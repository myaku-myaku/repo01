"""
update_dept.py
──────────────
部の Kintone REST API を使い、既存レコードをまとめて更新する。
API トークン認証を使用する。
"""
import logging
import math

import requests

import config

logger = logging.getLogger(__name__)

# Kintone の一括更新 API は最大 100 件まで
BATCH_SIZE = 100


def update_records(sync_records: list[dict]) -> dict:
    """
    同期対象レコードを部の Kintone に一括更新する。

    Args:
        sync_records: parse_csv.parse() の戻り値
            [{"dept_record_id": "123", "fields": {"status": "完了", ...}}, ...]

    Returns:
        {"success": int, "error": int} - 成功・失敗件数
    """
    if not sync_records:
        logger.info("更新対象レコードなし")
        return {"success": 0, "error": 0}

    base_url = f"https://{config.DEPT_KINTONE_DOMAIN}/k/v1"
    headers = {
        "X-Cybozu-API-Token": config.DEPT_API_TOKEN,
        "Content-Type": "application/json",
    }

    success_count = 0
    error_count = 0

    # バッチ処理（100 件ずつ）
    total_batches = math.ceil(len(sync_records) / BATCH_SIZE)
    for batch_idx in range(total_batches):
        batch = sync_records[batch_idx * BATCH_SIZE : (batch_idx + 1) * BATCH_SIZE]

        # Kintone の一括更新リクエスト形式に変換
        records_payload = []
        for rec in batch:
            record_entry = {
                "id": rec["dept_record_id"],
                "record": {
                    field_code: {"value": value}
                    for field_code, value in rec["fields"].items()
                },
            }
            records_payload.append(record_entry)

        payload = {
            "app": config.DEPT_APP_ID,
            "records": records_payload,
        }

        logger.info(
            f"バッチ {batch_idx + 1}/{total_batches} を更新中 "
            f"({len(batch)} 件: record_id {batch[0]['dept_record_id']} ～ {batch[-1]['dept_record_id']})"
        )

        try:
            resp = requests.put(
                f"{base_url}/records.json",
                headers=headers,
                json=payload,
                timeout=30,
            )
            resp.raise_for_status()
            success_count += len(batch)
            logger.info(f"  → 更新成功: {len(batch)} 件")

        except requests.HTTPError as e:
            error_count += len(batch)
            logger.error(f"  → HTTP エラー: {e.response.status_code} {e.response.text}")

        except requests.RequestException as e:
            error_count += len(batch)
            logger.error(f"  → 通信エラー: {e}")

    logger.info(f"更新完了 — 成功: {success_count} 件 / エラー: {error_count} 件")
    return {"success": success_count, "error": error_count}
