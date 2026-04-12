from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import UserRole
from app.models.host import Host
from app.models.office import Office
from app.models.port import Port, UsageStatus
from app.models.prefecture import Prefecture
from app.models.reservation import PortReservation, ReservationStatus
from app.models.slot import Slot
from app.models.user import User
from app.schemas.reservation import ReservationCreate, ReservationListItem, ReservationResponse

router = APIRouter(prefix="/ports", tags=["reservations"])


@router.get("/reservations", response_model=list[ReservationListItem])
async def list_reservations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status: ReservationStatus | None = Query(None),
    region_id: int | None = Query(None),
    prefecture_id: int | None = Query(None),
    office_id: int | None = Query(None),
    host_id: int | None = Query(None),
    my_only: bool = Query(False),
):
    query = (
        select(PortReservation)
        .join(Port, PortReservation.port_id == Port.id)
        .join(Slot, Port.slot_id == Slot.id)
        .join(Host, Slot.host_id == Host.id)
        .join(Office, Host.office_id == Office.id)
        .join(Prefecture, Office.prefecture_id == Prefecture.id)
        .options(
            selectinload(PortReservation.user),
            selectinload(PortReservation.port).selectinload(Port.slot).selectinload(Slot.host).selectinload(Host.office).selectinload(Office.prefecture),
        )
        .order_by(PortReservation.reserved_at.desc())
    )

    if status is not None:
        query = query.where(PortReservation.status == status)
    if my_only:
        query = query.where(PortReservation.reserved_by == current_user.id)
    if host_id is not None:
        query = query.where(Host.id == host_id)
    if office_id is not None:
        query = query.where(Host.office_id == office_id)
    if prefecture_id is not None:
        query = query.where(Office.prefecture_id == prefecture_id)
    if region_id is not None:
        query = query.where(Prefecture.region_id == region_id)

    result = await db.execute(query)
    reservations = result.scalars().all()

    items = []
    for r in reservations:
        port = r.port
        slot = port.slot
        host = slot.host
        office = host.office
        prefecture = office.prefecture
        user = r.user
        items.append(ReservationListItem(
            id=r.id,
            port_id=r.port_id,
            reserved_by=r.reserved_by,
            reserved_by_name=user.display_name or user.username if user else None,
            reserved_at=r.reserved_at,
            expires_at=r.expires_at,
            purpose=r.purpose,
            status=r.status,
            hostname=host.hostname,
            host_id=host.id,
            office_name=office.name,
            office_id=office.id,
            prefecture_name=prefecture.name,
            prefecture_id=prefecture.id,
            region_id=prefecture.region_id,
            slot_number=slot.slot_number,
            port_number=port.port_number,
            port_type=port.port_type,
            port_rate=port.port_rate,
        ))
    return items


@router.post("/{port_id}/reserve", response_model=ReservationResponse)
async def reserve_port(
    port_id: int,
    body: ReservationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Port).where(Port.id == port_id))
    port = result.scalar_one_or_none()
    if port is None:
        raise HTTPException(status_code=404, detail="Port not found")
    if port.usage_status not in (UsageStatus.AVAILABLE,):
        raise HTTPException(status_code=400, detail="Port is not available for reservation")

    reservation = PortReservation(
        port_id=port_id,
        reserved_by=user.id,
        purpose=body.purpose,
        expires_at=body.expires_at,
        status=ReservationStatus.ACTIVE,
    )
    port.usage_status = UsageStatus.RESERVED
    db.add(reservation)
    await db.commit()
    await db.refresh(reservation)
    return ReservationResponse(
        id=reservation.id,
        port_id=reservation.port_id,
        reserved_by=reservation.reserved_by,
        reserved_by_name=user.display_name or user.username,
        reserved_at=reservation.reserved_at,
        expires_at=reservation.expires_at,
        purpose=reservation.purpose,
        status=reservation.status,
    )


@router.delete("/{port_id}/reserve")
async def release_reservation(
    port_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PortReservation)
        .where(PortReservation.port_id == port_id, PortReservation.status == ReservationStatus.ACTIVE)
    )
    reservation = result.scalar_one_or_none()
    if reservation is None:
        raise HTTPException(status_code=404, detail="No active reservation found")
    if reservation.reserved_by != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="予約者本人または管理者のみ解除できます")
    reservation.status = ReservationStatus.RELEASED

    port_result = await db.execute(select(Port).where(Port.id == port_id))
    port = port_result.scalar_one()
    port.usage_status = UsageStatus.AVAILABLE
    await db.commit()
    return {"detail": "Reservation released"}
