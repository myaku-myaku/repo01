from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.port import Port
from app.models.user import User
from app.schemas.host import PortResponse, PortUpdate

router = APIRouter(prefix="/ports", tags=["ports"])


@router.patch("/{port_id}", response_model=PortResponse)
async def update_port(
    port_id: int,
    body: PortUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(select(Port).where(Port.id == port_id))
    port = result.scalar_one_or_none()
    if port is None:
        raise HTTPException(status_code=404, detail="Port not found")
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(port, key, value)
    await db.commit()
    await db.refresh(port)
    return port
