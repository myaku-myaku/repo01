/**
 * kintone_csv_attachment.js
 *
 * 【概要】
 * [NW伝送]011_オーダーフロー アプリ用。
 * 発注内容サブテーブルのデータをCSVファイルに変換し、
 * 添付ファイルフィールド（CSV添付）へ自動または手動で添付する。
 *
 * 【機能一覧】
 * 1. CSV生成・添付ボタン
 *    - サブテーブル下部に「CSV生成・添付」ボタンを配置。
 *    - 決裁番号, 伝票案件名, 明細名, 予算CD, 費用CD, 金額 をCSV化。
 *    - Kintone REST API でファイルアップロード後、添付ファイルフィールドに設定。
 *
 * 2. 保存時の自動添付（CONFIG.autoAttach で切替）
 *    - create.submit / edit.submit 時にCSVを自動添付（デフォルトは無効）。
 *
 * 3. ZIPパスワード生成ボタン
 *    - ZIPパスワードフィールドにランダムパスワードを生成・セットする。
 *
 * 【参照フィールドコード】
 *   発注内容_テーブル, CSV添付, ZIPパスワード
 *
 * 【依存】なし（Kintone JS API のみ使用）
 * 【配置】Kintone アプリの JS カスタマイズにアップロード
 */

(function() {
    'use strict';

    // 設定項目 - 本番環境設定
    const CONFIG = {
        // サブテーブルのフィールドコード
        subtableFieldCode: '発注内容_テーブル',
        
        // 添付ファイル先のフィールドコード
        attachmentFieldCode: 'CSV添付',
        
        // ZIPパスワードフィールドのフィールドコード
        zipPasswordFieldCode: 'ZIPパスワード',
        
        // サブテーブル内の対象フィールド
        targetFields: [
            '決裁番号',      // F1
            '伝票案件名',     // F2
            '明細名',        // F3
            '予算CD',        // F4
            '費用CD',        // F5
            '金額_テーブル'   // F6
        ],
        
        // CSV出力形式設定
        separator: ',',         // フィールド間区切り文字
        rowSeparator: '\n',     // 行間区切り文字
        includeHeader: true,    // ヘッダー行を含むか
        headerNames: ['決裁番号', '伝票案件名', '明細名', '予算CD', '費用CD', '金額'], // ヘッダー名
        
        // ファイル設定
        filename: '発注内容_データ', // ファイル名（拡張子除く）
        encoding: 'utf-8-bom',     // エンコーディング ('utf-8', 'utf-8-bom', 'shift_jis')
        
        // 自動添付設定
        autoAttach: false,      // 保存時の自動添付を有効にするか（一旦無効）
        replaceExisting: true,  // 既存のCSVファイルを置き換えるか
        
        // ボタン配置設定
        buttonPosition: 'subtable-bottom', // ボタンの配置位置
        
        // ZIPパスワード設定
        passwordLength: 12,     // パスワードの長さ（デフォルト12文字）
        passwordChars: {
            uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',  // 大文字（IとOを除外）
            lowercase: 'abcdefghijkmnpqrstuvwxyz',  // 小文字（lとoを除外）
            numbers: '23456789',                     // 数字（0と1を除外）
            symbols: '!@#$%&*+-='                    // 記号（混乱しやすい記号を除外）
        }
    };

    // レコード作成時にZIPパスワードを自動生成
    kintone.events.on(['app.record.create.submit'], function(event) {
        var record = event.record;
        var pwField = record[CONFIG.zipPasswordFieldCode];
        if (pwField && (!pwField.value || pwField.value === '')) {
            pwField.value = generateZipPassword();
            console.log('[csv-attachment] ZIPパスワードを自動生成しました');
        }
        return event;
    });

    // レコード保存前イベント（自動添付）
    kintone.events.on(['app.record.create.submit', 'app.record.edit.submit'], function(event) {
        if (!CONFIG.autoAttach) {
            return event;
        }
        
        const record = event.record;
        
        try {
            console.log('保存時CSV自動添付を開始します');
            
            // 非同期でCSV添付処理を実行
            return attachCSVToRecord(record).then(function(updatedRecord) {
                // 更新されたレコードを返す
                return { record: updatedRecord };
            }).catch(function(error) {
                console.error('CSV自動添付エラー:', error);
                // エラーが発生してもレコード保存を継続
                return event;
            });
            
        } catch (error) {
            console.error('CSV自動添付処理エラー:', error);
            return event;
        }
    });

    /**
     * サブテーブルをCSV形式に変換する関数
     * @param {Object} record - kintoneのレコードオブジェクト
     * @return {string} - CSV形式の文字列
     */
    function convertSubtableToCSV(record) {
        const subtableData = record[CONFIG.subtableFieldCode];
        
        if (!subtableData || !subtableData.value || subtableData.value.length === 0) {
            return ''; // サブテーブルが空の場合
        }

        const rows = [];
        
        // ヘッダー行を追加（設定で有効な場合）
        if (CONFIG.includeHeader && CONFIG.headerNames.length > 0) {
            rows.push(CONFIG.headerNames.join(CONFIG.separator));
        }

        let totalAmount = 0; // 合計金額を保持
        
        // サブテーブルの各行を処理
        subtableData.value.forEach(function(row) {
            const rowData = [];
            
            CONFIG.targetFields.forEach(function(fieldCode, index) {
                let cellValue = '';
                
                if (row.value[fieldCode] && row.value[fieldCode].value !== undefined) {
                    const field = row.value[fieldCode];
                    
                    // フィールドタイプに応じて値を取得
                    if (field.type === 'CHECK_BOX' || field.type === 'MULTI_SELECT') {
                        cellValue = Array.isArray(field.value) ? field.value.join(';') : field.value;
                    } else if (field.type === 'USER_SELECT' || field.type === 'ORGANIZATION_SELECT') {
                        if (Array.isArray(field.value)) {
                            cellValue = field.value.map(function(item) {
                                return item.name || item.code;
                            }).join(';');
                        } else {
                            cellValue = field.value;
                        }
                    } else if (field.type === 'FILE') {
                        if (Array.isArray(field.value)) {
                            cellValue = field.value.map(function(file) {
                                return file.name;
                            }).join(';');
                        } else {
                            cellValue = field.value;
                        }
                    } else {
                        cellValue = field.value || '';
                    }
                    
                    // 金額フィールド（6列目）の場合、合計に追加
                    if (index === 5 && fieldCode === '金額_テーブル') {
                        const numericValue = parseFloat(cellValue) || 0;
                        totalAmount += numericValue;
                    }
                }
                
                // CSVエスケープ処理
                rowData.push(escapeCSVValue(cellValue));
            });
            
            rows.push(rowData.join(CONFIG.separator));
        });
        
        // 合計行を追加（決裁番号、伝票案件名、明細名、予算CD、費用CD="合計"、金額=totalAmount）
        if (subtableData.value.length > 0) {
            const totalRow = ['', '', '', '', '合計', totalAmount];
            rows.push(totalRow.map(function(value) {
                return escapeCSVValue(value);
            }).join(CONFIG.separator));
        }

        return rows.join(CONFIG.rowSeparator);
    }

    /**
     * CSV用の値をエスケープする関数
     * @param {any} value - エスケープする値
     * @return {string} - エスケープされた値
     */
    function escapeCSVValue(value) {
        if (value === null || value === undefined) {
            return '';
        }
        
        if (typeof value !== 'string') {
            value = String(value);
        }
        
        // カンマ、改行、ダブルクォートが含まれる場合はダブルクォートで囲む
        if (value.includes(',') || value.includes('\n') || value.includes('\r') || value.includes('"')) {
            value = value.replace(/"/g, '""');
            return '"' + value + '"';
        }
        
        return value;
    }

    /**
     * 明細名と発注先略称をチェックして伝票案件名を更新する（2秒おきに継続実行）
     */
    let autoUpdateEnabled = true; // 自動更新の有効/無効フラグ
    let isRowChanging = false; // 行の追加・削除中フラグ
    let lastDenpyoValues = {}; // 前回の明細名と発注先略称の値を保持
    let lastMeisaiValues = {}; // ルックアップ検知用：前回の明細名を保存
    
    function updateMeisaiNameOnce() {
        // 自動更新が無効の場合はスキップ
        if (!autoUpdateEnabled) {
            console.log('⏸️ 自動更新は停止中です');
            return;
        }
        
        // 行の追加・削除中はスキップ
        if (isRowChanging) {
            console.log('⏭️ 行変更中のため自動更新をスキップします');
            return;
        }
        
        console.log('📝 伝票案件名の自動更新を実行します');
        
        try {
            // 毎回最新のレコード情報を取得
            const record = kintone.app.record.get().record;
            const subtableData = record[CONFIG.subtableFieldCode];
            
            // メインフォームから発注先略称と発注概要を取得（サブテーブル外のフィールド）
            const hacchuFieldMain = record['発注先略称'];
            const hacchuValue = hacchuFieldMain && hacchuFieldMain.value ? hacchuFieldMain.value : '';
            
            const gaiyoFieldMain = record['発注概要'];
            const gaiyoValue = gaiyoFieldMain && gaiyoFieldMain.value ? gaiyoFieldMain.value : '';
            
            if (!subtableData || !subtableData.value) {
                console.log('⚠️ サブテーブルデータがありません');
                return;
            }
            
            let hasChanges = false;
            
            // 各行をチェック
            subtableData.value.forEach(function(row, index) {
                const rowKey = 'row_' + index;
                const denpyoField = row.value['伝票案件名'];
                const meisaiField = row.value['明細名'];
                
                // 明細名がある場合のみ処理
                if (meisaiField && meisaiField.value) {
                    let meisaiValue = meisaiField.value;
                    
                    // 明細名のベース部分を抽出（発注概要が既に含まれている場合は除去）
                    let meisaiBase = meisaiValue;
                    if (gaiyoValue && meisaiValue.endsWith(gaiyoValue)) {
                        meisaiBase = meisaiValue.substring(0, meisaiValue.length - gaiyoValue.length);
                    }
                    
                    // 新しい明細名を生成（ベース + 発注概要）
                    let newMeisaiName = meisaiBase;
                    if (gaiyoValue) {
                        newMeisaiName += gaiyoValue;
                    }
                    
                    // 伝票案件名を生成（新しい明細名 + 括弧付き発注先略称）
                    let newDenpyoName = newMeisaiName;
                    if (hacchuValue) {
                        newDenpyoName += '(' + hacchuValue + ')';
                    }
                    
                    const combinedKey = meisaiBase + '||' + gaiyoValue + '||' + hacchuValue;
                    
                    // 前回と値が変わっているか、または明細名/伝票案件名が期待値と異なる場合に更新
                    const needsUpdate = (lastDenpyoValues[rowKey] !== combinedKey) || 
                                      (meisaiField.value !== newMeisaiName) ||
                                      (denpyoField && denpyoField.value !== newDenpyoName);
                    
                    if (needsUpdate) {
                        console.log('🔄 行', (index + 1), 'を更新:', newDenpyoName);
                        lastDenpyoValues[rowKey] = combinedKey;
                        
                        // 明細名を更新
                        if (meisaiField.value !== newMeisaiName) {
                            row.value['明細名'].value = newMeisaiName;
                            hasChanges = true;
                        }
                        
                        // 伝票案件名を更新
                        if (denpyoField && denpyoField.value !== newDenpyoName) {
                            row.value['伝票案件名'].value = newDenpyoName;
                            hasChanges = true;
                        }
                    }
                }
            });
            
            // サブテーブル1行目の値をメインフォームにコピー
            if (subtableData.value.length > 0) {
                const rowCount = subtableData.value.length;
                const firstRow = subtableData.value[0];
                
                // 伝票案件名MLタイトルには常にサブテーブル1行目の伝票案件名をコピー（行数に関わらず）
                if (record['伝票案件名MLタイトル'] && firstRow.value['伝票案件名']) {
                    const newValue = firstRow.value['伝票案件名'].value || '';
                    if (record['伝票案件名MLタイトル'].value !== newValue) {
                        record['伝票案件名MLタイトル'].value = newValue;
                        hasChanges = true;
                        console.log('📋 伝票案件名MLタイトルを更新:', newValue);
                    }
                }
                
                // 1行の場合：1行目の値をコピー
                // 2行以上の場合：「添付csvをご参照ください」を設定
                if (rowCount === 1) {
                    console.log('📋 サブテーブル1行のため、1行目の値をコピーします');
                    
                    if (record['決裁番号TBL1'] && firstRow.value['決裁番号']) {
                        const newValue = firstRow.value['決裁番号'].value || '';
                        if (record['決裁番号TBL1'].value !== newValue) {
                            record['決裁番号TBL1'].value = newValue;
                            hasChanges = true;
                        }
                    }
                    
                    if (record['伝票案件名TBL1'] && firstRow.value['伝票案件名']) {
                        const newValue = firstRow.value['伝票案件名'].value || '';
                        if (record['伝票案件名TBL1'].value !== newValue) {
                            record['伝票案件名TBL1'].value = newValue;
                            hasChanges = true;
                        }
                    }
                    
                    if (record['明細名TBL1'] && firstRow.value['明細名']) {
                        const newValue = firstRow.value['明細名'].value || '';
                        if (record['明細名TBL1'].value !== newValue) {
                            record['明細名TBL1'].value = newValue;
                            hasChanges = true;
                        }
                    }
                    
                    if (record['予算CD_TBL1'] && firstRow.value['予算CD']) {
                        const newValue = firstRow.value['予算CD'].value || '';
                        if (record['予算CD_TBL1'].value !== newValue) {
                            record['予算CD_TBL1'].value = newValue;
                            hasChanges = true;
                        }
                    }
                    
                    if (record['費用CD_TBL1'] && firstRow.value['費用CD']) {
                        const newValue = firstRow.value['費用CD'].value || '';
                        if (record['費用CD_TBL1'].value !== newValue) {
                            record['費用CD_TBL1'].value = newValue;
                            hasChanges = true;
                        }
                    }
                } else {
                    console.log('📋 サブテーブル2行以上のため、「添付csvをご参照ください」を設定します (行数:', rowCount, ')');
                    const csvMessage = '添付csvをご参照ください';
                    
                    if (record['決裁番号TBL1']) {
                        if (record['決裁番号TBL1'].value !== csvMessage) {
                            record['決裁番号TBL1'].value = csvMessage;
                            hasChanges = true;
                        }
                    }
                    
                    if (record['伝票案件名TBL1']) {
                        if (record['伝票案件名TBL1'].value !== csvMessage) {
                            record['伝票案件名TBL1'].value = csvMessage;
                            hasChanges = true;
                        }
                    }
                    
                    if (record['明細名TBL1']) {
                        if (record['明細名TBL1'].value !== csvMessage) {
                            record['明細名TBL1'].value = csvMessage;
                            hasChanges = true;
                        }
                    }
                    
                    if (record['予算CD_TBL1']) {
                        if (record['予算CD_TBL1'].value !== csvMessage) {
                            record['予算CD_TBL1'].value = csvMessage;
                            hasChanges = true;
                        }
                    }
                    
                    if (record['費用CD_TBL1']) {
                        if (record['費用CD_TBL1'].value !== csvMessage) {
                            record['費用CD_TBL1'].value = csvMessage;
                            hasChanges = true;
                        }
                    }
                }
            }
            
            // 追加承認者_発注時TBの全行を追加承認者_発注_Lineにコピー
            console.log('🔍 追加承認者_発注_Line処理を開始します');
            const approverTable = record['追加承認者_発注時TB'];
            console.log('📋 追加承認者_発注時TB:', approverTable);
            console.log('📋 追加承認者_発注時TB存在チェック:', !!approverTable);
            console.log('📋 追加承認者_発注時TB.value:', approverTable ? approverTable.value : null);
            console.log('📋 追加承認者_発注時TB行数:', approverTable && approverTable.value ? approverTable.value.length : 0);
            console.log('📋 追加承認者_発注_Line存在チェック:', !!record['追加承認者_発注_Line']);
            
            if (approverTable && approverTable.value && record['追加承認者_発注_Line']) {
                console.log('✅ 追加承認者_発注時TBと追加承認者_発注_Lineが存在します');
                const approverNames = [];
                
                approverTable.value.forEach(function(row, index) {
                    console.log('📋 行' + (index + 1) + 'の処理開始');
                    console.log('📋 行' + (index + 1) + 'の全フィールド:', Object.keys(row.value));
                    console.log('📋 行' + (index + 1) + 'の値:', row.value);
                    
                    if (row.value['追加承認者_発注']) {
                        const field = row.value['追加承認者_発注'];
                        console.log('📋 行' + (index + 1) + ' 追加承認者_発注フィールド:', field);
                        console.log('📋 行' + (index + 1) + ' フィールドタイプ:', field.type);
                        console.log('📋 行' + (index + 1) + ' フィールド値:', field.value);
                        
                        if (field.value) {
                            let approverName = '';
                            
                            // ユーザー選択フィールドの場合
                            if (field.type === 'USER_SELECT') {
                                console.log('📋 行' + (index + 1) + ' USER_SELECTフィールドとして処理');
                                if (Array.isArray(field.value)) {
                                    console.log('📋 行' + (index + 1) + ' 配列形式:', field.value);
                                    approverName = field.value.map(function(user) {
                                        console.log('📋 ユーザー情報:', user);
                                        return user.name || user.code;
                                    }).join(',');
                                } else if (field.value.name) {
                                    console.log('📋 行' + (index + 1) + ' オブジェクト形式 (name):', field.value.name);
                                    approverName = field.value.name;
                                } else {
                                    console.log('📋 行' + (index + 1) + ' 文字列形式:', field.value);
                                    approverName = field.value;
                                }
                            } else {
                                // 通常のテキストフィールドやドロップダウンの場合
                                console.log('📋 行' + (index + 1) + ' テキスト/ドロップダウンとして処理');
                                approverName = field.value;
                            }
                            
                            console.log('📋 行' + (index + 1) + ' 取得した承認者名:', approverName);
                            
                            if (approverName) {
                                approverNames.push(approverName);
                                console.log('✅ 行' + (index + 1) + ' 承認者名を追加:', approverName);
                            } else {
                                console.log('⚠️ 行' + (index + 1) + ' 承認者名が空です');
                            }
                        } else {
                            console.log('⚠️ 行' + (index + 1) + ' 追加承認者_発注の値がありません');
                        }
                    } else {
                        console.log('⚠️ 行' + (index + 1) + ' 追加承認者_発注フィールドが存在しません');
                    }
                });
                
                // →で連結
                const newLineValue = approverNames.join('→');
                console.log('📋 収集した承認者名リスト:', approverNames);
                console.log('📋 連結後の値:', newLineValue);
                console.log('📋 現在の追加承認者_発注_Lineの値:', record['追加承認者_発注_Line'].value);
                
                if (record['追加承認者_発注_Line'].value !== newLineValue) {
                    record['追加承認者_発注_Line'].value = newLineValue;
                    hasChanges = true;
                    console.log('✅ 追加承認者_発注_Lineを更新しました:', newLineValue);
                } else {
                    console.log('ℹ️ 追加承認者_発注_Lineは既に同じ値です');
                }
            } else {
                if (!approverTable) {
                    console.log('⚠️ 追加承認者_発注時TBフィールドが存在しません');
                } else if (!approverTable.value) {
                    console.log('⚠️ 追加承認者_発注時TBが空です');
                } else if (!record['追加承認者_発注_Line']) {
                    console.log('⚠️ 追加承認者_発注_Lineフィールドが存在しません');
                }
            }
            
            // 変更があった場合のみレコードを更新
            if (hasChanges) {
                console.log('🔄 レコード更新処理を開始します (hasChanges = true)');
                
                // 更新前に最新のレコードを再取得して、変更をマージ
                const latestRecord = kintone.app.record.get().record;
                console.log('📋 最新レコードを取得しました');
                
                // サブテーブルのデータをマージ（最新のデータに更新した内容を反映）
                if (latestRecord[CONFIG.subtableFieldCode]) {
                    latestRecord[CONFIG.subtableFieldCode].value = subtableData.value;
                    console.log('📋 サブテーブルデータをマージしました');
                }
                
                // メインフォームのフィールドもマージ
                if (record['決裁番号TBL1']) {
                    latestRecord['決裁番号TBL1'].value = record['決裁番号TBL1'].value;
                    console.log('📋 決裁番号TBL1をマージ:', record['決裁番号TBL1'].value);
                }
                if (record['伝票案件名TBL1']) {
                    latestRecord['伝票案件名TBL1'].value = record['伝票案件名TBL1'].value;
                    console.log('📋 伝票案件名TBL1をマージ:', record['伝票案件名TBL1'].value);
                }
                if (record['伝票案件名MLタイトル']) {
                    latestRecord['伝票案件名MLタイトル'].value = record['伝票案件名MLタイトル'].value;
                    console.log('📋 伝票案件名MLタイトルをマージ:', record['伝票案件名MLタイトル'].value);
                }
                if (record['明細名TBL1']) {
                    latestRecord['明細名TBL1'].value = record['明細名TBL1'].value;
                    console.log('📋 明細名TBL1をマージ:', record['明細名TBL1'].value);
                }
                if (record['予算CD_TBL1']) {
                    latestRecord['予算CD_TBL1'].value = record['予算CD_TBL1'].value;
                    console.log('📋 予算CD_TBL1をマージ:', record['予算CD_TBL1'].value);
                }
                if (record['費用CD_TBL1']) {
                    latestRecord['費用CD_TBL1'].value = record['費用CD_TBL1'].value;
                    console.log('📋 費用CD_TBL1をマージ:', record['費用CD_TBL1'].value);
                }
                if (record['追加承認者_発注_Line']) {
                    latestRecord['追加承認者_発注_Line'].value = record['追加承認者_発注_Line'].value;
                    console.log('📋 追加承認者_発注_Lineをマージ:', record['追加承認者_発注_Line'].value);
                    console.log('📋 マージ後のlatestRecordの追加承認者_発注_Line:', latestRecord['追加承認者_発注_Line'].value);
                }
                
                console.log('📋 kintone.app.record.set()を実行します');
                console.log('📋 設定する追加承認者_発注_Lineの値:', latestRecord['追加承認者_発注_Line'] ? latestRecord['追加承認者_発注_Line'].value : 'フィールドなし');
                
                kintone.app.record.set({ record: latestRecord });
                console.log('✅ kintone.app.record.set()を実行しました');
                
                // 設定後に確認
                setTimeout(function() {
                    const verifyRecord = kintone.app.record.get().record;
                    console.log('🔍 設定後の確認: 追加承認者_発注_Line =', verifyRecord['追加承認者_発注_Line'] ? verifyRecord['追加承認者_発注_Line'].value : 'フィールドなし');
                }, 100);
                
            } else {
                console.log('ℹ️ 更新する項目がありませんでした (hasChanges = false)');
            }
            
        } catch (error) {
            console.error('❌ 自動更新中にエラー:', error);
        }
    }



    /**
     * サブテーブルの「明細名」「発注先略称」変更時に「伝票案件名」を自動更新する関数
     * @param {Object} event - kintoneの変更イベント
     */
    function updateMeisaiName(event) {
        console.log('updateMeisaiName関数が呼び出されました');
        
        // 行変更中はスキップ
        if (isRowChanging) {
            console.log('⏭️ 行変更中のためスキップします');
            return event;
        }
        
        const record = event.record;
        const subtableData = record[CONFIG.subtableFieldCode];
        
        console.log('サブテーブルデータ:', subtableData);
        
        if (!subtableData || !subtableData.value) {
            console.log('サブテーブルデータが見つかりません');
            return event;
        }
        
        console.log('サブテーブル行数:', subtableData.value.length);
        
        // メインフォームから発注先略称と発注概要を取得
        const hacchuFieldMain = record['発注先略称'];
        const hacchuValue = hacchuFieldMain && hacchuFieldMain.value ? hacchuFieldMain.value : '';
        
        const gaiyoFieldMain = record['発注概要'];
        const gaiyoValue = gaiyoFieldMain && gaiyoFieldMain.value ? gaiyoFieldMain.value : '';
        
        console.log('📋 メインフォームの発注先略称:', hacchuValue);
        console.log('📋 メインフォームの発注概要:', gaiyoValue);
        
        // 各行の伝票案件名を更新
        subtableData.value.forEach(function(row, index) {
            const denpyoField = row.value['伝票案件名'];
            const meisaiField = row.value['明細名'];
            
            if (meisaiField && meisaiField.value) {
                let meisaiValue = meisaiField.value;
                
                // 明細名のベース部分を抽出（発注概要が既に含まれている場合は除去）
                let meisaiBase = meisaiValue;
                if (gaiyoValue && meisaiValue.endsWith(gaiyoValue)) {
                    meisaiBase = meisaiValue.substring(0, meisaiValue.length - gaiyoValue.length);
                }
                
                // 新しい明細名を生成（ベース + 発注概要）
                let newMeisaiName = meisaiBase;
                if (gaiyoValue) {
                    newMeisaiName += gaiyoValue;
                }
                
                // 伝票案件名を生成（新しい明細名 + 括弧付き発注先略称）
                let newDenpyoName = newMeisaiName;
                if (hacchuValue) {
                    newDenpyoName += '(' + hacchuValue + ')';
                }
                
                console.log('行 ' + (index + 1) + ' - 新しい伝票案件名:', newDenpyoName);
                
                // 明細名を更新
                if (meisaiField.value !== newMeisaiName) {
                    row.value['明細名'].value = newMeisaiName;
                    console.log('✅ 明細名を更新: 行' + (index + 1), meisaiValue, '->', newMeisaiName);
                }
                
                // 伝票案件名を更新
                if (denpyoField && denpyoField.value !== newDenpyoName) {
                    row.value['伝票案件名'].value = newDenpyoName;
                    console.log('✅ 伝票案件名を更新: 行' + (index + 1), denpyoField.value, '->', newDenpyoName);
                }
            } else {
                console.log('⚠️ 行 ' + (index + 1) + ' 明細名が空または存在しません');
            }
        });
        
        return event;
    }

    /**
     * CSVファイルを直接ダウンロードする関数
     */
    function downloadCSVFile() {
        try {
            const record = kintone.app.record.get().record;
            
            // CSVデータを生成
            const csvData = convertSubtableToCSV(record);
            
            if (!csvData || csvData.trim() === '') {
                alert('サブテーブルにデータがありません');
                return;
            }
            
            // ファイル名をサブテーブル1行目の「明細名」から取得
            let filename = '発注内容_データ'; // デフォルト値
            
            const subtableData = record[CONFIG.subtableFieldCode];
            if (subtableData && subtableData.value && subtableData.value.length > 0) {
                const firstRow = subtableData.value[0];
                if (firstRow.value['明細名'] && firstRow.value['明細名'].value) {
                    filename = firstRow.value['明細名'].value;
                    // ファイル名として使えない文字を置換
                    filename = filename.replace(/[<>:"/\\|?*]/g, '_');
                    console.log('📁 ファイル名をサブテーブル1行目の明細名から取得:', filename);
                } else {
                    console.log('⚠ サブテーブル1行目の明細名が空のため、デフォルトファイル名を使用');
                }
            } else {
                console.log('⚠ サブテーブルが空のため、デフォルトファイル名を使用');
            }
            
            filename = filename + '.csv';
            
            // BlobでCSVファイルを作成
            const blob = new Blob(['\uFEFF' + csvData], {
                type: 'text/csv;charset=utf-8'
            });
            
            // ダウンロードリンクを作成
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            
            // ダウンロードを実行
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // URLを解放
            URL.revokeObjectURL(url);
            
            console.log('✅ CSVファイルをダウンロードしました:', filename);
            
        } catch (error) {
            console.error('CSVダウンロードエラー:', error);
            throw error;
        }
    }

    /**
     * CSVファイルを作成してレコードに添付する関数
     * @param {Object} record - kintoneのレコードオブジェクト
     * @return {Promise} - 更新されたレコードを返すPromise
     */
    function attachCSVToRecord(record) {
        return new Promise(function(resolve, reject) {
            try {
                // CSVデータを生成
                const csvData = convertSubtableToCSV(record);
                
                if (!csvData || csvData.trim() === '') {
                    console.log('CSVデータが空のため添付をスキップします');
                    resolve(record);
                    return;
                }
                
                console.log('CSVデータを生成しました:', csvData.length, '文字');
                
                // ファイル名を生成
                const now = new Date();
                const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
                const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
                const filename = CONFIG.filename + '_' + dateStr + '_' + timeStr + '.csv';
                
                // エンコーディング対応
                let csvContent = csvData;
                if (CONFIG.encoding === 'utf-8-bom') {
                    csvContent = '\uFEFF' + csvData; // BOM付きUTF-8
                }
                
                // Blobを作成してkintone.api()でアップロード
                const blob = new Blob([csvContent], { 
                    type: 'text/csv;charset=utf-8' 
                });
                
                console.log('Blobを作成しました:', blob.size, 'バイト');
                
                // FormDataを作成
                const formData = new FormData();
                formData.append('file', blob, filename);
                
                // kintone.api()を使用してアップロード
                const uploadUrl = '/k/v1/file.json';
                
                console.log('kintone.api()でアップロード開始');
                
                kintone.api(kintone.api.url(uploadUrl, true), 'POST', formData).then(function(response) {
                    console.log('ファイルアップロード成功:', response.fileKey);
                    
                    // 添付ファイルフィールドに追加
                    const updatedRecord = addFileToAttachmentField(record, response.fileKey, filename);
                    console.log('CSVファイルを正常に添付しました:', filename);
                    resolve(updatedRecord);
                    
                }).catch(function(error) {
                    console.error('kintone.api()アップロードエラー:', error);
                    
                    // フォールバック：従来のダウンロード方式
                    console.log('ファイルアップロードに失敗したため、ダウンロード方式にフォールバックします');
                    
                    try {
                        // Blobを使ってダウンロードリンクを作成
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.setAttribute('href', url);
                        link.setAttribute('download', filename);
                        link.style.visibility = 'hidden';
                        
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        
                        URL.revokeObjectURL(url);
                        
                        console.log('CSVファイルをダウンロードしました:', filename);
                        alert('ファイル添付に失敗したため、CSVファイルをダウンロードしました。\n手動で添付してください。');
                        
                        resolve(record); // 元のレコードを返す
                        
                    } catch (downloadError) {
                        console.error('ダウンロードフォールバックエラー:', downloadError);
                        reject(error); // 元のエラーを返す
                    }
                });
                
            } catch (error) {
                console.error('CSV添付処理エラー:', error);
                reject(error);
            }
        });
    }



    /**
     * 添付ファイルフィールドにファイルを追加する関数
     * @param {Object} record - レコードオブジェクト
     * @param {string} fileKey - アップロードされたファイルのキー
     * @param {string} filename - ファイル名
     * @return {Object} - 更新されたレコード
     */
    function addFileToAttachmentField(record, fileKey, filename) {
        const attachmentField = record[CONFIG.attachmentFieldCode];
        
        if (!attachmentField) {
            console.error('添付ファイルフィールドが見つかりません:', CONFIG.attachmentFieldCode);
            return record;
        }
        
        const newFile = {
            fileKey: fileKey,
            name: filename,
            size: null // サイズは自動的に設定される
        };
        
        // 既存ファイルの処理
        if (CONFIG.replaceExisting) {
            // 同名のCSVファイルがあれば削除
            attachmentField.value = attachmentField.value.filter(function(file) {
                return !file.name.endsWith('.csv') || 
                       !file.name.startsWith(CONFIG.filename);
            });
        }
        
        // 新しいファイルを追加
        attachmentField.value.push(newFile);
        
        console.log('添付ファイルフィールドに追加:', filename);
        return record;
    }

    /**
     * 安全なZIPパスワードを生成する関数
     * 暗号学的に安全な乱数を使用
     * @return {string} - 生成されたパスワード
     */
    function generateZipPassword() {
        const length = CONFIG.passwordLength;
        const chars = CONFIG.passwordChars;
        
        // すべての文字を結合
        const allChars = chars.uppercase + chars.lowercase + chars.numbers + chars.symbols;
        
        // 安全な乱数を使用してパスワードを生成
        let password = '';
        const randomValues = new Uint32Array(length);
        
        // crypto.getRandomValues を使用（暗号学的に安全な乱数）
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(randomValues);
            
            for (let i = 0; i < length; i++) {
                const randomIndex = randomValues[i] % allChars.length;
                password += allChars[randomIndex];
            }
        } else {
            // フォールバック: Math.random() を使用（推奨されない）
            console.warn('crypto.getRandomValues が利用できないため、Math.random() を使用します');
            for (let i = 0; i < length; i++) {
                const randomIndex = Math.floor(Math.random() * allChars.length);
                password += allChars[randomIndex];
            }
        }
        
        // 最低限の複雑さを確保（大文字、小文字、数字、記号をそれぞれ1つ以上含む）
        const hasUppercase = /[A-Z]/.test(password);
        const hasLowercase = /[a-z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const hasSymbol = /[!@#$%&*+\-=]/.test(password);
        
        if (!hasUppercase || !hasLowercase || !hasNumber || !hasSymbol) {
            // 複雑さが不足している場合は再生成
            console.log('パスワードの複雑さが不足しているため再生成します');
            return generateZipPassword();
        }
        
        return password;
    }

    /**
     * ZIPパスワード生成ボタンを配置する関数
     */
    let zipPasswordButtonRetryCount = 0; // 再試行回数をカウント
    const MAX_ZIP_PASSWORD_RETRY = 3;    // 最大再試行回数
    
    function createZipPasswordButton() {
        // 再試行回数チェックを最初に行う
        if (zipPasswordButtonRetryCount >= MAX_ZIP_PASSWORD_RETRY) {
            console.error('❌ 最大再試行回数に達しました。ZIPパスワードボタンの配置を中止します。');
            console.log('💡 フィールドコードを確認してください: CONFIG.zipPasswordFieldCode = "' + CONFIG.zipPasswordFieldCode + '"');
            return;
        }
        
        console.log('ZIPパスワード生成ボタンを作成します（試行回数: ' + (zipPasswordButtonRetryCount + 1) + '/' + MAX_ZIP_PASSWORD_RETRY + '）');
        
        try {
            // 既存のボタンを削除
            const existingButton = document.querySelector('#zip-password-generate-button');
            if (existingButton) {
                existingButton.remove();
            }
            
            // まずレコードから該当フィールドが存在するか確認
            const record = kintone.app.record.get().record;
            if (!record[CONFIG.zipPasswordFieldCode]) {
                console.log('⚠ ZIPパスワードフィールドがレコードに存在しません。フィールドコード:', CONFIG.zipPasswordFieldCode);
                console.log('📋 利用可能なフィールド:', Object.keys(record));
                return;
            }
            
            console.log('✓ レコードにZIPパスワードフィールドが存在します');
            
            // ZIPパスワードフィールドのDOM要素を検索（複数の方法で試す）
            let zipPasswordField = null;
            
            // 方法1: name属性で検索
            zipPasswordField = document.querySelector('input[name="' + CONFIG.zipPasswordFieldCode + '"]');
            console.log('方法1 (name属性): ', zipPasswordField ? '見つかりました' : '見つかりません');
            
            // 方法2: data-field-code属性で検索
            if (!zipPasswordField) {
                const fieldElement = document.querySelector('[data-field-code="' + CONFIG.zipPasswordFieldCode + '"]');
                console.log('方法2 (data-field-code属性): fieldElement = ', fieldElement);
                if (fieldElement) {
                    zipPasswordField = fieldElement.querySelector('input[type="text"]');
                    console.log('  → input要素: ', zipPasswordField ? '見つかりました' : '見つかりません');
                }
            }
            
            // 方法3: より広範なDOM検索（kintoneの異なるDOM構造に対応）
            if (!zipPasswordField) {
                console.log('方法3 (広範検索): すべてのinput要素を検索します（text, password両方）');
                
                // type="text" と type="password" の両方を検索
                const allInputs = document.querySelectorAll('input[type="text"], input[type="password"]');
                console.log('  → 検出されたinput要素数:', allInputs.length);
                
                // 各input要素の周辺でラベルを探す
                allInputs.forEach(function(input, index) {
                    // 親要素を遡ってラベルを探す
                    let parent = input.parentElement;
                    for (let i = 0; i < 5 && parent; i++) {
                        const label = parent.querySelector('label, .label, [class*="label"]');
                        if (label) {
                            const labelText = label.textContent.trim();
                            if (index < 10) { // 最初の10個だけログ出力
                                console.log('  input[' + index + '] (type=' + input.type + ') のラベル: "' + labelText + '"');
                            }
                            
                            if (labelText === 'ZIPパスワード' || labelText.includes('ZIPパスワード')) {
                                console.log('  → ✓ ZIPパスワードフィールドを発見！ (input[' + index + '], type=' + input.type + ')');
                                zipPasswordField = input;
                                return;
                            }
                        }
                        parent = parent.parentElement;
                    }
                });
            }
            
            // 方法4: 詳細画面の場合はspanタグから値を読み取る（編集不可の場合）
            if (!zipPasswordField) {
                console.log('方法4 (詳細画面対応): 読み取り専用フィールドを検索します');
                const allElements = document.querySelectorAll('[data-field-code="' + CONFIG.zipPasswordFieldCode + '"]');
                console.log('  → data-field-codeで検出された要素数:', allElements.length);
                
                allElements.forEach(function(element) {
                    console.log('  → 要素タイプ:', element.tagName, 'クラス:', element.className);
                    // 詳細画面では値がspanで表示されている可能性
                    const valueSpan = element.querySelector('.value, span');
                    if (valueSpan) {
                        console.log('  → 値表示要素を発見 (詳細画面)');
                    }
                });
                
                console.log('⚠ 詳細画面ではZIPパスワードボタンは非表示にします');
            }
            
            if (!zipPasswordField) {
                console.log('⚠ ZIPパスワードフィールドのDOM要素が見つかりません');
                console.log('💡 DOMがまだレンダリングされていない可能性があります');
                
                // 再試行
                zipPasswordButtonRetryCount++;
                console.log('💡 1000ms後に再試行します...（' + zipPasswordButtonRetryCount + '/' + MAX_ZIP_PASSWORD_RETRY + '）');
                
                setTimeout(function() {
                    createZipPasswordButton();
                }, 1000); // 待機時間を500ms→1000msに延長
                return;
            }
            
            // 再試行カウンターをリセット（成功したため）
            zipPasswordButtonRetryCount = 0;
            
            console.log('✓ ZIPパスワードフィールドのDOM要素を発見しました');
            
            // ボタンを作成
            const button = document.createElement('button');
            button.id = 'zip-password-generate-button';
            button.type = 'button';
            button.textContent = '🔐 パスワード生成';
            button.style.marginLeft = '10px';
            button.style.padding = '6px 16px';
            button.style.backgroundColor = '#3498db';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '4px';
            button.style.cursor = 'pointer';
            button.style.fontWeight = 'bold';
            button.style.fontSize = '13px';
            button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
            button.style.transition = 'background-color 0.3s';
            
            // ホバーエフェクト
            button.addEventListener('mouseenter', function() {
                this.style.backgroundColor = '#2980b9';
            });
            button.addEventListener('mouseleave', function() {
                this.style.backgroundColor = '#3498db';
            });
            
            // クリックイベント
            button.addEventListener('click', function() {
                console.log('🔐 パスワード生成ボタンがクリックされました');
                
                try {
                    // パスワードを生成
                    const newPassword = generateZipPassword();
                    console.log('✅ パスワードを生成しました（長さ:', newPassword.length, '文字）');
                    
                    // フィールドに設定
                    const record = kintone.app.record.get().record;
                    if (record[CONFIG.zipPasswordFieldCode]) {
                        record[CONFIG.zipPasswordFieldCode].value = newPassword;
                        kintone.app.record.set({ record: record });
                        console.log('✅ ZIPパスワードフィールドに設定しました');
                        
                        // 視覚的フィードバック
                        button.textContent = '✓ 生成完了';
                        button.style.backgroundColor = '#27ae60';
                        
                        setTimeout(function() {
                            button.textContent = '🔐 パスワード生成';
                            button.style.backgroundColor = '#3498db';
                        }, 2000);
                        
                    } else {
                        console.error('⚠ ZIPパスワードフィールドがレコードに存在しません');
                        alert('ZIPパスワードフィールドが見つかりません。\nフィールドコード: ' + CONFIG.zipPasswordFieldCode);
                    }
                    
                } catch (error) {
                    console.error('パスワード生成エラー:', error);
                    alert('パスワードの生成に失敗しました: ' + error.message);
                }
            });
            
            // フィールドの右側にボタンを配置（柔軟な配置方法）
            // 方法1: input-outer-gaia の隣に配置
            let buttonPlaced = false;
            const inputOuter = zipPasswordField.closest('.input-outer-gaia');
            
            if (inputOuter && inputOuter.parentNode) {
                console.log('✓ 配置方法1: input-outer-gaia の隣に配置');
                
                // ボタンを包むコンテナを作成
                const buttonContainer = document.createElement('span');
                buttonContainer.id = 'zip-password-button-container';
                buttonContainer.style.display = 'inline-block';
                buttonContainer.style.verticalAlign = 'middle';
                buttonContainer.style.marginLeft = '5px';
                buttonContainer.appendChild(button);
                
                // inputOuterの次の兄弟要素として挿入
                if (inputOuter.nextSibling) {
                    inputOuter.parentNode.insertBefore(buttonContainer, inputOuter.nextSibling);
                } else {
                    inputOuter.parentNode.appendChild(buttonContainer);
                }
                
                buttonPlaced = true;
            }
            
            // 方法2: input要素の親要素の隣に配置（フォールバック）
            if (!buttonPlaced && zipPasswordField.parentElement) {
                console.log('✓ 配置方法2: input要素の親要素の隣に配置');
                
                const buttonContainer = document.createElement('span');
                buttonContainer.id = 'zip-password-button-container';
                buttonContainer.style.display = 'inline-block';
                buttonContainer.style.verticalAlign = 'middle';
                buttonContainer.style.marginLeft = '5px';
                buttonContainer.appendChild(button);
                
                if (zipPasswordField.parentElement.nextSibling) {
                    zipPasswordField.parentElement.parentNode.insertBefore(
                        buttonContainer, 
                        zipPasswordField.parentElement.nextSibling
                    );
                } else {
                    zipPasswordField.parentElement.parentNode.appendChild(buttonContainer);
                }
                
                buttonPlaced = true;
            }
            
            // 方法3: input要素の直後に配置（最終手段）
            if (!buttonPlaced) {
                console.log('✓ 配置方法3: input要素の直後に配置');
                
                button.style.display = 'inline-block';
                button.style.marginLeft = '5px';
                
                if (zipPasswordField.nextSibling) {
                    zipPasswordField.parentNode.insertBefore(button, zipPasswordField.nextSibling);
                } else {
                    zipPasswordField.parentNode.appendChild(button);
                }
                
                buttonPlaced = true;
            }
            
            if (buttonPlaced) {
                console.log('✅ ZIPパスワード生成ボタンを配置しました');
            } else {
                console.error('❌ ボタンの配置に失敗しました');
            }
            
        } catch (error) {
            console.error('ZIPパスワードボタン作成エラー:', error);
        }
    }

    /**
     * サブテーブルの行数をカウントする関数
     */
    function countSubtableRows() {
        try {
            const record = kintone.app.record.get().record;
            
            // デバッグ情報を出力
            console.log('レコード全体:', record);
            console.log('設定されているサブテーブルフィールド名:', CONFIG.subtableFieldCode);
            
            // 利用可能なフィールドをすべて表示
            const availableFields = Object.keys(record);
            console.log('利用可能なフィールド:', availableFields);
            
            const subtableData = record[CONFIG.subtableFieldCode];
            console.log('サブテーブルデータ:', subtableData);
            
            if (!subtableData || !subtableData.value) {
                console.log('サブテーブルデータが見つかりません');
                return 0;
            }
            
            console.log('サブテーブル値:', subtableData.value);
            return subtableData.value.length;
        } catch (error) {
            console.error('サブテーブル行数カウントエラー:', error);
            return 0;
        }
    }

    /**
     * CSVダウンロードボタンを作成
     */
    function createAttachButton() {
        console.log('CSVダウンロードボタンを作成します');
        console.log('現在の設定:', CONFIG);
        
        try {
            // 既存のボタンを削除
            const existingContainer = document.querySelector('#csv-attach-button-container');
            if (existingContainer) {
                existingContainer.remove();
            }
            
            const existingCsvContainer = document.querySelector('#csv-download-button-container');
            if (existingCsvContainer) {
                existingCsvContainer.remove();
            }
            
            const existingButtonsContainer = document.querySelector('#subtable-buttons-container');
            if (existingButtonsContainer) {
                existingButtonsContainer.remove();
            }
            
            // サブテーブルフィールドを自動検出
            const record = kintone.app.record.get().record;
            let subtableFieldName = CONFIG.subtableFieldCode;
            let subtableFound = false;
            
            console.log('🔍 サブテーブルフィールド名を確認:', subtableFieldName);
            
            // 設定されたフィールドをチェック
            if (record[subtableFieldName] && record[subtableFieldName].type === 'SUBTABLE') {
                subtableFound = true;
                console.log('✅ 設定されたサブテーブルフィールドが見つかりました');
            } else {
                // サブテーブルフィールドを自動検索
                console.log('設定されたサブテーブルフィールドが見つかりません。自動検索します...');
                for (let fieldName in record) {
                    if (record[fieldName].type === 'SUBTABLE') {
                        subtableFieldName = fieldName;
                        subtableFound = true;
                        console.log('サブテーブルフィールドを発見:', fieldName);
                        break;
                    }
                }
            }
            
            if (!subtableFound) {
                console.log('サブテーブルフィールドが見つかりませんでした');
                return;
            }
            
            // 行数をチェック
            const subtableData = record[subtableFieldName];
            const rowCount = subtableData && subtableData.value ? subtableData.value.length : 0;
            console.log('サブテーブル行数:', rowCount, '(フィールド:', subtableFieldName + ')');
            
            // 自動更新ボタンは常に表示（行数制限なし）
            // CSVダウンロードボタンは2行以上で表示
            const showDownloadButton = rowCount >= 2;
            
            // 検出されたサブテーブルフィールド名を設定に反映
            if (subtableFieldName !== CONFIG.subtableFieldCode) {
                console.log('サブテーブルフィールド名を更新:', CONFIG.subtableFieldCode, '->', subtableFieldName);
                CONFIG.subtableFieldCode = subtableFieldName;
            }
            
            // サブテーブル要素を検索
            const subtableElement = document.querySelector('.subtable-gaia');
            if (!subtableElement) {
                console.log('サブテーブルが見つからないため、ボタン作成をスキップします');
                return;
            }
            
            // ボタンコンテナを作成（テーブルの下に配置、横並び）
            const container = document.createElement('div');
            container.id = 'subtable-buttons-container';
            container.style.display = 'flex';
            container.style.gap = '10px';
            container.style.margin = '5px 0 10px 0';
            container.style.padding = '8px';
            container.style.backgroundColor = '#e8f4fd';
            container.style.border = '1px solid #3498db';
            container.style.borderRadius = '6px';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';  // 中央揃え
            container.style.width = 'fit-content';      // コンテンツに合わせた幅
            container.style.marginLeft = 'auto';        // 中央配置のため
            container.style.marginRight = 'auto';       // 中央配置のため
            
            // 自動更新停止/再開ボタン（常に表示）
            const toggleButton = document.createElement('button');
            toggleButton.id = 'auto-update-toggle-button';
            toggleButton.textContent = autoUpdateEnabled ? '⏸️ 自動更新を停止' : '▶️ 自動更新を再開';
            toggleButton.style.padding = '10px 20px';
            toggleButton.style.backgroundColor = autoUpdateEnabled ? '#ffc107' : '#28a745';
            toggleButton.style.color = 'white';
            toggleButton.style.border = 'none';
            toggleButton.style.borderRadius = '6px';
            toggleButton.style.cursor = 'pointer';
            toggleButton.style.fontWeight = 'bold';
            toggleButton.style.fontSize = '14px';
            toggleButton.style.whiteSpace = 'nowrap';
            toggleButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
            
            // 停止/再開ボタンクリックイベント
            toggleButton.addEventListener('click', function() {
                autoUpdateEnabled = !autoUpdateEnabled;
                
                if (autoUpdateEnabled) {
                    this.textContent = '⏸️ 概要・発注先 自動追記を停止';
                    this.style.backgroundColor = '#ffc107';
                    console.log('✅ 自動更新を再開しました');
                    alert('自動更新を再開しました');
                } else {
                    this.textContent = '▶️ 概要・発注先 自動追記を再開';
                    this.style.backgroundColor = '#28a745';
                    console.log('⏸️ 自動更新を停止しました');
                    alert('自動更新を停止しました');
                }
            });
            
            container.appendChild(toggleButton);
            
            // CSVダウンロードボタン（2行以上の場合のみ表示）
            if (showDownloadButton) {
                const downloadButton = document.createElement('button');
                downloadButton.textContent = '📥 CSVファイルをダウンロード';
                downloadButton.style.padding = '10px 20px';
                downloadButton.style.backgroundColor = '#007bff';
                downloadButton.style.color = 'white';
                downloadButton.style.border = 'none';
                downloadButton.style.borderRadius = '6px';
                downloadButton.style.cursor = 'pointer';
                downloadButton.style.fontWeight = 'bold';
                downloadButton.style.fontSize = '14px';
                downloadButton.style.whiteSpace = 'nowrap';
                downloadButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                
                // ダウンロードボタンクリックイベント
                downloadButton.addEventListener('click', function() {
                    console.log('CSVダウンロードボタンがクリックされました');
                    
                    this.disabled = true;
                    this.textContent = 'ダウンロード中...';
                    
                    try {
                        downloadCSVFile();
                        
                        downloadButton.disabled = false;
                        downloadButton.textContent = '📥 CSVファイルをダウンロード';
                        
                    } catch (error) {
                        console.error('ダウンロードエラー:', error);
                        downloadButton.disabled = false;
                        downloadButton.textContent = '📥 CSVファイルをダウンロード';
                        alert('ダウンロード中にエラーが発生しました: ' + error.message);
                    }
                });
                
                container.appendChild(downloadButton);
            }
            
            // サブテーブルの下に配置
            if (subtableElement.nextSibling) {
                subtableElement.parentNode.insertBefore(container, subtableElement.nextSibling);
            } else {
                subtableElement.parentNode.appendChild(container);
            }
            
            console.log('ボタンを作成しました（自動更新: 常に表示, CSV:', showDownloadButton, '）');
            
        } catch (error) {
            console.error('ダウンロードボタン作成エラー:', error);
        }
    }

    /**
     * ユーザーコードからメールアドレスを取得
     */
    function getUserEmail(userCode) {
        return kintone.api(kintone.api.url('/v1/users', true), 'GET', {
            codes: [userCode]
        }).then(function(resp) {
            if (resp.users && resp.users.length > 0 && resp.users[0].email) {
                return resp.users[0].email;
            }
            return userCode; // メールアドレスが取得できない場合はコードを返す
        }).catch(function(error) {
            console.error('ユーザー情報取得エラー:', error);
            return userCode; // エラー時はコードを返す
        });
    }

    /**
     * レコード作成者と承認者のメールアドレスを対応するアドレスフィールドに自動入力
     */
    function setUserEmailAddress(event) {
        try {
            const record = event.record;
            const promises = [];
            const loginUser = kintone.getLoginUser();
            
            // 1. レコード作成者のメールアドレスをレコード作成者アドレスフィールドに設定
            const creatorEmailField = record['レコード作成者アドレス'];
            
            if (loginUser && loginUser.email && creatorEmailField) {
                creatorEmailField.value = loginUser.email;
                console.log('✅ レコード作成者アドレスにメールアドレスを設定:', loginUser.email);
            } else if (!loginUser || !loginUser.email) {
                console.log('⚠ ログインユーザーのメールアドレスが取得できませんでした');
            } else {
                console.log('⚠ レコード作成者アドレスフィールドが見つかりません');
            }
            
            // 2. 承認者1_発注時のメールアドレスを発注承認者1メールアドレスフィールドに設定
            const approverField = record['承認者1_発注時'];
            const approverEmailField = record['発注承認者1メールアドレス'];
            
            if (approverField && approverField.value && Array.isArray(approverField.value) && approverField.value.length > 0) {
                const userCode = approverField.value[0].code;
                if (userCode && approverEmailField) {
                    const promise = getUserEmail(userCode).then(function(email) {
                        approverEmailField.value = email;
                        console.log('✅ 発注承認者1メールアドレスにメールアドレスを設定:', email);
                    });
                    promises.push(promise);
                } else {
                    console.log('⚠ 承認者1_発注時のユーザーコードが取得できませんでした');
                }
            } else {
                console.log('ℹ️ 承認者1_発注時フィールドが未設定です');
            }
            
            // すべてのAPI呼び出しが完了するまで待つ
            if (promises.length > 0) {
                return Promise.all(promises).then(function() {
                    return event;
                }).catch(function(error) {
                    console.error('メールアドレス設定エラー:', error);
                    return event;
                });
            }
            
        } catch (error) {
            console.error('メールアドレス自動入力エラー:', error);
        }
        
        return Promise.resolve(event);
    }

    // レコード詳細・編集画面でボタンを表示
    kintone.events.on(['app.record.detail.show', 'app.record.edit.show', 'app.record.create.show'], function(event) {
        console.log('レコード表示イベント:', event.type);
        
        // イベントタイプを変数に保存（非同期処理後も参照できるように）
        const eventType = event.type;
        const isCreate = eventType.includes('create');
        const isEdit = eventType.includes('edit');
        const isDetail = eventType.includes('detail');
        
        // Record_Noフィールドの制御
        if (isCreate) {
            // 作成画面では非表示（レコード番号がまだ採番されていないため）
            kintone.app.record.setFieldShown('Record_No', false);
            console.log('✅ Record_Noフィールドを非表示にしました（作成画面）');
            
        } else if (isEdit) {
            // 編集画面では表示するが無効化（変更不可）
            const record = event.record;
            if (record['Record_No']) {
                kintone.app.record.setFieldShown('Record_No', true);
                
                // DOMで直接無効化（より確実）
                setTimeout(function() {
                    try {
                        const recordNoField = document.querySelector('input[name="Record_No"]');
                        if (recordNoField) {
                            recordNoField.disabled = true;
                            recordNoField.readOnly = true;
                            recordNoField.style.backgroundColor = '#f0f0f0';
                            recordNoField.style.cursor = 'not-allowed';
                            console.log('✅ Record_Noフィールドを無効化しました（編集画面）');
                        } else {
                            console.log('⚠ Record_NoフィールドのDOM要素が見つかりませんでした');
                        }
                    } catch (error) {
                        console.error('Record_No無効化エラー:', error);
                    }
                }, 100);
            }
            
        } else if (isDetail) {
            // 詳細画面では通常表示
            kintone.app.record.setFieldShown('Record_No', true);
            console.log('ℹ️ Record_Noフィールドを表示しました（詳細画面）');
        }
        
        // 初期表示時にも明細名を更新
        if (isEdit || isCreate) {
            console.log('編集/作成画面なので明細名を更新します');
            event = updateMeisaiName(event);
        }
        
        // レコード作成者アドレスは作成時のみ設定（一度だけ）
        if (isCreate) {
            const loginUser = kintone.getLoginUser();
            const creatorEmailField = event.record['レコード作成者アドレス'];
            if (loginUser && loginUser.email && creatorEmailField) {
                creatorEmailField.value = loginUser.email;
                console.log('✅ レコード作成者アドレスにメールアドレスを設定（作成時のみ）:', loginUser.email);
            } else if (!loginUser || !loginUser.email) {
                console.log('⚠ ログインユーザーのメールアドレスが取得できませんでした');
            } else {
                console.log('⚠ レコード作成者アドレスフィールドが見つかりません');
            }
        }
        
        // 発注承認者1メールアドレスは作成・編集時に遅延設定
        if (isEdit || isCreate) {
            // 承認者1_発注時の初期値設定とプラグイン処理を待ってからメールアドレスを設定
            setTimeout(function() {
                const currentRecord = kintone.app.record.get();
                const approverField = currentRecord.record['承認者1_発注時'];
                const approverEmailField = currentRecord.record['発注承認者1メールアドレス'];
                
                console.log('🔍 承認者1_発注時フィールドの確認:', approverField);
                
                if (approverField && approverField.value && Array.isArray(approverField.value) && approverField.value.length > 0) {
                    const userCode = approverField.value[0].code;
                    console.log('🔍 承認者1ユーザーコード:', userCode);
                    if (userCode && approverEmailField) {
                        getUserEmail(userCode).then(function(email) {
                            console.log('✅ 発注承認者1メールアドレスにメールアドレスを設定:', email);
                            // 最新のレコードを取得して更新
                            const latestRecord = kintone.app.record.get();
                            latestRecord.record['発注承認者1メールアドレス'].value = email;
                            kintone.app.record.set(latestRecord);
                            console.log('✅ 発注承認者1メールアドレスを画面に反映しました');
                        }).catch(function(error) {
                            console.error('承認者1メールアドレス取得エラー:', error);
                        });
                    } else {
                        console.log('⚠ 承認者1_発注時のユーザーコードが取得できませんでした');
                    }
                } else {
                    console.log('ℹ️ 承認者1_発注時フィールドが未設定です');
                }
            }, 600); // プラグイン処理を待つが長すぎないように600msに設定
            
            // ボタン類を配置
            setTimeout(function() {
                createAttachButton();
                setupSubtableChangeListener();
                createZipPasswordButton();
                console.log('✅ ZIPパスワード生成ボタンの配置を試みます（編集/作成画面）');
            }, 500);
            
            return event;
        }
        
        setTimeout(function() {
            createAttachButton();
            setupSubtableChangeListener();
            
            // 詳細画面
            console.log('ℹ️ 詳細画面のためZIPパスワード生成ボタンはスキップします');
        }, 500);
        return event;
    });

    // ステータス変更時（プロセスアクション実行時）のメールアドレス更新
    // 「10.発注内容確認」→「11.発注メール確認」の時のみ実行
    kintone.events.on(['app.record.detail.process.proceed'], function(event) {
        console.log('プロセスアクション実行:', event.type);
        console.log('現在のステータス:', event.status);
        console.log('次のステータス:', event.nextStatus);
        
        // ログインユーザメールアドレスを常に更新
        const loginUser = kintone.getLoginUser();
        if (loginUser && loginUser.email) {
            const loginUserEmailField = event.record['ログインユーザメールアドレス'];
            if (loginUserEmailField) {
                loginUserEmailField.value = loginUser.email;
                console.log('✅ プロセスアクション実行時にログインユーザメールアドレスを更新:', loginUser.email);
            }
        }
        
        // 特定のステータス遷移時のみ発注承認者1メールアドレスを更新
        if (event.nextStatus && event.nextStatus.value === '11.発注メール確認') {
            console.log('✓ ステータス遷移条件に一致: 発注承認者1メールアドレスを更新します');
            
            if (loginUser && loginUser.email) {
                const approverEmailField = event.record['発注承認者1メールアドレス'];
                if (approverEmailField) {
                    approverEmailField.value = loginUser.email;
                    console.log('✅ プロセスアクション実行時に発注承認者1メールアドレスを更新:', loginUser.email);
                } else {
                    console.log('⚠ 発注承認者1メールアドレスフィールドが見つかりません');
                }
            } else {
                console.log('⚠ ログインユーザーのメールアドレスが取得できませんでした');
            }
        } else {
            console.log('ℹ️ ステータス遷移条件に一致しないため、発注承認者1メールアドレスは更新しません');
        }
        
        return event;
    });

    // レコード作成・編集・保存時にログインユーザメールアドレスを更新
    kintone.events.on([
        'app.record.create.submit',
        'app.record.edit.submit'
    ], function(event) {
        console.log('レコード保存前処理:', event.type);
        
        const loginUser = kintone.getLoginUser();
        if (loginUser && loginUser.email) {
            const loginUserEmailField = event.record['ログインユーザメールアドレス'];
            if (loginUserEmailField) {
                loginUserEmailField.value = loginUser.email;
                console.log('✅ 保存時にログインユーザメールアドレスを更新:', loginUser.email);
            } else {
                console.log('⚠ ログインユーザメールアドレスフィールドが見つかりません');
            }
        } else {
            console.log('⚠ ログインユーザーのメールアドレスが取得できませんでした');
        }
        
        return event;
    });

    // 承認者1_発注時フィールド変更時にメールアドレスを更新
    kintone.events.on(['app.record.create.change.承認者1_発注時', 'app.record.edit.change.承認者1_発注時'], function(event) {
        console.log('承認者1_発注時フィールドが変更されました');
        const record = event.record;
        const approverField = record['承認者1_発注時'];
        const approverEmailField = record['発注承認者1メールアドレス'];
        
        if (approverField && approverField.value && Array.isArray(approverField.value) && approverField.value.length > 0) {
            const userCode = approverField.value[0].code;
            if (userCode && approverEmailField) {
                getUserEmail(userCode).then(function(email) {
                    approverEmailField.value = email;
                    console.log('✅ 発注承認者1メールアドレスを更新:', email);
                });
            }
        } else if (approverEmailField) {
            // ユーザーがクリアされた場合はメールアドレスもクリア
            approverEmailField.value = '';
            console.log('✅ 発注承認者1メールアドレスをクリア');
        }
        
        return event;
    });

    // サブテーブル全体の変更イベント（行追加・削除）
    const subtableChangeEvents = [
        'app.record.edit.change.' + CONFIG.subtableFieldCode,
        'app.record.create.change.' + CONFIG.subtableFieldCode
    ];
    
    console.log('サブテーブル変更イベントを登録:', subtableChangeEvents);
    
    // サブテーブル変更時の統合ハンドラー
    kintone.events.on(subtableChangeEvents, function(event) {
        console.log('✓ サブテーブル変更イベントが発生しました:', event.type);
        
        const record = event.record;
        const subtableData = record[CONFIG.subtableFieldCode];
        
        if (!subtableData || !subtableData.value) {
            return event;
        }
        
        // 各行の明細名をチェック（ルックアップ検知用）
        let meisaiChanged = false;
        subtableData.value.forEach(function(row, index) {
            const meisaiField = row.value['明細名'];
            if (meisaiField && meisaiField.value) {
                const currentValue = meisaiField.value;
                const rowKey = 'row_' + index;
                
                // 前回の値が未定義または異なる場合
                if (lastMeisaiValues[rowKey] === undefined) {
                    // 初回設定
                    lastMeisaiValues[rowKey] = currentValue;
                } else if (lastMeisaiValues[rowKey] !== currentValue) {
                    console.log('🔔 明細名が変更されました（行', (index + 1), '）');
                    console.log('   前回:', lastMeisaiValues[rowKey]);
                    console.log('   今回:', currentValue);
                    
                    lastMeisaiValues[rowKey] = currentValue;
                    meisaiChanged = true;
                }
            }
        });
        
        // 明細名が変更された場合に自動更新を実行（初回のみ）
        if (meisaiChanged) {
            console.log('📝 明細名の変更を検知、ルックアップ完了後に自動更新を実行します');
            setTimeout(function() {
                updateMeisaiNameOnce();
            }, 500); // ルックアップ処理完了を待つ
        }
        
        // 手動変更用の処理も実行
        return updateMeisaiName(event);
    });

    // 伝票案件名フィールドの変更イベント（サブテーブル内）
    // 複数のパターンを試す
    const denpyoFieldChangeEvents = [
        'app.record.edit.change.発注内容_テーブル.伝票案件名',
        'app.record.create.change.発注内容_テーブル.伝票案件名',
        // フィールドコードが異なる可能性も考慮
        'app.record.edit.change.' + CONFIG.subtableFieldCode + '.伝票案件名',
        'app.record.create.change.' + CONFIG.subtableFieldCode + '.伝票案件名'
    ];
    
    console.log('伝票案件名フィールド変更イベントを登録:', denpyoFieldChangeEvents);
    
    kintone.events.on(denpyoFieldChangeEvents, function(event) {
        console.log('✓ 伝票案件名フィールド変更イベントが発生しました:', event.type);
        return updateMeisaiName(event);
    });
    
    // 全てのサブテーブルフィールド変更を監視（デバッグ用 + 明細名変更検知）
    kintone.events.on([
        'app.record.edit.change.*',
        'app.record.create.change.*'
    ], function(event) {
        // イベントタイプの存在確認
        if (!event || !event.type) {
            console.warn('⚠ イベントまたはイベントタイプが未定義です');
            return event;
        }
        
        // サブテーブル関連のイベントのみログ出力
        if (event.type.includes('発注内容') || event.type.includes(CONFIG.subtableFieldCode)) {
            console.log('🔍 サブテーブル関連イベント検出:', event.type, event.changes);
            
            // 明細名の変更を検知
            if (event.type.includes('明細名')) {
                console.log('🔔🔔 明細名フィールドが変更されました！');
                console.log('   イベント:', event.type);
                console.log('   changes:', event.changes);
                
                // ルックアップ完了後に自動更新を実行（初回のみ）
                setTimeout(function() {
                    console.log('📝 明細名変更検知→自動更新を実行します');
                    updateMeisaiNameOnce();
                }, 500);
            }
            
            // 伝票案件名の変更かチェック
            if (event.type.includes('伝票案件名')) {
                console.log('✓✓ 伝票案件名が変更されました！');
                return updateMeisaiName(event);
            }
        }
        return event;
    });

    // サブテーブル行変更の監視を設定
    function setupSubtableChangeListener() {
        console.log('サブテーブル変更監視を設定します');

        // DOM変更監視（行追加/削除 + 明細名変更を検出）
        const subtableElement = document.querySelector('.subtable-gaia');
        if (subtableElement) {
            let checkTimer = null;
            
            // MutationObserverで DOM 変更を監視
            const observer = new MutationObserver(function(mutations) {
                let shouldUpdate = false;
                let shouldCheckMeisai = false;
                
                mutations.forEach(function(mutation) {
                    if (mutation.type === 'childList') {
                        // 行の追加/削除を検出
                        shouldUpdate = true;
                    }
                    
                    // characterData変更（テキスト入力）も監視
                    if (mutation.type === 'characterData' || mutation.type === 'childList') {
                        shouldCheckMeisai = true;
                    }
                });
                
                if (shouldUpdate) {
                    // 行変更中フラグを立てる
                    isRowChanging = true;
                    console.log('🔄 行の追加・削除を検知（自動更新を一時停止）');
                    
                    setTimeout(function() {
                        // ボタンの表示制御を更新
                        createAttachButton();
                        
                        // 2秒待ってから行変更中フラグを解除（待機時間を延長）
                        setTimeout(function() {
                            isRowChanging = false;
                            console.log('✅ 行変更完了（自動更新を再開）');
                        }, 2000);
                    }, 300);
                }
                
                // 明細名の変更をチェック（デバウンス付き、行変更中は除外）
                if (shouldCheckMeisai && !isRowChanging) {
                    if (checkTimer) {
                        clearTimeout(checkTimer);
                    }
                    
                    checkTimer = setTimeout(function() {
                        console.log('🔍 DOM変更検知→明細名をチェックします');
                        checkMeisaiNameChange();
                    }, 300);
                }
            });
            
            observer.observe(subtableElement, {
                childList: true,
                subtree: true,
                characterData: true,
                characterDataOldValue: true
            });
            
            console.log('サブテーブルDOM変更監視を開始しました（明細名変更検知含む）');
        } else {
            console.log('サブテーブル要素が見つかりません');
        }
        
        // 定期的に明細名をチェック（フォールバック）
        setInterval(function() {
            checkMeisaiNameChange();
        }, 2000);
        console.log('明細名定期チェックを開始しました（2秒間隔）');
    }
    
    /**
     * 明細名の変更をチェックして自動更新する関数（2秒おきに実行）
     */
    function checkMeisaiNameChange() {
        // 自動更新が無効の場合はスキップ
        if (!autoUpdateEnabled) {
            return;
        }
        
        // 行の追加・削除中はスキップ
        if (isRowChanging) {
            return;
        }
        
        try {
            const record = kintone.app.record.get().record;
            const subtableData = record[CONFIG.subtableFieldCode];
            
            if (!subtableData || !subtableData.value) {
                return;
            }
            
            let hasChanges = false;
            
            subtableData.value.forEach(function(row, index) {
                const meisaiField = row.value['明細名'];
                if (meisaiField && meisaiField.value) {
                    const currentValue = meisaiField.value;
                    const rowKey = 'row_' + index;
                    
                    // 前回の値が未定義の場合（初回記録）
                    if (lastMeisaiValues[rowKey] === undefined) {
                        lastMeisaiValues[rowKey] = currentValue;
                        hasChanges = true;
                    } else if (lastMeisaiValues[rowKey] !== currentValue) {
                        console.log('🔔 明細名変更: 行' + (index + 1));
                        
                        lastMeisaiValues[rowKey] = currentValue;
                        hasChanges = true;
                    }
                }
            });
            
            // 明細名に変更があれば自動更新を実行
            if (hasChanges) {
                console.log('📝 明細名の変更を検知、自動更新を実行します');
                updateMeisaiNameOnce(); // 全行を処理
            }
            
        } catch (error) {
            console.error('明細名チェックエラー:', error);
        }
    }

    // 支払い金額テーブルのメール送付チェックボックス制御
    // 保存時に2つ以上チェックされている場合はエラーを返す
    kintone.events.on(['app.record.create.submit', 'app.record.edit.submit'], function(event) {
        console.log('📋 レコード保存時のバリデーションを実行します');
        
        // 保存前に追加承認者_発注_Lineなどを更新（event.recordを直接変更）
        console.log('📋 保存前に追加承認者_発注_Line等を更新します');
        
        const record = event.record;
        
        // 追加承認者_発注時TBから追加承認者_発注_Lineを生成
        if (record['追加承認者_発注時TB'] && record['追加承認者_発注_Line']) {
            const approverTable = record['追加承認者_発注時TB'];
            const approverNames = [];
            
            if (approverTable.value && approverTable.value.length > 0) {
                approverTable.value.forEach(function(row) {
                    const field = row.value['追加承認者_発注'];
                    if (field && field.value) {
                        approverNames.push(field.value);
                    }
                });
                
                if (approverNames.length > 0) {
                    const newLineValue = approverNames.join('→');
                    record['追加承認者_発注_Line'].value = newLineValue;
                    console.log('✅ 追加承認者_発注_Lineを設定しました:', newLineValue);
                }
            }
        }
        
        // サブテーブルの1行目から各フィールドをコピー
        const subtableData = record[CONFIG.subtableFieldCode];
        if (subtableData && subtableData.value && subtableData.value.length > 0) {
            const firstRow = subtableData.value[0].value;
            
            // 決裁番号TBL1
            if (firstRow['決裁番号'] && record['決裁番号TBL1']) {
                record['決裁番号TBL1'].value = firstRow['決裁番号'].value || '';
            }
            
            // 伝票案件名TBL1
            if (firstRow['伝票案件名'] && record['伝票案件名TBL1']) {
                record['伝票案件名TBL1'].value = firstRow['伝票案件名'].value || '';
            }
            
            // 伝票案件名MLタイトル（常に1行目の伝票案件名をコピー）
            if (firstRow['伝票案件名'] && record['伝票案件名MLタイトル']) {
                record['伝票案件名MLタイトル'].value = firstRow['伝票案件名'].value || '';
            }
            
            // 明細名TBL1
            if (firstRow['明細名'] && record['明細名TBL1']) {
                record['明細名TBL1'].value = firstRow['明細名'].value || '';
            }
            
            // 予算CD_TBL1
            if (firstRow['予算CD'] && record['予算CD_TBL1']) {
                record['予算CD_TBL1'].value = firstRow['予算CD'].value || '';
            }
            
            // 費用CD_TBL1
            if (firstRow['費用CD'] && record['費用CD_TBL1']) {
                record['費用CD_TBL1'].value = firstRow['費用CD'].value || '';
            }
            
            console.log('✅ サブテーブル1行目からフィールドをコピーしました');
        }
        
        try {
            const paymentTable = record['支払い金額テーブル'];
            
            let checkedCount = 0;
            const checkedRows = [];
            let checkedRowIndex = -1;
            
            // 支払い金額テーブルが存在する場合のみチェック
            if (paymentTable && paymentTable.value && paymentTable.value.length > 0) {
                // チェックされている行を数える
                paymentTable.value.forEach(function(row, index) {
                    const mailField = row.value['メール送付'];
                    if (mailField && mailField.value && mailField.value.length > 0) {
                        checkedCount++;
                        checkedRows.push(index + 1); // 1始まりで行番号を記録
                        checkedRowIndex = index;
                        console.log('✓ 行', (index + 1), 'がチェックされています');
                    }
                });
            } else {
                console.log('✓ 支払い金額テーブルが空です。メール送付チェックをスキップします');
            }
            
            console.log('✓ チェックされている行数:', checkedCount);
            console.log('✓ チェックされている行:', checkedRows);
            
            // 2行以上チェックされている場合はエラー
            if (checkedCount > 1) {
                const errorMessage = '支払い金額テーブルの「メール送付」は1行のみチェック可能です。\n' +
                                   '現在 ' + checkedCount + ' 行がチェックされています。\n' +
                                   'チェックされている行: ' + checkedRows.join(', ') + '\n\n' +
                                   '1行のみにチェックを入れてください。';
                
                console.error('❌ バリデーションエラー:', errorMessage);
                event.error = errorMessage;
                return event;
            }
            
            console.log('✅ バリデーション成功: メール送付チェックは' + checkedCount + '行です');
            
            // チェックされている行がある場合、そのデータをメインフォームにコピー
            if (checkedCount === 1 && checkedRowIndex >= 0) {
                const checkedRow = paymentTable.value[checkedRowIndex];
                console.log('📋 チェックされた行のデータをコピーします (行' + (checkedRowIndex + 1) + ')');
                console.log('📋 チェックされた行の利用可能なフィールド:', Object.keys(checkedRow.value));
                
                // 金額支払 → 金額支払Check
                if (checkedRow.value['金額支払'] && record['金額支払Check']) {
                    const value = checkedRow.value['金額支払'].value || '';
                    record['金額支払Check'].value = value;
                    console.log('✅ 金額支払Check を更新:', value);
                }
                
                // 支払い期日 → 支払い期日Check
                if (checkedRow.value['支払い期日'] && record['支払い期日Check']) {
                    const value = checkedRow.value['支払い期日'].value || '';
                    record['支払い期日Check'].value = value;
                    console.log('✅ 支払い期日Check を更新:', value);
                }
                
                // ==========================================
                // 📝 請求書ファイルのチェック
                // ==========================================
                // 注意: submitイベント時点では、サブテーブル内の添付ファイル情報は
                // kintoneの制限により取得できません（常に空配列になります）
                // そのため、submit.successイベントで保存後にチェックを行います
                
                console.log('📎 請求書ファイルは保存後にチェックします');
                
                console.log('✅ チェックされた行のデータ検証が完了しました');
            } else if (checkedCount === 0) {
                // チェックがない場合はCheckフィールドをクリア
                console.log('ℹ️ チェックがないため、Checkフィールドをクリアします');
                
                if (record['金額支払Check']) {
                    record['金額支払Check'].value = '';
                }
                if (record['支払い期日Check']) {
                    record['支払い期日Check'].value = '';
                }
                if (record['支払メール添付']) {
                    record['支払メール添付'].value = [];
                }
                
                console.log('✅ Checkフィールドをクリアしました');
            }
            
            // ==========================================
            // 📝 支払い承認フローチェックによる追加承認者_支払_Lineの制御
            // ==========================================
            console.log('🔍 支払い承認フロー処理を開始します');
            console.log('🔍 利用可能なフィールド:', Object.keys(record));
            
            const approvalFlowCheck = record['支払い承認フローチェック'];
            console.log('🔍 支払い承認フローチェックフィールド:', approvalFlowCheck);
            console.log('🔍 支払い承認フローチェック値:', approvalFlowCheck ? approvalFlowCheck.value : 'フィールドなし');
            
            if (approvalFlowCheck && record['追加承認者_支払_Line']) {
                const isChecked = Array.isArray(approvalFlowCheck.value) && 
                                approvalFlowCheck.value.includes('発注時と同じ承認フロー');
                
                console.log('📋 支払い承認フローチェック:', isChecked ? 'チェックあり' : 'チェックなし');
                console.log('📋 チェックボックスの値:', approvalFlowCheck.value);
                
                if (isChecked) {
                    // チェックが入っている場合: 追加承認者_発注_Lineをコピー
                    if (record['追加承認者_発注_Line']) {
                        const sourceValue = record['追加承認者_発注_Line'].value || '';
                        record['追加承認者_支払_Line'].value = sourceValue;
                        console.log('✅ 追加承認者_発注_Lineを追加承認者_支払_Lineにコピーしました:', sourceValue);
                    } else {
                        console.log('⚠ 追加承認者_発注_Lineフィールドが見つかりません');
                    }
                } else {
                    // チェックが入っていない場合: 追加承認者_支払TBから生成
                    console.log('📋 追加承認者_支払TBから生成します');
                    const paymentApproverTable = record['追加承認者_支払TB'];
                    console.log('📋 追加承認者_支払TB:', paymentApproverTable);
                    console.log('📋 追加承認者_支払TB行数:', paymentApproverTable && paymentApproverTable.value ? paymentApproverTable.value.length : 0);
                    
                    if (paymentApproverTable && paymentApproverTable.value) {
                        const paymentApproverNames = [];
                        
                    paymentApproverTable.value.forEach(function(row, index) {
                        console.log('📋 行' + (index + 1) + 'の値:', row.value);
                        if (row.value['追加承認者_支払い'] && row.value['追加承認者_支払い'].value) {
                            const field = row.value['追加承認者_支払い'];
                            console.log('📋 行' + (index + 1) + 'フィールド:', field);
                            let approverName = '';
                            
                            // ユーザー選択フィールドの場合
                            if (field.type === 'USER_SELECT') {
                                if (Array.isArray(field.value)) {
                                    approverName = field.value.map(function(user) {
                                        return user.name || user.code;
                                    }).join(',');
                                } else if (field.value.name) {
                                    approverName = field.value.name;
                                } else {
                                    approverName = field.value;
                                }
                            } else {
                                // 通常のテキストフィールドやドロップダウンの場合
                                approverName = field.value;
                            }
                            
                            if (approverName) {
                                console.log('📋 行' + (index + 1) + '承認者名:', approverName);
                                paymentApproverNames.push(approverName);
                            }
                        }
                    });                        // →で連結
                        const newLineValue = paymentApproverNames.join('→');
                        console.log('📋 生成された承認者リスト:', paymentApproverNames);
                        console.log('📋 連結後の値:', newLineValue);
                        record['追加承認者_支払_Line'].value = newLineValue;
                        console.log('✅ 追加承認者_支払TBから追加承認者_支払_Lineを生成しました:', newLineValue);
                    } else {
                        console.log('⚠ 追加承認者_支払TBが空またはフィールドが見つかりません');
                        record['追加承認者_支払_Line'].value = '';
                    }
                }
            } else {
                if (!approvalFlowCheck) {
                    console.log('⚠ 支払い承認フローチェックフィールドが見つかりません');
                }
                if (!record['追加承認者_支払_Line']) {
                    console.log('⚠ 追加承認者_支払_Lineフィールドが見つかりません');
                }
            }
            
        } catch (error) {
            console.error('メール送付チェック制御エラー:', error);
        }
        
        return event;
    });

    // ==========================================
    // 保存成功後イベント: 請求書ファイルの一致チェック + Record_No転記 + 検収書_送付ファイル有無チェック
    // ==========================================
    kintone.events.on(['app.record.create.submit.success', 'app.record.edit.submit.success'], function(event) {
        console.log('💾 レコード保存成功: 後処理を開始します');
        
        try {
            const appId = kintone.app.getId();
            const recordId = event.recordId || event.record.$id.value;
            const isCreate = event.type === 'app.record.create.submit.success';
            
            console.log('📋 AppID:', appId, 'RecordID:', recordId, 'イベント:', event.type);
            
            // ==========================================
            // 1. レコード作成時: Record_No転記
            // ==========================================
            if (isCreate) {
                console.log('📝 レコード作成: Record_Noにレコード番号を転記します');
                
                // レコード番号を5桁のゼロ埋めに変換（例: 321 → 00321）
                const recordNoFormatted = recordId.toString().padStart(5, '0');
                console.log('🔢 フォーマット後:', recordId, '→', recordNoFormatted);
                
                // Record_Noフィールドにレコード番号を設定
                const updateBody = {
                    app: appId,
                    id: recordId,
                    record: {
                        'Record_No': {
                            value: recordNoFormatted
                        }
                    }
                };
                
                // レコードを更新
                kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', updateBody, function(resp) {
                    console.log('✅ Record_Noにレコード番号を転記しました:', recordNoFormatted);
                }, function(error) {
                    console.error('❌ Record_No転記エラー:', error);
                });
            }
            
            // ==========================================
            // 2. 請求書ファイルチェック
            // ==========================================
            console.log('📎 請求書ファイルの一致をチェックします');
            
            // 保存されたレコードを再取得
            kintone.api(kintone.api.url('/k/v1/record', true), 'GET', {
                app: appId,
                id: recordId
            }, function(resp) {
                console.log('✅ レコード取得成功');
                
                const record = resp.record;
                let needsUpdate = false;
                const updateBody = {
                    app: appId,
                    id: recordId,
                    record: {}
                };
                
                // ==========================================
                // 検収書_送付の添付ファイル有無チェック（保存後）
                // ==========================================
                const kensyushoField = record['検収書_送付'];
                const kensyushoCheckField = record['検収書_送付ファイル有無'];
                
                if (kensyushoField && kensyushoCheckField) {
                    const currentCheckValue = kensyushoCheckField.value || [];
                    const hasFiles = kensyushoField.value && kensyushoField.value.length > 0;
                    const shouldBeChecked = hasFiles;
                    const isCurrentlyChecked = Array.isArray(currentCheckValue) && currentCheckValue.includes('添付ファイルあり');
                    
                    console.log('📎 検収書_送付ファイル数:', hasFiles ? kensyushoField.value.length : 0);
                    console.log('📎 現在のチェック状態:', isCurrentlyChecked);
                    
                    if (shouldBeChecked && !isCurrentlyChecked) {
                        // 添付ファイルありなのにチェックなし → チェックを付ける
                        updateBody.record['検収書_送付ファイル有無'] = {
                            value: ['添付ファイルあり']
                        };
                        needsUpdate = true;
                        console.log('✅ 検収書_送付ファイル有無に「添付ファイルあり」をチェックします');
                    } else if (!shouldBeChecked && isCurrentlyChecked) {
                        // 添付ファイルなしなのにチェックあり → チェックを外す
                        updateBody.record['検収書_送付ファイル有無'] = {
                            value: []
                        };
                        needsUpdate = true;
                        console.log('✅ 検収書_送付ファイル有無のチェックを外します');
                    } else {
                        console.log('ℹ️ 検収書_送付ファイル有無は既に正しい状態です');
                    }
                } else {
                    if (!kensyushoField) {
                        console.log('⚠ 検収書_送付フィールドが見つかりません');
                    }
                    if (!kensyushoCheckField) {
                        console.log('⚠ 検収書_送付ファイル有無フィールドが見つかりません');
                    }
                }
                
                const paymentTable = record['支払い金額テーブル'];
                
                if (!paymentTable || !paymentTable.value) {
                    console.log('⚠ 支払い金額テーブルが見つかりません');
                    
                    // 検収書のチェックのみ更新が必要な場合
                    if (needsUpdate) {
                        kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', updateBody, function(resp) {
                            console.log('✅ 検収書_送付ファイル有無を更新しました');
                        }, function(error) {
                            console.error('❌ 検収書_送付ファイル有無の更新エラー:', error);
                        });
                    }
                    return;
                }
                
                // チェックされている行を探す
                let checkedRowIndex = -1;
                for (let i = 0; i < paymentTable.value.length; i++) {
                    const row = paymentTable.value[i];
                    if (row.value['メール送付'] && row.value['メール送付'].value && row.value['メール送付'].value.length > 0) {
                        checkedRowIndex = i;
                        break;
                    }
                }
                
                if (checkedRowIndex === -1) {
                    console.log('ℹ️ チェックされた行がないため、請求書確認をスキップします');
                    
                    // 検収書のチェックのみ更新が必要な場合
                    if (needsUpdate) {
                        kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', updateBody, function(resp) {
                            console.log('✅ 検収書_送付ファイル有無を更新しました');
                        }, function(error) {
                            console.error('❌ 検収書_送付ファイル有無の更新エラー:', error);
                        });
                    }
                    return;
                }
                
                const checkedRow = paymentTable.value[checkedRowIndex];
                console.log('📋 チェックされた行 ' + (checkedRowIndex + 1) + ' の請求書をチェックします');
                
                // 請求書フィールドの確認
                if (checkedRow.value['請求書']) {
                    const filesInTable = checkedRow.value['請求書'].value || [];
                    const tableFileCount = Array.isArray(filesInTable) ? filesInTable.length : 0;
                    
                    console.log('🔍 サブテーブル請求書ファイル数:', tableFileCount);
                    
                    // 支払メール添付フィールドを確認
                    const filesInCheck = record['支払メール添付'].value || [];
                    const checkFileCount = Array.isArray(filesInCheck) ? filesInCheck.length : 0;
                    
                    console.log('🔍 支払メール添付ファイル数:', checkFileCount);
                    
                    // ファイル名リストを取得してソート
                    const tableFileNames = filesInTable.map(function(file) {
                        return file.name || '';
                    }).sort();
                    const checkFileNames = filesInCheck.map(function(file) {
                        return file.name || '';
                    }).sort();
                    
                    console.log('📎 サブテーブルファイル名:', tableFileNames);
                    console.log('📎 支払メール添付ファイル名:', checkFileNames);
                    
                    // ファイル数とファイル名の一致をチェック
                    let hasError = false;
                    let missingFiles = [];
                    let extraFiles = [];
                    
                    if (tableFileCount !== checkFileCount) {
                        hasError = true;
                    } else if (tableFileCount > 0) {
                        // ファイル数が同じ場合、ファイル名もチェック
                        for (let i = 0; i < tableFileNames.length; i++) {
                            if (tableFileNames[i] !== checkFileNames[i]) {
                                hasError = true;
                                break;
                            }
                        }
                    }
                    
                    // 不足・余分なファイルを特定
                    if (hasError) {
                        tableFileNames.forEach(function(name) {
                            if (checkFileNames.indexOf(name) === -1) {
                                missingFiles.push(name);
                            }
                        });
                        
                        checkFileNames.forEach(function(name) {
                            if (tableFileNames.indexOf(name) === -1) {
                                extraFiles.push(name);
                            }
                        });
                    }
                    
                    if (hasError) {
                        // シンプルなエラーメッセージを作成
                        let errorMessage = '⚠️ 請求書ファイルの不一致\n\n';
                        
                        errorMessage += 'サブテーブル: ' + tableFileCount + '件 / 支払メール添付: ' + checkFileCount + '件\n\n';
                        
                        if (missingFiles.length > 0) {
                            errorMessage += '【不足】\n';
                            missingFiles.forEach(function(name) {
                                errorMessage += '• ' + name + '\n';
                            });
                            errorMessage += '\n';
                        }
                        
                        if (extraFiles.length > 0) {
                            errorMessage += '【余分】\n';
                            extraFiles.forEach(function(name) {
                                errorMessage += '• ' + name + '\n';
                            });
                            errorMessage += '\n';
                        }
                        
                        errorMessage += 'レコードを編集して「支払メール添付」を修正してください。';
                        
                        console.error('❌ 請求書ファイル不一致検出');
                        console.error('  不足:', missingFiles);
                        console.error('  余分:', extraFiles);
                        
                        // アラート表示
                        alert(errorMessage);
                        
                    } else if (tableFileCount > 0) {
                        console.log('✅ 請求書ファイルが正しくコピーされています');
                    } else {
                        console.log('ℹ️ サブテーブルに請求書ファイルがありません');
                    }
                }
                
            }, function(error) {
                console.error('❌ レコード取得に失敗しました:', error);
            });
            
        } catch (error) {
            console.error('❌ 保存成功後の処理エラー:', error);
        }
        
        return event;
    });

    console.log('kintone CSV自動添付スクリプトが読み込まれました');

})();

