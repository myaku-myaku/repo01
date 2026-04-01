#!/usr/bin/env python3
"""
DF（ダークファイバー）廃止管理 集計スクリプト

- DFrelation/ 配下の最新「DF廃止管理」CSVを自動取得
- ステータス「13.NTT申請完了」の行を抽出
- ルートコードを4つのExcelファイル（東西 × 県間/中継）から距離検索
- 合計距離・月額費用（km単価設定可能）・年額を算出
"""

import csv
import glob
import os
import re
import sys
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

# ──────────────────────────────────────────────
# 設定
# ──────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent

# 1m あたりの月額料金（円）── デフォルト 1.5 円/m/月
COST_PER_METER_PER_MONTH = 1.5


def calc_monthly_cost(total_distance_km: float,
                      cost_per_meter: float = COST_PER_METER_PER_MONTH) -> float:
    """距離(km)と1mあたり月額単価から月額費用を算出"""
    return total_distance_km * 1000 * cost_per_meter


def calc_annual_cost(total_distance_km: float,
                     cost_per_meter: float = COST_PER_METER_PER_MONTH) -> float:
    """距離(km)と1mあたり月額単価から年額費用を算出"""
    return calc_monthly_cost(total_distance_km, cost_per_meter) * 12


def _glob_nfd(pattern: str) -> list[str]:
    """macOS (HFS+/APFS) はファイル名を NFD で保持する場合がある。
    NFC と NFD の両方でパターンを試して結果を結合する。"""
    nfc = glob.glob(unicodedata.normalize("NFC", pattern))
    nfd = glob.glob(unicodedata.normalize("NFD", pattern))
    # 重複を除きつつ順序を保持
    seen = set()
    result = []
    for p in nfc + nfd:
        norm = unicodedata.normalize("NFC", p)
        if norm not in seen:
            seen.add(norm)
            result.append(p)
    return result


# ──────────────────────────────────────────────
# 1. 最新の「DF廃止管理」CSVファイルを取得
# ──────────────────────────────────────────────
def find_latest_df_cancel_csv(directory: Path) -> Path:
    """DF廃止管理 を含む最新のCSVファイルを返す"""
    pattern = str(directory / "*DF廃止管理*.csv")
    candidates = _glob_nfd(pattern)
    if not candidates:
        sys.exit("ERROR: 'DF廃止管理' を含むCSVファイルが見つかりません")

    # ファイル名末尾のタイムスタンプ (_YYYYMMDDTHHmmss+0900) でソート
    ts_re = re.compile(r"_(\d{8}T\d{6}[+\-]\d{4})\.csv$")

    def extract_ts(path: str):
        m = ts_re.search(path)
        if m:
            return m.group(1)
        # タイムスタンプが無い場合はファイル更新日時で代替
        return datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y%m%dT%H%M%S+0000")

    candidates.sort(key=extract_ts, reverse=True)
    return Path(candidates[0])


# ──────────────────────────────────────────────
# 2. CSVを読み込み、「13.NTT申請完了」行のルートコードを抽出
# ──────────────────────────────────────────────
def load_target_routes(csv_path: Path) -> pd.DataFrame:
    """CSVからステータスが 13.NTT申請完了 の行を抽出する"""
    rows = []
    with open(csv_path, encoding="cp932", errors="replace") as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            if len(row) <= 14:
                continue
            status = row[14].strip()
            if status == "13.NTT申請完了":
                rows.append({
                    "レコード番号": row[0],
                    "回線ID": row[3],
                    "ルートコード": row[8].strip(),
                    "接続開始日": row[9],
                    "エリア": row[10].strip(),
                    "県域": row[11].strip(),
                    "始点通信用建物": row[12],
                    "終点通信用建物": row[13],
                    "ステータス": status,
                    "解約依頼日": row[17] if len(row) > 17 else "",
                    "NTT申請日": row[20] if len(row) > 20 else "",
                    "オーダー番号": row[25] if len(row) > 25 else "",
                })

    df = pd.DataFrame(rows)
    if df.empty:
        sys.exit("ERROR: ステータスが '13.NTT申請完了' の行がありません")
    return df


# ──────────────────────────────────────────────
# 3. 4つの Excel から距離ルックアップ辞書を構築
# ──────────────────────────────────────────────
def build_distance_lookup(directory: Path) -> dict[str, tuple[float, str]]:
    """
    ルートコード → (距離km, ソースファイル名) のマッピングを作成。
    同じルートコードが複数ファイルに見つかった場合は最初にヒットした値を採用。
    """
    lookup: dict[str, tuple[float, str]] = {}

    sources = [
        # (ファイル名パターン, ルートコード列index(0基準), 距離列index, ヘッダー行(0基準))
        ("【西日本】県間中継系光ファイバ設備の情報*.xlsx",       0, 5, 12),  # A列, F列
        ("【西日本】中継系光ファイバ設備の状況・今後の計画*.xlsx", 0, 3, 17),  # A列, D列
        ("【東日本】県間中継光ファイバに関する情報開示*.xls",     1, 7, 2),   # B列, H列
        ("【東日本】中継光ファイバ提供可能区間表*.xlsx",          1, 6, 2),   # B列, G列
    ]

    for pattern, route_col, dist_col, header_row in sources:
        files = _glob_nfd(str(directory / pattern))
        if not files:
            print(f"  WARNING: '{pattern}' に一致するファイルが見つかりません")
            continue

        fpath = files[0]
        short_name = os.path.basename(fpath)
        print(f"  読込中: {short_name}")

        df = pd.read_excel(fpath, header=None, skiprows=header_row + 1)

        for _, row in df.iterrows():
            rc = row.iloc[route_col]
            dist = row.iloc[dist_col]
            if pd.isna(rc) or str(rc).strip() == "":
                continue
            rc_str = str(rc).strip()
            if rc_str in lookup:
                continue  # 先勝ち
            try:
                dist_val = float(dist)
            except (ValueError, TypeError):
                dist_val = None
            if dist_val is not None:
                lookup[rc_str] = (dist_val, short_name)

    return lookup


# ──────────────────────────────────────────────
# 4. メイン処理
# ──────────────────────────────────────────────
def main(cost_per_meter: float = COST_PER_METER_PER_MONTH):
    os.chdir(SCRIPT_DIR)

    print("=" * 60)
    print("DF廃止管理　解約距離・費用 集計スクリプト")
    print("=" * 60)

    # --- 最新CSV取得 ---
    csv_path = find_latest_df_cancel_csv(SCRIPT_DIR)
    print(f"\n対象CSV: {csv_path.name}")

    # --- 対象行抽出 ---
    df_target = load_target_routes(csv_path)
    print(f"ステータス「13.NTT申請完了」: {len(df_target)} 件")

    # --- 距離ルックアップ辞書構築 ---
    print("\n距離情報の読み込み:")
    lookup = build_distance_lookup(SCRIPT_DIR)
    print(f"  ルックアップ辞書: {len(lookup)} ルートコード登録済み")

    # --- マッチング ---
    distances = []
    sources = []
    for _, row in df_target.iterrows():
        rc = row["ルートコード"]
        if rc in lookup:
            dist, src = lookup[rc]
            distances.append(dist)
            sources.append(src)
        else:
            distances.append(None)
            sources.append("未検出")

    df_target["距離(km)"] = distances
    df_target["距離ソース"] = sources

    # --- 結果表示 ---
    matched = df_target[df_target["距離(km)"].notna()]
    unmatched = df_target[df_target["距離(km)"].isna()]

    print("\n" + "=" * 60)
    print("■ 詳細一覧（ルートコード × 距離）")
    print("=" * 60)

    display_cols = ["ルートコード", "エリア", "県域", "始点通信用建物",
                    "終点通信用建物", "距離(km)", "距離ソース"]
    print(matched[display_cols].to_string(index=False))

    if not unmatched.empty:
        print(f"\n※ 距離が見つからなかったルートコード ({len(unmatched)} 件):")
        for _, row in unmatched.iterrows():
            print(f"  {row['ルートコード']}  ({row['エリア']} {row['県域']})")

    # --- NTT申請日を datetime に変換 ---
    def _parse_date(s):
        """'2026/03/19 18:11' のような文字列を date に変換"""
        if not s or pd.isna(s):
            return pd.NaT
        s = str(s).strip()
        for fmt in ("%Y/%m/%d %H:%M", "%Y/%m/%d", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                return pd.Timestamp(datetime.strptime(s, fmt))
            except ValueError:
                continue
        return pd.NaT

    matched = matched.copy()
    matched["NTT申請日_dt"] = matched["NTT申請日"].apply(_parse_date)

    # --- 期間の基準日 ---
    today = pd.Timestamp(datetime.now().date())
    # 今月初日
    month_start = today.replace(day=1)
    # 今週月曜日 (ISO weekday: Mon=0)
    week_start = today - timedelta(days=today.weekday())

    mask_month = matched["NTT申請日_dt"] >= month_start
    mask_week  = matched["NTT申請日_dt"] >= week_start

    # --- 集計ヘルパー ---
    def _summarize(df_sub, label):
        km = df_sub["距離(km)"].sum()
        m_cost = calc_monthly_cost(km, cost_per_meter)
        a_cost = calc_annual_cost(km, cost_per_meter)
        return {"label": label, "件数": len(df_sub), "距離(km)": km,
                "月額": m_cost, "年額": a_cost}

    total_km = matched["距離(km)"].sum()
    monthly = calc_monthly_cost(total_km, cost_per_meter)
    annual = calc_annual_cost(total_km, cost_per_meter)

    periods = [
        _summarize(matched, "これまでの累計"),
        _summarize(matched[mask_month], f"今月の累計（{month_start.strftime('%Y/%m/%d')}〜）"),
        _summarize(matched[mask_week],  f"今週の累計（{week_start.strftime('%Y/%m/%d')}〜）"),
    ]

    print("\n" + "=" * 60)
    print("■ 集計結果")
    print("=" * 60)
    print(f"  対象レコード数     : {len(df_target)} 件")
    print(f"  距離取得成功       : {len(matched)} 件")
    print(f"  距離取得失敗       : {len(unmatched)} 件")
    print(f"  単価               : {cost_per_meter} 円/m/月 ({cost_per_meter * 1000:,.0f} 円/km/月)")
    print()

    for p in periods:
        print(f"  【{p['label']}】")
        print(f"    件数   : {p['件数']} 件")
        print(f"    距離   : {p['距離(km)']:,.1f} km")
        print(f"    月額   : {p['月額']:,.0f} 円")
        print(f"    年額   : {p['年額']:,.0f} 円")
        print()

    # --- CSV出力 ---
    out_name = f"DF解約距離集計_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    out_path = SCRIPT_DIR / out_name

    # 詳細データ
    df_target.to_csv(out_path, index=False, encoding="utf-8-sig")

    # 集計結果をCSV末尾に追記
    with open(out_path, "a", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([])  # 空行で区切り
        writer.writerow(["■ 集計結果"])
        writer.writerow(["項目", "値"])
        writer.writerow(["対象レコード数", f"{len(df_target)} 件"])
        writer.writerow(["距離取得成功", f"{len(matched)} 件"])
        writer.writerow(["距離取得失敗", f"{len(unmatched)} 件"])
        writer.writerow(["単価", f"{cost_per_meter} 円/m/月 ({cost_per_meter * 1000:,.0f} 円/km/月)"])
        writer.writerow([])
        for p in periods:
            writer.writerow([f"【{p['label']}】"])
            writer.writerow(["件数", f"{p['件数']} 件"])
            writer.writerow(["距離", f"{p['距離(km)']:,.1f} km"])
            writer.writerow(["月額", f"{p['月額']:,.0f} 円"])
            writer.writerow(["年額", f"{p['年額']:,.0f} 円"])
            writer.writerow([])

    print(f"\n詳細CSV出力: {out_name}（集計結果を末尾に記載）")

    return {
        "total_km": total_km,
        "monthly_cost": monthly,
        "annual_cost": annual,
        "matched_count": len(matched),
        "unmatched_count": len(unmatched),
    }


if __name__ == "__main__":
    # コマンドライン引数で単価を変更可能:  python df_cancel_summary.py [円/m/月]
    cost = COST_PER_METER_PER_MONTH
    if len(sys.argv) > 1:
        try:
            cost = float(sys.argv[1])
        except ValueError:
            print(f"WARNING: 引数 '{sys.argv[1]}' を数値に変換できません。デフォルト {COST_PER_METER_PER_MONTH} を使用します。")
    main(cost_per_meter=cost)
