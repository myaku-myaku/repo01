"""
fetch_company.py
────────────────
Playwright を使って Icewall 経由で会社 Kintone にログインし、
対象アプリの全レコードを CSV でダウンロードする。

戻り値: ダウンロードした CSV ファイルのパス (str)
"""
import logging
import os
import time

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

import config

logger = logging.getLogger(__name__)


def fetch_csv() -> str:
    """
    会社 Kintone にログインして CSV をダウンロードし、保存先パスを返す。
    """
    os.makedirs(config.CSV_DOWNLOAD_DIR, exist_ok=True)

    with sync_playwright() as p:
        # headless=True で本番運用、デバッグ時は False に変更
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        # ── Step 1: Kintone URL を開く（Icewall にリダイレクトされる）────
        logger.info(f"Kintone へアクセス: {config.COMPANY_KINTONE_URL}")
        page.goto(config.COMPANY_KINTONE_URL, wait_until="networkidle")

        # ── Step 2: Icewall ログイン画面を検出してログイン ────────────────
        # TODO: 実際のIcewallのフォームのセレクタに合わせて修正してください
        #       ブラウザで右クリック → 検証 でセレクタを確認できます
        try:
            logger.info("Icewall ログインフォームを検索中...")

            # ユーザー名入力欄（例: input[name="username"] や input[type="text"]）
            page.wait_for_selector('input[name="username"]', timeout=10000)
            page.fill('input[name="username"]', config.ICEWALL_USERNAME)

            # パスワード入力欄
            page.fill('input[name="password"]', config.ICEWALL_PASSWORD)

            # ログインボタン（例: button[type="submit"] や input[type="submit"]）
            page.click('button[type="submit"]')

            # Kintone のトップページが表示されるまで待機
            page.wait_for_load_state("networkidle", timeout=30000)
            logger.info("ログイン成功")

        except PWTimeout:
            # すでにログイン済みの場合はこのブロックをスキップ
            logger.info("ログインフォームが見つからない（既にログイン済みの可能性）")

        # ── Step 3: 対象アプリページへ移動 ────────────────────────────────
        app_url = f"https://{_domain_from_url(config.COMPANY_KINTONE_URL)}/k/{config.COMPANY_APP_ID}/"
        logger.info(f"アプリページへ移動: {app_url}")
        page.goto(app_url, wait_until="networkidle")

        # ── Step 4: CSV エクスポート ───────────────────────────────────────
        csv_path = _export_csv_via_ui(page, context) or _export_csv_via_api(context)

        browser.close()

    logger.info(f"CSV 保存先: {csv_path}")
    return csv_path


def _export_csv_via_ui(page, context) -> str | None:
    """
    Kintone の UI 操作で CSV エクスポートを実行する。
    UI の構造が変わった場合はセレクタを修正する。
    """
    try:
        # Kintone の「ファイルに書き出す」ボタン（歯車アイコン or メニュー）
        # TODO: 実際の UI のセレクタに合わせて修正
        # 例1: ツールバーのエクスポートボタン
        # 例2: メニューから「ファイルに書き出す」をクリック

        # 書き出しメニューを開く
        page.click('.gaia-argoui-app-toolbar-menu-list-icon', timeout=5000)
        page.click('text=ファイルに書き出す', timeout=5000)

        # ダウンロードが始まるまで待機
        with page.expect_download(timeout=60000) as dl_info:
            page.click('text=書き出す', timeout=10000)

        download = dl_info.value
        save_path = os.path.join(config.CSV_DOWNLOAD_DIR, "company_export.csv")
        download.save_as(save_path)
        return save_path

    except Exception as e:
        logger.warning(f"UI 経由の CSV エクスポートに失敗: {e}")
        return None


def _export_csv_via_api(context) -> str:
    """
    Kintone の CSV エクスポート API を、ブラウザのセッション（Cookie）を使って呼び出す。
    UIのエクスポートが動作しない場合のフォールバック。
    """
    import requests

    # ブラウザのセッション Cookie を取得
    cookies = context.cookies()
    session_cookies = {c["name"]: c["value"] for c in cookies}

    domain = _domain_from_url(config.COMPANY_KINTONE_URL)

    # Kintone の CSV エクスポート API
    # 参考: https://cybozu.dev/ja/kintone/docs/rest-api/records/download-records/
    url = f"https://{domain}/k/v1/records.json"
    params = {
        "app": config.COMPANY_APP_ID,
        "totalCount": True,
    }

    # 全レコードを取得（最大 500 件ずつページング）
    all_records = []
    offset = 0
    limit = 500

    while True:
        params["query"] = f"limit {limit} offset {offset}"
        resp = requests.get(url, params=params, cookies=session_cookies)
        resp.raise_for_status()
        data = resp.json()
        records = data.get("records", [])
        all_records.extend(records)

        if len(records) < limit:
            break
        offset += limit

    # JSON → CSV に変換して保存
    import csv
    save_path = os.path.join(config.CSV_DOWNLOAD_DIR, "company_export.csv")
    if all_records:
        fieldnames = list(all_records[0].keys())
        with open(save_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for rec in all_records:
                # Kintone API レスポンスのフィールド値を平坦化
                row = {k: v.get("value", "") for k, v in rec.items()}
                writer.writerow(row)

    logger.info(f"API 経由で {len(all_records)} 件取得")
    return save_path


def _domain_from_url(url: str) -> str:
    """URL からドメインを抽出する（例: https://example.kintone.com/k/1/ → example.kintone.com）"""
    from urllib.parse import urlparse
    return urlparse(url).netloc
