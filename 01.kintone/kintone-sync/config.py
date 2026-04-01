"""
設定ファイル
.env の値を読み込んで各モジュールに提供する
"""
import json
import os
from dotenv import load_dotenv

load_dotenv()


def _require(key: str) -> str:
    value = os.getenv(key)
    if not value:
        raise EnvironmentError(f"環境変数 '{key}' が設定されていません。.env を確認してください。")
    return value


# ── 会社 Kintone ─────────────────────────────────────────────
COMPANY_KINTONE_URL: str = _require("COMPANY_KINTONE_URL")
COMPANY_APP_ID: str      = _require("COMPANY_APP_ID")
ICEWALL_USERNAME: str    = _require("ICEWALL_USERNAME")
ICEWALL_PASSWORD: str    = _require("ICEWALL_PASSWORD")
CSV_DOWNLOAD_DIR: str    = os.getenv("CSV_DOWNLOAD_DIR", "/tmp/kintone_csv")

# ── 部の Kintone ──────────────────────────────────────────────
DEPT_KINTONE_DOMAIN: str = _require("DEPT_KINTONE_DOMAIN")
DEPT_APP_ID: str         = _require("DEPT_APP_ID")
DEPT_API_TOKEN: str      = _require("DEPT_API_TOKEN")

# ── フィールドマッピング ───────────────────────────────────────
COMPANY_KEY_FIELD: str = os.getenv("COMPANY_KEY_FIELD", "案件名")
DEPT_KEY_FIELD: str    = os.getenv("DEPT_KEY_FIELD", "record_number")
FIELD_MAP: dict        = json.loads(os.getenv("FIELD_MAP", "{}"))

# ── ログ ──────────────────────────────────────────────────────
LOG_FILE: str = os.getenv("LOG_FILE", "/tmp/kintone_sync.log")
