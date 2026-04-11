from fastapi import APIRouter, Depends
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_admin
from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.host import Host
from app.models.import_log import ImportLog
from app.models.office import Office
from app.models.port import Port
from app.models.prefecture import Prefecture
from app.models.region import Region
from app.models.reservation import PortReservation
from app.models.slot import Slot

router = APIRouter(prefix="/admin", tags=["admin"])


@router.delete("/data")
async def delete_all_data(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_admin),
):
    """全装置データを削除する（ユーザーは保持）。管理者のみ実行可能。"""
    # FK依存順に削除
    await db.execute(delete(PortReservation))
    await db.execute(delete(Port))
    await db.execute(delete(Slot))
    await db.execute(delete(Host))
    await db.execute(delete(AuditLog))
    await db.execute(delete(ImportLog))
    await db.execute(delete(Office))
    await db.execute(delete(Prefecture))
    await db.execute(delete(Region))
    await db.commit()
    return {"message": "全データを削除しました"}
