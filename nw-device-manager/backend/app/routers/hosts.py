from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.host import Host
from app.models.port import Port
from app.models.reservation import PortReservation, ReservationStatus
from app.models.slot import Slot
from app.schemas.host import ActiveReservationInfo, HostResponse, PortResponse, SlotResponse

router = APIRouter(prefix="/hosts", tags=["hosts"])


@router.get("/{host_id}")
async def get_host_detail(
    host_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Host)
        .options(
            selectinload(Host.slots)
            .selectinload(Slot.ports)
            .selectinload(Port.reservations)
            .selectinload(PortReservation.user),
        )
        .where(Host.id == host_id)
    )
    host = result.scalar_one_or_none()
    if host is None:
        raise HTTPException(status_code=404, detail="Host not found")

    def _slot_sort_key(s: Slot) -> tuple:
        try:
            return (0, int(s.slot_number))
        except (ValueError, TypeError):
            return (1, s.slot_number or "")
    host.slots.sort(key=_slot_sort_key)

    slots_out = []
    for slot in host.slots:
        ports_out = []
        for port in slot.ports:
            active_res = None
            for r in port.reservations:
                if r.status == ReservationStatus.ACTIVE:
                    u = r.user
                    active_res = ActiveReservationInfo(
                        id=r.id,
                        reserved_by=r.reserved_by,
                        reserved_by_name=u.display_name or u.username if u else None,
                        reserved_at=r.reserved_at,
                        expires_at=r.expires_at,
                        purpose=r.purpose,
                    )
                    break
            ports_out.append(PortResponse(
                id=port.id,
                slot_id=port.slot_id,
                port_number=port.port_number,
                port_name=port.port_name,
                port_type=port.port_type,
                port_rate=port.port_rate,
                layer_rate=port.layer_rate,
                admin_status=port.admin_status,
                oper_status=port.oper_status,
                usage_status=port.usage_status,
                description=port.description,
                sfp_info=port.sfp_info,
                active_reservation=active_res,
            ))
        slots_out.append(SlotResponse(
            id=slot.id,
            host_id=slot.host_id,
            slot_number=slot.slot_number,
            board_name=slot.board_name,
            board_type=slot.board_type,
            status=slot.status,
            ports=ports_out,
        ))

    return HostResponse(
        id=host.id,
        office_id=host.office_id,
        hostname=host.hostname,
        model=host.model,
        vendor=host.vendor,
        ip_address=host.ip_address,
        software_version=host.software_version,
        ne_type=host.ne_type,
        status=host.status,
        slots=slots_out,
    )
