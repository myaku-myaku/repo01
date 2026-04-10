from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.port import Port, UsageStatus
from app.models.reservation import PortReservation, ReservationStatus
from app.models.user import User
from app.schemas.reservation import ReservationCreate, ReservationResponse

router = APIRouter(prefix="/ports", tags=["reservations"])


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
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PortReservation)
        .where(PortReservation.port_id == port_id, PortReservation.status == ReservationStatus.ACTIVE)
    )
    reservation = result.scalar_one_or_none()
    if reservation is None:
        raise HTTPException(status_code=404, detail="No active reservation found")
    reservation.status = ReservationStatus.RELEASED

    port_result = await db.execute(select(Port).where(Port.id == port_id))
    port = port_result.scalar_one()
    port.usage_status = UsageStatus.AVAILABLE
    await db.commit()
    return {"detail": "Reservation released"}
