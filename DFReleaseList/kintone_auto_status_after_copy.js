(function() {
  'use strict';

  /**
   * プラグインコピー完了後 → コピー先アプリのステータス自動更新スクリプト
   *
   * 解約リストアプリ（コピー元）に設置。
   * プラグインがレコードを解約管理アプリ（コピー先）にコピーした後、
   * コピー先レコードのステータスを自動で「F課に依頼する」アクションで進めます。
   *
   * 動作フロー:
   *   1. kintone_trigger_plugin.js がプラグインボタンを自動クリック
   *   2. 本スクリプトがコピー完了をポーリングで検知
   *   3. コピー先レコードのステータスを API で更新
   *
   * 使い方:
   *   1. kintone_trigger_plugin.js と一緒に解約リストアプリに登録
   *   2. kintone_trigger_plugin.js より後に読み込まれるよう順序を設定
   */

  // =============================================
  // ★ 設定 (CONFIG)
  // =============================================
  var CONFIG = {
    // コピー先アプリ（解約管理アプリ）のID
    TARGET_APP_ID: 421,

    // コピー先で元レコードを特定するフィールドコード
    // コピー元のレコード番号が入るフィールド
    LINK_FIELD: 'ListRecordNo',

    // コピー先で実行するアクション名（プロセス管理のボタン名）
    ACTION_NAME: 'F課に依頼する',

    // ポーリング間隔（ミリ秒）
    POLL_INTERVAL: 2000,

    // ポーリング最大回数（超えたらタイムアウト）
    POLL_MAX_ATTEMPTS: 15,

    // プラグインボタンクリック後、ポーリング開始までの待機（ミリ秒）
    INITIAL_DELAY: 2000,

    // トリガーとなるステータス遷移（kintone_trigger_plugin.js と合わせる）
    TRIGGER_FROM_STATUS: 'チェック完了',
    TRIGGER_TO_STATUS: '申請依頼完了',

    // --- 文書管理番号の自動採番 ---
    // コピー先の文書管理番号フィールドコード（空文字なら採番しない）
    DOC_NUMBER_FIELD: '文書管理番号',
    // プレフィックス
    DOC_PREFIX: 'BB',
    // レコード番号のゼロ埋め桁数
    DOC_SEQ_DIGITS: 6
  };

  // =============================================
  // 関数
  // =============================================

  /**
   * コピー先アプリでレコードを検索する
   * @param {string} sourceRecordId - コピー元のレコード番号
   * @returns {Promise<Object|null>} 見つかったレコード or null
   */
  function findTargetRecord(sourceRecordId) {
    var query = CONFIG.LINK_FIELD + ' = "' + sourceRecordId + '" order by $id desc limit 1';

    return kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
      app: CONFIG.TARGET_APP_ID,
      query: query,
      fields: ['$id', 'ステータス', CONFIG.LINK_FIELD, '作成日時', CONFIG.DOC_NUMBER_FIELD]
    }).then(function(resp) {
      if (resp.records.length > 0) {
        return resp.records[0];
      }
      return null;
    });
  }

  /**
   * 文書管理番号を生成する
   * @param {string} createdTime - ISO 8601 作成日時
   * @param {string|number} recordId - レコード番号
   * @returns {string} 例: "BB260226-000042"
   */
  function buildDocNumber(createdTime, recordId) {
    var d = new Date(createdTime);
    var jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    var yy = String(jst.getUTCFullYear()).slice(-2);
    var mm = ('0' + (jst.getUTCMonth() + 1)).slice(-2);
    var dd = ('0' + jst.getUTCDate()).slice(-2);
    var seq = String(recordId);
    while (seq.length < CONFIG.DOC_SEQ_DIGITS) seq = '0' + seq;
    return CONFIG.DOC_PREFIX + yy + mm + dd + '-' + seq;
  }

  /**
   * コピー先レコードに文書管理番号を書き込む（未採番の場合のみ）
   * @param {Object} record - 検索で取得したレコード
   * @returns {Promise}
   */
  function assignDocNumber(record) {
    if (!CONFIG.DOC_NUMBER_FIELD) {
      return Promise.resolve();
    }
    // 既に番号が入っていればスキップ
    var existing = record[CONFIG.DOC_NUMBER_FIELD] ? record[CONFIG.DOC_NUMBER_FIELD].value : '';
    if (existing) {
      console.log('[auto-status] 文書管理番号は既に採番済み:', existing);
      return Promise.resolve();
    }

    var targetId = record.$id.value;
    var createdTime = record['作成日時'] ? record['作成日時'].value : new Date().toISOString();
    var docNumber = buildDocNumber(createdTime, targetId);

    console.log('[auto-status] 文書管理番号を採番:', docNumber);
    var updateRecord = {};
    updateRecord[CONFIG.DOC_NUMBER_FIELD] = { value: docNumber };

    return kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', {
      app: CONFIG.TARGET_APP_ID,
      id: targetId,
      record: updateRecord
    }).then(function() {
      console.log('[auto-status] 文書管理番号の書き込み完了:', docNumber);
    });
  }

  /**
   * コピー先レコードのステータスを進める
   * @param {string} recordId - コピー先のレコードID
   * @returns {Promise}
   */
  function advanceTargetStatus(recordId) {
    return kintone.api(kintone.api.url('/k/v1/record/status', true), 'PUT', {
      app: CONFIG.TARGET_APP_ID,
      id: recordId,
      action: CONFIG.ACTION_NAME
    });
  }

  /**
   * コピー先のレコード作成をポーリングで待ち、ステータスを進める
   * @param {string} sourceRecordId - コピー元のレコード番号
   */
  function pollAndAdvance(sourceRecordId) {
    var attempts = 0;

    console.log('[auto-status] コピー先レコードのポーリング開始 (元レコード: ' + sourceRecordId + ')');

    function poll() {
      attempts++;
      console.log('[auto-status] ポーリング ' + attempts + '/' + CONFIG.POLL_MAX_ATTEMPTS);

      findTargetRecord(sourceRecordId)
        .then(function(record) {
          if (!record) {
            // まだ見つからない → 再試行
            if (attempts < CONFIG.POLL_MAX_ATTEMPTS) {
              setTimeout(poll, CONFIG.POLL_INTERVAL);
            } else {
              console.warn('[auto-status] タイムアウト: コピー先レコードが見つかりませんでした');
            }
            return;
          }

          var targetId = record.$id.value;
          var currentStatus = record['ステータス'] ? record['ステータス'].value : '';
          console.log('[auto-status] コピー先レコード発見: ID=' + targetId + ', ステータス=' + currentStatus);

          // 文書管理番号を採番してからステータスを進める
          assignDocNumber(record)
            .then(function() {
              return advanceTargetStatus(targetId);
            })
            .then(function() {
              console.log('[auto-status] ステータス更新成功: アクション「' + CONFIG.ACTION_NAME + '」を実行しました');
            })
            .catch(function(err) {
              console.error('[auto-status] ステータス更新エラー:', err);
              var msg = err.message || JSON.stringify(err);
              if (msg.indexOf('指定されたアクション') > -1) {
                console.warn('[auto-status] アクション実行不可（既に進行済みの可能性）');
              }
            });
        })
        .catch(function(err) {
          console.error('[auto-status] 検索エラー:', err);
          if (attempts < CONFIG.POLL_MAX_ATTEMPTS) {
            setTimeout(poll, CONFIG.POLL_INTERVAL);
          }
        });
    }

    // 初回ポーリング開始
    setTimeout(poll, CONFIG.INITIAL_DELAY);
  }

  // =============================================
  // イベント登録
  // =============================================

  /**
   * ステータス変更時 — プラグインコピーのトリガーと同じ遷移を検知
   */
  kintone.events.on('app.record.detail.process.proceed', function(event) {
    var currentStatus = event.status.value;
    var nextStatus = event.nextStatus.value;

    if (currentStatus !== CONFIG.TRIGGER_FROM_STATUS || nextStatus !== CONFIG.TRIGGER_TO_STATUS) {
      return event;
    }

    var sourceRecordId = String(event.record.$id.value);
    console.log('[auto-status] ステータス遷移検知: ' + currentStatus + ' → ' + nextStatus);
    console.log('[auto-status] コピー元レコード番号: ' + sourceRecordId);

    // sessionStorage にフラグを保存（リロード後にポーリング開始）
    sessionStorage.setItem('autoStatusSourceId', sourceRecordId);

    return event;
  });

  /**
   * 詳細画面表示時 — フラグがあればポーリング開始
   */
  kintone.events.on('app.record.detail.show', function(event) {
    var sourceRecordId = sessionStorage.getItem('autoStatusSourceId');
    if (sourceRecordId) {
      sessionStorage.removeItem('autoStatusSourceId');
      console.log('[auto-status] リロード後、ポーリングを開始します');

      // kintone_trigger_plugin.js のプラグインボタンクリック後に実行されるよう
      // 十分な待機時間を設ける
      setTimeout(function() {
        pollAndAdvance(sourceRecordId);
      }, CONFIG.INITIAL_DELAY);
    }

    return event;
  });

  console.log('[INIT] コピー先ステータス自動更新スクリプト読み込み完了');
})();
