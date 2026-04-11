from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.host import Host
from app.models.office import Office
from app.models.prefecture import Prefecture
from app.models.region import Region

router = APIRouter(prefix="/offices", tags=["offices"])


def _strip_code_prefix(name: str) -> str:
    """Remove leading code prefix like 'A003_' from office name."""
    if "_" in name:
        return name.split("_", 1)[1]
    return name


def _strip_area_code(name: str) -> str:
    """Remove leading area code letter like 'C東京' → '東京'."""
    if len(name) >= 2 and name[0].isascii() and name[0].isalpha():
        return name[1:]
    return name


@router.get("/device-list")
async def get_office_device_list(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """全局舎のPTN設置装置一覧: 局舎ごとに設置総数と機種別台数を返す."""

    # 1. 全局舎 + 地域・都道府県情報を取得
    office_result = await db.execute(
        select(
            Office.id,
            Office.name,
            Office.code,
            Prefecture.name.label("prefecture_name"),
            Region.name.label("region_name"),
        )
        .join(Prefecture, Prefecture.id == Office.prefecture_id)
        .join(Region, Region.id == Prefecture.region_id)
        .order_by(Region.id, Prefecture.id, Office.name)
    )
    offices = {row.id: {
        "office_id": row.id,
        "office_name": _strip_code_prefix(row.name),
        "office_code": row.code,
        "prefecture": _strip_area_code(row.prefecture_name),
        "region": row.region_name,
        "total_hosts": 0,
        "models": {},
    } for row in office_result.all()}

    # 2. 装置を取得して局舎ごとに集計
    host_result = await db.execute(
        select(Host.office_id, Host.model)
    )
    for office_id, model in host_result.all():
        if office_id not in offices:
            continue
        o = offices[office_id]
        o["total_hosts"] += 1
        model_name = model or "不明"
        o["models"][model_name] = o["models"].get(model_name, 0) + 1

    # 3. 装置がある局舎のみ返す + models を辞書からリストに変換
    result = []
    all_models: set[str] = set()
    for o in offices.values():
        if o["total_hosts"] == 0:
            continue
        all_models.update(o["models"].keys())
        result.append(o)

    # モデル一覧をソートして返す (フロントでカラム生成に使用)
    sorted_models = sorted(all_models)

    return {
        "models": sorted_models,
        "offices": result,
    }
