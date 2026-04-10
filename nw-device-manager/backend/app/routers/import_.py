import io

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.host import Host
from app.models.office import Office
from app.models.port import Port, UsageStatus
from app.models.prefecture import Prefecture
from app.models.region import Region
from app.models.slot import Slot, SlotStatus
from app.models.user import User
from app.services.import_service import detect_vendor_format, parse_import_data

router = APIRouter(prefix="/import", tags=["import"])


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    content = await file.read()

    if file.filename.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(content))
    elif file.filename.endswith((".xlsx", ".xls")):
        df = pd.read_excel(io.BytesIO(content))
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV or XLSX.")

    vendor_format = detect_vendor_format(df)
    records = parse_import_data(df, vendor_format)

    created_hosts = 0
    created_slots = 0
    created_ports = 0

    for record in records:
        # Ensure region exists
        region = await _get_or_create(db, Region, {"code": record["region_code"]}, {"name": record["region_name"], "code": record["region_code"]})
        # Ensure prefecture exists
        prefecture = await _get_or_create(db, Prefecture, {"code": record["prefecture_code"]}, {"name": record["prefecture_name"], "code": record["prefecture_code"], "region_id": region.id})
        # Ensure office exists
        office = await _get_or_create(db, Office, {"code": record["office_code"]}, {"name": record["office_name"], "code": record["office_code"], "prefecture_id": prefecture.id})
        # Ensure host exists
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
            created_hosts += 1

        if "slot_number" in record:
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
                created_slots += 1

            if "port_number" in record:
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
                    "usage_status": _map_usage_status(record.get("usage_status")),
                    "description": record.get("description"),
                    "sfp_info": record.get("sfp_info"),
                })
                if port_created:
                    created_ports += 1

    await db.commit()
    return {
        "message": f"Import completed ({vendor_format})",
        "created_hosts": created_hosts,
        "created_slots": created_slots,
        "created_ports": created_ports,
        "total_records": len(records),
    }


def _map_usage_status(raw: str | None) -> UsageStatus:
    if raw is None:
        return UsageStatus.AVAILABLE
    raw_lower = raw.lower()
    if "use" in raw_lower or "occupied" in raw_lower:
        return UsageStatus.IN_USE
    if "idle" in raw_lower or "free" in raw_lower or "available" in raw_lower:
        return UsageStatus.AVAILABLE
    return UsageStatus.AVAILABLE


async def _get_or_create(db: AsyncSession, model, lookup: dict, defaults: dict):
    from sqlalchemy import select
    stmt = select(model)
    for k, v in lookup.items():
        stmt = stmt.where(getattr(model, k) == v)
    result = await db.execute(stmt)
    instance = result.scalar_one_or_none()
    if instance is None:
        instance = model(**defaults)
        db.add(instance)
        await db.flush()
    return instance


async def _get_or_create_flag(db: AsyncSession, model, lookup: dict, defaults: dict):
    from sqlalchemy import select
    stmt = select(model)
    for k, v in lookup.items():
        stmt = stmt.where(getattr(model, k) == v)
    result = await db.execute(stmt)
    instance = result.scalar_one_or_none()
    if instance is None:
        instance = model(**defaults)
        db.add(instance)
        await db.flush()
        return instance, True
    return instance, False
