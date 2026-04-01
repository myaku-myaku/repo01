(function() {
  'use strict';

  /**
   * サブテーブル → 文字列（複数行）フィールド コピースクリプト
   *
   * サブテーブル "status_history" の内容をタブ区切りテキストに変換し、
   * 文字列（複数行）フィールド "statusTexline" に自動セットします。
   *
   * 対象イベント:
   *   - レコード作成・編集画面の表示時
   *   - サブテーブル行の追加・削除・変更時
   *   - 保存前（最終同期）
   */

  // =============================================
  // ★ 設定 (CONFIG)
  // =============================================
  var CONFIG = {
    // サブテーブルのフィールドコード
    SUBTABLE_FIELD: 'status_history',

    // サブテーブル内の対象フィールドコード（表示順）
    TARGET_FIELDS: ['datetime_sh', 'status_sh', 'user_sh'],

    // ヘッダー行の表示名（TARGET_FIELDS と同じ順番）
    HEADER_NAMES: ['日時', 'ステータス', 'ユーザー'],

    // ヘッダー行を含めるか
    INCLUDE_HEADER: true,

    // コピー先の文字列（複数行）フィールドコード
    DEST_FIELD: 'statusTexline',

    // 列の区切り文字
    SEPARATOR: '\t',

    // 行の区切り文字
    ROW_SEPARATOR: '\n'
  };

  // =============================================
  // 変換関数
  // =============================================

  /**
   * サブテーブルの内容をテキストに変換する
   * @param {Object} record - kintone レコードオブジェクト
   * @returns {string} タブ区切りテキスト
   */
  /**
   * UTC の ISO 8601 文字列を JST の "YYYY-MM-DD HH:mm" に変換する
   * @param {string} isoStr - 例: "2026-02-25T02:46:50.827Z"
   * @returns {string} 例: "2026-02-25 11:46"
   */
  function formatDatetimeJST(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr; // パース失敗時はそのまま返す
    // UTC → JST (+9h)
    var jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    var yyyy = jst.getUTCFullYear();
    var mm   = ('0' + (jst.getUTCMonth() + 1)).slice(-2);
    var dd   = ('0' + jst.getUTCDate()).slice(-2);
    var hh   = ('0' + jst.getUTCHours()).slice(-2);
    var mi   = ('0' + jst.getUTCMinutes()).slice(-2);
    return yyyy + '-' + mm + '-' + dd + ' ' + hh + ':' + mi;
  }

  /**
   * セルの値を取得する（型に応じて変換）
   */
  function getCellValue(field) {
    if (!field || field.value === undefined || field.value === null) {
      return '';
    }
    if (field.type === 'DATETIME') {
      return formatDatetimeJST(field.value);
    }
    if (field.type === 'USER_SELECT' || field.type === 'ORGANIZATION_SELECT') {
      if (Array.isArray(field.value)) {
        return field.value.map(function(u) { return u.name || u.code; }).join('; ');
      }
    }
    if (field.type === 'CHECK_BOX' || field.type === 'MULTI_SELECT') {
      if (Array.isArray(field.value)) {
        return field.value.join('; ');
      }
    }
    return String(field.value || '');
  }

  /**
   * 文字列の表示幅を計算する（全角=2, 半角=1）
   */
  function strWidth(str) {
    var w = 0;
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      // 全角文字の範囲（CJK、全角記号など）
      if ((code >= 0x3000 && code <= 0x9FFF) ||  // CJK
          (code >= 0xF900 && code <= 0xFAFF) ||  // CJK互換
          (code >= 0xFF01 && code <= 0xFF60) ||  // 全角英数
          (code >= 0xFFE0 && code <= 0xFFE6) ||  // 全角記号
          (code >= 0xAC00 && code <= 0xD7AF)) {  // ハングル
        w += 2;
      } else {
        w += 1;
      }
    }
    return w;
  }

  /**
   * 文字列を指定幅まで半角スペースでパディングする
   */
  function padEnd(str, targetWidth) {
    var currentWidth = strWidth(str);
    var padding = targetWidth - currentWidth;
    if (padding <= 0) return str;
    var spaces = '';
    for (var i = 0; i < padding; i++) {
      spaces += ' ';
    }
    return str + spaces;
  }

  function subtableToText(record) {
    var subtable = record[CONFIG.SUBTABLE_FIELD];
    if (!subtable || !subtable.value || subtable.value.length === 0) {
      return '';
    }

    // 全行のセル値を先に取得
    var allRows = subtable.value.map(function(row) {
      return CONFIG.TARGET_FIELDS.map(function(fieldCode) {
        return getCellValue(row.value[fieldCode]);
      });
    });

    // 各列の最大幅を計算（ヘッダーも考慮）
    var colWidths = CONFIG.TARGET_FIELDS.map(function(_, colIdx) {
      var maxW = CONFIG.INCLUDE_HEADER ? strWidth(CONFIG.HEADER_NAMES[colIdx]) : 0;
      allRows.forEach(function(row) {
        var w = strWidth(row[colIdx]);
        if (w > maxW) maxW = w;
      });
      return maxW;
    });

    var lines = [];

    // ヘッダー行
    if (CONFIG.INCLUDE_HEADER) {
      lines.push(CONFIG.HEADER_NAMES.join(CONFIG.SEPARATOR));
    }

    // データ行
    allRows.forEach(function(row) {
      lines.push(row.join(CONFIG.SEPARATOR));
    });

    return lines.join(CONFIG.ROW_SEPARATOR);
  }

  /**
   * サブテーブルの内容をコピー先フィールドに同期する
   */
  function syncToTextField() {
    var obj = kintone.app.record.get();
    var text = subtableToText(obj.record);
    obj.record[CONFIG.DEST_FIELD].value = text;
    kintone.app.record.set(obj);
    console.log('[subtable→text] 同期完了 (' + (obj.record[CONFIG.SUBTABLE_FIELD].value || []).length + ' 行)');
  }

  // =============================================
  // イベント登録
  // =============================================

  // 作成・編集画面の表示時に初回同期
  kintone.events.on([
    'app.record.create.show',
    'app.record.edit.show'
  ], function(event) {
    var text = subtableToText(event.record);
    event.record[CONFIG.DEST_FIELD].value = text;
    console.log('[subtable→text] 画面表示時に同期');
    return event;
  });

  // サブテーブル行の追加・削除時
  kintone.events.on([
    'app.record.create.change.' + CONFIG.SUBTABLE_FIELD,
    'app.record.edit.change.' + CONFIG.SUBTABLE_FIELD
  ], function(event) {
    var text = subtableToText(event.record);
    event.record[CONFIG.DEST_FIELD].value = text;
    console.log('[subtable→text] テーブル変更で同期');
    return event;
  });

  // サブテーブル内フィールドの変更時
  CONFIG.TARGET_FIELDS.forEach(function(fieldCode) {
    kintone.events.on([
      'app.record.create.change.' + fieldCode,
      'app.record.edit.change.' + fieldCode
    ], function(event) {
      var text = subtableToText(event.record);
      event.record[CONFIG.DEST_FIELD].value = text;
      console.log('[subtable→text] フィールド "' + fieldCode + '" 変更で同期');
      return event;
    });
  });

  // 保存前に最終同期（確実にデータを反映）
  kintone.events.on([
    'app.record.create.submit',
    'app.record.edit.submit'
  ], function(event) {
    var text = subtableToText(event.record);
    event.record[CONFIG.DEST_FIELD].value = text;
    console.log('[subtable→text] 保存前に最終同期');
    return event;
  });

  // プロセス管理のアクション実行時に同期
  kintone.events.on('app.record.detail.process.proceed', function(event) {
    var text = subtableToText(event.record);
    event.record[CONFIG.DEST_FIELD].value = text;
    console.log('[subtable→text] プロセスアクション実行時に同期');
    return event;
  });

  console.log('[INIT] subtable→text 同期スクリプト読み込み完了');
})();
