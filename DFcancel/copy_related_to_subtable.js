(function() {
    'use strict';

    // 設定
    const CONFIG = {
        // 関連レコードの取得元アプリID（実際のアプリIDに変更してください）
        RELATED_APP_ID: 416,  // ★要変更: 関連DFアプリのアプリID
        
        // 現在のレコードの検索キーフィールド
        SEARCH_KEY_FIELD: '調査対象中継回線ID',
        
        // 関連レコードアプリの検索対象フィールド
        RELATED_SEARCH_FIELD: '調査対象中継回線ID',
        
        // サブテーブルフィールド
        SUBTABLE_FIELD: '関連DFリスト',
        
        // ボタンラベル
        BUTTON_LABEL: '関連DFリストにコピー'
    };

    // 関連レコードからサブテーブルへのフィールドマッピング
    const FIELD_MAPPING = {
        'グループ内連番': 'グループ内連番t',
        '種別': '種別',
        '回線ID': '回線IDt',
        '始点回線種別': '始点回線種別t',
        '始点回線ID': '始点回線IDt',
        '終点回線種別': '終点回線種別t',
        '終点回線ID': '終点回線IDt',
        'ルートコード': 'ルートコードt',
        '始点局内伝送路': '始点局内伝送路t',
        '終点局内伝送路': '終点局内伝送路t',
        '始点通信用建物': '始点通信用建物t',
        '終点通信用建物': '終点通信用建物t',
        '接続開始日': '接続開始日t'
    };

    // レコード編集画面表示時にボタンを追加
    kintone.events.on(['app.record.edit.show', 'app.record.create.show'], function(event) {
        // ボタンが既に存在する場合は追加しない
        if (document.getElementById('copy_related_button')) {
            return event;
        }

        // 保存ボタンの右側にスペース要素を取得
        const headerSpace = kintone.app.record.getHeaderMenuSpaceElement();
        
        // ボタン要素を作成
        const button = document.createElement('button');
        button.id = 'copy_related_button';
        button.innerText = CONFIG.BUTTON_LABEL;
        
        // Kintone標準ボタンのスタイルを適用
        button.className = 'gaia-argoui-app-toolbar-statusmenu-button';
        button.style.cssText = 'margin-left: 10px; height: 48px; min-width: 100px; padding: 0 16px;';

        // ボタンクリック時の処理
        button.onclick = function(e) {
            e.preventDefault(); // デフォルト動作を防止
            copyRelatedToSubtable();
        };

        // ボタンを配置
        headerSpace.appendChild(button);

        return event;
    });

    // 関連レコードをサブテーブルにコピーする関数
    function copyRelatedToSubtable() {
        const record = kintone.app.record.get();
        
        // 検索キーの値を取得
        const searchKeyValue = record.record[CONFIG.SEARCH_KEY_FIELD].value;
        
        if (!searchKeyValue) {
            alert('検索キー "' + CONFIG.SEARCH_KEY_FIELD + '" の値が空です。');
            return;
        }
        
        console.log('検索キー:', CONFIG.SEARCH_KEY_FIELD, '=', searchKeyValue);
        
        // アプリIDのチェック
        if (!CONFIG.RELATED_APP_ID || CONFIG.RELATED_APP_ID === 0) {
            alert('設定エラー: RELATED_APP_IDが設定されていません。\nスクリプトのCONFIG.RELATED_APP_IDに関連DFアプリのアプリIDを設定してください。');
            return;
        }
        
        // 関連レコードを検索するクエリを作成
        const query = CONFIG.RELATED_SEARCH_FIELD + ' = "' + searchKeyValue + '"';
        
        console.log('検索クエリ:', query, 'AppID:', CONFIG.RELATED_APP_ID);
        
        // 関連レコードを取得
        kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
            app: CONFIG.RELATED_APP_ID,
            query: query,
            totalCount: true
        }).then(function(resp) {
            if (!resp.records || resp.records.length === 0) {
                alert('関連レコードが見つかりませんでした。\n検索条件: ' + query);
                return;
            }

            console.log('取得した関連レコード:', resp.records);

            // レコードを逆順にソート（1,2,3...の順にするため）
            const sortedRecords = resp.records.slice().reverse();

            // サブテーブルのデータを作成
            const subtableRows = sortedRecords.map(function(relatedRecord, index) {
                const row = {
                    value: {}
                };

                console.log('レコード[' + index + ']を処理中:', relatedRecord);

                // フィールドマッピングに従ってデータをコピー
                for (const sourceField in FIELD_MAPPING) {
                    const targetField = FIELD_MAPPING[sourceField];
                    
                    if (relatedRecord[sourceField] && relatedRecord[sourceField].value !== undefined) {
                        const fieldValue = relatedRecord[sourceField].value;
                        const fieldType = relatedRecord[sourceField].type;
                        
                        // サブテーブルの各セルには type と value プロパティを設定
                        row.value[targetField] = {
                            type: fieldType,
                            value: fieldValue === null || fieldValue === undefined ? '' : fieldValue
                        };
                    } else {
                        // フィールドが存在しない場合は SINGLE_LINE_TEXT として空文字
                        console.log('レコード[' + index + ']: フィールド "' + sourceField + '" が見つかりません');
                        row.value[targetField] = {
                            type: 'SINGLE_LINE_TEXT',
                            value: ''
                        };
                    }
                }

                console.log('レコード[' + index + ']の変換後データ:', row);
                return row;
            });

            console.log('サブテーブル行データ:', subtableRows);

            // 現在のレコードを取得
            const currentRecord = kintone.app.record.get();
            
            // サブテーブルを完全にクリアしてから新しいデータを設定
            currentRecord.record[CONFIG.SUBTABLE_FIELD].value = [];
            currentRecord.record[CONFIG.SUBTABLE_FIELD].value = subtableRows;
            
            // レコードを設定
            try {
                kintone.app.record.set(currentRecord);
                alert(subtableRows.length + '件の関連レコードをサブテーブルにコピーしました。');
            } catch (e) {
                console.error('レコード設定エラー:', e);
                console.log('設定しようとしたデータ:', JSON.stringify(subtableRows, null, 2));
                alert('サブテーブルへの設定中にエラーが発生しました。\nコンソールログを確認してください。\n' + e.message);
            }

        }).catch(function(error) {
            console.error('関連レコード取得エラー:', error);
            alert('関連レコードの取得中にエラーが発生しました。\n' + (error.message || JSON.stringify(error)));
        });
    }

})();
