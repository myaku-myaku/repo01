from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.host import Host
from app.models.office import Office
from app.models.prefecture import Prefecture
from app.models.region import Region
from app.schemas.region import (
    OfficeResponse,
    TreeHost,
    TreeOffice,
    TreeRegion,
)

router = APIRouter(prefix="/regions", tags=["regions"])


@router.get("/tree", response_model=list[TreeRegion])
async def get_region_tree(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Region).options(selectinload(Region.prefectures)).order_by(Region.id)
    )
    return result.scalars().unique().all()


@router.get("/offices", response_model=list[TreeOffice])
async def get_offices(
    prefecture_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(
            Office.id,
            Office.name,
            Office.code,
            Office.address,
            func.count(Host.id).label("host_count"),
        )
        .join(Host, Host.office_id == Office.id)
        .where(Office.prefecture_id == prefecture_id)
        .group_by(Office.id)
        .having(func.count(Host.id) > 0)
        .order_by(Office.name)
    )
    rows = result.all()
    return [
        TreeOffice(id=r.id, name=r.name, code=r.code, address=r.address, host_count=r.host_count)
        for r in rows
    ]


@router.get("/hosts", response_model=list[TreeHost])
async def get_hosts_by_office(
    office_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        select(Host).where(Host.office_id == office_id).order_by(Host.hostname)
    )
    return result.scalars().all()
