/**
 * kintone_orderflow_utils.js
 *
 * 【概要】
 * [NW伝送]011_オーダーフロー アプリの汎用ユーティリティ。
 * 発注内容サブテーブルに関する小さな処理をまとめたスクリプト。
 *
 * 【機能一覧】
 * 1. フィールド非表示
 *    - 「テーブルID」「決裁種別」フィールドをレコード表示時に非表示にする。
 *    - イベント: detail.show / create.show / edit.show
 *
 * 2. テーブルID自動採番
 *    - 発注内容_テーブルの各行に連番（1, 2, 3...）を自動付与する。
 *    - イベント: create.submit / edit.submit
 *
 * 3. 案件一覧フィールド自動生成
 *    - 発注内容_テーブルの「伝票案件名」を改行区切りで「案件一覧」フィールドに連結コピーする。
 *    - イベント: create.submit / edit.submit / index.edit.submit
 *
 * 4. プロセスアクション時の承認者コピー
 *    - 確認完了→確認メール送信: 承認者1_発注時 にログインユーザーをセット
 *    - G番登録完了⇨発注完了 / G番不要⇨発注完了: 発注時承認者→支払承認者コピー
 *    - イベント: detail.process.proceed
 *
 * 5. 承認者コピー補完（RPA/API フォールバック）
 *    - RPA 等が REST API でステータスを進めた場合、process.proceed は発火しない。
 *    - 詳細画面表示時にステータス≧14 かつ承認者1_支払が空なら REST API で補完する。
 *    - イベント: detail.show
 *
 * 6. 手動承認者コピーボタン
 *    - 承認者1_発注時 → 承認者1_支払、追加承認者_発注 → 追加承認者_支払
 *    - 支払い依頼者 ← ログインユーザー名（プレフィックス除去）
 *    - スペース: Approver_manuaru_copy に配置
 *    - イベント: detail.show
 *
 * 【統合元ファイル】
 *   - subTable_Field_Disable.js  → 機能1
 *   - tableID.js                 → 機能2
 *   - tblFieldCopy.js            → 機能3
 *
 * 【依存】なし（Kintone JS API のみ使用）
 * 【配置】Kintone アプリの JS カスタマイズにアップロード
 */
(function () {
    'use strict';

    // =========================================================
    // 1. フィールド非表示（テーブルID・決裁種別）
    // =========================================================
    kintone.events.on([
        'app.record.detail.show',
        'app.record.create.show',
        'app.record.edit.show'
    ], function (event) {
        kintone.app.record.setFieldShown('テーブルID', false);
        kintone.app.record.setFieldShown('決裁種別', false);

        // サブテーブル内「検収額計算」列をJSで非表示
        setTimeout(function () {
            hideSubtableColumn('部分検収_テーブル', '検収額計算');
        }, 300);

        return event;
    });

    // =========================================================
    // 2. テーブルID自動採番（保存時）
    // =========================================================
    kintone.events.on([
        'app.record.create.submit',
        'app.record.edit.submit'
    ], function (event) {
        var record = event.record;
        var rows = record['発注内容_テーブル'].value;
        var count = rows.length;

        for (var i = 0; i < count; i++) {
            rows[i].value['テーブルID'].value = i + 1;
        }
        console.log('[orderflow-utils] テーブルID採番完了: ' + count + '行');
        return event;
    });

    // =========================================================
    // 3. 案件一覧フィールド自動生成（保存時）
    // =========================================================
    kintone.events.on([
        'app.record.create.submit',
        'app.record.edit.submit',
        'app.record.index.edit.submit'
    ], function (event) {
        var record = event.record;
        var rows = record['発注内容_テーブル'].value;
        var names = [];

        for (var i = 0; i < rows.length; i++) {
            var name = rows[i].value['伝票案件名'].value;
            if (name) {
                names.push(name);
            }
        }
        record['案件一覧'].value = names.join('\n');
        console.log('[orderflow-utils] 案件一覧更新: ' + names.length + '件');
        return event;
    });

    // =========================================================
    // 4. プロセスアクション時: 承認者フィールド書き換え
    //    ※ JSカスタマイズはプラグインより先に実行されるため、
    //      メール送信プラグインが参照する前にフィールド値を確定させる。
    //      branchprocess プラグインの同等設定(Rule 5)は無効化すること。
    // =========================================================
    kintone.events.on('app.record.detail.process.proceed', function (event) {
        var action = event.action.value;
        var record = event.record;

        // 「確認完了→確認メール送信」アクション時、承認者1_発注時 にログインユーザーをセット
        if (action === '確認完了→確認メール送信') {
            var user = kintone.getLoginUser();
            record['承認者1_発注時'].value = [{ code: user.code, name: user.name }];
            console.log('[orderflow-utils] 承認者1_発注時 にログインユーザーをセット: ' + user.name);
        }

        // 「G番登録完了⇨発注完了」「G番不要⇨発注完了」アクション時、
        // 発注時の承認者を支払い承認者にコピー
        if (action === 'G番登録完了⇨発注完了' || action === 'G番不要⇨発注完了') {
            // 承認者1_発注時 → 承認者1_支払
            if (record['承認者1_発注時'] && record['承認者1_発注時'].value) {
                record['承認者1_支払'].value = record['承認者1_発注時'].value;
                console.log('[orderflow-utils] 承認者1_発注時 → 承認者1_支払 をコピー');
            }
            // 追加承認者_発注 → 追加承認者_支払
            if (record['追加承認者_発注'] && record['追加承認者_発注'].value) {
                record['追加承認者_支払'].value = record['追加承認者_発注'].value;
                console.log('[orderflow-utils] 追加承認者_発注 → 追加承認者_支払 をコピー');
            }
        }

        return event;
    });

    // =========================================================
    // 5. 承認者コピー補完（detail.show / REST API フォールバック）
    //    RPA 等が API 経由でステータスを進めた場合、process.proceed は
    //    発火しないため、詳細画面を開いた時点で未コピーを検知して補完する。
    // =========================================================
    // =========================================================
    // 6. 手動承認者コピーボタン
    //    スペース「Approver_manuaru_copy」に配置。
    //    承認者1_発注時 → 承認者1_支払、追加承認者_発注 → 追加承認者_支払、
    //    支払い依頼者 ← ログインユーザー名 を REST API で書き込みリロード。
    // =========================================================
    var MANUAL_COPY_BTN_ID = 'approver_manual_copy_btn';

    // --- 機能5: 自動補完（detail.show のみ） ---
    kintone.events.on('app.record.detail.show', function (event) {
        var record = event.record;
        var status = record['ステータス'] ? record['ステータス'].value : '';

        // ステータス番号が 14 以上（＝「14.発注完了」以降）の場合のみ対象
        var statusNum = parseInt(status, 10);
        if (isNaN(statusNum) || statusNum < 14) {
            return event;
        }

        // 承認者1_発注時 に値があり、承認者1_支払 が空ならコピーが必要
        var src = record['承認者1_発注時'];
        var dst = record['承認者1_支払'];
        var hasSource = src && src.value && src.value.length > 0;
        var targetEmpty = !dst || !dst.value || dst.value.length === 0;

        if (!hasSource || !targetEmpty) {
            return event;
        }

        // 無限リロード防止: sessionStorage で同一レコードの補完済みを記録
        var recId = String(record['$id'].value);
        var guardKey = 'approver_copy_done_' + kintone.app.getId() + '_' + recId;
        if (sessionStorage.getItem(guardKey)) {
            console.log('[orderflow-utils] 承認者コピー補完済み（sessionStorage）。スキップ');
            return event;
        }

        // REST API でコピー
        var body = {
            app: kintone.app.getId(),
            id: recId,
            record: {
                '承認者1_支払': { value: src.value }
            }
        };

        // 追加承認者もコピー（値がある場合）
        var srcExtra = record['追加承認者_発注'];
        var dstExtra = record['追加承認者_支払'];
        var extraEmpty = !dstExtra || !dstExtra.value || dstExtra.value.length === 0;
        if (srcExtra && srcExtra.value && srcExtra.value.length > 0 && extraEmpty) {
            body.record['追加承認者_支払'] = { value: srcExtra.value };
        }

        console.log('[orderflow-utils] 承認者コピー補完開始: ステータス="' + status + '"');
        kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', body)
            .then(function () {
                console.log('[orderflow-utils] 承認者コピー補完完了。リロードします');
                sessionStorage.setItem(guardKey, '1');
                location.reload();
            })
            .catch(function (err) {
                console.error('[orderflow-utils] 承認者コピー補完エラー:', err);
                sessionStorage.setItem(guardKey, 'error');
            });

        return event;
    });

    // --- 機能6: 手動承認者コピーボタン（edit.show のみ） ---
    kintone.events.on('app.record.edit.show', function (event) {
        setTimeout(function () {
            if (document.getElementById(MANUAL_COPY_BTN_ID)) return;

            var btn = document.createElement('button');
            btn.id = MANUAL_COPY_BTN_ID;
            btn.innerText = '承認者・支払依頼者コピー';
            btn.style.cssText =
                'padding:8px 16px;background-color:#e67e22;color:#fff;' +
                'border:none;border-radius:4px;font-weight:bold;font-size:13px;cursor:pointer;';
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                manualApproverCopy();
            });

            var placed = false;
            try {
                var spaceEl = kintone.app.record.getSpaceElement('Approver_manuaru_copy');
                if (spaceEl) {
                    spaceEl.appendChild(btn);
                    placed = true;
                }
            } catch (ex) {
                console.warn('[orderflow-utils] スペース Approver_manuaru_copy が見つかりません:', ex);
            }
            // フォールバック: ヘッダーメニュー
            if (!placed) {
                try {
                    var header = kintone.app.record.getHeaderMenuSpaceElement();
                    if (header) {
                        header.appendChild(btn);
                        placed = true;
                    }
                } catch (ex2) {
                    console.warn('[orderflow-utils] ヘッダーメニューも取得失敗:', ex2);
                }
            }
            if (placed) {
                console.log('[orderflow-utils] 手動承認者コピーボタンを配置しました');
            }
        }, 500);

        return event;
    });

    /**
     * 手動承認者コピー（編集画面内で record.set() で反映）
     * - 承認者1_発注時 → 承認者1_支払
     * - 追加承認者_発注時TB → 追加承認者_支払TB（サブテーブル内ドロップダウンをコピー）
     * - 支払い依頼者 ← ログインユーザー（ユーザー選択フィールド）
     */
    function manualApproverCopy() {
        var obj = kintone.app.record.get();
        var rec = obj.record;
        var user = kintone.getLoginUser();

        var summary = [];

        // 承認者1_発注時 → 承認者1_支払
        if (rec['承認者1_発注時'] && rec['承認者1_発注時'].value && rec['承認者1_発注時'].value.length > 0) {
            rec['承認者1_支払'].value = rec['承認者1_発注時'].value;
            summary.push('承認者1_支払');
        }

        // 追加承認者_発注時TB（サブテーブル）→ 追加承認者_支払TB（サブテーブル）
        // 各行のドロップダウン「追加承認者_発注」→「追加承認者_支払」をコピー
        var srcTbl = rec['追加承認者_発注時TB'];
        var dstTbl = rec['追加承認者_支払TB'];
        console.log('[orderflow-utils] 追加承認者_発注時TB:', srcTbl ? ('rows=' + (srcTbl.value || []).length) : '未検出');
        console.log('[orderflow-utils] 追加承認者_支払TB:', dstTbl ? ('rows=' + (dstTbl.value || []).length) : '未検出');

        if (srcTbl && srcTbl.value && srcTbl.value.length > 0 && dstTbl) {
            var srcRows = srcTbl.value;
            // コピー元の値を収集（空行はスキップ）
            var valuesToCopy = [];
            for (var si = 0; si < srcRows.length; si++) {
                var srcVal = srcRows[si].value['追加承認者_発注'] ? srcRows[si].value['追加承認者_発注'].value : '';
                if (srcVal) {
                    valuesToCopy.push(srcVal);
                }
            }
            console.log('[orderflow-utils] 追加承認者コピー対象:', JSON.stringify(valuesToCopy));

            if (valuesToCopy.length > 0) {
                // 既存の支払TBの1行目をテンプレートとして全フィールド構造を取得
                var dstExisting = dstTbl.value || [];
                var dstTemplate = dstExisting.length > 0 ? dstExisting[0] : null;

                var newRows = valuesToCopy.map(function (val) {
                    var row = { value: {} };
                    // テンプレートから全フィールドをコピー（不足フィールドエラー防止）
                    if (dstTemplate) {
                        var tKeys = Object.keys(dstTemplate.value);
                        for (var t = 0; t < tKeys.length; t++) {
                            var tv = dstTemplate.value[tKeys[t]];
                            if (tv.type === 'RECORD_NUMBER' || tv.type === 'CALC') continue;
                            row.value[tKeys[t]] = { type: tv.type, value: '' };
                        }
                    }
                    // ドロップダウンフィールドに値をセット
                    row.value['追加承認者_支払'] = { type: 'DROP_DOWN', value: val };
                    return row;
                });

                console.log('[orderflow-utils] 追加承認者_支払TB 設定行数:', newRows.length);
                rec['追加承認者_支払TB'].value = newRows;
                summary.push('追加承認者_支払TB（' + valuesToCopy.length + '件）');
            }
        } else if (!srcTbl) {
            console.log('[orderflow-utils] 追加承認者_発注時TB が見つかりません');
            // デバッグ: SUBTABLEフィールド一覧を出力
            var allKeys = Object.keys(rec);
            var subtables = allKeys.filter(function (k) { return rec[k] && rec[k].type === 'SUBTABLE'; });
            console.log('[orderflow-utils] SUBTABLE一覧:', subtables.join(', '));
        } else {
            console.log('[orderflow-utils] 追加承認者_発注時TB が空のためスキップ');
        }

        // 支払い依頼者 ← ログインユーザー（ユーザー選択フィールド）
        rec['支払い依頼者'].value = [{ code: user.code, name: user.name }];
        summary.push('支払い依頼者=' + user.name);

        kintone.app.record.set(obj);
        console.log('[orderflow-utils] 手動承認者コピー完了: ' + summary.join(', '));
    }

    // =========================================================
    // ヘルパー: サブテーブルの指定フィールド列を非表示にする
    // =========================================================
    function hideSubtableColumn(subtableCode, fieldCode) {
        // 対象サブテーブルを data-field-code 属性で特定
        var tableWrapper = document.querySelector(
            '.field-' + subtableCode + ', ' +
            '[data-field-code="' + subtableCode + '"]'
        );
        if (!tableWrapper) {
            console.log('[orderflow-utils] サブテーブル "' + subtableCode + '" のDOM要素が見つかりませんでした');
            return;
        }

        var headerCells = tableWrapper.querySelectorAll('thead th, tr.subtable-header-gaia th');
        var colIndex = -1;

        // ヘッダーからフィールドコードに一致する列を特定
        headerCells.forEach(function (th, idx) {
            var text = (th.textContent || '').trim();
            if (text === fieldCode || text.indexOf(fieldCode) >= 0) {
                colIndex = idx;
            }
        });

        if (colIndex < 0) {
            console.log('[orderflow-utils] サブテーブル列 "' + fieldCode + '" が見つかりませんでした');
            return;
        }

        // 対象サブテーブル内の該当列のth/tdを直接非表示にする（他テーブルに影響しない）
        var nthCol = colIndex + 1;
        var cells = tableWrapper.querySelectorAll(
            'thead th:nth-child(' + nthCol + '), tbody td:nth-child(' + nthCol + ')'
        );
        cells.forEach(function (cell) {
            cell.style.display = 'none';
        });
        console.log('[orderflow-utils] サブテーブル "' + subtableCode + '" の列 "' + fieldCode + '" (列' + nthCol + ') を非表示にしました');
    }

})();
