"""NCE NBI sync router.

Provides endpoints to test NCE connectivity and trigger a full
sync of NE/board/port data from iMaster NCE-T into PRISM.
"""

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import async_session, get_db
from app.models.host import Host
from app.models.import_log import ImportLog
from app.models.office import Office
from app.models.port import Port, UsageStatus
from app.models.prefecture import Prefecture
from app.models.region import Region
from app.models.slot import Slot, SlotStatus
from app.models.user import User, UserRole
from app.services.nce_client import NCEAuthError, NCEClient, nce_client
from app.services.nce_parser import (
    build_ne_id_map,
    parse_card_list,
    parse_ltp_list,
    parse_ne_list,
)
from app.services.task_manager import ImportTask, TaskStatus, task_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/nce", tags=["nce"])


def _require_admin(user: User) -> None:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="管理者権限が必要です")


@router.get("/status")
async def nce_connection_status(
    _user: User = Depends(get_current_user),
):
    """Check NCE configuration and connectivity."""
    result = await nce_client.test_connection()
    return result


@router.post("/sync")
async def trigger_nce_sync(
    user: User = Depends(get_current_user),
):
    """Trigger a full sync from NCE NBI. Admin only.

    Returns a task_id that can be polled via /import/status/{task_id}.
    """
    _require_admin(user)

    if not nce_client.is_configured:
        raise HTTPException(
            status_code=400,
            detail="NCE接続情報が設定されていません。.envにNCE_BASE_URL, NCE_USERNAME, NCE_PASSWORDを設定してください。",
        )

    task = task_manager.create_task()
    task.status = TaskStatus.RUNNING
    task.phase = "connecting"
    task.message = "NCEに接続中..."

    asyncio.create_task(_run_nce_sync(task))
    task_manager.cleanup_old_tasks()

    return {"task_id": task.id, "message": "NCE同期を開始しました"}


@router.get("/sync/latest")
async def get_latest_nce_sync(
    _user: User = Depends(get_current_user),
):
    """Get the latest NCE sync task status."""
    task = task_manager.get_latest_task()
    if not task:
        return {"status": "none"}
    return task.to_dict()


async def _run_nce_sync(task: ImportTask) -> None:
    """Background NCE sync coroutine."""
    client = NCEClient()
    try:
        # Step 1: Authenticate
        task.message = "NCE認証中..."
        await client.authenticate()

        # Step 2: Fetch NE list
        task.phase = "fetching_ne"
        task.message = "NE（装置）一覧を取得中..."
        ne_items = await client.get_network_elements()
        ne_map = build_ne_id_map(ne_items)
        ne_records = parse_ne_list(ne_items)
        logger.info("NCE sync: %d NE items fetched, %d PTN records", len(ne_items), len(ne_records))

        # Step 3: Fetch card (board) list
        task.phase = "fetching_boards"
        task.message = f"ボード一覧を取得中... (NE: {len(ne_records)}台)"
        board_items = await client.get_cards()
        board_records = parse_card_list(board_items, ne_map)
        logger.info("NCE sync: %d card items fetched, %d records", len(board_items), len(board_records))

        # Step 4: Fetch port/LTP list
        task.phase = "fetching_ports"
        task.message = f"ポート一覧を取得中... (ボード: {len(board_records)}枚)"
        ltp_items = await client.get_ports()
        ltp_records = parse_ltp_list(ltp_items, ne_map)
        logger.info("NCE sync: %d LTP items fetched, %d records", len(ltp_items), len(ltp_records))

        # Combine all records (NE-only + board-only + port records)
        # Port records include host/slot info, so they're the most complete
        all_records = ne_records + board_records + ltp_records
        task.total_records = len(all_records)
        task.total = len(all_records)

        # Step 5: Upsert into DB
        task.phase = "importing"
        task.message = f"データベースに反映中... ({len(all_records)}件)"

        async with async_session() as db:
            result = await db.execute(select(Office))
            all_offices = {o.code: o for o in result.scalars().all()}

            # Ensure LAB vendor offices exist for devices without office codes
            lab_offices = await _ensure_lab_offices(db, all_offices)

            processed = 0
            report_interval = max(1, len(all_records) // 50)

            for record in all_records:
                office_code = record.get("office_code")
                if office_code and office_code in all_offices:
                    office = all_offices[office_code]
                else:
                    # Fallback: assign to vendor-based LAB office
                    vendor = record.get("vendor") or "Other"
                    lab_code = f"LAB_{vendor}"
                    office = lab_offices.get(lab_code)
                    if not office:
                        task.skipped_no_office += 1
                        processed += 1
                        task.current = processed
                        continue

                host = await _upsert(db, Host, {"hostname": record["hostname"]}, {
                    "hostname": record["hostname"],
                    "model": record.get("model"),
                    "vendor": record.get("vendor"),
                    "ip_address": record.get("ip_address"),
                    "software_version": record.get("software_version"),
                    "ne_type": record.get("ne_type"),
                    "office_id": office.id,
                })
                if host._sa_instance_state.pending:
                    task.created_hosts += 1

                if record.get("slot_number"):
                    slot = await _upsert(db, Slot, {
                        "host_id": host.id, "slot_number": record["slot_number"]
                    }, {
                        "host_id": host.id,
                        "slot_number": record["slot_number"],
                        "board_name": record.get("board_name"),
                        "board_type": record.get("board_type"),
                        "status": SlotStatus.INSTALLED if record.get("board_name") else SlotStatus.EMPTY,
                    })
                    if slot._sa_instance_state.pending:
                        task.created_slots += 1

                    if record.get("port_number"):
                        new_usage = _map_usage(record.get("usage_status"))
                        port = await _upsert(db, Port, {
                            "slot_id": slot.id, "port_number": record["port_number"]
                        }, {
                            "slot_id": slot.id,
                            "port_number": record["port_number"],
                            "port_name": record.get("port_name"),
                            "port_type": record.get("port_type"),
                            "port_rate": record.get("port_rate"),
                            "admin_status": record.get("admin_status"),
                            "oper_status": record.get("oper_status"),
                            "usage_status": new_usage,
                            "description": record.get("description"),
                        })
                        if port._sa_instance_state.pending:
                            task.created_ports += 1

                processed += 1
                task.current = processed
                if processed % report_interval == 0:
                    task.message = f"DB反映中... {processed}/{len(all_records)}"
                    await asyncio.sleep(0)

            # Import log
            log = ImportLog(
                vendor="Huawei (NCE NBI)",
                filename="nce_sync",
                file_exported_at=datetime.now(timezone.utc),
                record_count=len(all_records),
            )
            db.add(log)

            task.phase = "committing"
            task.message = "コミット中..."
            await db.commit()

        task.status = TaskStatus.COMPLETE
        task.phase = "complete"
        task.message = (
            f"NCE同期完了 — NE: {len(ne_records)}, ボード: {len(board_records)}, "
            f"ポート: {len(ltp_records)}, スキップ(局舎不明): {task.skipped_no_office}"
        )
        logger.info("NCE sync complete: %s", task.message)

    except NCEAuthError as e:
        task.status = TaskStatus.FAILED
        task.phase = "error"
        task.error = str(e)
        task.message = f"NCE認証エラー: {e}"
        logger.error("NCE sync auth error: %s", e)
    except Exception as e:
        task.status = TaskStatus.FAILED
        task.phase = "error"
        task.error = str(e)
        task.message = f"NCE同期エラー: {e}"
        logger.exception("NCE sync failed")


async def _ensure_lab_offices(
    db: AsyncSession, all_offices: dict[str, Office]
) -> dict[str, Office]:
    """Ensure LAB prefecture and vendor-based offices exist.

    Creates: 関東 → LAB → {Huawei, ZTE, Ribbon, ...}
    Returns a dict of lab_code -> Office for fallback assignment.
    """
    lab_offices: dict[str, Office] = {}

    # Find or create LAB prefecture under 関東
    result = await db.execute(
        select(Prefecture).where(Prefecture.name == "LAB")
    )
    lab_pref = result.scalar_one_or_none()

    if lab_pref is None:
        # Find 関東 region
        result = await db.execute(
            select(Region).where(Region.name == "関東")
        )
        kanto = result.scalar_one_or_none()
        if kanto is None:
            logger.warning("関東 region not found, cannot create LAB prefecture")
            return lab_offices

        lab_pref = Prefecture(name="LAB", code="PLAB", region_id=kanto.id)
        db.add(lab_pref)
        await db.flush()
        logger.info("Created LAB prefecture under 関東 (id=%d)", lab_pref.id)

    # Create vendor offices under LAB
    vendors = ["Huawei", "ZTE", "Ribbon", "Other"]
    for vendor in vendors:
        lab_code = f"LAB_{vendor}"
        if lab_code in all_offices:
            lab_offices[lab_code] = all_offices[lab_code]
            continue

        result = await db.execute(
            select(Office).where(Office.code == lab_code)
        )
        office = result.scalar_one_or_none()
        if office is None:
            office = Office(
                name=vendor,
                code=lab_code,
                prefecture_id=lab_pref.id,
            )
            db.add(office)
            await db.flush()
            logger.info("Created LAB office: %s (id=%d)", vendor, office.id)

        lab_offices[lab_code] = office
        all_offices[lab_code] = office

    return lab_offices


def _map_usage(raw: str | None) -> UsageStatus:
    if raw is None:
        return UsageStatus.AVAILABLE
    raw_lower = raw.lower()
    if "use" in raw_lower or "occupied" in raw_lower:
        return UsageStatus.IN_USE
    return UsageStatus.AVAILABLE


async def _upsert(db: AsyncSession, model, lookup: dict, defaults: dict):
    """Get or create, updating existing records with new values."""
    from sqlalchemy.exc import IntegrityError

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
            return instance
        except IntegrityError:
            result = await db.execute(stmt)
            instance = result.scalar_one_or_none()
            if instance is None:
                raise
    # Update existing
    for k, v in defaults.items():
        if k not in lookup and v is not None:
            setattr(instance, k, v)
    return instance
