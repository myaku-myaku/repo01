#!/usr/bin/env python3
"""Test scan_excel_file on D111_沼南.xlsx"""

import sys
from pathlib import Path

# スクリプトと同じディレクトリに移動
sys.path.insert(0, str(Path(__file__).parent))

# scan_excel_fileをインポート
exec(open(Path(__file__).parent / "01.semi_trns_cab.py").read())

file_path = Path(__file__).parent / "D111_沼南.xlsx"
result = scan_excel_file(file_path)

print(f'ファイル: {result["file"].name}')
print(f'準伝送シート数: {len(result["sheet_hits"])}')
print(f'準伝送セル件数: {sum(result["sheet_hits"].values())}')
print(f'CABホスト数: {len(result["cab_hostnames"])}')
print(f'CABホスト名: {sorted(result["cab_hostnames"])}')
print(f'エラー: {result["errors"]}')
print(f'\n準伝送セル詳細:')
for cell in result['jundenso_cells']:
    print(f'  {cell}')
