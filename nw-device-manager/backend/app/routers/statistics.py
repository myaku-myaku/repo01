from collections import defaultdict

from fastapi import APIRouter, Depends, Query
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
from app.schemas.statistics import BoardStats, ModelStats, RateStats, RegionStats, SummaryStats

router = APIRouter(prefix="/statistics", tags=["statistics"])

# port_type プレフィックス → 速度カテゴリ
_PORT_TYPE_RATE_MAP: list[tuple[str, str]] = [
    ("400GE", "400G"),
    ("100GE", "100G"),
    ("OTR100", "100G"),
    ("25GE", "25G"),
    ("10GE", "10G"),
    ("OTP10", "10G"),
    ("GE", "1G"),
    ("ETGBE", "1G"),
    ("FE", "100M"),
]

# port_rate (kbit/s) → カテゴリ
_PORT_RATE_KBPS_MAP: list[tuple[int, str]] = [
    (400_000_000, "400G"),
    (100_000_000, "100G"),
    (25_000_000, "25G"),
    (10_000_000, "10G"),
    (1_000_000, "1G"),
    (0, "1G以下"),
]

# 表示ソート順
_RATE_ORDER = ["1G以下", "100M", "1G", "10G", "25G", "100G", "400G"]


def _classify_port_rate(port_type: str | None, port_rate: str | None) -> str:
    """port_type と port_rate から速度カテゴリを判定."""
    if port_type:
        pt = port_type.strip().upper()
        for prefix, category in _PORT_TYPE_RATE_MAP:
            if pt.startswith(prefix.upper()):
                return category
    if port_rate:
        try:
            kbps = int(port_rate.replace(",", ""))
            for threshold, category in _PORT_RATE_KBPS_MAP:
                if kbps >= threshold:
                    return category
        except ValueError:
            pass
    return "不明"


async def _get_port_ids_by_rate(db: AsyncSession, rate: str) -> set[int]:
    """指定された速度カテゴリに該当するポートIDのセットを返す."""
    result = await db.execute(select(Port.id, Port.port_type, Port.port_rate))
    return {
        row.id for row in result.all()
        if _classify_port_rate(row.port_type, row.port_rate) == rate
    }


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
    rate: str | None = Query(None, description="速度カテゴリでフィルタ (例: 10G, 100G)"),
):
    if rate:
        port_ids = await _get_port_ids_by_rate(db, rate)
        if not port_ids:
            return []
        port_filter = Port.id.in_(port_ids)
        result = await db.execute(
            select(
                Host.model,
                Host.vendor,
                func.count(func.distinct(Host.id)).label("host_count"),
                func.count(Port.id).label("total_ports"),
                func.sum(case((Port.usage_status == UsageStatus.AVAILABLE, 1), else_=0)).label("available_ports"),
            )
            .join(Slot, Slot.host_id == Host.id)
            .join(Port, (Port.slot_id == Slot.id) & port_filter)
            .group_by(Host.model, Host.vendor)
            .order_by(func.count(func.distinct(Host.id)).desc())
        )
    else:
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
    rate: str | None = Query(None, description="速度カテゴリでフィルタ (例: 10G, 100G)"),
):
    if rate:
        port_ids = await _get_port_ids_by_rate(db, rate)
        if not port_ids:
            # 全地域を0件で返す
            regions = await db.execute(select(Region.id, Region.name).order_by(Region.id))
            return [
                RegionStats(region_name=r.name, host_count=0, total_ports=0, available_ports=0, utilization_pct=0)
                for r in regions.all()
            ]
        port_filter = Port.id.in_(port_ids)
        result = await db.execute(
            select(
                Region.id,
                Region.name.label("region_name"),
                func.count(func.distinct(Host.id)).label("host_count"),
                func.count(Port.id).label("total_ports"),
                func.sum(case((Port.usage_status == UsageStatus.AVAILABLE, 1), else_=0)).label("available_ports"),
            )
            .outerjoin(Prefecture, Prefecture.region_id == Region.id)
            .outerjoin(Office, Office.prefecture_id == Prefecture.id)
            .outerjoin(Host, Host.office_id == Office.id)
            .outerjoin(Slot, Slot.host_id == Host.id)
            .outerjoin(Port, (Port.slot_id == Slot.id) & port_filter)
            .group_by(Region.id, Region.name)
            .order_by(Region.id)
        )
    else:
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
            .order_by(Region.id)
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


@router.get("/by-board", response_model=list[BoardStats])
async def get_stats_by_board(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(
            Slot.board_name,
            func.count(Slot.id).label("slot_count"),
            func.count(Port.id).label("total_ports"),
            func.sum(case((Port.usage_status == UsageStatus.AVAILABLE, 1), else_=0)).label("available_ports"),
            func.sum(case((Port.usage_status == UsageStatus.IN_USE, 1), else_=0)).label("in_use_ports"),
        )
        .outerjoin(Port, Port.slot_id == Slot.id)
        .group_by(Slot.board_name)
        .order_by(func.count(Slot.id).desc())
    )
    rows = result.all()
    return [
        BoardStats(
            board_name=r.board_name,
            slot_count=r.slot_count,
            total_ports=r.total_ports,
            available_ports=r.available_ports or 0,
            in_use_ports=r.in_use_ports or 0,
            utilization_pct=round((1 - (r.available_ports or 0) / r.total_ports) * 100, 1) if r.total_ports > 0 else 0,
        )
        for r in rows
    ]


@router.get("/by-rate", response_model=list[RateStats])
async def get_stats_by_rate(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Port.port_type, Port.port_rate, Port.usage_status)
    )
    rows = result.all()

    buckets: dict[str, dict[str, int]] = defaultdict(lambda: {
        "total": 0, "available": 0, "in_use": 0, "reserved": 0,
    })
    for port_type, port_rate, usage_status in rows:
        cat = _classify_port_rate(port_type, port_rate)
        buckets[cat]["total"] += 1
        if usage_status == UsageStatus.AVAILABLE:
            buckets[cat]["available"] += 1
        elif usage_status == UsageStatus.IN_USE:
            buckets[cat]["in_use"] += 1
        elif usage_status == UsageStatus.RESERVED:
            buckets[cat]["reserved"] += 1

    stats = []
    for cat, counts in buckets.items():
        total = counts["total"]
        available = counts["available"]
        util = round((1 - available / total) * 100, 1) if total > 0 else 0
        stats.append(RateStats(
            rate_category=cat,
            total_ports=total,
            available_ports=available,
            in_use_ports=counts["in_use"],
            reserved_ports=counts["reserved"],
            utilization_pct=util,
        ))

    order = {v: i for i, v in enumerate(_RATE_ORDER)}
    stats.sort(key=lambda s: order.get(s.rate_category, 999))
    return stats
