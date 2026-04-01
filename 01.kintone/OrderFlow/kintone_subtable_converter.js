/*
 * kintone JavaScript - サブテーブルをカンマ区切りテキストに変換
 * サブテーブルの各フィールドを指定されたフィールドにカンマ区切りで出力
 */

(function() {
    'use strict';

        // 設定項目 - 実際のアプリに合わせて変更してください
    const CONFIG = {
        // サブテーブルのフィールドコード
        subtableFieldCode: 'T1',
        
        // 出力先のフィールドコード（文字列（複数行）推奨）
        outputFieldCode: 'O1',
        
        // サブテーブル内の対象フィールド
        targetFields: [
            'F1',  // 実際のフィールドコードに変更
            'F2',
            'F3'
        ],
        
        // 出力形式設定
        separator: ', ',        // フィールド間区切り文字
        rowSeparator: '\n',     // 行間区切り文字
        includeHeader: true,    // ヘッダー行を含むか
        headerNames: ['F1', 'F2', 'F3'], // ヘッダー名（空の場合はフィールドコードを使用）
        
        // 自動更新設定
        autoUpdate: true,       // サブテーブル変更時の自動更新を有効にするか
        updateDelay: 200,       // 自動更新の遅延時間（ミリ秒）
        
        // ボタン配置設定
        buttonPosition: 'subtable-bottom', // 'auto', 'header', 'floating', 'subtable', 'subtable-right', 'subtable-bottom', 'form-top'
        floatingPosition: {     // フローティング時の位置設定
            top: '10px',
            right: '10px',
            bottom: 'auto',
            left: 'auto'
        }
    };

    // レコード保存前イベント
    kintone.events.on(['app.record.create.submit', 'app.record.edit.submit'], function(event) {
        const record = event.record;
        
        try {
            // サブテーブルからデータを取得してカンマ区切りに変換
            const csvText = convertSubtableToCSV(record);
            
            // 出力先フィールドに設定
            record[CONFIG.outputFieldCode].value = csvText;
            
            console.log('保存時にサブテーブルデータを変換しました:', csvText);
            
        } catch (error) {
            console.error('サブテーブル変換エラー:', error);
            // エラーが発生してもレコード保存を継続
        }
        
        return event;
    });

    // 削除：この部分は下で統合された新しいイベント処理に置き換え

    // サブテーブル内の個別フィールド変更イベント（修正版）
    if (CONFIG.autoUpdate) {
        console.log('サブテーブルフィールド変更イベントを登録します');
        
        // 方法1: サブテーブル全体の変更を監視
        kintone.events.on([
            'app.record.edit.change.' + CONFIG.subtableFieldCode,
            'app.record.create.change.' + CONFIG.subtableFieldCode
        ], function(event) {
            console.log('サブテーブル全体変更イベント発生:', event.type);
            
            try {
                setTimeout(function() {
                    const currentRecord = kintone.app.record.get().record;
                    const csvText = convertSubtableToCSV(currentRecord);
                    
                    currentRecord[CONFIG.outputFieldCode].value = csvText;
                    kintone.app.record.set({record: currentRecord});
                    
                    console.log('サブテーブル変更時にデータを更新しました');
                }, CONFIG.updateDelay);
                
            } catch (error) {
                console.error('サブテーブル変更エラー:', error);
            }
            
            return event;
        });
        
        // 方法2: 個別フィールドの変更イベント（代替アプローチ）
        CONFIG.targetFields.forEach(function(fieldCode) {
            const events = [
                'app.record.edit.change.' + fieldCode,
                'app.record.create.change.' + fieldCode
            ];
            
            console.log('フィールド変更イベントを登録:', fieldCode);
            
            kintone.events.on(events, function(event) {
                console.log('フィールド変更イベント発生:', fieldCode, event.type);
                
                try {
                    setTimeout(function() {
                        const currentRecord = kintone.app.record.get().record;
                        const csvText = convertSubtableToCSV(currentRecord);
                        
                        currentRecord[CONFIG.outputFieldCode].value = csvText;
                        kintone.app.record.set({record: currentRecord});
                        
                        console.log('フィールド変更時にサブテーブルデータを更新しました:', fieldCode);
                    }, CONFIG.updateDelay);
                    
                } catch (error) {
                    console.error('フィールド変更エラー:', fieldCode, error);
                }
                
                return event;
            });
        });
        
        // 方法3: 汎用的な変更監視（フォールバック）
        let updateTimer = null;
        
        function scheduleUpdate() {
            if (updateTimer) {
                clearTimeout(updateTimer);
            }
            
            updateTimer = setTimeout(function() {
                try {
                    const currentRecord = kintone.app.record.get().record;
                    const csvText = convertSubtableToCSV(currentRecord);
                    
                    const outputField = currentRecord[CONFIG.outputFieldCode];
                    if (outputField && outputField.value !== csvText) {
                        outputField.value = csvText;
                        kintone.app.record.set({record: currentRecord});
                        console.log('汎用変更監視でデータを更新しました');
                    }
                } catch (error) {
                    console.error('汎用更新エラー:', error);
                }
                updateTimer = null;
            }, CONFIG.updateDelay);
        }
        
        // DOM変更監視（最終手段）
        setTimeout(function() {
            const subtableElement = document.querySelector('[data-field-code="' + CONFIG.subtableFieldCode + '"]');
            if (subtableElement) {
                console.log('DOMレベルでサブテーブル監視を開始');
                
                const observer = new MutationObserver(function(mutations) {
                    let shouldUpdate = false;
                    mutations.forEach(function(mutation) {
                        if (mutation.type === 'childList' || mutation.type === 'subtree') {
                            shouldUpdate = true;
                        }
                    });
                    
                    if (shouldUpdate) {
                        console.log('DOM変更を検出、更新をスケジュール');
                        scheduleUpdate();
                    }
                });
                
                observer.observe(subtableElement, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
            }
        }, 1000);
    }

    // サブテーブル行の追加・削除時のイベント
    if (CONFIG.autoUpdate) {
        kintone.events.on([
            'app.record.edit.change.' + CONFIG.subtableFieldCode + '.ADD_ROW',
            'app.record.edit.change.' + CONFIG.subtableFieldCode + '.REMOVE_ROW',
            'app.record.create.change.' + CONFIG.subtableFieldCode + '.ADD_ROW',
            'app.record.create.change.' + CONFIG.subtableFieldCode + '.REMOVE_ROW'
        ], function(event) {
            const record = event.record;
            
            try {
                // 行の追加・削除後に自動更新（少し長めの遅延）
                setTimeout(function() {
                    const currentRecord = kintone.app.record.get().record;
                    const csvText = convertSubtableToCSV(currentRecord);
                    
                    currentRecord[CONFIG.outputFieldCode].value = csvText;
                    kintone.app.record.set({record: currentRecord});
                    
                    console.log('サブテーブル行の追加/削除時にデータを更新しました');
                }, CONFIG.updateDelay + 100); // 行追加/削除は少し長めの遅延
                
            } catch (error) {
                console.error('行追加/削除時エラー:', error);
            }
            
            return event;
        });
        
        console.log('サブテーブル自動更新機能が有効になりました');
    } else {
        console.log('サブテーブル自動更新機能は無効です（保存時のみ更新）');
    }

    /**
     * サブテーブルをCSV形式に変換する関数
     * @param {Object} record - kintoneのレコードオブジェクト
     * @return {string} - CSV形式の文字列
     */
    function convertSubtableToCSV(record) {
        // サブテーブルデータを取得
        const subtableData = record[CONFIG.subtableFieldCode];
        
        if (!subtableData || !subtableData.value || subtableData.value.length === 0) {
            return ''; // サブテーブルが空の場合
        }

        const rows = [];
        
        // ヘッダー行を追加（設定で有効な場合）
        if (CONFIG.includeHeader && CONFIG.headerNames.length > 0) {
            rows.push(CONFIG.headerNames.join(CONFIG.separator));
        }

        // サブテーブルの各行を処理
        subtableData.value.forEach(function(row, index) {
            const rowData = [];
            
            // 設定されたフィールドの値を取得
            CONFIG.targetFields.forEach(function(fieldCode) {
                let cellValue = '';
                
                if (row.value[fieldCode] && row.value[fieldCode].value !== undefined) {
                    const field = row.value[fieldCode];
                    
                    // フィールドタイプに応じて値を取得
                    if (field.type === 'CHECK_BOX' || field.type === 'MULTI_SELECT') {
                        // チェックボックスや複数選択の場合
                        cellValue = Array.isArray(field.value) ? field.value.join(';') : field.value;
                    } else if (field.type === 'USER_SELECT' || field.type === 'ORGANIZATION_SELECT') {
                        // ユーザー選択や組織選択の場合
                        if (Array.isArray(field.value)) {
                            cellValue = field.value.map(function(item) {
                                return item.name || item.code;
                            }).join(';');
                        } else {
                            cellValue = field.value;
                        }
                    } else if (field.type === 'FILE') {
                        // ファイルフィールドの場合
                        if (Array.isArray(field.value)) {
                            cellValue = field.value.map(function(file) {
                                return file.name;
                            }).join(';');
                        } else {
                            cellValue = '';
                        }
                    } else {
                        // その他のフィールド
                        cellValue = field.value || '';
                    }
                } else {
                    cellValue = '';
                }
                
                // CSV形式のためにダブルクォートでエスケープ
                cellValue = escapeCSVValue(cellValue);
                rowData.push(cellValue);
            });
            
            rows.push(rowData.join(CONFIG.separator));
        });

        return rows.join(CONFIG.rowSeparator);
    }

    /**
     * CSV用の値をエスケープする関数
     * @param {string} value - エスケープする値
     * @return {string} - エスケープされた値
     */
    function escapeCSVValue(value) {
        if (typeof value !== 'string') {
            value = String(value);
        }
        
        // カンマ、改行、ダブルクォートが含まれる場合はダブルクォートで囲む
        if (value.includes(',') || value.includes('\n') || value.includes('\r') || value.includes('"')) {
            // ダブルクォートを二重にエスケープ
            value = value.replace(/"/g, '""');
            return '"' + value + '"';
        }
        
        return value;
    }

    /**
     * サブテーブルの特定の列だけを抽出する関数（オプション）
     * @param {Object} record - kintoneのレコードオブジェクト
     * @param {string} fieldCode - 抽出するフィールドコード
     * @return {string} - 指定フィールドの値をカンマ区切りで結合した文字列
     */
    function extractSingleColumn(record, fieldCode) {
        const subtableData = record[CONFIG.subtableFieldCode];
        
        if (!subtableData || !subtableData.value || subtableData.value.length === 0) {
            return '';
        }

        const values = subtableData.value.map(function(row) {
            if (row.value[fieldCode] && row.value[fieldCode].value !== undefined) {
                return row.value[fieldCode].value || '';
            }
            return '';
        }).filter(function(value) {
            return value !== ''; // 空の値は除外
        });

        return values.join(CONFIG.separator);
    }

    // 高度な変換機能：JSON形式での出力
    function convertSubtableToJSON(record) {
        const subtableData = record[CONFIG.subtableFieldCode];
        
        if (!subtableData || !subtableData.value || subtableData.value.length === 0) {
            return '[]';
        }

        const jsonArray = subtableData.value.map(function(row) {
            const obj = {};
            CONFIG.targetFields.forEach(function(fieldCode) {
                if (row.value[fieldCode]) {
                    obj[fieldCode] = row.value[fieldCode].value;
                }
            });
            return obj;
        });

        return JSON.stringify(jsonArray, null, 2);
    }

    /**
     * CSVファイルをダウンロードする関数
     * @param {Object} record - kintoneのレコードオブジェクト
     * @param {string} filename - ダウンロードファイル名（省略時は自動生成）
     */
    function downloadCSV(record, filename) {
        try {
            // CSVデータを生成
            const csvData = convertSubtableToCSV(record);
            
            if (!csvData || csvData.trim() === '') {
                alert('ダウンロードするデータがありません。');
                return;
            }
            
            // ファイル名を生成（指定がない場合）
            if (!filename) {
                const now = new Date();
                const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
                const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
                filename = CONFIG.subtableFieldCode + '_' + dateStr + '_' + timeStr + '.csv';
            }
            
            // BOM付きUTF-8でエンコード（Excelでの文字化け防止）
            const bom = '\uFEFF';
            const csvContent = bom + csvData;
            
            // Blobオブジェクトを作成
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            
            // ダウンロードリンクを作成
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            
            // 一時的にDOMに追加してクリック実行
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // オブジェクトURLを解放
            URL.revokeObjectURL(url);
            
            console.log('CSVファイルをダウンロードしました:', filename);
            
        } catch (error) {
            console.error('CSVダウンロードエラー:', error);
            alert('CSVファイルのダウンロードに失敗しました。');
        }
    }

    /**
     * サブテーブル要素を検索するヘルパー関数
     */
    function findSubtableElement() {
        const selectors = [
            '[data-field-code="' + CONFIG.subtableFieldCode + '"]',
            '.subtable-gaia',
            '.subtable-container',
            '[data-field="' + CONFIG.subtableFieldCode + '"]',
            '.field-' + CONFIG.subtableFieldCode,
            '.table-gaia'
        ];
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                console.log('サブテーブル要素発見:', selector, element);
                return element;
            }
        }
        
        console.log('サブテーブル要素が見つかりませんでした');
        return null;
    }

    /**
     * サブテーブル配置用の親要素を検索
     */
    function findSubtableForPlacement() {
        const subtableElement = findSubtableElement();
        if (subtableElement && subtableElement.parentNode) {
            return subtableElement.parentNode;
        }
        
        // フォールバック処理
        const formElement = document.querySelector('.contents-horizontal-gaia') || 
                          document.querySelector('form[name="record"]') ||
                          document.querySelector('.gaia-argoui-contents-body');
        if (formElement) {
            console.log('サブテーブルが見つからないためフォーム上部に配置します');
            return formElement;
        }
        
        return null;
    }

    /**
     * CSVダウンロードボタンを作成
     */
    function createButtons() {
        console.log('createButtons関数が呼び出されました', 'ボタン位置設定:', CONFIG.buttonPosition);
        
        try {
            let headerSpace = null;
            let placementType = 'unknown';
            
            // 位置設定に基づいて配置場所を決定
            switch (CONFIG.buttonPosition) {
                case 'floating':
                    headerSpace = document.body;
                    placementType = 'floating';
                    console.log('フローティングボタンとして配置します');
                    break;
                    
                case 'header':
                    headerSpace = kintone.app.getHeaderSpaceElement() || kintone.app.getHeaderMenuSpaceElement();
                    placementType = 'header';
                    console.log('ヘッダー領域に配置します');
                    break;
                    
                case 'subtable':
                    // サブテーブルの直前に配置
                    const subtableElement = document.querySelector('[data-field-code="' + CONFIG.subtableFieldCode + '"]');
                    console.log('サブテーブル要素検索:', subtableElement);
                    
                    if (subtableElement && subtableElement.parentNode) {
                        headerSpace = subtableElement.parentNode;
                        placementType = 'subtable';
                        console.log('サブテーブル近くに配置します');
                    } else {
                        headerSpace = findSubtableForPlacement();
                        if (headerSpace) {
                            placementType = 'subtable';
                        }
                    }
                    break;
                    
                case 'subtable-right':
                    // サブテーブルの右側に配置
                    const rightSubtableElement = findSubtableElement();
                    console.log('サブテーブル右側配置用要素:', rightSubtableElement);
                    
                    if (rightSubtableElement) {
                        headerSpace = rightSubtableElement;
                        placementType = 'subtable-right';
                        console.log('サブテーブル右側に配置します');
                    } else {
                        headerSpace = findSubtableForPlacement();
                        if (headerSpace) {
                            placementType = 'subtable-bottom';
                            console.log('右側配置失敗、下側にフォールバック');
                        }
                    }
                    break;
                    
                case 'subtable-bottom':
                    // サブテーブルの下側に配置
                    const bottomSubtableElement = findSubtableElement();
                    console.log('サブテーブル下側配置用要素:', bottomSubtableElement);
                    
                    if (bottomSubtableElement && bottomSubtableElement.parentNode) {
                        headerSpace = bottomSubtableElement.parentNode;
                        placementType = 'subtable-bottom';
                        console.log('サブテーブル下側に配置します');
                    } else {
                        headerSpace = findSubtableForPlacement();
                        if (headerSpace) {
                            placementType = 'subtable';
                        }
                    }
                    break;
                    
                case 'form-top':
                    // フォームの最上部に配置
                    const formSelectors = [
                        '.contents-horizontal-gaia',
                        'form[name="record"]',
                        '.record-form',
                        '.gaia-argoui-contents-body'
                    ];
                    
                    for (const selector of formSelectors) {
                        const element = document.querySelector(selector);
                        if (element) {
                            headerSpace = element;
                            placementType = 'form-top';
                            console.log('フォーム上部に配置します:', selector);
                            break;
                        }
                    }
                    break;
                    
                case 'auto':
                    // 自動選択（従来の動作）
                    console.log('自動配置モードで場所を検索します');
                    
                    // 方法1: 標準のヘッダースペース
                    try {
                        headerSpace = kintone.app.getHeaderSpaceElement();
                        if (headerSpace) placementType = 'header';
                        console.log('標準ヘッダースペース:', headerSpace);
                    } catch (e) {
                        console.log('標準ヘッダースペース取得失敗:', e);
                    }
                    
                    // 方法2: ヘッダーメニュースペース
                    if (!headerSpace) {
                        try {
                            headerSpace = kintone.app.getHeaderMenuSpaceElement();
                            if (headerSpace) placementType = 'header';
                            console.log('ヘッダーメニュースペース:', headerSpace);
                        } catch (e) {
                            console.log('ヘッダーメニュースペース取得失敗:', e);
                        }
                    }
                    
                    // 方法3: DOM要素検索
                    if (!headerSpace) {
                        const selectors = [
                            '.gaia-argoui-app-toolbar',
                            '.gaia-header-toolbar',
                            '.contents-horizontal-gaia',
                            '.gaia-argoui-contents-body'
                        ];
                        
                        for (const selector of selectors) {
                            const element = document.querySelector(selector);
                            if (element) {
                                headerSpace = element;
                                placementType = 'auto-detected';
                                console.log('DOM検索で配置場所発見:', selector);
                                break;
                            }
                        }
                    }
                    
                    // 最終手段: フローティング
                    if (!headerSpace) {
                        headerSpace = document.body;
                        placementType = 'floating';
                        console.log('フローティングボタンにフォールバック');
                    }
                    break;
                    
                default:
                    console.log('不明な配置設定:', CONFIG.buttonPosition, '自動配置を使用します');
                    // autoケースと同じ処理をするため、autoの処理を再実行
                    CONFIG.buttonPosition = 'auto';
                    headerSpace = document.body;
                    placementType = 'floating';
                    break;
            }
            
            // 既存のボタンを削除
            const existingContainer = document.querySelector('#subtable-buttons-container');
            if (existingContainer) {
                existingContainer.remove();
                console.log('既存のボタンを削除しました');
            }
            
            // ボタンコンテナを作成
            const container = document.createElement('div');
            container.id = 'subtable-buttons-container';
            
            // 配置タイプに応じてスタイルを適用
            if (placementType === 'floating') {
                container.style.position = 'fixed';
                container.style.top = CONFIG.floatingPosition.top;
                container.style.right = CONFIG.floatingPosition.right;
                container.style.bottom = CONFIG.floatingPosition.bottom;
                container.style.left = CONFIG.floatingPosition.left;
                container.style.zIndex = '9999';
                container.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
                container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                container.style.borderRadius = '8px';
                container.style.padding = '12px';
                console.log('フローティングボタンスタイルを適用');
            } else if (placementType === 'subtable') {
                container.style.display = 'block';
                container.style.margin = '10px 0';
                container.style.padding = '8px';
                container.style.backgroundColor = '#e8f4fd';
                container.style.border = '1px solid #3498db';
                container.style.borderRadius = '6px';
                container.style.textAlign = 'center';
                console.log('サブテーブル近くスタイルを適用');
            } else if (placementType === 'subtable-right') {
                container.style.position = 'absolute';
                container.style.top = '0';
                container.style.right = '-180px';
                container.style.display = 'block';
                container.style.padding = '8px';
                container.style.backgroundColor = '#fff3cd';
                container.style.border = '1px solid #ffc107';
                container.style.borderRadius = '6px';
                container.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                container.style.zIndex = '1000';
                console.log('サブテーブル右側スタイルを適用');
            } else if (placementType === 'subtable-bottom') {
                container.style.display = 'block';
                container.style.margin = '5px 0 10px 0';
                container.style.padding = '8px';
                container.style.backgroundColor = '#d1ecf1';
                container.style.border = '1px solid #17a2b8';
                container.style.borderRadius = '6px';
                container.style.textAlign = 'center';
                console.log('サブテーブル下側スタイルを適用');
            } else if (placementType === 'form-top') {
                container.style.display = 'block';
                container.style.margin = '0 0 15px 0';
                container.style.padding = '10px';
                container.style.backgroundColor = '#f8f9fa';
                container.style.border = '1px solid #dee2e6';
                container.style.borderRadius = '4px';
                container.style.textAlign = 'right';
                console.log('フォーム上部スタイルを適用');
            } else {
                // header や auto-detected の場合
                container.style.display = 'inline-block';
                container.style.margin = '5px 10px';
                container.style.padding = '5px';
                container.style.backgroundColor = 'transparent';
                container.style.borderRadius = '4px';
                console.log('標準スタイルを適用');
            }
            
            // CSVダウンロードボタン
            const downloadButton = document.createElement('button');
            downloadButton.textContent = 'CSVファイルをダウンロード';
            downloadButton.style.padding = '10px 20px';
            downloadButton.style.backgroundColor = '#27ae60';
            downloadButton.style.color = 'white';
            downloadButton.style.border = 'none';
            downloadButton.style.borderRadius = '6px';
            downloadButton.style.cursor = 'pointer';
            downloadButton.style.fontWeight = 'bold';
            downloadButton.style.fontSize = '14px';
            downloadButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
            downloadButton.style.transition = 'all 0.2s ease';
            
            // ボタンホバーエフェクト
            downloadButton.addEventListener('mouseenter', function() {
                this.style.backgroundColor = '#219a52';
                this.style.transform = 'translateY(-1px)';
            });
            
            downloadButton.addEventListener('mouseleave', function() {
                this.style.backgroundColor = '#27ae60';
                this.style.transform = 'translateY(0)';
            });
            
            downloadButton.addEventListener('click', function() {
                console.log('CSVダウンロードボタンがクリックされました');
                try {
                    const record = kintone.app.record.get().record;
                    downloadCSV(record);
                } catch (error) {
                    console.error('ダウンロードエラー:', error);
                    alert('ダウンロードに失敗しました: ' + error.message);
                }
            });
            
            container.appendChild(downloadButton);
            
            // headerSpaceが存在することを確認
            if (!headerSpace) {
                console.error('配置先要素が見つかりませんでした。フローティングにフォールバックします');
                headerSpace = document.body;
                placementType = 'floating';
            }
            
            // 配置タイプに応じて挿入位置を調整
            try {
                if (placementType === 'subtable') {
                    // サブテーブルの直前に挿入
                    const subtableElement = findSubtableElement();
                    if (subtableElement && subtableElement.parentNode) {
                        subtableElement.parentNode.insertBefore(container, subtableElement);
                        console.log('サブテーブル直前に挿入しました');
                    } else {
                        headerSpace.appendChild(container);
                        console.log('サブテーブル要素が見つからないため通常配置しました');
                    }
                } else if (placementType === 'subtable-right') {
                    // サブテーブルの右側に配置
                    const subtableElement = findSubtableElement();
                    if (subtableElement) {
                        // サブテーブル要素の position を relative にして、ボタンを absolute で配置
                        const subtableParent = subtableElement.parentNode || subtableElement;
                        subtableParent.style.position = 'relative';
                        subtableParent.appendChild(container);
                        console.log('サブテーブル右側に配置しました');
                    } else {
                        headerSpace.appendChild(container);
                        console.log('サブテーブル右側配置失敗、通常配置しました');
                    }
                } else if (placementType === 'subtable-bottom') {
                    // サブテーブルの直後に挿入
                    const subtableElement = findSubtableElement();
                    if (subtableElement && subtableElement.parentNode) {
                        // サブテーブルの次の兄弟要素として挿入
                        if (subtableElement.nextSibling) {
                            subtableElement.parentNode.insertBefore(container, subtableElement.nextSibling);
                        } else {
                            subtableElement.parentNode.appendChild(container);
                        }
                        console.log('サブテーブル下側に配置しました');
                    } else {
                        headerSpace.appendChild(container);
                        console.log('サブテーブル下側配置失敗、通常配置しました');
                    }
                } else if (placementType === 'form-top') {
                    // フォームの最初に挿入
                    if (headerSpace.firstChild) {
                        headerSpace.insertBefore(container, headerSpace.firstChild);
                    } else {
                        headerSpace.appendChild(container);
                    }
                    console.log('フォーム最上部に配置しました');
                } else {
                    // その他の場合（header, floating, auto-detected）
                    headerSpace.appendChild(container);
                    console.log('通常の場所に配置しました');
                }
            } catch (insertError) {
                console.error('ボタン挿入エラー:', insertError);
                // 最終フォールバック: body要素に追加
                try {
                    document.body.appendChild(container);
                    console.log('bodyに緊急配置しました');
                } catch (bodyError) {
                    console.error('緊急配置も失敗:', bodyError);
                    return;
                }
            }
            
            console.log('CSVダウンロードボタンを作成しました (配置タイプ:', placementType + ')');
            
        } catch (error) {
            console.error('ボタン作成エラー:', error);
        }
    }

    /**
     * JSONファイルをダウンロードする関数
     * @param {Object} record - kintoneのレコードオブジェクト
     * @param {string} filename - ダウンロードファイル名
     */
    function downloadJSON(record, filename) {
        try {
            const jsonData = convertSubtableToJSON(record);
            
            if (!filename) {
                const now = new Date();
                const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
                const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
                filename = CONFIG.subtableFieldCode + '_' + dateStr + '_' + timeStr + '.json';
            }
            
            const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('JSONダウンロードエラー:', error);
            alert('JSONファイルのダウンロードに失敗しました。');
        }
    }

    // レコード詳細・編集画面でボタンを表示
    kintone.events.on(['app.record.detail.show', 'app.record.edit.show', 'app.record.create.show'], function(event) {
        console.log('kintoneイベントが発生しました:', event.type);
        
        // 段階的にボタン作成を試行
        setTimeout(function() {
            createButtons();
        }, 100);
        
        // 1秒後にも再試行
        setTimeout(function() {
            const existingButton = document.querySelector('#subtable-buttons-container');
            if (!existingButton) {
                console.log('1秒後の再試行でボタンを作成します');
                createButtons();
            }
        }, 1000);
        
        return event;
    });

    // グローバル関数として公開（デバッグ用）
    window.kintoneSubtableConverter = {
        convertToCSV: function(record) {
            return convertSubtableToCSV(record);
        },
        convertToJSON: function(record) {
            return convertSubtableToJSON(record);
        },
        extractColumn: function(record, fieldCode) {
            return extractSingleColumn(record, fieldCode);
        },
        downloadCSV: function(record, filename) {
            downloadCSV(record, filename);
        },
        downloadJSON: function(record, filename) {
            downloadJSON(record, filename);
        },
        // デバッグ用：手動でボタンを作成
        createButton: function() {
            createButtons();
        },
        // デバッグ用：現在のレコードを取得してダウンロード
        downloadCurrentRecord: function() {
            try {
                const record = kintone.app.record.get().record;
                downloadCSV(record);
            } catch (error) {
                console.error('レコード取得エラー:', error);
            }
        },
        // ボタン位置を動的に変更
        changeButtonPosition: function(position, floatingPos) {
            CONFIG.buttonPosition = position;
            if (floatingPos) {
                CONFIG.floatingPosition = floatingPos;
            }
            createButtons();
        },
        // 現在の設定を表示
        showConfig: function() {
            console.log('現在の設定:', CONFIG);
        },
        // サブテーブル要素の確認
        findSubtableElement: function() {
            console.log('サブテーブル検索開始...');
            
            const selectors = [
                '[data-field-code="' + CONFIG.subtableFieldCode + '"]',
                '.subtable-gaia',
                '.subtable-container', 
                '[data-field="' + CONFIG.subtableFieldCode + '"]',
                '.field-' + CONFIG.subtableFieldCode,
                '.table-gaia'
            ];
            
            selectors.forEach(function(selector) {
                const element = document.querySelector(selector);
                console.log('セレクター:', selector, '結果:', element);
            });
            
            // すべてのdata-field-code属性を持つ要素を表示
            const allFields = document.querySelectorAll('[data-field-code]');
            console.log('全フィールド要素:');
            allFields.forEach(function(field) {
                console.log('- ', field.getAttribute('data-field-code'), field);
            });
            
            return findSubtableElement();
        },
        // サブテーブル配置のテスト
        testSubtablePositions: function() {
            console.log('サブテーブル配置テスト開始');
            
            const positions = ['subtable-right', 'subtable-bottom', 'subtable'];
            
            positions.forEach(function(position) {
                console.log('テスト配置:', position);
                window.kintoneSubtableConverter.changeButtonPosition(position);
            });
        }
    };

})();