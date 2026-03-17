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
    // ヘルパー: サブテーブルの指定フィールド列を非表示にする
    // =========================================================
    function hideSubtableColumn(subtableCode, fieldCode) {
        // サブテーブルのDOM要素を探す
        var tables = document.querySelectorAll('.subtable-gaia');
        tables.forEach(function (table) {
            var headerCells = table.querySelectorAll('thead th, tr.subtable-header-gaia th');
            var colIndex = -1;

            // ヘッダーからフィールドコードに一致する列を特定
            headerCells.forEach(function (th, idx) {
                // Kintoneはヘッダーセル内のspan等にフィールドラベルを表示する
                var text = (th.textContent || '').trim();
                if (text === fieldCode || text.indexOf(fieldCode) >= 0) {
                    colIndex = idx;
                }
            });

            if (colIndex < 0) {
                console.log('[orderflow-utils] サブテーブル列 "' + fieldCode + '" が見つかりませんでした');
                return;
            }

            // CSSでn番目の列を非表示（nth-childは1始まり）
            var styleId = 'hide-col-' + fieldCode;
            var existing = document.getElementById(styleId);
            if (existing) existing.remove();

            var style = document.createElement('style');
            style.id = styleId;
            // サブテーブル内の該当列のth/tdを非表示
            var nthCol = colIndex + 1;
            style.textContent =
                '.subtable-gaia thead th:nth-child(' + nthCol + '),' +
                '.subtable-gaia tbody td:nth-child(' + nthCol + ')' +
                '{ display: none !important; }';
            document.head.appendChild(style);
            console.log('[orderflow-utils] サブテーブル列 "' + fieldCode + '" (列' + nthCol + ') を非表示にしました');
        });
    }

})();
