/**
 * kintone_copy_to_inspection.js
 *
 * 【概要】
 * 発注内容サブテーブル（発注内容_テーブル）の行を
 * 部分検収サブテーブル（部分検収_テーブル）へコピーするスクリプト。
 *
 * 【機能】
 * 1. レコード編集画面にコピーボタンを表示し、手動でコピーを実行できる。
 * 2. プロセス管理のアクション実行時（「G番登録完了⇨発注完了」または
 *    「G番不要⇨発注完了」）に自動でコピーを実行する。
 * 3. 詳細画面表示時、ステータスが「14.発注完了」以降かつ部分検収テーブルが
 *    空の場合、REST API経由で自動コピー＋ページリロードする。
 *    （Excel マクロ等がAPI経由でステータスを変更した場合の補完）
 *
 * 【フィールドマッピング】
 *   明細名         → 明細名_検収テーブル
 *   金額_テーブル   → 金額_検収
 *   検収日         → 初期値 null で追加
 *
 * 【プロセス管理】
 *   ステータス遷移: 13.発注完了(G番前) → 14.発注完了
 *   アクション: 「G番登録完了⇨発注完了」「G番不要⇨発注完了」
 *
 * 【依存】なし（Kintone JS API のみ使用）
 * 【配置】Kintone アプリの JS カスタマイズにアップロード
 */
(function () {
    'use strict';

    // ========== 設定 ==========
    const CONFIG = {
        // コピー元サブテーブル
        SOURCE_SUBTABLE: '発注内容_テーブル',
        // コピー先サブテーブル
        TARGET_SUBTABLE: '部分検収_テーブル',

        // フィールドマッピング  { コピー元フィールドコード: コピー先フィールドコード }
        FIELD_MAPPING: {
            '明細名': '明細名_検収テーブル',
            '金額_テーブル': '金額_検収'
        },

        // コピー先サブテーブル内の追加フィールド（マッピング対象外だが空値で初期化が必要）
        // { フィールドコード: { type: Kintoneフィールドタイプ, value: 初期値 } }
        EXTRA_FIELDS: {
            '検収日':       { type: 'DATE',       value: null },
            '部分検収':     { type: 'CHECK_BOX',  value: [] },
            '検収額計算':   { type: 'CALC',       value: '' }
        },

        // ボタン配置先スペースフィールドの要素ID
        SPACE_ELEMENT_ID: 'tblCopy_oder-inspection',

        // ボタン設定
        BUTTON_ID: 'copy_to_inspection_button',
        BUTTON_LABEL: '発注内容 → 部分検収へコピー',

        // true: コピー先に既存行がある場合、末尾に追記する
        // false: コピー先を上書き（クリアしてからコピー）
        APPEND_MODE: false,

        // true: コピー前に確認ダイアログを表示
        CONFIRM_BEFORE_COPY: true,

        // サブテーブルコピー時に同時コピーするスカラーフィールド
        // { コピー元フィールドコード: コピー先フィールドコード }
        SCALAR_FIELD_COPY: {
            '承認者1_発注時': '検収担当者'
        },

        // プロセスアクション名（この名前で実行された時に自動コピー）
        PROCESS_ACTIONS: [
            'G番登録完了⇨発注完了',
            'G番不要⇨発注完了'
        ],

        // 詳細画面表示時の自動コピー対象ステータス
        // このステータス以降で部分検収テーブルが空なら自動コピーする
        AUTO_COPY_STATUSES: [
            '14.発注完了'
        ]
    };

    // ========== コピーロジック（共通） ==========
    function buildCopiedRows(record) {
        var sourceRows = record[CONFIG.SOURCE_SUBTABLE].value;
        if (!sourceRows || sourceRows.length === 0) {
            return null;
        }
        return sourceRows.map(function (srcRow, idx) {
            var row = { value: {} };
            Object.keys(CONFIG.FIELD_MAPPING).forEach(function (srcField) {
                var dstField = CONFIG.FIELD_MAPPING[srcField];
                var srcCell = srcRow.value[srcField];
                if (srcCell && srcCell.value !== undefined) {
                    row.value[dstField] = {
                        type: srcCell.type,
                        value: srcCell.value === null ? '' : srcCell.value
                    };
                } else {
                    console.warn('[copy_to_inspection] 行[' + idx + ']: "' + srcField + '" が見つかりません。');
                    row.value[dstField] = { type: 'SINGLE_LINE_TEXT', value: '' };
                }
            });
            if (CONFIG.EXTRA_FIELDS) {
                Object.keys(CONFIG.EXTRA_FIELDS).forEach(function (fieldCode) {
                    var def = CONFIG.EXTRA_FIELDS[fieldCode];
                    row.value[fieldCode] = { type: def.type, value: def.value };
                });
            }
            return row;
        });
    }

    // ========== スカラーフィールドコピー（共通） ==========
    function copyScalarFields(record) {
        if (!CONFIG.SCALAR_FIELD_COPY) return;
        Object.keys(CONFIG.SCALAR_FIELD_COPY).forEach(function (srcField) {
            var dstField = CONFIG.SCALAR_FIELD_COPY[srcField];
            var srcVal = record[srcField];
            if (srcVal && srcVal.value != null) {
                record[dstField].value = srcVal.value;
                console.log('[copy_to_inspection] "' + srcField + '" → "' + dstField + '" をコピーしました。');
            } else {
                console.warn('[copy_to_inspection] "' + srcField + '" の値が見つかりません。スキップします。');
            }
        });
    }

    // ========== プロセスアクションイベント ==========
    kintone.events.on(
        ['app.record.detail.process.proceed'],
        function (event) {
            var action = event.action.value;
            if (CONFIG.PROCESS_ACTIONS.indexOf(action) < 0) {
                return event;
            }

            var record = event.record;
            var newRows = buildCopiedRows(record);
            if (!newRows || newRows.length === 0) {
                console.log('[copy_to_inspection] プロセスアクション "' + action + '": コピー元が空のためスキップ');
                return event;
            }

            if (CONFIG.APPEND_MODE) {
                var existing = record[CONFIG.TARGET_SUBTABLE].value || [];
                record[CONFIG.TARGET_SUBTABLE].value = existing.concat(newRows);
            } else {
                record[CONFIG.TARGET_SUBTABLE].value = newRows;
            }

            // スカラーフィールドコピー
            copyScalarFields(record);

            console.log('[copy_to_inspection] プロセスアクション "' + action + '": ' + newRows.length + '件をコピーしました。');
            return event;
        }
    );

    // ========== ボタン イベント登録 ==========
    kintone.events.on(
        ['app.record.edit.show'],
        function (event) {
            if (document.getElementById(CONFIG.BUTTON_ID)) {
                return event;
            }

            var button = document.createElement('button');
            button.id = CONFIG.BUTTON_ID;
            button.innerText = CONFIG.BUTTON_LABEL;
            button.style.cssText =
                'padding: 10px 20px; background-color: #3498db; color: #fff; ' +
                'border: none; border-radius: 6px; font-weight: bold; font-size: 14px; ' +
                'cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2); ' +
                'transition: background-color 0.3s;';
            button.addEventListener('mouseenter', function () {
                button.style.backgroundColor = '#2980b9';
            });
            button.addEventListener('mouseleave', function () {
                button.style.backgroundColor = '#3498db';
            });
            button.addEventListener('click', function (e) {
                e.preventDefault();
                copySubtableRows();
            });

            // ボタン配置: 複数のフォールバックを用意
            var placed = false;

            // 1. スペースフィールドに配置（推奨）
            if (CONFIG.SPACE_ELEMENT_ID) {
                try {
                    var spaceEl = kintone.app.record.getSpaceElement(CONFIG.SPACE_ELEMENT_ID);
                    if (spaceEl) {
                        spaceEl.appendChild(button);
                        placed = true;
                        console.log('[copy_to_inspection] ボタンをスペース "' + CONFIG.SPACE_ELEMENT_ID + '" に配置しました。');
                    }
                } catch (e0) {
                    console.warn('[copy_to_inspection] getSpaceElement失敗:', e0);
                }
            }

            // 2. ヘッダーメニュースペースを試行
            if (!placed) {
                try {
                    var headerSpace = kintone.app.record.getHeaderMenuSpaceElement();
                    if (headerSpace) {
                        headerSpace.appendChild(button);
                        placed = true;
                        console.log('[copy_to_inspection] ボタンをヘッダーメニューに配置しました。');
                    }
                } catch (e1) {
                    console.warn('[copy_to_inspection] getHeaderMenuSpaceElement失敗:', e1);
                }
            }

            // 3. 最終フォールバック: body末尾にfloating配置
            if (!placed) {
                button.style.cssText += 'position: fixed; top: 12px; right: 200px; z-index: 10000;';
                document.body.appendChild(button);
                console.log('[copy_to_inspection] ボタンをfloating配置しました。');
            }

            return event;
        }
    );

    // ========== ボタン用コピー処理 ==========
    function copySubtableRows() {
        var currentRecord = kintone.app.record.get();
        var sourceRows = currentRecord.record[CONFIG.SOURCE_SUBTABLE].value;

        if (!sourceRows || sourceRows.length === 0) {
            alert('「' + CONFIG.SOURCE_SUBTABLE + '」にデータがありません。');
            return;
        }

        if (CONFIG.CONFIRM_BEFORE_COPY) {
            var msg = sourceRows.length + '件の行を「' + CONFIG.TARGET_SUBTABLE + '」にコピーします。';
            if (!CONFIG.APPEND_MODE) {
                msg += '\n※ コピー先の既存データは上書きされます。';
            }
            if (!confirm(msg)) {
                return;
            }
        }

        var newRows = buildCopiedRows(currentRecord.record);
        if (!newRows) {
            alert('「' + CONFIG.SOURCE_SUBTABLE + '」にデータがありません。');
            return;
        }

        if (CONFIG.APPEND_MODE) {
            var existing = currentRecord.record[CONFIG.TARGET_SUBTABLE].value || [];
            currentRecord.record[CONFIG.TARGET_SUBTABLE].value = existing.concat(newRows);
        } else {
            currentRecord.record[CONFIG.TARGET_SUBTABLE].value = newRows;
        }

        // スカラーフィールドコピー
        copyScalarFields(currentRecord.record);

        try {
            kintone.app.record.set(currentRecord);
            console.log('[copy_to_inspection] ' + newRows.length + '件をコピーしました。');
            alert(newRows.length + '件を「' + CONFIG.TARGET_SUBTABLE + '」にコピーしました。');
        } catch (e) {
            console.error('[copy_to_inspection] レコード設定エラー:', e);
            console.log('[copy_to_inspection] 設定しようとしたデータ:', JSON.stringify(newRows, null, 2));
            alert('サブテーブルへの設定中にエラーが発生しました。\nコンソールを確認してください。\n' + e.message);
        }
    }

    // ========== 詳細画面表示時の自動コピー（REST API） ==========
    // API経由でステータスが変わった場合の補完
    kintone.events.on(
        ['app.record.detail.show'],
        function (event) {
            var record = event.record;
            var status = record['ステータス'] ? record['ステータス'].value : '';

            // 対象ステータスかチェック
            if (CONFIG.AUTO_COPY_STATUSES.indexOf(status) < 0) {
                return event;
            }

            // 無限リロード防止: sessionStorage で同一レコードの自動コピー済み判定
            var recordId = String(record['$id'].value);
            var autoCopyKey = 'copy_to_inspection_done_' + kintone.app.getId() + '_' + recordId;
            if (sessionStorage.getItem(autoCopyKey)) {
                console.log('[copy_to_inspection] 自動コピー済みフラグあり（sessionStorage）。スキップ');
                return event;
            }

            // コピー先テーブルが既に埋まっているなら何もしない
            // 行が1つでも存在すればコピー済みとみなす（フィールド値の有無に依存しない）
            var targetRows = record[CONFIG.TARGET_SUBTABLE] ? record[CONFIG.TARGET_SUBTABLE].value : [];
            var hasData = targetRows.length > 0 && targetRows.some(function (row) {
                // いずれかのマッピング先フィールドに値があればデータありとみなす
                return Object.keys(CONFIG.FIELD_MAPPING).some(function (srcField) {
                    var dstField = CONFIG.FIELD_MAPPING[srcField];
                    var cell = row.value[dstField];
                    return cell && cell.value != null && cell.value !== '';
                });
            });
            // 行が存在する場合はフィールド値が空でもコピー済みとみなす（空明細の無限ループ防止）
            if (hasData || targetRows.length > 0) {
                console.log('[copy_to_inspection] 部分検収テーブルにデータ済み（' + targetRows.length + '行）。自動コピーをスキップ');
                return event;
            }

            // コピー元にデータがあるかチェック
            var newRows = buildCopiedRows(record);
            if (!newRows || newRows.length === 0) {
                console.log('[copy_to_inspection] コピー元が空のため自動コピーをスキップ');
                return event;
            }

            // REST API でコピー先テーブルを更新
            console.log('[copy_to_inspection] 自動コピー開始: ステータス="' + status + '", ' + newRows.length + '件');

            // API用に行データを整形（typeフィールドを除去、CALCフィールドを除外）
            var calcFields = Object.keys(CONFIG.EXTRA_FIELDS || {}).filter(function (k) {
                return CONFIG.EXTRA_FIELDS[k].type === 'CALC';
            });
            var apiRows = newRows.map(function (row) {
                var val = {};
                Object.keys(row.value).forEach(function (key) {
                    // 計算フィールドはAPI更新不可のため除外
                    if (calcFields.indexOf(key) >= 0) return;
                    val[key] = { value: row.value[key].value };
                });
                return { value: val };
            });

            var updateBody = {
                app: kintone.app.getId(),
                id: kintone.app.record.getId(),
                record: {}
            };
            updateBody.record[CONFIG.TARGET_SUBTABLE] = { value: apiRows };

            // スカラーフィールドコピー（REST API用）
            if (CONFIG.SCALAR_FIELD_COPY) {
                Object.keys(CONFIG.SCALAR_FIELD_COPY).forEach(function (srcField) {
                    var dstField = CONFIG.SCALAR_FIELD_COPY[srcField];
                    var srcVal = record[srcField];
                    if (srcVal && srcVal.value != null) {
                        updateBody.record[dstField] = { value: srcVal.value };
                        console.log('[copy_to_inspection] REST API: "' + srcField + '" → "' + dstField + '"');
                    }
                });
            }

            kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', updateBody)
                .then(function () {
                    console.log('[copy_to_inspection] REST API自動コピー完了。ページをリロードします。');
                    // リロード前にフラグを立てて無限ループを防止
                    sessionStorage.setItem(autoCopyKey, '1');
                    location.reload();
                })
                .catch(function (err) {
                    console.error('[copy_to_inspection] REST API自動コピーエラー:', err);
                    // エラー時もフラグを立ててリトライループを防止
                    sessionStorage.setItem(autoCopyKey, 'error');
                });

            return event;
        }
    );
})();
