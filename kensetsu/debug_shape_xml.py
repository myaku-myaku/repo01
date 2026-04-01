#!/usr/bin/env python3
"""Debug script to inspect shape XML in D111_沼南.xlsx"""

import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

JUNDENSO_KEYWORD = "準伝送ラック"

file_path = Path(__file__).parent / "D111_沼南.xlsx"

if not file_path.exists():
    print(f"ファイルが見つかりません: {file_path}")
    exit(1)

print(f"📁 検査中: {file_path}\n")

# ExcelファイルをZIPとして開く
with zipfile.ZipFile(file_path, 'r') as zip_ref:
    # すべてのファイルをリスト
    print("ZIP内のファイル:")
    for name in sorted(zip_ref.namelist()):
        print(f"  {name}")
    
    print("\n" + "="*60)
    print("Drawing XMLファイルを検索")
    print("="*60)
    
    # drawingファイルを探す
    drawing_files = [n for n in zip_ref.namelist() if 'drawing' in n.lower() and n.endswith('.xml')]
    
    for drawing_file in drawing_files:
        print(f"\n📄 {drawing_file}")
        print("-" * 60)
        
        content = zip_ref.read(drawing_file).decode('utf-8', errors='replace')
        
        # キーワードを検索
        if JUNDENSO_KEYWORD in content:
            print(f"✓✓✓ 「{JUNDENSO_KEYWORD}」が見つかりました！")
            
            # 該当箇所を表示
            lines = content.split('\n')
            for idx, line in enumerate(lines):
                if JUNDENSO_KEYWORD in line:
                    print(f"\n  行 {idx+1}:")
                    print(f"  {line[:200]}")
        else:
            print(f"  「{JUNDENSO_KEYWORD}」は見つかりませんでした")
        
        # XMLをパースしてテキスト要素を探す
        try:
            root = ET.fromstring(content)
            
            # 名前空間を取得
            namespaces = {}
            for event, elem in ET.iterparse(zipfile.ZipFile(file_path).open(drawing_file), events=['start-ns']):
                ns_prefix, ns_uri = event
                if ns_prefix:
                    namespaces[ns_prefix] = ns_uri
            
            print(f"\n  名前空間: {namespaces}")
            
            # すべてのテキスト要素を探す
            all_text = []
            for elem in root.iter():
                if elem.text and elem.text.strip():
                    all_text.append(elem.text.strip())
                    if JUNDENSO_KEYWORD in elem.text:
                        print(f"\n  ✓ Element {elem.tag}: {elem.text}")
            
            if all_text:
                print(f"\n  全テキスト要素数: {len(all_text)}")
                print(f"  テキストサンプル:")
                for txt in all_text[:10]:
                    print(f"    - {txt[:100]}")
        
        except Exception as e:
            print(f"  XML解析エラー: {e}")
    
    # vmlDrawingファイルも確認
    print("\n" + "="*60)
    print("VML Drawing XMLファイルを検索")
    print("="*60)
    
    vml_files = [n for n in zip_ref.namelist() if 'vmlDrawing' in n or ('xl/drawings/' in n and 'vml' in n)]
    
    for vml_file in vml_files:
        print(f"\n📄 {vml_file}")
        print("-" * 60)
        
        content = zip_ref.read(vml_file).decode('utf-8', errors='replace')
        
        if JUNDENSO_KEYWORD in content:
            print(f"✓✓✓ 「{JUNDENSO_KEYWORD}」が見つかりました！")
            
            lines = content.split('\n')
            for idx, line in enumerate(lines):
                if JUNDENSO_KEYWORD in line:
                    print(f"\n  行 {idx+1}:")
                    print(f"  {line[:200]}")
        else:
            print(f"  「{JUNDENSO_KEYWORD}」は見つかりませんでした")

print("\n\n✅ 検査完了")
