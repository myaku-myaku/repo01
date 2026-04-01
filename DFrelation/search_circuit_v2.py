import pandas as pd
import os
import sys
import glob
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import PatternFill

"""
回線調査スクリプト v2
シンプルで正確なロジックに特化
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
            # Excelの方が新しい → キャッシュを再生成
            print(f"  東日本: Excelファイルが更新されています → キャッシュ再生成")
            df_anken_east = load_anken_excel(DF_LIST_EAST, DF_LIST_EAST_CACHE)
        else:
            # キャッシュの方が新しい or 同じ → キャッシュ使用
            cache_dt = datetime.fromtimestamp(cache_time)
            print(f"  東日本: キャッシュ使用 {DF_LIST_EAST_CACHE} ({cache_dt.strftime('%Y-%m-%d %H:%M')})")
            df_anken_east = pd.read_csv(DF_LIST_EAST_CACHE, encoding='utf-8-sig')
            print(f"  東日本: 読み込み完了 ({len(df_anken_east)}行)")
    elif os.path.exists(DF_LIST_EAST_CACHE):
        # キャッシュのみ存在（Excelなし）
        cache_dt = datetime.fromtimestamp(os.path.getmtime(DF_LIST_EAST_CACHE))
        print(f"  東日本: キャッシュ使用 {DF_LIST_EAST_CACHE} ({cache_dt.strftime('%Y-%m-%d %H:%M')})")
        df_anken_east = pd.read_csv(DF_LIST_EAST_CACHE, encoding='utf-8-sig')
        print(f"  東日本: 読み込み完了 ({len(df_anken_east)}行)")
    else:
        # キャッシュなし → Excel読み込み
        df_anken_east = load_anken_excel(DF_LIST_EAST, DF_LIST_EAST_CACHE)
    
    # 西日本
    if os.path.exists(DF_LIST_WEST_CACHE) and os.path.exists(DF_LIST_WEST):
        cache_time = os.path.getmtime(DF_LIST_WEST_CACHE)
        excel_time = os.path.getmtime(DF_LIST_WEST)
        
        if excel_time > cache_time:
            # Excelの方が新しい → キャッシュを再生成
            print(f"  西日本: Excelファイルが更新されています → キャッシュ再生成")
            df_anken_west = load_anken_excel(DF_LIST_WEST, DF_LIST_WEST_CACHE)
        else:
            # キャッシュの方が新しい or 同じ → キャッシュ使用
            cache_dt = datetime.fromtimestamp(cache_time)
            print(f"  西日本: キャッシュ使用 {DF_LIST_WEST_CACHE} ({cache_dt.strftime('%Y-%m-%d %H:%M')})")
            df_anken_west = pd.read_csv(DF_LIST_WEST_CACHE, encoding='utf-8-sig')
            print(f"  西日本: 読み込み完了 ({len(df_anken_west)}行)")
    elif os.path.exists(DF_LIST_WEST_CACHE):
        # キャッシュのみ存在（Excelなし）
        cache_dt = datetime.fromtimestamp(os.path.getmtime(DF_LIST_WEST_CACHE))
        print(f"  西日本: キャッシュ使用 {DF_LIST_WEST_CACHE} ({cache_dt.strftime('%Y-%m-%d %H:%M')})")
        df_anken_west = pd.read_csv(DF_LIST_WEST_CACHE, encoding='utf-8-sig')
        print(f"  西日本: 読み込み完了 ({len(df_anken_west)}行)")
    else:
        # キャッシュなし → Excel読み込み
        df_anken_west = load_anken_excel(DF_LIST_WEST, DF_LIST_WEST_CACHE)
    
    print("案件データ読み込み完了\n")

def load_anken_excel(excel_file, cache_file):
    """Excelから案件データを読み込み、キャッシュを作成"""
    if not os.path.exists(excel_file):
        print(f"  警告: {excel_file} が見つかりません")
        return pd.DataFrame(columns=["中継回線", "リング名"])
    
    print(f"  {excel_file} 読み込み中...")
    try:
        # シート「一覧」のD列(中継回線)とI列(リング名)を読み込み
        # header=1で2行目をヘッダーとして読み込み（1行目はタイトル行の可能性）
        df = pd.read_excel(excel_file, sheet_name="一覧", engine='openpyxl', header=1)
        
        # 必要な列のみ抽出
        if "中継回線" in df.columns and "リング名" in df.columns:
            df_cache = df[["中継回線", "リング名"]].copy()
        elif "中継回線ID" in df.columns and "リング名" in df.columns:
            df_cache = df[["中継回線ID", "リング名"]].copy()
            df_cache.columns = ["中継回線", "リング名"]
        else:
            # 列名が異なる場合はインデックスで取得（header=1の後なので0-indexed）
            df_cache = df.iloc[:, [3, 8]].copy()  # D列=3, I列=8
            df_cache.columns = ["中継回線", "リング名"]
        
        # 欠損値を除外し、ヘッダー行の重複も除外
        df_cache = df_cache.dropna(subset=["中継回線"])
        df_cache = df_cache[df_cache["中継回線"].astype(str) != "中継回線"]
        df_cache = df_cache[df_cache["中継回線"].astype(str) != "中継回線ID"]
        
        # 中継回線IDを正規化
        df_cache["中継回線"] = df_cache["中継回線"].apply(normalize_id)
        
        # キャッシュ保存
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
    
    # 中継回線IDで検索
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
    import os
    import re
    
    # パターンを正規表現に変換（*を.*に、?を.に）
    regex_pattern = pattern.replace('*', '.*').replace('?', '.')
    regex = re.compile(regex_pattern)
    
    # 一致するファイルを検索（~$で始まる一時ファイルは除外）
    files = [f for f in os.listdir('.') if regex.match(f) and not f.startswith('~$')]
    
    if not files:
        print(f"  警告: パターン '{pattern}' に一致するファイルが見つかりません")
        return pd.DataFrame()
    
    latest_file = sorted(files)[-1]  # 最新ファイル
    try:
        df = pd.read_excel(latest_file, engine='openpyxl' if latest_file.endswith('.xlsx') else 'xlrd', header=header_row)
        print(f"  {latest_file}: 読み込み成功 ({len(df)}行)")
        return df
    except Exception as e:
        print(f"  警告: {latest_file} の読み込みに失敗: {e}")
        return pd.DataFrame()

def load_kyoten_master():
    """拠点マスタCSVを読み込む（「拠点マスタ」「csv」を含む最新ファイル）"""
    import os
    
    # 「拠点マスタ」と「csv」を含むファイルを検索
    files = [f for f in os.listdir('.') if '拠点マスタ' in f and f.endswith('.csv') and not f.startswith('~$')]
    
    if not files:
        print(f"  警告: 拠点マスタファイルが見つかりません")
        return pd.DataFrame()
    
    latest_file = sorted(files)[-1]  # 最新ファイル
    
    # エンコーディングを試行
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
    
    # E列「ビル名」で検索
    if 'ビル名' not in df_kyoten_master.columns or '県域' not in df_kyoten_master.columns:
        return ""
    
    building_name = str(building_name).strip()
    
    # ビル名で完全一致検索
    matches = df_kyoten_master[df_kyoten_master['ビル名'].astype(str) == building_name]
    
    if not matches.empty:
        kendo = matches.iloc[0]['県域']
        return str(kendo) if pd.notna(kendo) else ""
    
    return ""

def create_df_list():
    """DF_list.xlsxを生成"""
    print("DF_list.xlsx生成中...")
    data = []
    
    # 西日本
    if not df_west_chukei.empty:
        for cid in df_west_chukei.iloc[:, 6].dropna():
            data.append({"対象エリア": "西日本", "回線ID": str(cid)})
    
    # 東日本
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
        # 県間中継系（列名で取得）
        if not df_west_kenkan.empty:
            route_col = [c for c in df_west_kenkan.columns if 'ルートコード' in str(c)]
            status_col = [c for c in df_west_kenkan.columns if '未利用芯線状況' in str(c)]
            if route_col and status_col:
                matches = df_west_kenkan[df_west_kenkan[route_col[0]].astype(str) == route_code]
                if not matches.empty:
                    status = matches.iloc[0][status_col[0]]
                    if pd.notna(status) and str(status) not in ['※３', '※3']:
                        return str(status)
        
        # 中継系（列名で取得）
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
        # 県間中継（B列=ルートコード、I列=未利用芯線状況）
        if not df_east_kenkan.empty and len(df_east_kenkan.columns) > 8:
            matches = df_east_kenkan[df_east_kenkan.iloc[:, 1].astype(str) == route_code]
            if not matches.empty:
                status = matches.iloc[0].iloc[8]
                if pd.notna(status):
                    return str(status)
        
        # 中継提供可能（B列=ルートコード、I列=未利用芯線状況）
        if not df_east_chukei_teikyo.empty and len(df_east_chukei_teikyo.columns) > 8:
            matches = df_east_chukei_teikyo[df_east_chukei_teikyo.iloc[:, 1].astype(str) == route_code]
            if not matches.empty:
                status = matches.iloc[0].iloc[8]
                if pd.notna(status):
                    return str(status)
    
    return ""

def get_same_route_count(route_code, area):
    """同じルートコードを持つ使用中の回線数を取得（自分自身を含む）"""
    if not route_code or route_code in ["-", "", "nan"]:
        return ""
    
    route_code = str(route_code).strip()
    df = df_east_chukei if area == "東日本" else df_west_chukei
    
    if df.empty or len(df.columns) < 10:
        return ""
    
    # J列（iloc[9]）でルートコードが一致し、I列（iloc[8]）で使用状態が"使用中"の行を検索
    matching_rows = df[
        (df.iloc[:, 9].astype(str) == route_code) & 
        (df.iloc[:, 8].astype(str) == "使用中")
    ]
    
    # 自分自身を含む総数を返す
    count = len(matching_rows)
    return str(count)

def search_chukei(circuit_id, area):
    """中継回線を検索"""
    df = df_east_chukei if area == "東日本" else df_west_chukei
    
    # G列で回線IDを検索
    matches = df[df.iloc[:, 6].astype(str) == str(circuit_id)]
    if matches.empty:
        return None
    
    row = matches.iloc[0]
    return {
        "回線ID": str(row.iloc[6]),  # G列
        "使用状態": str(row.iloc[8]) if pd.notna(row.iloc[8]) else "",  # I列
        "ルートコード": str(row.iloc[9]) if pd.notna(row.iloc[9]) else "",  # J列
        "始点通信用建物": str(row.iloc[10]) if pd.notna(row.iloc[10]) else "",  # K列（始点）当社の通信用建物
        "終点通信用建物": str(row.iloc[19]) if pd.notna(row.iloc[19]) else "",  # T列（終点）当社の通信用建物
        "距離": str(row.iloc[28]) if pd.notna(row.iloc[28]) else "",  # AC列 距離
        "接続開始日": str(row.iloc[32]) if pd.notna(row.iloc[32]) else "",  # AG列 接続開始日
        "始点局内伝送路": str(row.iloc[16]) if pd.notna(row.iloc[16]) else "",  # Q列
        "終点局内伝送路": str(row.iloc[25]) if pd.notna(row.iloc[25]) else "",  # Z列
    }

def search_kyokunai(circuit_id, area):
    """局内回線を検索"""
    df = df_east_kyokunai if area == "東日本" else df_west_kyokunai
    
    # G列で回線IDを検索
    matches = df[df.iloc[:, 6].astype(str) == str(circuit_id)]
    if matches.empty:
        return []
    
    results = []
    for idx, row in matches.iterrows():
        # 使用状態チェック
        usage = str(row.iloc[8]) if pd.notna(row.iloc[8]) else ""  # I列
        
        # N/O列とX/Y列の値を取得
        n_val = str(row.iloc[13]) if pd.notna(row.iloc[13]) else ""
        o_val = str(row.iloc[14]) if pd.notna(row.iloc[14]) else ""
        x_val = str(row.iloc[23]) if pd.notna(row.iloc[23]) else ""
        y_val = str(row.iloc[24]) if pd.notna(row.iloc[24]) else ""
        
        # フィールドスワップ検出
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
            "回線ID": str(row.iloc[6]),  # G列
            "使用状態": usage,
            "建物": str(row.iloc[10]) if pd.notna(row.iloc[10]) else "",  # K列 当社の通信用建物
            "接続開始日": str(row.iloc[38]) if pd.notna(row.iloc[38]) else "",  # AM列 接続開始日
            "始点回線ID": start_id,
            "始点回線種別": start_type,
            "終点回線ID": end_id,
            "終点回線種別": end_type,
        })
    
    return results

def search_tanmatu(circuit_id, area):
    """端末回線を検索（局内IDまたは回線IDで）"""
    df = df_east_tanmatu if area == "東日本" else df_west_tanmatu
    
    # DataFrameが空の場合は終了
    if df.empty or df.shape[1] < 16:
        return None
    
    # まずG列（回線ID）で検索
    matches = df[df.iloc[:, 6].astype(str) == str(circuit_id)]
    
    # 見つからなければP列（始点局内伝送路）で検索
    if matches.empty:
        matches = df[df.iloc[:, 15].astype(str) == str(circuit_id)]
    
    if matches.empty:
        return None
    
    row = matches.iloc[0]
    return {
        "回線ID": str(row.iloc[6]),  # G列
        "使用状態": str(row.iloc[8]) if pd.notna(row.iloc[8]) else "",  # I列
        "始点建物": str(row.iloc[9]) if pd.notna(row.iloc[9]) else "",  # J列（始点）当社の通信用建物
        "接続開始日": str(row.iloc[38]) if pd.notna(row.iloc[38]) else "",  # AM列 接続開始日
        "始点局内伝送路": str(row.iloc[15]) if pd.notna(row.iloc[15]) else "",  # P列
    }

def trace_circuit(target_circuit_id, area, used_circuit_ids):
    """
    調査対象中継回線IDを起点に両方向へ探索し、始点端から終点端までソートして返す
    
    used_circuit_ids: 既に使用済みの回線IDのセット（重複防止用）
    戻り値: 回線情報のリスト（接続順）
    """
    visited = set()  # 訪問済みセット
    
    def get_circuit_info(cid):
        """回線情報を取得（種別判定含む）"""
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
            return "｀", tanmatu
        
        return None, None
    
    def trace_recursive(cid, from_cid=None):
        """
        再帰的に追跡（来た方向を考慮して進む）
        cid: 現在の回線ID
        from_cid: 来た元の回線ID（Noneの場合は調査対象回線）
        """
        norm_id = normalize_id(cid)
        
        # 無限ループ防止
        if norm_id in visited:
            return []
        visited.add(norm_id)
        
        # 既出回線の場合は停止（重複防止）
        if norm_id in used_circuit_ids:
            return []
        
        kind, info = get_circuit_info(cid)
        if not info:
            return []
        
        results = []
        next_candidates = []  # 次に進むべき回線IDのリスト
        
        if kind == "中継":
            start_id = info["始点局内伝送路"]
            end_id = info["終点局内伝送路"]
            
            # 来た方向を判定
            norm_from = normalize_id(from_cid) if from_cid else None
            norm_start = normalize_id(start_id) if start_id and start_id not in ["-", "", "nan"] else None
            norm_end = normalize_id(end_id) if end_id and end_id not in ["-", "", "nan"] else None
            
            if from_cid is None:
                # 調査対象回線（最初）→ 両方向へ進む
                if norm_start:
                    next_candidates.append(start_id)
                if norm_end:
                    next_candidates.append(end_id)
            elif norm_from == norm_start:
                # 始点から来た → 終点へ進む
                if norm_end:
                    next_candidates.append(end_id)
            elif norm_from == norm_end:
                # 終点から来た → 始点へ進む
                if norm_start:
                    next_candidates.append(start_id)
            else:
                # 来た方向が不明（データ不整合）→ 両方向試す
                if norm_start:
                    next_candidates.append(start_id)
                if norm_end:
                    next_candidates.append(end_id)
            
            # 自分を追加
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
            
            # 来た方向を判定
            norm_from = normalize_id(from_cid) if from_cid else None
            norm_start = normalize_id(start_id) if start_id and start_id not in ["-", "", "nan"] else None
            norm_end = normalize_id(end_id) if end_id and end_id not in ["-", "", "nan"] else None
            
            # 方向判定（CSVの始点/終点とグループ全体の始点/終点は逆のことがある）
            direction = "始点"  # デフォルト
            
            if from_cid is None:
                # 調査対象回線（最初）→ 両方向へ進む
                if norm_start:
                    next_candidates.append(start_id)
                if norm_end:
                    next_candidates.append(end_id)
            elif norm_from == norm_start:
                # 始点から来た → 終点へ進む
                direction = "始点"
                if norm_end:
                    next_candidates.append(end_id)
            elif norm_from == norm_end:
                # 終点から来た → 始点へ進む
                direction = "終点"
                if norm_start:
                    next_candidates.append(start_id)
            else:
                # 来た方向が不明（データ不整合）→ 両方向試す
                if norm_start:
                    next_candidates.append(start_id)
                if norm_end:
                    next_candidates.append(end_id)
            
            # 自分を追加
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
            
            # 来た方向を判定
            norm_from = normalize_id(from_cid) if from_cid else None
            norm_start = normalize_id(start_id) if start_id and start_id not in ["-", "", "nan"] else None
            
            direction = "始点"
            
            if from_cid is None:
                # 調査対象回線（最初）→ 始点方向のみ
                if norm_start:
                    next_candidates.append(start_id)
            elif norm_from != norm_start:
                # 始点以外から来た（通常は始点から来る）→ 始点へ進む
                if norm_start:
                    next_candidates.append(start_id)
                direction = "始点"
            else:
                # 始点から来た → 端末なので終端
                direction = "終点"
            
            # 自分を追加
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
        
        # 次の回線へ進む
        for next_id in next_candidates:
            next_results = trace_recursive(next_id, cid)
            results.extend(next_results)
        
        return results
    
    # 調査対象回線が既出の場合は空リストを返す
    norm_target = normalize_id(target_circuit_id)
    if norm_target in used_circuit_ids:
        return []
    
    # 調査対象回線から再帰的に探索
    all_results = trace_recursive(target_circuit_id)
    
    # 始点端から終点端の順に並び替え
    if all_results:
        all_results = sort_circuit_chain(all_results)
    
    return all_results

def sort_circuit_chain(results):
    """
    回線チェーンを始点端から終点端の順に並び替え
    
    results: trace_recursiveで取得した回線リスト（順不同）
    戻り値: 始点端から終点端まで接続順に並べたリスト
    """
    if not results:
        return results
    
    # 回線IDでインデックスを作成
    circuit_map = {normalize_id(r["回線ID"]): r for r in results}
    
    # グラフ構築：各回線IDから接続している回線IDへのマッピング
    connections = {}  # {回線ID: [接続先回線ID, ...]}
    
    for r in results:
        norm_id = normalize_id(r["回線ID"])
        connections[norm_id] = []
        
        # 始点回線IDへの接続
        start_id = r.get("始点回線ID")
        if start_id and start_id not in ["-", "", "nan", None]:
            norm_start = normalize_id(start_id)
            if norm_start in circuit_map:
                connections[norm_id].append(norm_start)
        
        # 終点回線IDへの接続
        end_id = r.get("終点回線ID")
        if end_id and end_id not in ["-", "", "nan", None]:
            norm_end = normalize_id(end_id)
            if norm_end in circuit_map:
                connections[norm_id].append(norm_end)
    
    # 端点（接続が1つ以下）を探す
    endpoints = []
    for cid, neighbors in connections.items():
        if len(neighbors) <= 1:
            endpoints.append(cid)
    
    if not endpoints:
        # 端点が見つからない（循環？）→ 元の順序を返す
        return results
    
    # 端点から幅優先探索で最長パスを見つける
    def bfs_longest_path(start_id):
        """幅優先探索で最長パスを見つける"""
        visited = {start_id}
        path = [start_id]
        current = start_id
        
        while True:
            # 次の未訪問の隣接ノードを探す
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
    
    # 各端点から探索して最長パスを選択
    best_path = []
    for endpoint in endpoints:
        path = bfs_longest_path(endpoint)
        if len(path) > len(best_path):
            best_path = path
    
    # パスに沿って回線情報を並べる
    sorted_results = []
    for cid in best_path:
        if cid in circuit_map:
            sorted_results.append(circuit_map[cid])
    
    # パスに含まれなかった回線を追加（念のため）
    visited_set = set(best_path)
    for r in results:
        if normalize_id(r["回線ID"]) not in visited_set:
            sorted_results.append(r)
    
    return sorted_results

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
    
    # 処理開始
    all_results = []
    used_circuit_ids = set()  # 全グループで使用済みの回線IDを記録（重複防止用）
    total = len(df_list)
    
    print(f"回線調査開始 ({total}件)\n")
    
    for idx, (_, row) in enumerate(df_list.iterrows(), 1):
        area = row["対象エリア"]
        circuit_id = str(row["回線ID"])
        
        if idx % 100 == 0:
            print(f"  処理中: {idx}/{total}...")
        
        # 調査対象中継回線ID自体が既出の場合はスキップ
        norm_circuit_id = normalize_id(circuit_id)
        if norm_circuit_id in used_circuit_ids:
            continue
        
        # 回線を追跡（グループ内調査でも既出回線に遭遇したら停止）
        results = trace_circuit(circuit_id, area, used_circuit_ids)
        
        # 調査対象中継回線IDを付与
        for r in results:
            r["調査対象中継回線ID"] = circuit_id
            r["エリア"] = area
            r["案件"] = ""  # 案件情報はスキップ
            
            # 使用した回線IDを記録（正規化済み）
            if r["回線ID"] != "---":  # 仕切り行は除外
                used_circuit_ids.add(normalize_id(r["回線ID"]))
        
        # グループ間仕切り行を追加
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
    
    # グループ内連番を付与（"---"行以外）
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
    
    # 列順を整理（調査グループ番号を削除、グループ内連番を調査対象中継回線IDの右に）
    columns = [
        "調査対象中継回線ID", "グループ内連番", "案件", "エリア",
        "種別", "使用状態", "方向", "回線ID", "ルートコード", "回線未利用芯線状況",
        "始点通信用建物", "終点通信用建物", "距離", "接続開始日", "使用中同一ルート回線数",
        "グループ始点通信用建物", "グループ終点通信用建物", "グループルート", "同一ルートグループ数",
        "グループ詳細ルート", "同一詳細ルートグループ数",
        "始点回線ID", "始点回線種別", "終点回線ID", "終点回線種別"
    ]
    
    # 存在する列のみ使用
    existing_cols = [c for c in columns if c in df_output.columns]
    df_output = df_output[existing_cols]
    
    # 調査対象中継回線ID_tbl列を追加（調査対象中継回線IDの複製）
    df_output.insert(1, "調査対象中継回線ID_tbl", df_output["調査対象中継回線ID"])
    
    # 県域列を追加（エリア列の右に挿入）
    print("県域列追加中...")
    df_output.insert(df_output.columns.get_loc("エリア") + 1, "県域", "")
    
    for idx in range(len(df_output)):
        # 仕切り行は"---"
        if df_output.at[idx, "調査対象中継回線ID"] == "---":
            df_output.at[idx, "県域"] = "---"
        else:
            # 始点通信用建物から県域を取得
            building = df_output.at[idx, "始点通信用建物"]
            kendo = get_kendo(building)
            df_output.at[idx, "県域"] = kendo
    
    # 局内未接続被疑列を追加
    print("局内未接続被疑列追加中...")
    df_output["局内未接続被疑"] = ""
    
    for idx in range(len(df_output)):
        # 仕切り行は"-"
        if df_output.at[idx, "調査対象中継回線ID"] == "---":
            df_output.at[idx, "局内未接続被疑"] = "-"
            continue
        
        # 中継回線のみ判定
        if df_output.at[idx, "種別"] == "中継回線":
            usage_state = str(df_output.at[idx, "使用状態"])
            start_id = str(df_output.at[idx, "始点回線ID"])
            end_id = str(df_output.at[idx, "終点回線ID"])
            route_code = str(df_output.at[idx, "ルートコード"])
            
            # ルートコードにEKK/WKKを含む場合は県間扱い
            is_kenkan = any(k in route_code for k in ["EKK", "WKK"])
            prefix = "(県間)" if is_kenkan else ""
            
            # 解約済み判定
            if "解約" in usage_state:
                df_output.at[idx, "局内未接続被疑"] = "解約済み"
            # 廃止済み判定（始点または終点が空白で、使用状態が「廃止」を含む）
            elif (start_id in ["", "-", "nan"] or end_id in ["", "-", "nan"]) and "廃止" in usage_state:
                df_output.at[idx, "局内未接続被疑"] = "廃止済み"
            # 局内未接続被疑判定（始点または終点が空白か"-"）
            elif start_id in ["", "-", "nan"] or end_id in ["", "-", "nan"]:
                df_output.at[idx, "局内未接続被疑"] = f"{prefix}局内未接続被疑"
            else:
                df_output.at[idx, "局内未接続被疑"] = ""
    
    # 未接続被疑グループ判定列を追加
    print("未接続被疑グループ判定列追加中...")
    df_output["未接続被疑グループ"] = ""
    
    # 未接続被疑と廃止済みの調査対象中継回線IDを収集（県間フラグも管理）
    mihisetsu_groups = set()
    kenkan_mihisetsu_groups = set()
    haishi_groups = set()
    for idx in range(len(df_output)):
        if df_output.at[idx, "調査対象中継回線ID"] == "---":
            continue
        flag = df_output.at[idx, "局内未接続被疑"]
        tid = df_output.at[idx, "調査対象中継回線ID"]
        if flag == "(県間)局内未接続被疑":
            kenkan_mihisetsu_groups.add(tid)
        elif flag == "局内未接続被疑":
            mihisetsu_groups.add(tid)
        elif flag == "廃止済み":
            haishi_groups.add(tid)
    
    # 未接続被疑グループまたは廃止済みグループに属するすべての回線にフラグを立てる
    for idx in range(len(df_output)):
        target_id = df_output.at[idx, "調査対象中継回線ID"]
        if target_id == "---":
            df_output.at[idx, "未接続被疑グループ"] = "-"
        elif target_id in haishi_groups:
            df_output.at[idx, "未接続被疑グループ"] = "廃止済みグループ"
        elif target_id in kenkan_mihisetsu_groups:
            df_output.at[idx, "未接続被疑グループ"] = "(県間)未接続被疑グループ"
        elif target_id in mihisetsu_groups:
            df_output.at[idx, "未接続被疑グループ"] = "未接続被疑グループ"
    
    # チェック列を追加
    
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
    group_routes = {}  # {調査対象中継回線ID: (始点通信用建物, 終点通信用建物, 正規化ルート, 詳細ルート, 正規化詳細ルート, 使用中フラグ)}
    
    for target_id in df_output["調査対象中継回線ID"].unique():
        if target_id == "---":
            continue
        
        group_df = df_output[df_output["調査対象中継回線ID"] == target_id]
        
        # 使用中の回線が1つでも存在するか
        has_in_use = (group_df["使用状態"] == "使用中").any()
        
        if not has_in_use:
            continue
        
        # グループの最初の行の始点通信用建物
        first_row = group_df.iloc[0]
        start_building = str(first_row["始点通信用建物"]) if pd.notna(first_row["始点通信用建物"]) else ""
        
        # グループの最後の行の終点通信用建物（空白なら始点通信用建物）
        last_row = group_df.iloc[-1]
        end_building = str(last_row["終点通信用建物"]) if pd.notna(last_row["終点通信用建物"]) and str(last_row["終点通信用建物"]) != "" else str(last_row["始点通信用建物"]) if pd.notna(last_row["始点通信用建物"]) else ""
        
        # 空白チェック
        if not start_building or not end_building:
            continue
        
        # ルートを正規化（逆方向も同じルートとして扱う）
        if start_building <= end_building:
            normalized_route = f"{start_building} - {end_building}"
        else:
            normalized_route = f"{end_building} - {start_building}"
        
        # 詳細ルート（中継回線の経由ビルを含む）を構築
        # グループ全体の流れに沿って、接続順に経路を辿る
        detailed_buildings = []
        prev_building = None
        
        for idx, row in group_df.iterrows():
            if row["種別"] == "中継回線":
                s_bldg = str(row["始点通信用建物"]) if pd.notna(row["始点通信用建物"]) and str(row["始点通信用建物"]) != "" else None
                e_bldg = str(row["終点通信用建物"]) if pd.notna(row["終点通信用建物"]) and str(row["終点通信用建物"]) != "" else None
                
                if not s_bldg or not e_bldg:
                    continue
                
                # 初回の場合：グループ始点ビルと照合して方向を決定
                if not detailed_buildings:
                    # グループ始点ビルがs_bldgまたはe_bldgのどちらかと一致するか確認
                    if start_building == s_bldg:
                        # 順方向：グループ始点 = この中継の始点
                        detailed_buildings.append(s_bldg)
                        detailed_buildings.append(e_bldg)
                        prev_building = e_bldg
                    elif start_building == e_bldg:
                        # 逆方向：グループ始点 = この中継の終点
                        detailed_buildings.append(e_bldg)
                        detailed_buildings.append(s_bldg)
                        prev_building = s_bldg
                    else:
                        # グループ始点と一致しない場合はCSVの順序を使う
                        detailed_buildings.append(s_bldg)
                        detailed_buildings.append(e_bldg)
                        prev_building = e_bldg
                else:
                    # 前のビルとの接続を確認
                    if prev_building == s_bldg:
                        # 順方向：始点が前の終点と一致
                        if e_bldg not in detailed_buildings or detailed_buildings[-1] != e_bldg:
                            detailed_buildings.append(e_bldg)
                        prev_building = e_bldg
                    elif prev_building == e_bldg:
                        # 逆方向：終点が前の終点と一致（次の中継が逆向き）
                        if s_bldg not in detailed_buildings or detailed_buildings[-1] != s_bldg:
                            detailed_buildings.append(s_bldg)
                        prev_building = s_bldg
                    else:
                        # 接続が切れている場合（通常は発生しないはず）
                        # 新しい経路として追加
                        if s_bldg not in detailed_buildings or detailed_buildings[-1] != s_bldg:
                            detailed_buildings.append(s_bldg)
                        if e_bldg not in detailed_buildings or detailed_buildings[-1] != e_bldg:
                            detailed_buildings.append(e_bldg)
                        prev_building = e_bldg
        
        # 詳細ルート文字列を作成
        detailed_route = " → ".join(detailed_buildings) if detailed_buildings else ""
        
        # 詳細ルートを正規化（逆方向も同じとして扱う）
        if detailed_buildings:
            reversed_buildings = detailed_buildings[::-1]
            if detailed_buildings <= reversed_buildings:
                normalized_detailed_route = " → ".join(detailed_buildings)
            else:
                normalized_detailed_route = " → ".join(reversed_buildings)
        else:
            normalized_detailed_route = ""
        
        group_routes[target_id] = (start_building, end_building, normalized_route, detailed_route, normalized_detailed_route, has_in_use)
    
    # 各正規化ルートのグループ数をカウント
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
    
    # グループの並び替え（グループ詳細ルートが同じものを連続させる）
    print("グループ並び替え中...")
    
    # 各グループのデータを収集（正規化詳細ルートも保存）
    groups_data = []
    current_group = []
    current_target_id = None
    
    for idx in range(len(df_output)):
        row = df_output.iloc[idx]
        target_id = row["調査対象中継回線ID"]
        
        if target_id == "---":
            # 仕切り行の場合、現在のグループを保存
            if current_group:
                # 正規化詳細ルートを取得
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
            # データ行の場合
            if target_id != current_target_id:
                # 新しいグループの開始
                if current_group:
                    # 正規化詳細ルートを取得
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
    
    # 最後のグループを追加
    if current_group:
        # 正規化詳細ルートを取得
        if current_target_id in group_routes:
            _, _, _, _, norm_det_route, _ = group_routes[current_target_id]
        else:
            norm_det_route = ""
        
        groups_data.append({
            "target_id": current_target_id,
            "normalized_detailed_route": norm_det_route,
            "rows": current_group
        })
    
    # 正規化詳細ルートでソート（空白は最後）
    def sort_key(group):
        normalized_detailed_route = group["normalized_detailed_route"]
        if not normalized_detailed_route or normalized_detailed_route == "":
            return (1, "")  # 空白は最後
        else:
            return (0, normalized_detailed_route)
    
    groups_data.sort(key=sort_key)
    
    # ソート後のデータを再構築
    sorted_rows = []
    for i, group in enumerate(groups_data):
        # グループのデータ行を追加
        sorted_rows.extend(group["rows"])
        
        # 最後のグループ以外は仕切り行を追加
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
    
    # DataFrameを再構築
    df_output = pd.DataFrame(sorted_rows)
    
    # チェック列を再計算（並び替え後に位置が変わるため）
    print("チェック列再計算中...")
    
    for idx in range(len(df_output)):
        # 仕切り行はスキップ
        if df_output.at[idx, "調査対象中継回線ID"] == "---":
            continue
        
        # 始点チェック（I列=始点回線ID が 上下のH列=回線ID に存在するか）
        start_id = df_output.at[idx, "始点回線ID"]
        start_check = "OK"
        
        if start_id and start_id not in ["-", "", "nan"]:
            norm_start = normalize_id(start_id)
            found = False
            
            # 上の行をチェック（idx-1）
            if idx > 0:
                prev_row = df_output.iloc[idx - 1]
                if prev_row["調査対象中継回線ID"] != "---":
                    prev_circuit_id = normalize_id(prev_row["回線ID"])
                    if prev_circuit_id == norm_start:
                        found = True
            
            # 下の行をチェック（idx+1）
            if not found and idx < len(df_output) - 1:
                next_row = df_output.iloc[idx + 1]
                if next_row["調査対象中継回線ID"] != "---":
                    next_circuit_id = normalize_id(next_row["回線ID"])
                    if next_circuit_id == norm_start:
                        found = True
            
            start_check = "OK" if found else "NG"
        else:
            # 始点回線IDが"-"の場合は始点端なのでOK
            start_check = "OK"
        
        # 終点チェック（K列=終点回線ID が 上下のH列=回線ID に存在するか）
        end_id = df_output.at[idx, "終点回線ID"]
        end_check = "OK"
        
        if end_id and end_id not in ["-", "", "nan"]:
            norm_end = normalize_id(end_id)
            found = False
            
            # 上の行をチェック（idx-1）
            if idx > 0:
                prev_row = df_output.iloc[idx - 1]
                if prev_row["調査対象中継回線ID"] != "---":
                    prev_circuit_id = normalize_id(prev_row["回線ID"])
                    if prev_circuit_id == norm_end:
                        found = True
            
            # 下の行をチェック（idx+1）
            if not found and idx < len(df_output) - 1:
                next_row = df_output.iloc[idx + 1]
                if next_row["調査対象中継回線ID"] != "---":
                    next_circuit_id = normalize_id(next_row["回線ID"])
                    if next_circuit_id == norm_end:
                        found = True
            
            end_check = "OK" if found else "NG"
        else:
            # 終点回線IDが"-"の場合は終点端なのでOK
            end_check = "OK"
        
        # 接続チェック（始点と終点の両方がOKならOK）
        connection_check = "OK" if (start_check == "OK" and end_check == "OK") else "NG"
        
        df_output.at[idx, "始点チェック"] = start_check
        df_output.at[idx, "終点チェック"] = end_check
        df_output.at[idx, "接続チェック"] = connection_check
    
    # 案件名を設定（最後に処理）
    if enable_anken:
        print("案件名設定中...")
        for idx, row in df_output.iterrows():
            if row["調査対象中継回線ID"] != "---":
                target_id = normalize_id(row["調査対象中継回線ID"])
                area = row["エリア"]
                anken_name = get_anken_name(target_id, area)
                df_output.at[idx, "案件"] = anken_name if anken_name else ""
    
    # 出力
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    excel_file = f"回線調査結果_{timestamp}.xlsx"
    
    print(f"ファイル出力中...")
    
    # Kintoneテーブル用CSV（レコードの開始行列を追加）
    kintone_tbl_csv_file = f"回線調査結果_{timestamp}_kintone-tbl.csv"
    df_kintone = df_output[df_output["調査対象中継回線ID"] != "---"].copy()
    df_kintone = df_kintone.replace("-", "")
    df_kintone_tbl = df_kintone.copy()
    
    # レコードの開始行列を追加（A列として先頭に挿入）
    df_kintone_tbl.insert(0, "レコードの開始行", "")
    
    # グループ内連番が1の行に"*"を設定
    for idx in df_kintone_tbl.index:
        group_number = df_kintone_tbl.at[idx, "グループ内連番"]
        if group_number == 1 or group_number == "1":
            df_kintone_tbl.at[idx, "レコードの開始行"] = "*"
    
    # 調査対象中継回線ID_No列を追加（調査対象中継回線IDの右に挿入）
    target_id_col_idx = df_kintone_tbl.columns.get_loc("調査対象中継回線ID")
    df_kintone_tbl.insert(target_id_col_idx + 1, "調査対象中継回線ID_No", "")
    
    # 調査対象中継回線ID + グループ内連番を結合
    for idx in df_kintone_tbl.index:
        target_id = str(df_kintone_tbl.at[idx, "調査対象中継回線ID"])
        group_num = str(df_kintone_tbl.at[idx, "グループ内連番"])
        if target_id and group_num and target_id != "" and group_num != "":
            df_kintone_tbl.at[idx, "調査対象中継回線ID_No"] = target_id + group_num
    
    df_kintone_tbl.to_csv(kintone_tbl_csv_file, index=False, encoding='utf-8-sig')
    print(f"  {kintone_tbl_csv_file}")
    
    # Excel出力（数値列を数値型に変換）
    df_excel = df_output.copy()
    
    # 数値に変換する列のリスト
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
            # "---"や"-"、空白以外を数値に変換
            df_excel[col] = pd.to_numeric(df_excel[col], errors='coerce')
    
    df_excel.to_excel(excel_file, index=False, sheet_name='調査結果')
    print(f"  {excel_file}")
    
    print(f"\n処理完了!")
    total_groups = df_output[df_output["調査対象中継回線ID"] != "---"]["調査対象中継回線ID"].nunique()
    total_data_rows = len(df_output[df_output["調査対象中継回線ID"] != "---"])
    total_separator_rows = len(df_output[df_output["調査対象中継回線ID"] == "---"])
    print(f"総グループ数: {total_groups}")
    print(f"データ行数: {total_data_rows}")
    print(f"仕切り行数: {total_separator_rows}")
    print(f"総行数: {len(df_output)}")
    
    # チェック結果サマリー
    check_ng = df_output[(df_output["調査対象中継回線ID"] != "---") & (df_output["接続チェック"] == "NG")]
    if len(check_ng) > 0:
        print(f"\n⚠️ 接続チェックNG: {len(check_ng)}行")
        print(f"   始点NG: {len(df_output[(df_output['調査対象中継回線ID'] != '---') & (df_output['始点チェック'] == 'NG')])}行")
        print(f"   終点NG: {len(df_output[(df_output['調査対象中継回線ID'] != '---') & (df_output['終点チェック'] == 'NG')])}行")
    else:
        print(f"\n✅ 接続チェック: すべてOK")

if __name__ == "__main__":
    import sys
    
    # コマンドライン引数で案件名設定を制御
    # 使い方: python search_circuit_v2.py [--anken]
    enable_anken = '--anken' in sys.argv
    
    if enable_anken:
        print("\n案件名設定: 有効")
        load_anken_data()
    else:
        print("\n案件名設定: 無効 (有効にする場合は --anken オプションを付けてください)")
    
    main(enable_anken)

