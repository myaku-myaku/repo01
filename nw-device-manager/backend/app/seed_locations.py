"""Seed regions, prefectures, and offices from 拠点マスタ CSV."""
import asyncio
import csv
import os
from collections import OrderedDict

from sqlalchemy import select

from app.database import async_session
from app.models.office import Office
from app.models.prefecture import Prefecture
from app.models.region import Region

# 地域 → 県域 (表示順、設備のある県のみ)
# 各県: (CSVの県域名, ツリー表示名)
REGION_PREFECTURE_MAP = OrderedDict([
    ("北海道", [
        ("北海道", "M北海道"),
    ]),
    ("東北", [
        ("宮城", "P宮城"),
        ("山形", "P山形"),
        ("福島", "P福島"),
    ]),
    ("関東", [
        ("茨城", "A茨城"),
        ("栃木", "A栃木"),
        ("群馬", "A群馬"),
        ("埼玉", "B埼玉"),
        ("東京", "C東京"),
        ("千葉", "D千葉"),
        ("神奈川", "E神奈川"),
    ]),
    ("東海", [
        ("愛知", "F愛知"),
        ("岐阜", "G岐阜"),
        ("三重", "G三重"),
        ("静岡", "H静岡"),
    ]),
    ("近畿", [
        ("大阪", "I大阪"),
        ("京都", "J京都"),
        ("滋賀", "J滋賀"),
        ("奈良", "J奈良"),
        ("兵庫", "K兵庫"),
    ]),
    ("中国", [
        ("岡山", "N岡山"),
        ("広島", "N広島"),
    ]),
    ("九州", [
        ("福岡", "L福岡"),
        ("佐賀", "L佐賀"),
        ("熊本", "V熊本"),
    ]),
])

# CSVの県域名 → 地域名 逆引き
PREF_TO_REGION = {}
for region, pref_list in REGION_PREFECTURE_MAP.items():
    for csv_name, _display in pref_list:
        PREF_TO_REGION[csv_name] = region

# CSVの県域名のセット（対象県のみ）
TARGET_PREFECTURES = set(PREF_TO_REGION.keys())


async def seed_locations(csv_path: str):
    async with async_session() as db:
        # Check if already seeded
        result = await db.execute(select(Region))
        if result.scalars().first() is not None:
            print("Locations already seeded, skipping.")
            return

        # 1. Create regions (in order)
        region_objs = {}
        for i, region_name in enumerate(REGION_PREFECTURE_MAP.keys(), 1):
            region = Region(name=region_name, code=f"R{i:02d}")
            db.add(region)
            region_objs[region_name] = region
        await db.flush()
        print(f"Created {len(region_objs)} regions")

        # 2. Create prefectures (in order)
        pref_objs = {}
        pref_idx = 1
        for region_name, pref_list in REGION_PREFECTURE_MAP.items():
            for csv_name, display_name in pref_list:
                pref = Prefecture(
                    name=display_name,
                    code=f"P{pref_idx:02d}",
                    region_id=region_objs[region_name].id,
                )
                db.add(pref)
                pref_objs[csv_name] = pref
                pref_idx += 1
        await db.flush()
        print(f"Created {len(pref_objs)} prefectures")

        # 3. Read CSV and create offices (only for target prefectures)
        offices_created = 0
        seen_codes = set()

        with open(csv_path, encoding="shift_jis") as f:
            reader = csv.reader(f)
            next(reader)  # skip header
            for row in reader:
                pref_name = row[2].strip()  # C列: 県域
                bldg_name = row[4].strip()  # E列: ビル名
                office_code = row[7].strip()  # H列: 局舎コード

                if not pref_name or not office_code:
                    continue
                if pref_name not in TARGET_PREFECTURES:
                    continue
                if office_code in seen_codes:
                    continue
                seen_codes.add(office_code)

                pref_obj = pref_objs.get(pref_name)
                if pref_obj is None:
                    continue

                office_display = f"{office_code}_{bldg_name}"
                office = Office(
                    name=office_display,
                    code=office_code,
                    prefecture_id=pref_obj.id,
                )
                db.add(office)
                offices_created += 1

        await db.commit()
        print(f"Created {offices_created} offices")
        print("Location seeding complete!")


if __name__ == "__main__":
    csv_path = os.environ.get(
        "CSV_PATH",
        "/data/kyoten.csv",
    )
    asyncio.run(seed_locations(csv_path))
