from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.host import Host
from app.models.slot import Slot
from app.schemas.host import HostResponse

router = APIRouter(prefix="/hosts", tags=["hosts"])


@router.get("/{host_id}", response_model=HostResponse)
async def get_host_detail(
    host_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Host)
        .options(selectinload(Host.slots).selectinload(Slot.ports))
        .where(Host.id == host_id)
    )
    host = result.scalar_one_or_none()
    if host is None:
        raise HTTPException(status_code=404, detail="Host not found")
    return host
