import pandas as pd
import os
import sys
import glob
import re
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import PatternFill

"""
回線調査スクリプト v3
v2ベース + KintoneインポートCSV差分更新機能

変更点:
  - 出力ファイルを xlsx と kintone-tbl-import.csv の2種類に変更
  - 同ディレクトリ内の既存KintoneエクスポートCSV（xxxxDF解約リスト_YYYYMMDD...csv）を自動検出
  - 既存CSVと調査結果を突き合わせ:
    - 既存レコード → 「使用状態」列のみ更新
    - 新規レコード → 新たに追加
"""

# スクリプトのディレクトリに移動
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)

# 案件管理ファイル
DF_LIST_EAST = "DF管理一覧表(東日本).xlsm"
DF_LIST_WEST = "DF管理一覧表(西日本).xlsm"
DF_LIST_EAST_CACHE = "DF管理一覧表_東日本_cache.csv"
DF_LIST_WEST_CACHE = "DF管理一覧表_西日本_cache.csv"

# 案件データ
df_anken_east = None
df_anken_west = None

# ファイル定義
EAST_CHUKEI = "2780_tyuukei.csv"
EAST_KYOKUNAI = "2780_kyokunai.csv"
EAST_TANMATU = "2780_tanmatu.csv"
WEST_CHUKEI = "1510_tyuukei.csv"
WEST_KYOKUNAI = "1510_kyokunai.csv"
WEST_TANMATU = "1510_tanmatu.csv"

# グローバル変数
df_east_chukei = None
df_east_kyokunai = None
df_east_tanmatu = None
df_west_chukei = None
df_west_kyokunai = None
df_west_tanmatu = None

# 未利用芯線状況ファイル
df_west_kenkan = None
df_west_chukei_joukyou = None
df_east_kenkan = None
df_east_chukei_teikyo = None

# 拠点マスタ
df_kyoten_master = None

def read_csv_safe(filepath):
    """CSVファイルを安全に読み込む"""
    encodings = ['cp932', 'shift_jis', 'utf-8', 'utf-8-sig']
    for enc in encodings:
        try:
            df = pd.read_csv(filepath, encoding=enc, low_memory=False, on_bad_lines='skip', encoding_errors='ignore')
            print(f"  {filepath}: {enc}で読み込み成功 ({len(df)}行)")
            return df
        except Exception as e:
            continue
    print(f"  警告: {filepath}の読み込みに失敗")
    return pd.DataFrame()

def load_anken_data():
    """案件データを読み込む（キャッシュ優先・自動更新対応）"""
    global df_anken_east, df_anken_west
    
    print("\n案件データ読み込み中...")
    
    # 東日本
    if os.path.exists(DF_LIST_EAST_CACHE) and os.path.exists(DF_LIST_EAST):
        cache_time = os.path.getmtime(DF_LIST_EAST_CACHE)
        excel_time = os.path.getmtime(DF_LIST_EAST)
        
        if excel_time > cache_time:
            print(f"  東日本: Excelファイルが更新されています → キャッシュ再生成")
            df_anken_east = load_anken_excel(DF_LIST_EAST, DF_LIST_EAST_CACHE)
        else:
            cache_dt = datetime.fromtimestamp(cache_time)
            print(f"  東日本: キャッシュ使用 {DF_LIST_EAST_CACHE} ({cache_dt.strftime('%Y-%m-%d %H:%M')})")
            df_anken_east = pd.read_csv(DF_LIST_EAST_CACHE, encoding='utf-8-sig')
            print(f"  東日本: 読み込み完了 ({len(df_anken_east)}行)")
    elif os.path.exists(DF_LIST_EAST_CACHE):
        cache_dt = datetime.fromtimestamp(os.path.getmtime(DF_LIST_EAST_CACHE))
        print(f"  東日本: キャッシュ使用 {DF_LIST_EAST_CACHE} ({cache_dt.strftime('%Y-%m-%d %H:%M')})")
        df_anken_east = pd.read_csv(DF_LIST_EAST_CACHE, encoding='utf-8-sig')
        print(f"  東日本: 読み込み完了 ({len(df_anken_east)}行)")
    else:
        df_anken_east = load_anken_excel(DF_LIST_EAST, DF_LIST_EAST_CACHE)
    
    # 西日本
    if os.path.exists(DF_LIST_WEST_CACHE) and os.path.exists(DF_LIST_WEST):
        cache_time = os.path.getmtime(DF_LIST_WEST_CACHE)
        excel_time = os.path.getmtime(DF_LIST_WEST)
        
        if excel_time > cache_time:
            print(f"  西日本: Excelファイルが更新されています → キャッシュ再生成")
            df_anken_west = load_anken_excel(DF_LIST_WEST, DF_LIST_WEST_CACHE)
        else:
            cache_dt = datetime.fromtimestamp(cache_time)
            print(f"  西日本: キャッシュ使用 {DF_LIST_WEST_CACHE} ({cache_dt.strftime('%Y-%m-%d %H:%M')})")
            df_anken_west = pd.read_csv(DF_LIST_WEST_CACHE, encoding='utf-8-sig')
            print(f"  西日本: 読み込み完了 ({len(df_anken_west)}行)")
    elif os.path.exists(DF_LIST_WEST_CACHE):
        cache_dt = datetime.fromtimestamp(os.path.getmtime(DF_LIST_WEST_CACHE))
        print(f"  西日本: キャッシュ使用 {DF_LIST_WEST_CACHE} ({cache_dt.strftime('%Y-%m-%d %H:%M')})")
        df_anken_west = pd.read_csv(DF_LIST_WEST_CACHE, encoding='utf-8-sig')
        print(f"  西日本: 読み込み完了 ({len(df_anken_west)}行)")
    else:
        df_anken_west = load_anken_excel(DF_LIST_WEST, DF_LIST_WEST_CACHE)
    
    print("案件データ読み込み完了\n")

def load_anken_excel(excel_file, cache_file):
    """Excelから案件データを読み込み、キャッシュを作成"""
    if not os.path.exists(excel_file):
        print(f"  警告: {excel_file} が見つかりません")
        return pd.DataFrame(columns=["中継回線", "リング名"])
    
    print(f"  {excel_file} 読み込み中...")
    try:
        df = pd.read_excel(excel_file, sheet_name="一覧", engine='openpyxl', header=1)
        
        if "中継回線" in df.columns and "リング名" in df.columns:
            df_cache = df[["中継回線", "リング名"]].copy()
        elif "中継回線ID" in df.columns and "リング名" in df.columns:
            df_cache = df[["中継回線ID", "リング名"]].copy()
            df_cache.columns = ["中継回線", "リング名"]
        else:
            df_cache = df.iloc[:, [3, 8]].copy()
            df_cache.columns = ["中継回線", "リング名"]
        
        df_cache = df_cache.dropna(subset=["中継回線"])
        df_cache = df_cache[df_cache["中継回線"].astype(str) != "中継回線"]
        df_cache = df_cache[df_cache["中継回線"].astype(str) != "中継回線ID"]
        df_cache["中継回線"] = df_cache["中継回線"].apply(normalize_id)
        
        df_cache.to_csv(cache_file, index=False, encoding='utf-8-sig')
        print(f"  読み込み成功 ({len(df_cache)}行) → キャッシュ作成: {cache_file}")
        
        return df_cache
    except Exception as e:
        print(f"  エラー: {excel_file} の読み込みに失敗: {e}")
        return pd.DataFrame(columns=["中継回線", "リング名"])

def get_anken_name(circuit_id, area):
    """回線IDから案件名を取得"""
    if not circuit_id or circuit_id in ["-", "", "nan"]:
        return ""
    
    circuit_id = normalize_id(circuit_id)
    df_anken = df_anken_east if area == "東日本" else df_anken_west
    
    if df_anken is None or df_anken.empty:
        return ""
    
    matches = df_anken[df_anken["中継回線"].astype(str) == str(circuit_id)]
    if not matches.empty:
        anken = matches.iloc[0]["リング名"]
        return str(anken) if pd.notna(anken) else ""
    
    return ""

def load_all_files():
    """全CSVファイルを読み込む"""
    global df_east_chukei, df_east_kyokunai, df_east_tanmatu
    global df_west_chukei, df_west_kyokunai, df_west_tanmatu
    global df_west_kenkan, df_west_chukei_joukyou, df_east_kenkan, df_east_chukei_teikyo
    global df_kyoten_master
    
    print("CSVファイル読み込み中...")
    df_east_chukei = read_csv_safe(EAST_CHUKEI)
    df_east_kyokunai = read_csv_safe(EAST_KYOKUNAI)
    df_east_tanmatu = read_csv_safe(EAST_TANMATU)
    df_west_chukei = read_csv_safe(WEST_CHUKEI)
    df_west_kyokunai = read_csv_safe(WEST_KYOKUNAI)
    df_west_tanmatu = read_csv_safe(WEST_TANMATU)
    print("読み込み完了\n")
    
    print("未利用芯線状況ファイル読み込み中...")
    df_west_kenkan = load_latest_excel(".*西日本.*県間.*\\.xlsx", header_row=12)
    df_west_chukei_joukyou = load_latest_excel(".*西日本.*中継.*状況.*\\.xlsx", header_row=17)
    df_east_kenkan = load_latest_excel(".*東日本.*県間.*\\.xls", header_row=2)
    df_east_chukei_teikyo = load_latest_excel(".*東日本.*中継.*提供.*\\.xlsx", header_row=2)
    print("読み込み完了\n")
    
    print("拠点マスタ読み込み中...")
    df_kyoten_master = load_kyoten_master()
    print("読み込み完了\n")

def load_latest_excel(pattern, header_row=0):
    """最新のExcel/XLSファイルを読み込む（正規表現パターンマッチング）"""
    regex = re.compile(pattern)
    files = [f for f in os.listdir('.') if regex.match(f) and not f.startswith('~$')]
    
    if not files:
        print(f"  警告: パターン '{pattern}' に一致するファイルが見つかりません")
        return pd.DataFrame()
    
    latest_file = sorted(files)[-1]
    try:
        df = pd.read_excel(latest_file, engine='openpyxl' if latest_file.endswith('.xlsx') else 'xlrd', header=header_row)
        print(f"  {latest_file}: 読み込み成功 ({len(df)}行)")
        return df
    except Exception as e:
        print(f"  警告: {latest_file} の読み込みに失敗: {e}")
        return pd.DataFrame()

def load_kyoten_master():
    """拠点マスタCSVを読み込む"""
    files = [f for f in os.listdir('.') if '拠点マスタ' in f and f.endswith('.csv') and not f.startswith('~$')]
    
    if not files:
        print(f"  警告: 拠点マスタファイルが見つかりません")
        return pd.DataFrame()
    
    latest_file = sorted(files)[-1]
    encodings = ['cp932', 'shift_jis', 'utf-8', 'utf-8-sig']
    for enc in encodings:
        try:
            df = pd.read_csv(latest_file, encoding=enc, low_memory=False)
            print(f"  {latest_file}: 読み込み成功 ({len(df)}行)")
            return df
        except Exception as e:
            continue
    
    print(f"  警告: {latest_file} の読み込みに失敗")
    return pd.DataFrame()

def get_kendo(building_name):
    """ビル名から県域を取得"""
    if not building_name or building_name in ["-", "", "nan"]:
        return ""
    
    if df_kyoten_master is None or df_kyoten_master.empty:
        return ""
    
    if 'ビル名' not in df_kyoten_master.columns or '県域' not in df_kyoten_master.columns:
        return ""
    
    building_name = str(building_name).strip()
    matches = df_kyoten_master[df_kyoten_master['ビル名'].astype(str) == building_name]
    
    if not matches.empty:
        kendo = matches.iloc[0]['県域']
        return str(kendo) if pd.notna(kendo) else ""
    
    return ""

def create_df_list():
    """DF_list.xlsxを生成"""
    print("DF_list.xlsx生成中...")
    data = []
    
    if not df_west_chukei.empty:
        for cid in df_west_chukei.iloc[:, 6].dropna():
            data.append({"対象エリア": "西日本", "回線ID": str(cid)})
    
    if not df_east_chukei.empty:
        for cid in df_east_chukei.iloc[:, 6].dropna():
            data.append({"対象エリア": "東日本", "回線ID": str(cid)})
    
    df = pd.DataFrame(data)
    df.to_excel("DF_list.xlsx", index=False)
    print(f"DF_list.xlsx生成完了 ({len(df)}件)\n")
    return df

def normalize_id(circuit_id):
    """回線IDを正規化（ゼロパディング除去）"""
    if pd.isna(circuit_id) or circuit_id == "":
        return ""
    s = str(circuit_id).strip()
    if s.replace(".", "").replace("-", "").isdigit():
        try:
            return str(int(float(s)))
        except:
            return s
    return s

def get_unused_core_status(route_code, area):
    """ルートコードから未利用芯線状況を取得"""
    if not route_code or route_code in ["-", "", "nan"]:
        return ""
    
    route_code = str(route_code).strip()
    
    if area == "西日本":
        if not df_west_kenkan.empty:
            route_col = [c for c in df_west_kenkan.columns if 'ルートコード' in str(c)]
            status_col = [c for c in df_west_kenkan.columns if '未利用芯線状況' in str(c)]
            if route_col and status_col:
                matches = df_west_kenkan[df_west_kenkan[route_col[0]].astype(str) == route_code]
                if not matches.empty:
                    status = matches.iloc[0][status_col[0]]
                    if pd.notna(status) and str(status) not in ['※３', '※3']:
                        return str(status)
        
        if not df_west_chukei_joukyou.empty:
            route_col = [c for c in df_west_chukei_joukyou.columns if 'ルートコード' in str(c)]
            status_col = [c for c in df_west_chukei_joukyou.columns if '未利用芯線状況' in str(c)]
            if route_col and status_col:
                matches = df_west_chukei_joukyou[df_west_chukei_joukyou[route_col[0]].astype(str) == route_code]
                if not matches.empty:
                    status = matches.iloc[0][status_col[0]]
                    if pd.notna(status) and str(status) not in ['※３', '※3']:
                        return str(status)
    
    else:  # 東日本
        if not df_east_kenkan.empty and len(df_east_kenkan.columns) > 8:
            matches = df_east_kenkan[df_east_kenkan.iloc[:, 1].astype(str) == route_code]
            if not matches.empty:
                status = matches.iloc[0].iloc[8]
                if pd.notna(status):
                    return str(status)
        
        if not df_east_chukei_teikyo.empty and len(df_east_chukei_teikyo.columns) > 8:
            matches = df_east_chukei_teikyo[df_east_chukei_teikyo.iloc[:, 1].astype(str) == route_code]
            if not matches.empty:
                status = matches.iloc[0].iloc[8]
                if pd.notna(status):
                    return str(status)
    
    return ""

def get_same_route_count(route_code, area):
    """同じルートコードを持つ使用中の回線数を取得"""
    if not route_code or route_code in ["-", "", "nan"]:
        return ""
    
    route_code = str(route_code).strip()
    df = df_east_chukei if area == "東日本" else df_west_chukei
    
    if df.empty or len(df.columns) < 10:
        return ""
    
    matching_rows = df[
        (df.iloc[:, 9].astype(str) == route_code) & 
        (df.iloc[:, 8].astype(str) == "使用中")
    ]
    
    count = len(matching_rows)
    return str(count)

def search_chukei(circuit_id, area):
    """中継回線を検索"""
    df = df_east_chukei if area == "東日本" else df_west_chukei
    
    matches = df[df.iloc[:, 6].astype(str) == str(circuit_id)]
    if matches.empty:
        return None
    
    row = matches.iloc[0]
    return {
        "回線ID": str(row.iloc[6]),
        "使用状態": str(row.iloc[8]) if pd.notna(row.iloc[8]) else "",
        "ルートコード": str(row.iloc[9]) if pd.notna(row.iloc[9]) else "",
        "始点通信用建物": str(row.iloc[10]) if pd.notna(row.iloc[10]) else "",
        "終点通信用建物": str(row.iloc[19]) if pd.notna(row.iloc[19]) else "",
        "距離": str(row.iloc[28]) if pd.notna(row.iloc[28]) else "",
        "接続開始日": str(row.iloc[32]) if pd.notna(row.iloc[32]) else "",
        "始点局内伝送路": str(row.iloc[16]) if pd.notna(row.iloc[16]) else "",
        "終点局内伝送路": str(row.iloc[25]) if pd.notna(row.iloc[25]) else "",
    }

def search_kyokunai(circuit_id, area):
    """局内回線を検索"""
    df = df_east_kyokunai if area == "東日本" else df_west_kyokunai
    
    matches = df[df.iloc[:, 6].astype(str) == str(circuit_id)]
    if matches.empty:
        return []
    
    results = []
    for idx, row in matches.iterrows():
        usage = str(row.iloc[8]) if pd.notna(row.iloc[8]) else ""
        
        n_val = str(row.iloc[13]) if pd.notna(row.iloc[13]) else ""
        o_val = str(row.iloc[14]) if pd.notna(row.iloc[14]) else ""
        x_val = str(row.iloc[23]) if pd.notna(row.iloc[23]) else ""
        y_val = str(row.iloc[24]) if pd.notna(row.iloc[24]) else ""
        
        if o_val in ["端末回線", "中継回線", "局内回線"]:
            start_id, start_type = n_val, o_val
        elif n_val in ["端末回線", "中継回線", "局内回線"]:
            start_id, start_type = o_val, n_val
        else:
            start_id, start_type = n_val, o_val
        
        if y_val in ["端末回線", "中継回線", "局内回線"]:
            end_id, end_type = x_val, y_val
        elif x_val in ["端末回線", "中継回線", "局内回線"]:
            end_id, end_type = y_val, x_val
        else:
            end_id, end_type = x_val, y_val
        
        results.append({
            "回線ID": str(row.iloc[6]),
            "使用状態": usage,
            "建物": str(row.iloc[10]) if pd.notna(row.iloc[10]) else "",
            "接続開始日": str(row.iloc[38]) if pd.notna(row.iloc[38]) else "",
            "始点回線ID": start_id,
            "始点回線種別": start_type,
            "終点回線ID": end_id,
            "終点回線種別": end_type,
        })
    
    return results

def search_tanmatu(circuit_id, area):
    """端末回線を検索"""
    df = df_east_tanmatu if area == "東日本" else df_west_tanmatu
    
    if df.empty or df.shape[1] < 16:
        return None
    
    matches = df[df.iloc[:, 6].astype(str) == str(circuit_id)]
    if matches.empty:
        matches = df[df.iloc[:, 15].astype(str) == str(circuit_id)]
    
    if matches.empty:
        return None
    
    row = matches.iloc[0]
    return {
        "回線ID": str(row.iloc[6]),
        "使用状態": str(row.iloc[8]) if pd.notna(row.iloc[8]) else "",
        "始点建物": str(row.iloc[9]) if pd.notna(row.iloc[9]) else "",
        "接続開始日": str(row.iloc[38]) if pd.notna(row.iloc[38]) else "",
        "始点局内伝送路": str(row.iloc[15]) if pd.notna(row.iloc[15]) else "",
    }

def trace_circuit(target_circuit_id, area, used_circuit_ids):
    """調査対象中継回線IDを起点に両方向へ探索"""
    visited = set()
    
    def get_circuit_info(cid):
        chukei = search_chukei(cid, area)
        if chukei:
            return "中継", chukei
        
        kyokunai_list = search_kyokunai(cid, area)
        if kyokunai_list:
            for k in kyokunai_list:
                if k["使用状態"] == "使用中":
                    return "局内", k
        
        tanmatu = search_tanmatu(cid, area)
        if tanmatu:
            return "端末", tanmatu
        
        return None, None
    
    def trace_recursive(cid, from_cid=None):
        norm_id = normalize_id(cid)
        
        if norm_id in visited:
            return []
        visited.add(norm_id)
        
        if norm_id in used_circuit_ids:
            return []
        
        kind, info = get_circuit_info(cid)
        if not info:
            return []
        
        results = []
        next_candidates = []
        
        if kind == "中継":
            start_id = info["始点局内伝送路"]
            end_id = info["終点局内伝送路"]
            
            norm_from = normalize_id(from_cid) if from_cid else None
            norm_start = normalize_id(start_id) if start_id and start_id not in ["-", "", "nan"] else None
            norm_end = normalize_id(end_id) if end_id and end_id not in ["-", "", "nan"] else None
            
            if from_cid is None:
                if norm_start:
                    next_candidates.append(start_id)
                if norm_end:
                    next_candidates.append(end_id)
            elif norm_from == norm_start:
                if norm_end:
                    next_candidates.append(end_id)
            elif norm_from == norm_end:
                if norm_start:
                    next_candidates.append(start_id)
            else:
                if norm_start:
                    next_candidates.append(start_id)
                if norm_end:
                    next_candidates.append(end_id)
            
            route_code = info.get("ルートコード", "")
            unused_core = get_unused_core_status(route_code, area)
            same_route_count = get_same_route_count(route_code, area)
            
            results.append({
                "種別": "中継回線",
                "方向": "中継回線",
                "回線ID": info["回線ID"],
                "使用状態": info["使用状態"],
                "ルートコード": route_code,
                "回線未利用芯線状況": unused_core,
                "始点通信用建物": info.get("始点通信用建物", ""),
                "終点通信用建物": info.get("終点通信用建物", ""),
                "距離": info.get("距離", ""),
                "接続開始日": info.get("接続開始日", ""),
                "使用中同一ルート回線数": same_route_count,
                "始点回線ID": start_id,
                "始点回線種別": "局内回線" if start_id and start_id not in ["-", "", "nan"] else "",
                "終点回線ID": end_id,
                "終点回線種別": "局内回線" if end_id and end_id not in ["-", "", "nan"] else "",
            })
        
        elif kind == "局内":
            start_id = info["始点回線ID"]
            start_type = info["始点回線種別"]
            end_id = info["終点回線ID"]
            end_type = info["終点回線種別"]
            
            norm_from = normalize_id(from_cid) if from_cid else None
            norm_start = normalize_id(start_id) if start_id and start_id not in ["-", "", "nan"] else None
            norm_end = normalize_id(end_id) if end_id and end_id not in ["-", "", "nan"] else None
            
            direction = "始点"
            
            if from_cid is None:
                if norm_start:
                    next_candidates.append(start_id)
                if norm_end:
                    next_candidates.append(end_id)
            elif norm_from == norm_start:
                direction = "始点"
                if norm_end:
                    next_candidates.append(end_id)
            elif norm_from == norm_end:
                direction = "終点"
                if norm_start:
                    next_candidates.append(start_id)
            else:
                if norm_start:
                    next_candidates.append(start_id)
                if norm_end:
                    next_candidates.append(end_id)
            
            building = info.get("建物", "")
            results.append({
                "種別": "局内回線",
                "方向": direction,
                "回線ID": info["回線ID"],
                "使用状態": info["使用状態"],
                "ルートコード": "",
                "回線未利用芯線状況": "",
                "始点通信用建物": building,
                "終点通信用建物": "",
                "距離": "",
                "接続開始日": info.get("接続開始日", ""),
                "使用中同一ルート回線数": "",
                "始点回線ID": start_id,
                "始点回線種別": start_type,
                "終点回線ID": end_id,
                "終点回線種別": end_type,
            })
        
        elif kind == "端末":
            start_id = info["始点局内伝送路"]
            
            norm_from = normalize_id(from_cid) if from_cid else None
            norm_start = normalize_id(start_id) if start_id and start_id not in ["-", "", "nan"] else None
            
            direction = "始点"
            
            if from_cid is None:
                if norm_start:
                    next_candidates.append(start_id)
            elif norm_from != norm_start:
                if norm_start:
                    next_candidates.append(start_id)
                direction = "始点"
            else:
                direction = "終点"
            
            start_building = info.get("始点建物", "")
            results.append({
                "種別": "端末回線",
                "方向": direction,
                "回線ID": info["回線ID"],
                "使用状態": info["使用状態"],
                "ルートコード": "",
                "回線未利用芯線状況": "",
                "始点通信用建物": start_building,
                "終点通信用建物": "",
                "距離": "",
                "接続開始日": info.get("接続開始日", ""),
                "使用中同一ルート回線数": "",
                "始点回線ID": start_id,
                "始点回線種別": "局内回線" if start_id and start_id not in ["-", "", "nan"] else "",
                "終点回線ID": "",
                "終点回線種別": "",
            })
        
        for next_id in next_candidates:
            next_results = trace_recursive(next_id, cid)
            results.extend(next_results)
        
        return results
    
    norm_target = normalize_id(target_circuit_id)
    if norm_target in used_circuit_ids:
        return []
    
    all_results = trace_recursive(target_circuit_id)
    
    if all_results:
        all_results = sort_circuit_chain(all_results)
    
    return all_results

def sort_circuit_chain(results):
    """回線チェーンを始点端から終点端の順に並び替え"""
    if not results:
        return results
    
    circuit_map = {normalize_id(r["回線ID"]): r for r in results}
    connections = {}
    
    for r in results:
        norm_id = normalize_id(r["回線ID"])
        connections[norm_id] = []
        
        start_id = r.get("始点回線ID")
        if start_id and start_id not in ["-", "", "nan", None]:
            norm_start = normalize_id(start_id)
            if norm_start in circuit_map:
                connections[norm_id].append(norm_start)
        
        end_id = r.get("終点回線ID")
        if end_id and end_id not in ["-", "", "nan", None]:
            norm_end = normalize_id(end_id)
            if norm_end in circuit_map:
                connections[norm_id].append(norm_end)
    
    endpoints = []
    for cid, neighbors in connections.items():
        if len(neighbors) <= 1:
            endpoints.append(cid)
    
    if not endpoints:
        return results
    
    def bfs_longest_path(start_id):
        visited = {start_id}
        path = [start_id]
        current = start_id
        
        while True:
            next_id = None
            for neighbor in connections.get(current, []):
                if neighbor not in visited:
                    next_id = neighbor
                    break
            
            if not next_id:
                break
            
            visited.add(next_id)
            path.append(next_id)
            current = next_id
        
        return path
    
    best_path = []
    for endpoint in endpoints:
        path = bfs_longest_path(endpoint)
        if len(path) > len(best_path):
            best_path = path
    
    sorted_results = []
    for cid in best_path:
        if cid in circuit_map:
            sorted_results.append(circuit_map[cid])
    
    visited_set = set(best_path)
    for r in results:
        if normalize_id(r["回線ID"]) not in visited_set:
            sorted_results.append(r)
    
    return sorted_results


# ===========================================================================
# v3 追加: 既存Kintone CSVの読み込み・差分マージ
# ===========================================================================

def find_kintone_export_csv():
    """
    同ディレクトリ内にある xxxxDF解約リスト_YYYYMMDDTHHMMSS+0900.csv を検出し、
    最新のファイルを返す。日付が今日でなければ警告を出す。
    """
    pattern = re.compile(r'(.+DF解約リスト_(\d{8})T\d{6}\+\d{4}\.csv)$')
    
    candidates = []
    for f in os.listdir('.'):
        m = pattern.match(f)
        if m and not f.startswith('~$'):
            candidates.append((f, m.group(2)))  # (filename, YYYYMMDD)
    
    if not candidates:
        print("\n⚠️  既存KintoneエクスポートCSV（DF解約リスト_*.csv）が見つかりません")
        print("   → kintone-tbl-import.csv は全行新規追加として生成します\n")
        return None
    
    # 最新ファイル（ファイル名の日付順でソート）
    candidates.sort(key=lambda x: x[0], reverse=True)
    latest_file, date_str = candidates[0]
    
    # 日付チェック
    today_str = datetime.now().strftime('%Y%m%d')
    if date_str != today_str:
        print(f"\n⚠️  既存KintoneエクスポートCSVの日付が古い可能性があります")
        print(f"   ファイル: {latest_file}")
        print(f"   ファイル日付: {date_str[:4]}/{date_str[4:6]}/{date_str[6:8]}")
        print(f"   今日の日付:   {today_str[:4]}/{today_str[4:6]}/{today_str[6:8]}")
        print(f"   → 最新データでない可能性があります。必要に応じてKintoneから再エクスポートしてください\n")
    else:
        print(f"\n✅ 既存KintoneエクスポートCSV検出: {latest_file} (本日のデータ)\n")
    
    return latest_file


def load_kintone_export(filepath):
    """
    KintoneエクスポートCSVを読み込み、調査対象中継回線ID_No をキーとした辞書を作成
    """
    encodings = ['cp932', 'shift_jis', 'utf-8', 'utf-8-sig']
    df = None
    for enc in encodings:
        try:
            df = pd.read_csv(filepath, encoding=enc, low_memory=False,
                             on_bad_lines='skip', encoding_errors='replace')
            print(f"  既存CSV読み込み: {enc} ({len(df)}行)")
            break
        except Exception:
            continue
    
    if df is None or df.empty:
        print(f"  警告: {filepath} の読み込みに失敗")
        return pd.DataFrame()
    
    return df


def build_kintone_import_csv(df_new_tbl, kintone_export_file):
    """
    調査結果（df_new_tbl）と既存KintoneエクスポートCSVをマージして
    kintone-tbl-import.csv 用の DataFrame を生成する。

    ロジック:
      - 既存CSVの全行をベースにする
      - 調査対象中継回線ID_No で突き合わせ
      - 既存行: 「使用状態」列のみ調査結果で上書き
      - 新規行: 全列を新規追加
    """
    if kintone_export_file is None:
        # 既存CSVが無い場合は新規データをそのまま返す
        return df_new_tbl
    
    df_existing = load_kintone_export(kintone_export_file)
    if df_existing.empty:
        return df_new_tbl
    
    # --- 調査対象中継回線ID_No を文字列キーとして正規化 ---
    def make_id_no_key(val):
        """ID_No を整数文字列に正規化"""
        if pd.isna(val) or str(val).strip() in ['', 'nan']:
            return ''
        try:
            return str(int(float(val)))
        except (ValueError, OverflowError):
            return str(val).strip()
    
    # 新規データのキーマップ: {ID_No: 行データ(dict)}
    new_data_map = {}
    for idx in df_new_tbl.index:
        id_no = make_id_no_key(df_new_tbl.at[idx, '調査対象中継回線ID_No'])
        if id_no:
            new_data_map[id_no] = idx
    
    # 既存CSVの ID_No キーセット
    existing_id_nos = set()
    if '調査対象中継回線ID_No' in df_existing.columns:
        for idx in df_existing.index:
            key = make_id_no_key(df_existing.at[idx, '調査対象中継回線ID_No'])
            if key:
                existing_id_nos.add(key)
    
    # --- 既存データの「使用状態」を更新 ---
    updated_count = 0
    not_found_count = 0
    
    if '調査対象中継回線ID_No' in df_existing.columns and '使用状態' in df_existing.columns:
        for idx in df_existing.index:
            key = make_id_no_key(df_existing.at[idx, '調査対象中継回線ID_No'])
            if not key:
                continue
            
            if key in new_data_map:
                new_idx = new_data_map[key]
                new_usage = df_new_tbl.at[new_idx, '使用状態']
                old_usage = df_existing.at[idx, '使用状態']
                
                if pd.notna(new_usage) and str(new_usage).strip() != '':
                    if str(old_usage) != str(new_usage):
                        df_existing.at[idx, '使用状態'] = new_usage
                        updated_count += 1
            else:
                not_found_count += 1
    
    print(f"  既存レコードの使用状態更新: {updated_count}件")
    if not_found_count > 0:
        print(f"  既存CSVにあるが今回の調査結果に無い行: {not_found_count}件（そのまま保持）")
    
    # --- 新規行の追加（既存CSVに無い調査対象中継回線ID_No） ---
    new_rows = []
    for id_no, new_idx in new_data_map.items():
        if id_no not in existing_id_nos:
            new_rows.append(df_new_tbl.loc[new_idx].to_dict())
    
    print(f"  新規追加行: {len(new_rows)}件")
    
    if new_rows:
        df_new_additions = pd.DataFrame(new_rows)
        
        # 既存CSVの列構造に合わせる（既存に無い列は追加、新規に無い列は空白）
        for col in df_existing.columns:
            if col not in df_new_additions.columns:
                df_new_additions[col] = ''
        
        # 既存CSVの列順に合わせる
        df_new_additions = df_new_additions.reindex(columns=df_existing.columns, fill_value='')
        
        # 新規行のレコードの開始行を設定
        # 新規行はグループ内連番=1 なら "*"
        if 'レコードの開始行' in df_new_additions.columns and 'グループ内連番' in df_new_additions.columns:
            for idx in df_new_additions.index:
                seq = df_new_additions.at[idx, 'グループ内連番']
                if str(seq).strip() in ['1', '1.0']:
                    df_new_additions.at[idx, 'レコードの開始行'] = '*'
                else:
                    df_new_additions.at[idx, 'レコードの開始行'] = ''
        
        # レコード番号は空（Kintoneが自動採番）
        if 'レコード番号' in df_new_additions.columns:
            df_new_additions['レコード番号'] = ''
        
        df_result = pd.concat([df_existing, df_new_additions], ignore_index=True)
    else:
        df_result = df_existing.copy()
    
    print(f"  マージ後の総行数: {len(df_result)}件")
    
    return df_result


# ===========================================================================
# メイン処理
# ===========================================================================

def main(enable_anken=False):
    """メイン処理"""
    # ファイル読み込み
    load_all_files()
    
    # DF_list生成
    if not os.path.exists("DF_list.xlsx"):
        df_list = create_df_list()
    else:
        df_list = pd.read_excel("DF_list.xlsx", header=0)
        print(f"DF_list.xlsx読み込み ({len(df_list)}件)\n")
    
    # 既存KintoneエクスポートCSVを検出
    kintone_export_file = find_kintone_export_csv()
    
    # 処理開始
    all_results = []
    used_circuit_ids = set()
    total = len(df_list)
    
    print(f"回線調査開始 ({total}件)\n")
    
    for idx, (_, row) in enumerate(df_list.iterrows(), 1):
        area = row["対象エリア"]
        circuit_id = str(row["回線ID"])
        
        if idx % 100 == 0:
            print(f"  処理中: {idx}/{total}...")
        
        norm_circuit_id = normalize_id(circuit_id)
        if norm_circuit_id in used_circuit_ids:
            continue
        
        results = trace_circuit(circuit_id, area, used_circuit_ids)
        
        for r in results:
            r["調査対象中継回線ID"] = circuit_id
            r["エリア"] = area
            r["案件"] = ""
            
            if r["回線ID"] != "---":
                used_circuit_ids.add(normalize_id(r["回線ID"]))
        
        if all_results:
            separator = {
                "調査対象中継回線ID": "---",
                "調査対象中継回線ID_tbl": "---",
                "グループ内連番": "---",
                "案件": "---",
                "エリア": "---",
                "県域": "---",
                "種別": "---",
                "使用状態": "---",
                "方向": "---",
                "回線ID": "---",
                "ルートコード": "---",
                "回線未利用芯線状況": "---",
                "始点通信用建物": "---",
                "終点通信用建物": "---",
                "距離": "---",
                "接続開始日": "---",
                "使用中同一ルート回線数": "---",
                "グループ始点通信用建物": "---",
                "グループ終点通信用建物": "---",
                "グループルート": "---",
                "同一ルートグループ数": "---",
                "グループ詳細ルート": "---",
                "同一詳細ルートグループ数": "---",
                "始点回線ID": "---",
                "始点回線種別": "---",
                "終点回線ID": "---",
                "終点回線種別": "---",
                "局内未接続被疑": "---",
                "未接続被疑グループ": "---",
                "始点チェック": "---",
                "終点チェック": "---",
                "接続チェック": "---",
            }
            all_results.append(separator)
        
        all_results.extend(results)
    
    print(f"\n調査完了: {len(all_results)}行生成\n")
    
    # DataFrame化
    df_output = pd.DataFrame(all_results)
    
    # グループ内連番を付与
    print("グループ内連番付与中...")
    df_output["グループ内連番"] = ""
    current_group_id = None
    counter = 0
    
    for idx, row in df_output.iterrows():
        target_id = row.get("調査対象中継回線ID")
        
        if target_id == "---":
            df_output.at[idx, "グループ内連番"] = "---"
            continue
        
        if target_id != current_group_id:
            current_group_id = target_id
            counter = 1
        else:
            counter += 1
        
        df_output.at[idx, "グループ内連番"] = counter
    
    # 列順を整理
    columns = [
        "調査対象中継回線ID", "グループ内連番", "案件", "エリア",
        "種別", "使用状態", "方向", "回線ID", "ルートコード", "回線未利用芯線状況",
        "始点通信用建物", "終点通信用建物", "距離", "接続開始日", "使用中同一ルート回線数",
        "グループ始点通信用建物", "グループ終点通信用建物", "グループルート", "同一ルートグループ数",
        "グループ詳細ルート", "同一詳細ルートグループ数",
        "始点回線ID", "始点回線種別", "終点回線ID", "終点回線種別"
    ]
    
    existing_cols = [c for c in columns if c in df_output.columns]
    df_output = df_output[existing_cols]
    
    # 調査対象中継回線ID_tbl列を追加
    df_output.insert(1, "調査対象中継回線ID_tbl", df_output["調査対象中継回線ID"])
    
    # 県域列を追加
    print("県域列追加中...")
    df_output.insert(df_output.columns.get_loc("エリア") + 1, "県域", "")
    
    for idx in range(len(df_output)):
        if df_output.at[idx, "調査対象中継回線ID"] == "---":
            df_output.at[idx, "県域"] = "---"
        else:
            building = df_output.at[idx, "始点通信用建物"]
            kendo = get_kendo(building)
            df_output.at[idx, "県域"] = kendo
    
    # 局内未接続被疑列を追加
    print("局内未接続被疑列追加中...")
    df_output["局内未接続被疑"] = ""
    
    for idx in range(len(df_output)):
        if df_output.at[idx, "調査対象中継回線ID"] == "---":
            df_output.at[idx, "局内未接続被疑"] = "-"
            continue
        
        if df_output.at[idx, "種別"] == "中継回線":
            usage_state = str(df_output.at[idx, "使用状態"])
            start_id = str(df_output.at[idx, "始点回線ID"])
            end_id = str(df_output.at[idx, "終点回線ID"])
            
            if "解約" in usage_state:
                df_output.at[idx, "局内未接続被疑"] = "解約済み"
            elif (start_id in ["", "-", "nan"] or end_id in ["", "-", "nan"]) and "廃止" in usage_state:
                df_output.at[idx, "局内未接続被疑"] = "廃止済み"
            elif start_id in ["", "-", "nan"] or end_id in ["", "-", "nan"]:
                df_output.at[idx, "局内未接続被疑"] = "局内未接続被疑"
            else:
                df_output.at[idx, "局内未接続被疑"] = ""
    
    # 未接続被疑グループ判定列を追加
    print("未接続被疑グループ判定列追加中...")
    df_output["未接続被疑グループ"] = ""
    
    mihisetsu_groups = set()
    haishi_groups = set()
    for idx in range(len(df_output)):
        if df_output.at[idx, "調査対象中継回線ID"] == "---":
            continue
        if df_output.at[idx, "局内未接続被疑"] == "局内未接続被疑":
            mihisetsu_groups.add(df_output.at[idx, "調査対象中継回線ID"])
        elif df_output.at[idx, "局内未接続被疑"] == "廃止済み":
            haishi_groups.add(df_output.at[idx, "調査対象中継回線ID"])
    
    for idx in range(len(df_output)):
        target_id = df_output.at[idx, "調査対象中継回線ID"]
        if target_id == "---":
            df_output.at[idx, "未接続被疑グループ"] = "-"
        elif target_id in haishi_groups:
            df_output.at[idx, "未接続被疑グループ"] = "廃止済みグループ"
        elif target_id in mihisetsu_groups:
            df_output.at[idx, "未接続被疑グループ"] = "未接続被疑グループ"
    
    # チェック列を追加
    print("チェック列追加中...")
    df_output["始点チェック"] = ""
    df_output["終点チェック"] = ""
    df_output["接続チェック"] = ""
    
    # グループルート列を追加
    print("グループルート列追加中...")
    df_output["グループ始点通信用建物"] = ""
    df_output["グループ終点通信用建物"] = ""
    df_output["グループルート"] = ""
    df_output["同一ルートグループ数"] = ""
    df_output["グループ詳細ルート"] = ""
    df_output["同一詳細ルートグループ数"] = ""
    
    # グループごとにルート情報を計算
    group_routes = {}
    
    for target_id in df_output["調査対象中継回線ID"].unique():
        if target_id == "---":
            continue
        
        group_df = df_output[df_output["調査対象中継回線ID"] == target_id]
        has_in_use = (group_df["使用状態"] == "使用中").any()
        
        if not has_in_use:
            continue
        
        first_row = group_df.iloc[0]
        start_building = str(first_row["始点通信用建物"]) if pd.notna(first_row["始点通信用建物"]) else ""
        
        last_row = group_df.iloc[-1]
        end_building = str(last_row["終点通信用建物"]) if pd.notna(last_row["終点通信用建物"]) and str(last_row["終点通信用建物"]) != "" else str(last_row["始点通信用建物"]) if pd.notna(last_row["始点通信用建物"]) else ""
        
        if not start_building or not end_building:
            continue
        
        if start_building <= end_building:
            normalized_route = f"{start_building} - {end_building}"
        else:
            normalized_route = f"{end_building} - {start_building}"
        
        detailed_buildings = []
        prev_building = None
        
        for _, row in group_df.iterrows():
            if row["種別"] == "中継回線":
                s_bldg = str(row["始点通信用建物"]) if pd.notna(row["始点通信用建物"]) and str(row["始点通信用建物"]) != "" else None
                e_bldg = str(row["終点通信用建物"]) if pd.notna(row["終点通信用建物"]) and str(row["終点通信用建物"]) != "" else None
                
                if not s_bldg or not e_bldg:
                    continue
                
                if not detailed_buildings:
                    if start_building == s_bldg:
                        detailed_buildings.append(s_bldg)
                        detailed_buildings.append(e_bldg)
                        prev_building = e_bldg
                    elif start_building == e_bldg:
                        detailed_buildings.append(e_bldg)
                        detailed_buildings.append(s_bldg)
                        prev_building = s_bldg
                    else:
                        detailed_buildings.append(s_bldg)
                        detailed_buildings.append(e_bldg)
                        prev_building = e_bldg
                else:
                    if prev_building == s_bldg:
                        if e_bldg not in detailed_buildings or detailed_buildings[-1] != e_bldg:
                            detailed_buildings.append(e_bldg)
                        prev_building = e_bldg
                    elif prev_building == e_bldg:
                        if s_bldg not in detailed_buildings or detailed_buildings[-1] != s_bldg:
                            detailed_buildings.append(s_bldg)
                        prev_building = s_bldg
                    else:
                        if s_bldg not in detailed_buildings or detailed_buildings[-1] != s_bldg:
                            detailed_buildings.append(s_bldg)
                        if e_bldg not in detailed_buildings or detailed_buildings[-1] != e_bldg:
                            detailed_buildings.append(e_bldg)
                        prev_building = e_bldg
        
        detailed_route = " → ".join(detailed_buildings) if detailed_buildings else ""
        
        if detailed_buildings:
            reversed_buildings = detailed_buildings[::-1]
            if detailed_buildings <= reversed_buildings:
                normalized_detailed_route = " → ".join(detailed_buildings)
            else:
                normalized_detailed_route = " → ".join(reversed_buildings)
        else:
            normalized_detailed_route = ""
        
        group_routes[target_id] = (start_building, end_building, normalized_route, detailed_route, normalized_detailed_route, has_in_use)
    
    # 各ルートのグループ数をカウント
    route_counts = {}
    detailed_route_counts = {}
    for target_id, (start, end, norm_route, det_route, norm_det_route, in_use) in group_routes.items():
        if in_use:
            route_counts[norm_route] = route_counts.get(norm_route, 0) + 1
            if norm_det_route:
                detailed_route_counts[norm_det_route] = detailed_route_counts.get(norm_det_route, 0) + 1
    
    # DataFrameに値を設定
    for idx in range(len(df_output)):
        target_id = df_output.at[idx, "調査対象中継回線ID"]
        
        if target_id == "---":
            df_output.at[idx, "グループ始点通信用建物"] = "-"
            df_output.at[idx, "グループ終点通信用建物"] = "-"
            df_output.at[idx, "グループルート"] = "-"
            df_output.at[idx, "同一ルートグループ数"] = "-"
            df_output.at[idx, "グループ詳細ルート"] = "-"
            df_output.at[idx, "同一詳細ルートグループ数"] = "-"
        elif target_id in group_routes:
            start, end, norm_route, det_route, norm_det_route, in_use = group_routes[target_id]
            df_output.at[idx, "グループ始点通信用建物"] = start
            df_output.at[idx, "グループ終点通信用建物"] = end
            df_output.at[idx, "グループルート"] = norm_route
            df_output.at[idx, "同一ルートグループ数"] = str(route_counts.get(norm_route, 0))
            df_output.at[idx, "グループ詳細ルート"] = det_route
            df_output.at[idx, "同一詳細ルートグループ数"] = str(detailed_route_counts.get(norm_det_route, 0)) if norm_det_route else ""
    
    # グループの並び替え
    print("グループ並び替え中...")
    
    groups_data = []
    current_group = []
    current_target_id = None
    
    for idx in range(len(df_output)):
        row = df_output.iloc[idx]
        target_id = row["調査対象中継回線ID"]
        
        if target_id == "---":
            if current_group:
                if current_target_id in group_routes:
                    _, _, _, _, norm_det_route, _ = group_routes[current_target_id]
                else:
                    norm_det_route = ""
                
                groups_data.append({
                    "target_id": current_target_id,
                    "normalized_detailed_route": norm_det_route,
                    "rows": current_group
                })
                current_group = []
                current_target_id = None
        else:
            if target_id != current_target_id:
                if current_group:
                    if current_target_id in group_routes:
                        _, _, _, _, norm_det_route, _ = group_routes[current_target_id]
                    else:
                        norm_det_route = ""
                    
                    groups_data.append({
                        "target_id": current_target_id,
                        "normalized_detailed_route": norm_det_route,
                        "rows": current_group
                    })
                current_group = []
                current_target_id = target_id
            
            current_group.append(row.to_dict())
    
    if current_group:
        if current_target_id in group_routes:
            _, _, _, _, norm_det_route, _ = group_routes[current_target_id]
        else:
            norm_det_route = ""
        
        groups_data.append({
            "target_id": current_target_id,
            "normalized_detailed_route": norm_det_route,
            "rows": current_group
        })
    
    def sort_key(group):
        normalized_detailed_route = group["normalized_detailed_route"]
        if not normalized_detailed_route or normalized_detailed_route == "":
            return (1, "")
        else:
            return (0, normalized_detailed_route)
    
    groups_data.sort(key=sort_key)
    
    # ソート後のデータを再構築
    sorted_rows = []
    for i, group in enumerate(groups_data):
        sorted_rows.extend(group["rows"])
        
        if i < len(groups_data) - 1:
            separator = {
                "調査対象中継回線ID": "---",
                "調査対象中継回線ID_tbl": "---",
                "グループ内連番": "---",
                "案件": "---",
                "エリア": "---",
                "県域": "---",
                "種別": "---",
                "使用状態": "---",
                "方向": "---",
                "回線ID": "---",
                "ルートコード": "---",
                "回線未利用芯線状況": "---",
                "始点通信用建物": "---",
                "終点通信用建物": "---",
                "距離": "---",
                "接続開始日": "---",
                "使用中同一ルート回線数": "---",
                "グループ始点通信用建物": "---",
                "グループ終点通信用建物": "---",
                "グループルート": "---",
                "同一ルートグループ数": "---",
                "グループ詳細ルート": "---",
                "同一詳細ルートグループ数": "---",
                "始点回線ID": "---",
                "始点回線種別": "---",
                "終点回線ID": "---",
                "終点回線種別": "---",
                "局内未接続被疑": "---",
                "未接続被疑グループ": "---",
                "始点チェック": "---",
                "終点チェック": "---",
                "接続チェック": "---",
            }
            sorted_rows.append(separator)
    
    df_output = pd.DataFrame(sorted_rows)
    
    # チェック列を再計算
    print("チェック列再計算中...")
    
    for idx in range(len(df_output)):
        if df_output.at[idx, "調査対象中継回線ID"] == "---":
            continue
        
        start_id = df_output.at[idx, "始点回線ID"]
        start_check = "OK"
        
        if start_id and start_id not in ["-", "", "nan"]:
            norm_start = normalize_id(start_id)
            found = False
            
            if idx > 0:
                prev_row = df_output.iloc[idx - 1]
                if prev_row["調査対象中継回線ID"] != "---":
                    prev_circuit_id = normalize_id(prev_row["回線ID"])
                    if prev_circuit_id == norm_start:
                        found = True
            
            if not found and idx < len(df_output) - 1:
                next_row = df_output.iloc[idx + 1]
                if next_row["調査対象中継回線ID"] != "---":
                    next_circuit_id = normalize_id(next_row["回線ID"])
                    if next_circuit_id == norm_start:
                        found = True
            
            start_check = "OK" if found else "NG"
        else:
            start_check = "OK"
        
        end_id = df_output.at[idx, "終点回線ID"]
        end_check = "OK"
        
        if end_id and end_id not in ["-", "", "nan"]:
            norm_end = normalize_id(end_id)
            found = False
            
            if idx > 0:
                prev_row = df_output.iloc[idx - 1]
                if prev_row["調査対象中継回線ID"] != "---":
                    prev_circuit_id = normalize_id(prev_row["回線ID"])
                    if prev_circuit_id == norm_end:
                        found = True
            
            if not found and idx < len(df_output) - 1:
                next_row = df_output.iloc[idx + 1]
                if next_row["調査対象中継回線ID"] != "---":
                    next_circuit_id = normalize_id(next_row["回線ID"])
                    if next_circuit_id == norm_end:
                        found = True
            
            end_check = "OK" if found else "NG"
        else:
            end_check = "OK"
        
        connection_check = "OK" if (start_check == "OK" and end_check == "OK") else "NG"
        
        df_output.at[idx, "始点チェック"] = start_check
        df_output.at[idx, "終点チェック"] = end_check
        df_output.at[idx, "接続チェック"] = connection_check
    
    # 案件名を設定
    if enable_anken:
        print("案件名設定中...")
        for idx, row in df_output.iterrows():
            if row["調査対象中継回線ID"] != "---":
                target_id = normalize_id(row["調査対象中継回線ID"])
                area = row["エリア"]
                anken_name = get_anken_name(target_id, area)
                df_output.at[idx, "案件"] = anken_name if anken_name else ""
    
    # =====================================================================
    # 出力（v3: xlsx と kintone-tbl-import.csv の2種類）
    # =====================================================================
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    excel_file = f"回線調査結果_{timestamp}.xlsx"
    kintone_import_file = f"回線調査結果_{timestamp}_kintone-tbl-import.csv"
    
    print(f"\nファイル出力中...")
    
    # --- 1. Excel出力 ---
    df_excel = df_output.copy()
    
    numeric_columns = [
        "グループ内連番",
        "回線ID",
        "距離",
        "使用中同一ルート回線数",
        "同一ルートグループ数",
        "同一詳細ルートグループ数",
        "始点回線ID",
        "終点回線ID"
    ]
    
    for col in numeric_columns:
        if col in df_excel.columns:
            df_excel[col] = pd.to_numeric(df_excel[col], errors='coerce')
    
    df_excel.to_excel(excel_file, index=False, sheet_name='調査結果')
    print(f"  {excel_file}")
    
    # --- 2. Kintoneテーブルインポート用CSV ---
    # まず仕切り行を除去し、"-"を空白に変換したデータを作成
    df_kintone_tbl = df_output[df_output["調査対象中継回線ID"] != "---"].copy()
    df_kintone_tbl = df_kintone_tbl.replace("-", "")
    
    # レコードの開始行列を追加
    df_kintone_tbl.insert(0, "レコードの開始行", "")
    
    for idx in df_kintone_tbl.index:
        group_number = df_kintone_tbl.at[idx, "グループ内連番"]
        if group_number == 1 or group_number == "1":
            df_kintone_tbl.at[idx, "レコードの開始行"] = "*"
    
    # レコード番号列を追加（Kintoneインポート時に自動採番されるため空欄）
    df_kintone_tbl.insert(1, "レコード番号", "")
    
    # 調査対象中継回線ID_No列を追加
    id_tbl_col_idx = df_kintone_tbl.columns.get_loc("調査対象中継回線ID_tbl")
    df_kintone_tbl.insert(id_tbl_col_idx + 1, "調査対象中継回線ID_No", "")
    
    for idx in df_kintone_tbl.index:
        target_id = str(df_kintone_tbl.at[idx, "調査対象中継回線ID"])
        group_num = str(df_kintone_tbl.at[idx, "グループ内連番"])
        if target_id and group_num and target_id != "" and group_num != "":
            df_kintone_tbl.at[idx, "調査対象中継回線ID_No"] = target_id + group_num
    
    # 既存CSVとマージ
    print("\n--- Kintone差分マージ処理 ---")
    df_merged = build_kintone_import_csv(df_kintone_tbl, kintone_export_file)
    
    # CSV出力（UTF-8 BOM）
    df_merged.to_csv(kintone_import_file, index=False, encoding='utf-8-sig')
    print(f"\n  {kintone_import_file}")
    
    # =====================================================================
    # サマリー
    # =====================================================================
    print(f"\n処理完了!")
    total_groups = df_output[df_output["調査対象中継回線ID"] != "---"]["調査対象中継回線ID"].nunique()
    total_data_rows = len(df_output[df_output["調査対象中継回線ID"] != "---"])
    total_separator_rows = len(df_output[df_output["調査対象中継回線ID"] == "---"])
    print(f"総グループ数: {total_groups}")
    print(f"データ行数: {total_data_rows}")
    print(f"仕切り行数: {total_separator_rows}")
    print(f"総行数 (Excel): {len(df_output)}")
    print(f"総行数 (Kintone import): {len(df_merged)}")
    
    # チェック結果サマリー
    check_ng = df_output[(df_output["調査対象中継回線ID"] != "---") & (df_output["接続チェック"] == "NG")]
    if len(check_ng) > 0:
        print(f"\n⚠️ 接続チェックNG: {len(check_ng)}行")
        print(f"   始点NG: {len(df_output[(df_output['調査対象中継回線ID'] != '---') & (df_output['始点チェック'] == 'NG')])}行")
        print(f"   終点NG: {len(df_output[(df_output['調査対象中継回線ID'] != '---') & (df_output['終点チェック'] == 'NG')])}行")
    else:
        print(f"\n✅ 接続チェック: すべてOK")

if __name__ == "__main__":
    enable_anken = '--anken' in sys.argv
    
    if enable_anken:
        print("\n案件名設定: 有効")
        load_anken_data()
    else:
        print("\n案件名設定: 無効 (有効にする場合は --anken オプションを付けてください)")
    
    main(enable_anken)
