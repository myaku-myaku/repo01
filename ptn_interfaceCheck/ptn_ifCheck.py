#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PTN_list.xlsx から曲射コードに該当する行を抽出するスクリプト

CheckPTN シートの F 列（局舎コード）を読み取り、
rbbn/zte/huawei シートから該当する行を抽出して新しい Excel ファイルに出力する。
"""

import pandas as pd
from datetime import datetime
import sys
import os


def create_rbbn_summary(df):
    """
    rbbn シートのホスト名ごとに General Description を集計
    
    Args:
        df: rbbn シートのデータフレーム
    
    Returns:
        summary: カテゴリ別集計データフレーム
        detail: 詳細集計データフレーム
    """
    # カテゴリ定義
    cat1_items = ['OTR100Q28_ER4F', 'OTR100Q28_LR4', 'OTR100Q28_ZR4']
    cat2_items = ['OTP10_L27BD', 'OTP10_L33BD', 'OTP10T_ALLM']
    cat3_items = ['OTP10_LR', 'OTP10_SR']
    
    # カテゴリ列を追加
    def categorize(desc):
        if pd.isna(desc):
            return 'その他'
        if desc in cat1_items:
            return 'カテゴリ1_100G'
        elif desc in cat2_items:
            return 'カテゴリ2_10G_BD'
        elif desc in cat3_items:
            return 'カテゴリ3_10G_LR/SR'
        else:
            return 'その他'
    
    df['カテゴリ'] = df['General Description'].apply(categorize)
    
    # ホスト名ごとの機種名を取得（最初の値を使用）
    ne_type_map = df.groupby('NE Name')['NE Type'].first()
    
    # ホスト名ごとにカテゴリ集計
    summary = df.groupby(['NE Name', 'カテゴリ']).size().unstack(fill_value=0)
    
    # 合計列を追加
    summary['合計'] = summary.sum(axis=1)
    
    # カテゴリの順序を整理
    desired_order = ['カテゴリ1_100G', 'カテゴリ2_10G_BD', 'カテゴリ3_10G_LR/SR', 'その他', '合計']
    existing_cols = [col for col in desired_order if col in summary.columns]
    summary = summary[existing_cols]
    
    # インデックスをリセットしてホスト名を列に
    summary = summary.reset_index()
    
    # 機種名を追加（NE Name の右隣に挿入）
    summary.insert(1, 'NE Type', summary['NE Name'].map(ne_type_map))
    
    # ホスト名ごとに詳細集計（General Description 別）
    detail = df.groupby(['NE Name', 'General Description']).size().unstack(fill_value=0)
    detail['合計'] = detail.sum(axis=1)
    detail = detail.reset_index()
    
    # 詳細集計にも機種名を追加
    detail.insert(1, 'NE Type', detail['NE Name'].map(ne_type_map))
    
    return summary, detail


def create_zte_summary(df):
    """
    zte シートのホスト名ごとに Port Type、UNI/NNI、Port Used Status を集計
    
    Args:
        df: zte シートのデータフレーム
    
    Returns:
        summary: 集計データフレーム
    """
    # ホスト名ごとの機種名を取得
    ne_type_map = df.groupby('Ne Name')['Ne Type'].first()
    
    # Port Used Status が "used" で始まるものを used としてカウント
    df = df.copy()
    df['Status'] = df['Port Used Status'].apply(
        lambda x: 'used' if str(x).startswith('used') else 'free'
    )
    
    # ホスト名、Port Type、UNI/NNI、Status でグループ化
    grouped = df.groupby(['Ne Name', 'Port Type', 'UNI/NNI', 'Status']).size().reset_index(name='count')
    
    # ピボットテーブルを作成
    # 列名: Port Type_UNI/NNI_Status の形式
    grouped['column_name'] = grouped['Port Type'] + '_' + grouped['UNI/NNI'] + '_' + grouped['Status']
    
    pivot = grouped.pivot_table(
        index='Ne Name',
        columns='column_name',
        values='count',
        fill_value=0
    ).astype(int)
    
    # 列を整理（優先順: 100GE -> 10GE -> GE, UNI -> NNI, used -> free）
    desired_cols = [
        '100GE_UNI_used', '100GE_UNI_free', '100GE_NNI_used', '100GE_NNI_free',
        '10GE_UNI_used', '10GE_UNI_free', '10GE_NNI_used', '10GE_NNI_free',
        'GE_UNI_used', 'GE_UNI_free', 'GE_NNI_used', 'GE_NNI_free'
    ]
    existing_cols = [col for col in desired_cols if col in pivot.columns]
    other_cols = [col for col in pivot.columns if col not in desired_cols]
    pivot = pivot[existing_cols + other_cols]
    
    # インデックスをリセット
    pivot = pivot.reset_index()
    
    # 機種名を追加
    pivot.insert(1, 'Ne Type', pivot['Ne Name'].map(ne_type_map))
    
    return pivot


def extract_matching_rows(input_file="PTN_list.xlsx", output_file=None):
    """
    CheckPTN シートの局舎コードを基に、他のシートから該当行を抽出する
    
    Args:
        input_file: 入力 Excel ファイル名
        output_file: 出力 Excel ファイル名（None の場合は自動生成）
    """
    
    # 出力ファイル名の生成
    if output_file is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"PTN_抽出結果_{timestamp}.xlsx"
    
    print(f"=" * 80)
    print(f"PTN データ抽出スクリプト")
    print(f"=" * 80)
    print(f"入力ファイル: {input_file}")
    print(f"出力ファイル: {output_file}")
    print()
    
    # ファイルの存在確認
    if not os.path.exists(input_file):
        print(f"エラー: {input_file} が見つかりません")
        sys.exit(1)
    
    # CheckPTN シートから局舎コードを読み取る
    print("【ステップ 1/4】CheckPTN シートから局舎コードを読み取り中...")
    checkptn_df = pd.read_excel(input_file, sheet_name="CheckPTN")
    
    # F 列（局舎コード）を取得（NaN を除外）
    kyokusha_codes = checkptn_df["局舎コード"].dropna().unique()
    kyokusha_codes = [str(code).strip() for code in kyokusha_codes if str(code).strip()]
    
    print(f"  ✓ 局舎コード数: {len(kyokusha_codes)}")
    print(f"  サンプル: {', '.join(kyokusha_codes[:5])}")
    if len(kyokusha_codes) > 5:
        print(f"           ... 他 {len(kyokusha_codes) - 5} 件")
    print()
    
    # Excel writer を作成
    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        
        # CheckPTN シートをそのままコピー
        print("【ステップ 2/4】CheckPTN シートをコピー中...")
        checkptn_df.to_excel(writer, sheet_name="CheckPTN", index=False)
        print(f"  ✓ {len(checkptn_df)} 行をコピーしました")
        print()
        
        # 各ベンダーシートから抽出
        vendor_sheets = [
            ("rbbn", "NE Name"),
            ("zte", "Ne Name"),
            ("huawei", "NE")
        ]
        
        print("【ステップ 3/4】各ベンダーシートから該当行を抽出中...")
        
        # 抽出したデータを保存（集計用）
        extracted_data = {}
        
        for sheet_name, name_column in vendor_sheets:
            print(f"  処理中: {sheet_name} シート...")
            
            try:
                # シートを読み込む
                # huawei シートは最初の3行がヘッダー情報なのでスキップ
                skiprows = 3 if sheet_name == "huawei" else None
                df = pd.read_excel(input_file, sheet_name=sheet_name, skiprows=skiprows)
                original_count = len(df)
                
                # 局舎コードを含む行を抽出
                # NE Name/Ne Name/NE 列に局舎コードが含まれているかチェック
                mask = df[name_column].astype(str).apply(
                    lambda x: any(code in x for code in kyokusha_codes)
                )
                filtered_df = df[mask]
                
                # 抽出結果を保存
                filtered_df.to_excel(writer, sheet_name=sheet_name, index=False)
                
                # 集計用にデータを保存
                extracted_data[sheet_name] = filtered_df
                
                print(f"    ✓ {original_count} 行中 {len(filtered_df)} 行を抽出 " +
                      f"({len(filtered_df)/original_count*100:.1f}%)")
                
            except Exception as e:
                print(f"    ✗ エラー: {sheet_name} シートの処理中にエラーが発生しました")
                print(f"      {str(e)}")
        
        print()
        print("【ステップ 4/5】集計シートを作成中...")
        
        # rbbn 集計シートを作成
        if 'rbbn' in extracted_data and len(extracted_data['rbbn']) > 0:
            print(f"  処理中: rbbn 集計シート...")
            try:
                summary, detail = create_rbbn_summary(extracted_data['rbbn'])
                
                # カテゴリ別集計シートを保存
                summary.to_excel(writer, sheet_name='rbbn_集計_カテゴリ', index=False)
                print(f"    ✓ カテゴリ別集計: {len(summary)} ホスト")
                
                # 詳細集計シートを保存
                detail.to_excel(writer, sheet_name='rbbn_集計_詳細', index=False)
                print(f"    ✓ 詳細集計: {len(detail)} ホスト")
                
            except Exception as e:
                print(f"    ✗ エラー: rbbn 集計シートの作成中にエラーが発生しました")
                print(f"      {str(e)}")
        
        # zte 集計シートを作成
        if 'zte' in extracted_data and len(extracted_data['zte']) > 0:
            print(f"  処理中: zte 集計シート...")
            try:
                summary = create_zte_summary(extracted_data['zte'])
                
                # 集計シートを保存
                summary.to_excel(writer, sheet_name='zte_集計', index=False)
                print(f"    ✓ ポート集計: {len(summary)} ホスト")
                
            except Exception as e:
                print(f"    ✗ エラー: zte 集計シートの作成中にエラーが発生しました")
                print(f"      {str(e)}")
        
        print()
        print("【ステップ 5/5】ファイルを保存中...")
    
    print(f"  ✓ 保存完了: {output_file}")
    print()
    print("=" * 80)
    print("処理が完了しました")
    print("=" * 80)
    
    return output_file


def main():
    """メイン処理"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    input_file = os.path.join(script_dir, "PTN_list.xlsx")
    
    # カレントディレクトリをスクリプトのディレクトリに変更
    os.chdir(script_dir)
    
    try:
        output_file = extract_matching_rows(input_file)
        print(f"\n出力ファイルを確認してください: {output_file}")
        return 0
    except Exception as e:
        print(f"\nエラーが発生しました: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
