from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.host import Host
from app.models.office import Office
from app.models.port import Port, UsageStatus
from app.models.prefecture import Prefecture
from app.models.region import Region
from app.models.slot import Slot
from app.schemas.statistics import ModelStats, RegionStats, SummaryStats

router = APIRouter(prefix="/statistics", tags=["statistics"])


@router.get("/summary", response_model=SummaryStats)
async def get_summary(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    host_count = await db.scalar(select(func.count(Host.id)))
    slot_count = await db.scalar(select(func.count(Slot.id)))
    port_count = await db.scalar(select(func.count(Port.id)))

    status_counts = await db.execute(
        select(Port.usage_status, func.count(Port.id)).group_by(Port.usage_status)
    )
    status_map = {row[0]: row[1] for row in status_counts.all()}

    return SummaryStats(
        total_hosts=host_count or 0,
        total_slots=slot_count or 0,
        total_ports=port_count or 0,
        available_ports=status_map.get(UsageStatus.AVAILABLE, 0),
        in_use_ports=status_map.get(UsageStatus.IN_USE, 0),
        reserved_ports=status_map.get(UsageStatus.RESERVED, 0),
        faulty_ports=status_map.get(UsageStatus.FAULTY, 0),
    )


@router.get("/by-model", response_model=list[ModelStats])
async def get_stats_by_model(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(
            Host.model,
            Host.vendor,
            func.count(func.distinct(Host.id)).label("host_count"),
            func.count(Port.id).label("total_ports"),
            func.sum(case((Port.usage_status == UsageStatus.AVAILABLE, 1), else_=0)).label("available_ports"),
        )
        .outerjoin(Slot, Slot.host_id == Host.id)
        .outerjoin(Port, Port.slot_id == Slot.id)
        .group_by(Host.model, Host.vendor)
        .order_by(func.count(func.distinct(Host.id)).desc())
    )
    rows = result.all()
    return [
        ModelStats(
            model=r.model,
            vendor=r.vendor,
            host_count=r.host_count,
            total_ports=r.total_ports,
            available_ports=r.available_ports or 0,
            utilization_pct=round((1 - (r.available_ports or 0) / r.total_ports) * 100, 1) if r.total_ports > 0 else 0,
        )
        for r in rows
    ]


@router.get("/by-region", response_model=list[RegionStats])
async def get_stats_by_region(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(
            Region.name.label("region_name"),
            func.count(func.distinct(Host.id)).label("host_count"),
            func.count(Port.id).label("total_ports"),
            func.sum(case((Port.usage_status == UsageStatus.AVAILABLE, 1), else_=0)).label("available_ports"),
        )
        .outerjoin(Prefecture, Prefecture.region_id == Region.id)
        .outerjoin(Office, Office.prefecture_id == Prefecture.id)
        .outerjoin(Host, Host.office_id == Office.id)
        .outerjoin(Slot, Slot.host_id == Host.id)
        .outerjoin(Port, Port.slot_id == Slot.id)
        .group_by(Region.id, Region.name)
        .order_by(Region.name)
    )
    rows = result.all()
    return [
        RegionStats(
            region_name=r.region_name,
            host_count=r.host_count,
            total_ports=r.total_ports,
            available_ports=r.available_ports or 0,
            utilization_pct=round((1 - (r.available_ports or 0) / r.total_ports) * 100, 1) if r.total_ports > 0 else 0,
        )
        for r in rows
    ]
