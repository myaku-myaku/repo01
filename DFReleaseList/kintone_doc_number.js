(function() {
  'use strict';

  /**
   * 文書管理番号 自動採番スクリプト（レコード番号ベース）
   *
   * フォーマット: BB + YYMMDD(作成日) + "-" + ゼロ埋め4桁レコード番号
   * 例: BB260226-0001, BB260226-0042, ...
   *
   * 採番ロジック:
   *   レコード保存成功後に $id（レコード番号）を使って番号を生成し、
   *   PUT で書き込む。$id は一意かつ不変なので重複なし。
   *
   * 使い方:
   *   1. CONFIG を対象アプリに合わせて変更
   *   2. Kintone アプリの「JavaScript/CSS でカスタマイズ」に登録
   *
   * 注意:
   *   - レコード番号は Kintone が自動採番するため重複しない
   *   - 一度採番された番号は変更されない
   */

  // =============================================
  // ★ 設定 (CONFIG) — アプリに合わせて変更してください
  // =============================================
  var CONFIG = {
    // 文書管理番号のフィールドコード
    DOC_NUMBER_FIELD: '文書管理番号',

    // プレフィックス（固定文字列）
    PREFIX: 'BB',

    // レコード番号部分の桁数
    SEQ_DIGITS: 6
  };

  // =============================================
  // ヘルパー関数
  // =============================================

  /**
   * レコードの作成日時から YYMMDD を生成する（JST）
   * @param {string} createdTime - ISO 8601 形式の作成日時
   * @returns {string} 例: "260226"
   */
  function formatDatePart(createdTime) {
    var d = new Date(createdTime);
    // JST = UTC + 9h
    var jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    var yy = String(jst.getUTCFullYear()).slice(-2);
    var mm = ('0' + (jst.getUTCMonth() + 1)).slice(-2);
    var dd = ('0' + jst.getUTCDate()).slice(-2);
    return yy + mm + dd;
  }

  /**
   * 数値をゼロ埋めする
   * @param {number|string} num
   * @returns {string} 例: "0042"
   */
  function zeroPad(num) {
    var s = String(num);
    while (s.length < CONFIG.SEQ_DIGITS) {
      s = '0' + s;
    }
    return s;
  }

  /**
   * 文書管理番号を生成する
   * @param {string} createdTime - レコード作成日時
   * @param {string|number} recordId - レコード番号 ($id)
   * @returns {string} 例: "BB260226-0042"
   */
  function buildDocNumber(createdTime, recordId) {
    var datePart = formatDatePart(createdTime);
    return CONFIG.PREFIX + datePart + '-' + zeroPad(recordId);
  }

  // =============================================
  // イベント登録
  // =============================================

  // レコード作成 保存成功後 — $id 確定後に採番して PUT
  kintone.events.on('app.record.create.submit.success', function(event) {
    var record = event.record;
    var recordId = record.$id.value;
    var createdTime = record['作成日時'].value;
    var docNumber = buildDocNumber(createdTime, recordId);

    console.log('[採番] レコード #' + recordId + ' → ' + docNumber);

    var appId = kintone.app.getId();
    return kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', {
      app: appId,
      id: recordId,
      record: {
        [CONFIG.DOC_NUMBER_FIELD]: { value: docNumber }
      }
    }).then(function() {
      console.log('[採番] 書き込み完了:', docNumber);
      return event;
    }).catch(function(err) {
      console.error('[採番] 書き込みエラー:', err);
      return event;
    });
  });

  // 画面表示時 — 文書管理番号フィールドを編集不可にする
  kintone.events.on([
    'app.record.create.show',
    'app.record.edit.show'
  ], function(event) {
    event.record[CONFIG.DOC_NUMBER_FIELD].disabled = true;
    return event;
  });

  console.log('[INIT] 文書管理番号 自動採番スクリプト読み込み完了');
})();
