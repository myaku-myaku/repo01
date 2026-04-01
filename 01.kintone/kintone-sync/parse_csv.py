"""
parse_csv.py
────────────
ダウンロードした CSV を読み込み、
案件名フィールドから部の Kintone レコード番号を抽出して
同期用のレコードリストを返す。
"""
import logging
import re
from typing import Optional

import pandas as pd

import config

logger = logging.getLogger(__name__)


def parse(csv_path: str) -> list[dict]:
    """
    CSV を読み込み、同期対象レコードのリストを返す。

    戻り値の形式:
    [
        {
            "dept_record_id": "123",       # 部 Kintone のレコード番号
            "fields": {                    # 更新するフィールドと値
                "status": "完了",
                "completion_date": "2024-03-01",
                ...
            }
        },
        ...
    ]
    """
    logger.info(f"CSV 読み込み: {csv_path}")

    # Kintone の CSV は UTF-8 BOM 付き (utf-8-sig) で出力される
    df = pd.read_csv(csv_path, encoding="utf-8-sig", dtype=str)
    df = df.fillna("")

    logger.info(f"  取得行数: {len(df)}")
    logger.info(f"  カラム: {list(df.columns)}")

    results = []

    for _, row in df.iterrows():
        # ── レコード番号を案件名から抽出 ───────────────────────────────
        key_value = row.get(config.COMPANY_KEY_FIELD, "")
        dept_record_id = _extract_record_id(key_value)

        if dept_record_id is None:
            logger.debug(f"レコード番号が見つからない行をスキップ: {key_value!r}")
            continue

        # ── 同期フィールドを収集 ────────────────────────────────────────
        # FIELD_MAP: { "会社CSVカラム名": "部Kintoneフィールドコード" }
        fields = {}
        for company_col, dept_field in config.FIELD_MAP.items():
            if company_col in row:
                fields[dept_field] = row[company_col]
            else:
                logger.warning(f"CSVにカラムが存在しない: '{company_col}'")

        if not fields:
            logger.debug(f"同期フィールドが空のためスキップ: record_id={dept_record_id}")
            continue

        results.append({
            "dept_record_id": dept_record_id,
            "fields": fields,
        })

    logger.info(f"同期対象レコード数: {len(results)}")
    return results


def _extract_record_id(text: str) -> Optional[str]:
    """
    案件名のテキストから部 Kintone のレコード番号を抽出する。

    TODO: 実際の案件名のフォーマットに合わせて正規表現を修正してください。

    例:
        "案件_00123_設備工事"   → "123"
        "[No.456] 改修工事"    → "456"
        "PRJ-789"              → "789"
    """
    if not text:
        return None

    # ── パターン例（実際のフォーマットに合わせて修正） ──────────────────
    patterns = [
        r"_0*(\d+)_",           # "案件_00123_工事" → "123"
        r"\[No\.(\d+)\]",       # "[No.456] 工事"  → "456"
        r"PRJ-(\d+)",           # "PRJ-789"         → "789"
        r"^(\d+)",              # 先頭が数字         → そのまま
    ]

    for pattern in patterns:
        m = re.search(pattern, text)
        if m:
            return m.group(1)

    return None
