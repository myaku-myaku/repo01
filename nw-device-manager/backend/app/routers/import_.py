import asyncio
import io
import zipfile

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import async_session, get_db
from app.models.host import Host
from app.models.office import Office
from app.models.port import Port, UsageStatus
from app.models.slot import Slot, SlotStatus
from app.models.user import User
from app.models.import_log import ImportLog
from app.services.import_service import (
    FORMAT_TO_VENDOR,
    detect_vendor_format,
    extract_file_datetime,
    parse_import_data,
    skip_metadata_rows,
)
from app.services.task_manager import ImportTask, TaskStatus, task_manager

router = APIRouter(prefix="/import", tags=["import"])


@router.get("/latest-by-vendor")
async def get_latest_imports_by_vendor(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """ベンダーごとの最新インポート情報を返す."""
    from sqlalchemy import func as sqlfunc

    # ベンダーごとに最新のimported_atを持つレコードを取得
    subq = (
        select(
            ImportLog.vendor,
            sqlfunc.max(ImportLog.id).label("max_id"),
        )
        .group_by(ImportLog.vendor)
        .subquery()
    )
    result = await db.execute(
        select(ImportLog)
        .join(subq, ImportLog.id == subq.c.max_id)
        .order_by(ImportLog.vendor)
    )
    logs = result.scalars().all()
    return [
        {
            "vendor": log.vendor,
            "filename": log.filename,
            "file_exported_at": log.file_exported_at.isoformat() if log.file_exported_at else None,
            "imported_at": log.imported_at.isoformat() if log.imported_at else None,
        }
        for log in logs
    ]


def _read_single_file(content: bytes, filename: str) -> pd.DataFrame | None:
    """Read a single CSV/XLSX file into a DataFrame."""
    lower = filename.lower()
    if lower.endswith(".csv"):
        return skip_metadata_rows(content, filename)
    elif lower.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(content))
    return None


def _extract_files_from_zip(content: bytes) -> list[tuple[str, bytes]]:
    """Extract supported files from a ZIP archive."""
    files = []
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename
            if "/__MACOSX/" in name or name.startswith("__MACOSX/") or "/." in name:
                continue
            lower = name.lower()
            if lower.endswith((".csv", ".xlsx", ".xls")):
                files.append((name, zf.read(info)))
    return files


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    _user: User = Depends(get_current_user),
):
    """Upload a file and start background import. Returns task_id immediately."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    content = await file.read()

    # Build list of (filename, content) pairs
    if file.filename.lower().endswith(".zip"):
        file_entries = _extract_files_from_zip(content)
        if not file_entries:
            raise HTTPException(status_code=400, detail="ZIP内に対応ファイル（CSV/XLSX）がありません。")
    elif file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        file_entries = [(file.filename, content)]
    else:
        raise HTTPException(status_code=400, detail="対応形式: CSV, XLSX, ZIP")

    # Parse all files upfront (synchronous, fast)
    all_batches: list[tuple[str, str, list[dict], bytes]] = []
    for fname, fcontent in file_entries:
        df = _read_single_file(fcontent, fname)
        if df is None or df.empty:
            continue
        vendor_format = detect_vendor_format(df)
        records = parse_import_data(df, vendor_format)
        if records:
            display_name = fname.rsplit("/", 1)[-1]
            all_batches.append((display_name, vendor_format, records, fcontent))

    if not all_batches:
        raise HTTPException(status_code=400, detail="有効なレコードが見つかりませんでした。")

    # Create task and start background processing
    task = task_manager.create_task()
    task.total_records = sum(len(r) for _, _, r, _ in all_batches)
    task.total = task.total_records
    task.status = TaskStatus.RUNNING
    task.message = "インポート開始..."

    asyncio.create_task(_run_import(task, all_batches))
    task_manager.cleanup_old_tasks()

    return {"task_id": task.id, "total_records": task.total_records}


@router.get("/status/{task_id}")
async def get_task_status(
    task_id: str,
    _user: User = Depends(get_current_user),
):
    """Poll import task progress."""
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="タスクが見つかりません")
    return task.to_dict()


@router.get("/status")
async def get_latest_task_status(
    _user: User = Depends(get_current_user),
):
    """Get the latest import task status (useful when returning to the page)."""
    task = task_manager.get_latest_task()
    if not task:
        return {"status": "none"}
    return task.to_dict()


async def _run_import(task: ImportTask, all_batches: list[tuple[str, str, list[dict], bytes]]) -> None:
    """Background import coroutine."""
    try:
        async with async_session() as db:
            result = await db.execute(select(Office))
            all_offices = {o.code: o for o in result.scalars().all()}

            total_records = task.total_records
            processed = 0
            file_count = len(all_batches)
            report_interval = max(1, total_records // 50)

            task.phase = "importing"
            task.message = f"{file_count}ファイル, {total_records}件のレコードを処理します"

            for file_idx, (fname, vformat, records, raw_content) in enumerate(all_batches):
                task.message = f"[{file_idx + 1}/{file_count}] {fname} ({vformat}, {len(records)}件)"

                for record in records:
                    office_code = record.get("office_code")
                    if not office_code or office_code not in all_offices:
                        task.skipped_no_office += 1
                        processed += 1
                        task.current = processed
                        if processed % report_interval == 0:
                            task.message = f"[{file_idx + 1}/{file_count}] {fname} ... {processed}/{total_records}"
                            await asyncio.sleep(0)
                        continue

                    office = all_offices[office_code]

                    host, host_created = await _get_or_create_flag(db, Host, {"hostname": record["hostname"]}, {
                        "hostname": record["hostname"],
                        "model": record.get("model"),
                        "vendor": record.get("vendor"),
                        "ip_address": record.get("ip_address"),
                        "software_version": record.get("software_version"),
                        "ne_type": record.get("ne_type"),
                        "office_id": office.id,
                    })
                    if host_created:
                        task.created_hosts += 1

                    if "slot_number" in record and record.get("slot_number"):
                        slot, slot_created = await _get_or_create_flag(db, Slot, {
                            "host_id": host.id, "slot_number": record["slot_number"]
                        }, {
                            "host_id": host.id,
                            "slot_number": record["slot_number"],
                            "board_name": record.get("board_name"),
                            "board_type": record.get("board_type"),
                            "status": SlotStatus.INSTALLED if record.get("board_name") else SlotStatus.EMPTY,
                        })
                        if slot_created:
                            task.created_slots += 1

                        if "port_number" in record and record.get("port_number"):
                            new_usage = _map_usage_status(record.get("usage_status"))
                            port, port_created = await _get_or_create_flag(db, Port, {
                                "slot_id": slot.id, "port_number": record["port_number"]
                            }, {
                                "slot_id": slot.id,
                                "port_number": record["port_number"],
                                "port_name": record.get("port_name"),
                                "port_type": record.get("port_type"),
                                "port_rate": record.get("port_rate"),
                                "layer_rate": record.get("layer_rate"),
                                "admin_status": record.get("admin_status"),
                                "oper_status": record.get("oper_status"),
                                "usage_status": new_usage,
                                "description": record.get("description"),
                                "sfp_info": record.get("sfp_info"),
                            })
                            if port_created:
                                task.created_ports += 1
                            else:
                                if port.usage_status != new_usage:
                                    port.usage_status = new_usage

                    processed += 1
                    task.current = processed
                    if processed % report_interval == 0:
                        task.message = f"[{file_idx + 1}/{file_count}] {fname} ... {processed}/{total_records}"
                        await asyncio.sleep(0)

            # Record import logs per vendor
            for fname, vformat, records, raw_content in all_batches:
                vendor = FORMAT_TO_VENDOR.get(vformat, "Other")
                file_dt = extract_file_datetime(raw_content, fname, vformat)
                log = ImportLog(
                    vendor=vendor,
                    filename=fname,
                    file_exported_at=file_dt,
                    record_count=len(records),
                )
                db.add(log)

            task.phase = "committing"
            task.message = "データベースにコミット中..."
            task.current = total_records
            await db.commit()

            formats = ", ".join(f"{fn}({vf})" for fn, vf, _ , _ in all_batches)
            task.status = TaskStatus.COMPLETE
            task.phase = "complete"
            task.message = f"インポート完了 ({formats})"

    except Exception as e:
        task.status = TaskStatus.FAILED
        task.phase = "error"
        task.error = str(e)
        task.message = f"エラー: {e}"


def _map_usage_status(raw: str | None) -> UsageStatus:
    if raw is None:
        return UsageStatus.AVAILABLE
    raw_lower = raw.lower()
    if "use" in raw_lower or "occupied" in raw_lower:
        return UsageStatus.IN_USE
    if "idle" in raw_lower or "free" in raw_lower or "available" in raw_lower:
        return UsageStatus.AVAILABLE
    return UsageStatus.AVAILABLE


async def _get_or_create_flag(db: AsyncSession, model, lookup: dict, defaults: dict):
    stmt = select(model)
    for k, v in lookup.items():
        stmt = stmt.where(getattr(model, k) == v)
    result = await db.execute(stmt)
    instance = result.scalar_one_or_none()
    if instance is None:
        try:
            async with db.begin_nested():
                instance = model(**defaults)
                db.add(instance)
                await db.flush()
            return instance, True
        except IntegrityError:
            result = await db.execute(stmt)
            instance = result.scalar_one_or_none()
            if instance is None:
                raise
    # Update existing record with new values
    for k, v in defaults.items():
        if k not in lookup and v is not None:
            setattr(instance, k, v)
    return instance, False
