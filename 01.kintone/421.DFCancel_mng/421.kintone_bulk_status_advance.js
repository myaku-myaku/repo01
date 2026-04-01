(function() {
  'use strict';

  /**
   * Kintone 一括ステータス進めスクリプト（分岐対応版）
   *
   * レコード一覧画面にボタンを追加し、現在表示中の全レコードの
   * プロセス管理ステータスを一括で次へ進めます。
   *
   * ステータスごとに異なるアクションを定義できるため、
   * 分岐するプロセス管理フローにも対応しています。
   *
   * 使い方:
   *   1. CONFIG.STATUS_ACTION_MAP にステータス→アクションのマッピングを設定
   *   2. 必要に応じて CONFIG.ASSIGNEE_FIELD_CODE を設定
   *   3. 対象 Kintone アプリの「JavaScript/CSS でカスタマイズ」に登録
   *
   * 注意:
   *   - プロセス管理が有効なアプリでのみ動作します
   *   - 現在のビュー/フィルタで表示中のレコードが対象です
   *   - STATUS_ACTION_MAP に定義されていないステータスのレコードはスキップされます
   */

  // =============================================
  // ★ 設定 (CONFIG) — アプリに合わせて変更してください
  // =============================================
  const CONFIG = {
    // ★要変更: ステータス → アクション名のマッピング
    // キー: 現在のステータス名（プロセス管理の状態名）
    // 値:   実行するアクション名（プロセス管理のアクションボタン表示名）
    //
    // 例: プロセスが以下のように分岐する場合
    //   「未処理」──(確認)──→「確認中」
    //   「確認中」──(承認)──→「承認済み」
    //   「確認中」──(差し戻し)──→「未処理」  ← こちらは一括では実行しない
    //   「承認済み」──(完了)──→「完了」
    //
    // STATUS_ACTION_MAP には一括で進めたい方向だけ定義:
    //   { '未処理': '確認', '確認中': '承認', '承認済み': '完了' }
    //
    STATUS_ACTION_MAP: {
      '01.解約依頼': '依頼受領→F課確認',
      '11.依頼受領・F課確認': 'F課確認完了→NTT申請を依頼',
      '12.確認完了・NTT申請前': 'NTT申請完了',
    //'承認済み': '完了'
    },

    // 次のアサイニー（作業者）のフィールドコード
    // 不要な場合は空文字 '' にする
    // アクションに作業者の指定が必要な場合のみ設定
    // ステータスごとに分けたい場合は ASSIGNEE_MAP を使用
    ASSIGNEE_FIELD_CODE: '',

    // ステータスごとのアサイニーフィールドコード（任意）
    // 特定のステータスだけアサイニー指定が必要な場合に使う
    // 例: { '確認中': 'approver_field' }
    // 空オブジェクト {} なら ASSIGNEE_FIELD_CODE がフォールバックで使われる
    ASSIGNEE_MAP: {},

    // ボタンのラベル
    BUTTON_LABEL: '一括ステータス更新',

    // ボタンの色（CSS）
    BUTTON_COLOR: '#e74c3c',

    // 確認ダイアログを表示するか
    SHOW_CONFIRM: true,

    // 一度の API リクエストで処理するレコード数（上限 100）
    BATCH_SIZE: 100,

    // API リクエスト間のディレイ（ミリ秒）— レート制限対策
    BATCH_DELAY_MS: 500,

    // ボタンID（重複防止）
    BUTTON_ID: 'bulk_status_advance_button',

    // 進捗表示用のスパンID
    PROGRESS_ID: 'bulk_status_advance_progress'
  };

  // =============================================
  // ヘルパー関数
  // =============================================

  /**
   * 指定ミリ秒のディレイを返す Promise
   */
  function delay(ms) {
    return new Promise(function(resolve) {
      setTimeout(resolve, ms);
    });
  }

  /**
   * 現在の一覧の絞り込み条件で全レコードを取得（カーソル API 使用）
   * @returns {Promise<Array>} レコード配列
   */
  function fetchAllDisplayedRecords() {
    var appId = kintone.app.getId();
    var query = kintone.app.getQueryCondition();
    // getQueryCondition() は limit/offset/order なしの条件部分のみ返す
    console.log('[INFO] 取得クエリ条件:', query || '(なし — 全レコード)');

    // カーソルを作成して全件取得
    var body = {
      app: appId,
      fields: ['$id', 'ステータス'],
      size: 500
    };
    if (query) {
      body.query = query;
    }

    return kintone.api(kintone.api.url('/k/v1/cursor', true), 'POST', body)
      .then(function(resp) {
        var cursorId = resp.id;
        return fetchCursorRecords(cursorId, []);
      })
      .catch(function(err) {
        // カーソル API が使えない場合はフォールバック
        console.warn('[WARN] カーソル API 失敗、通常取得にフォールバック:', err);
        return fetchRecordsPaginated(appId, query);
      });
  }

  /**
   * カーソルからレコードを再帰的に取得
   */
  function fetchCursorRecords(cursorId, accumulated) {
    return kintone.api(kintone.api.url('/k/v1/cursor', true), 'GET', { id: cursorId })
      .then(function(resp) {
        var records = accumulated.concat(resp.records);
        if (resp.next) {
          return fetchCursorRecords(cursorId, records);
        }
        return records;
      });
  }

  /**
   * カーソル API が使えない場合のフォールバック（ページネーション）
   */
  function fetchRecordsPaginated(appId, condition) {
    var allRecords = [];
    var limit = 500;

    function fetchPage(offset) {
      var query = (condition ? condition + ' ' : '') +
                  'order by $id asc limit ' + limit + ' offset ' + offset;
      return kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
        app: appId,
        query: query,
        fields: ['$id', 'ステータス']
      }).then(function(resp) {
        allRecords = allRecords.concat(resp.records);
        if (resp.records.length === limit) {
          return fetchPage(offset + limit);
        }
        return allRecords;
      });
    }

    return fetchPage(0);
  }

  /**
   * レコードをステータスごとにグループ分けする
   * @param {Array} records - レコード配列
   * @returns {{ groups: Object, skipped: Array }}
   *   groups: { ステータス名: [レコード配列] }
   *   skipped: STATUS_ACTION_MAP に定義がないレコードの配列
   */
  function groupRecordsByStatus(records) {
    var groups = {};
    var skipped = [];
    records.forEach(function(rec) {
      var status = rec['ステータス'] ? rec['ステータス'].value : null;
      if (!status || !CONFIG.STATUS_ACTION_MAP[status]) {
        skipped.push(rec);
        return;
      }
      if (!groups[status]) {
        groups[status] = [];
      }
      groups[status].push(rec);
    });
    return { groups: groups, skipped: skipped };
  }

  /**
   * 確認ダイアログ用のステータス内訳テキストを生成
   */
  function buildConfirmMessage(groups, skippedCount) {
    var lines = ['表示中のレコードを一括でステータス進めします。\n'];
    var totalTarget = 0;
    var statuses = Object.keys(groups);
    statuses.forEach(function(status) {
      var count = groups[status].length;
      var action = CONFIG.STATUS_ACTION_MAP[status];
      totalTarget += count;
      lines.push('  「' + status + '」→ アクション「' + action + '」: ' + count + ' 件');
    });
    lines.push('');
    lines.push('処理対象: ' + totalTarget + ' 件');
    if (skippedCount > 0) {
      lines.push('スキップ（マッピング未定義）: ' + skippedCount + ' 件');
    }
    lines.push('\n一括での実行は危険が伴います。自己責任の元で実行してください');
    return lines.join('\n');
  }

  /**
   * レコードのアサイニーフィールドコードを取得
   * ステータスごとの ASSIGNEE_MAP → フォールバック ASSIGNEE_FIELD_CODE
   */
  function getAssigneeFieldCode(status) {
    if (CONFIG.ASSIGNEE_MAP && CONFIG.ASSIGNEE_MAP[status]) {
      return CONFIG.ASSIGNEE_MAP[status];
    }
    return CONFIG.ASSIGNEE_FIELD_CODE || '';
  }

  /**
   * レコードのステータスを一括更新（ステータスごとにバッチ処理）
   * PUT /k/v1/records/status は 1 リクエスト最大 100 件
   * 同一バッチ内でアクションが異なっていても OK（records 配列の各要素に action を持てる）
   *
   * @param {Object} groups - { ステータス名: [レコード配列] }
   * @param {number} totalCount - 対象レコード総数
   * @param {Function} onProgress - 進捗コールバック (done, total)
   * @returns {Promise<{success: number, failed: number, skipped: number, errors: Array}>}
   */
  function bulkAdvanceStatus(groups, totalCount, onProgress) {
    var appId = kintone.app.getId();
    var results = { success: 0, failed: 0, skipped: 0, errors: [] };

    // 全ステータスのレコードを action 付きでフラット化
    var allEntries = [];
    Object.keys(groups).forEach(function(status) {
      var action = CONFIG.STATUS_ACTION_MAP[status];
      var assigneeField = getAssigneeFieldCode(status);
      groups[status].forEach(function(rec) {
        var entry = {
          id: rec['$id'].value,
          action: action,
          _record: rec // 再試行用に元レコードを保持
        };
        // アサイニーが必要な場合
        if (assigneeField && rec[assigneeField]) {
          var assigneeValue = rec[assigneeField].value;
          if (Array.isArray(assigneeValue) && assigneeValue.length > 0) {
            entry.assignee = assigneeValue[0].code;
          } else if (typeof assigneeValue === 'object' && assigneeValue.code) {
            entry.assignee = assigneeValue.code;
          }
        }
        allEntries.push(entry);
      });
    });

    // バッチに分割
    var batches = [];
    for (var i = 0; i < allEntries.length; i += CONFIG.BATCH_SIZE) {
      batches.push(allEntries.slice(i, i + CONFIG.BATCH_SIZE));
    }

    console.log('[INFO] バッチ数:', batches.length,
                '(対象レコード数:', allEntries.length, ')');

    // 順次実行
    var chain = Promise.resolve();
    batches.forEach(function(batch, batchIndex) {
      chain = chain.then(function() {
        // リクエストボディを構築（_record は除外）
        var statusRecords = batch.map(function(entry) {
          var apiEntry = { id: entry.id, action: entry.action };
          if (entry.assignee) {
            apiEntry.assignee = entry.assignee;
          }
          return apiEntry;
        });

        var body = {
          app: appId,
          records: statusRecords
        };

        console.log('[INFO] バッチ', batchIndex + 1, '/', batches.length,
                     ':', batch.length, '件処理中...');

        return kintone.api(kintone.api.url('/k/v1/records/status', true), 'PUT', body)
          .then(function() {
            results.success += batch.length;
            if (onProgress) {
              onProgress(results.success + results.failed, totalCount);
            }
            console.log('[INFO] バッチ', batchIndex + 1, '完了 ✅');
          })
          .catch(function(err) {
            console.error('[ERROR] バッチ', batchIndex + 1, '失敗:', err);
            // バッチ全体が失敗した場合、個別に再試行
            return retryIndividually(appId, batch, results, onProgress, totalCount);
          });
      }).then(function() {
        // バッチ間ディレイ
        if (batchIndex < batches.length - 1) {
          return delay(CONFIG.BATCH_DELAY_MS);
        }
      });
    });

    return chain.then(function() {
      return results;
    });
  }

  /**
   * バッチ失敗時に 1 件ずつ再試行
   */
  function retryIndividually(appId, batch, results, onProgress, totalCount) {
    var chain = Promise.resolve();
    batch.forEach(function(entry) {
      chain = chain.then(function() {
        var apiEntry = { id: entry.id, action: entry.action };
        if (entry.assignee) {
          apiEntry.assignee = entry.assignee;
        }
        var body = {
          app: appId,
          records: [apiEntry]
        };
        return kintone.api(kintone.api.url('/k/v1/records/status', true), 'PUT', body)
          .then(function() {
            results.success += 1;
          })
          .catch(function(err) {
            results.failed += 1;
            results.errors.push({
              id: entry.id,
              action: entry.action,
              error: err.message || JSON.stringify(err)
            });
            console.warn('[WARN] レコード', entry.id,
                         '(アクション:' + entry.action + ') スキップ:', err.message || err);
          })
          .then(function() {
            if (onProgress) {
              onProgress(results.success + results.failed, totalCount);
            }
          });
      });
    });
    return chain;
  }

  /**
   * 進捗テキストを更新
   */
  function updateProgress(done, total) {
    var el = document.getElementById(CONFIG.PROGRESS_ID);
    if (el) {
      el.textContent = '処理中... ' + done + ' / ' + total;
    }
  }

  // =============================================
  // メイン: 一覧画面にボタンを追加
  // =============================================
  kintone.events.on('app.record.index.show', function(event) {
    console.log('[INIT] 一括ステータス進めスクリプト読み込み');

    // ボタンが既に存在する場合はスキップ（重複防止）
    if (document.getElementById(CONFIG.BUTTON_ID)) {
      return event;
    }

    var headerSpace = kintone.app.getHeaderMenuSpaceElement();
    if (!headerSpace) {
      console.warn('[WARN] ヘッダーメニュースペースが取得できません');
      return event;
    }

    // --- ボタン作成 ---
    var button = document.createElement('button');
    button.id = CONFIG.BUTTON_ID;
    button.textContent = CONFIG.BUTTON_LABEL;
    button.style.cssText = [
      'padding: 6px 16px',
      'margin-left: 8px',
      'background-color: ' + CONFIG.BUTTON_COLOR,
      'color: #fff',
      'border: none',
      'border-radius: 4px',
      'font-size: 14px',
      'font-weight: bold',
      'cursor: pointer',
      'transition: opacity 0.2s'
    ].join(';');

    button.addEventListener('mouseenter', function() {
      button.style.opacity = '0.85';
    });
    button.addEventListener('mouseleave', function() {
      button.style.opacity = '1';
    });

    // --- 進捗テキスト ---
    var progressSpan = document.createElement('span');
    progressSpan.id = CONFIG.PROGRESS_ID;
    progressSpan.style.cssText = 'margin-left: 8px; font-size: 13px; color: #555;';

    // --- クリックハンドラ ---
    button.addEventListener('click', function() {
      if (button.disabled) return;

      console.log('[INFO] 一括ステータス進めボタン押下');
      progressSpan.textContent = 'レコード取得中...';
      button.disabled = true;
      button.style.opacity = '0.5';
      button.style.cursor = 'not-allowed';

      fetchAllDisplayedRecords()
        .then(function(records) {
          if (!records || records.length === 0) {
            alert('対象のレコードが見つかりませんでした。');
            resetButton();
            return;
          }

          console.log('[INFO] 取得レコード数:', records.length);

          // ステータスごとにグループ分け
          var result = groupRecordsByStatus(records);
          var groups = result.groups;
          var skipped = result.skipped;
          var targetStatuses = Object.keys(groups);

          // 対象レコード数を集計
          var totalTarget = 0;
          targetStatuses.forEach(function(s) { totalTarget += groups[s].length; });

          if (totalTarget === 0) {
            var skipMsg = '対象レコードが 0 件です。\n' +
                          '全 ' + records.length + ' 件がマッピング未定義のステータスでした。\n\n' +
                          'CONFIG.STATUS_ACTION_MAP を確認してください。';
            alert(skipMsg);
            resetButton();
            return;
          }

          // ステータス内訳をログ出力
          console.log('[INFO] ステータス内訳:');
          targetStatuses.forEach(function(status) {
            console.log('  「' + status + '」→「' + CONFIG.STATUS_ACTION_MAP[status] +
                        '」: ' + groups[status].length + ' 件');
          });
          if (skipped.length > 0) {
            console.log('[INFO] スキップ（マッピング未定義）:', skipped.length, '件');
          }

          // 確認ダイアログ
          if (CONFIG.SHOW_CONFIRM) {
            var msg = buildConfirmMessage(groups, skipped.length);
            if (!confirm(msg)) {
              console.log('[INFO] ユーザーによりキャンセルされました');
              resetButton();
              return;
            }
          }

          progressSpan.textContent = '処理中... 0 / ' + totalTarget;
          return bulkAdvanceStatus(groups, totalTarget, updateProgress);
        })
        .then(function(results) {
          if (!results) return; // キャンセルまたは 0 件の場合

          // 結果表示
          var msg = '処理完了\n' +
                    '  成功: ' + results.success + ' 件\n' +
                    '  スキップ: ' + results.failed + ' 件';
          if (results.errors.length > 0) {
            msg += '\n\nスキップされたレコード:';
            results.errors.slice(0, 10).forEach(function(e) {
              msg += '\n  ID ' + e.id + ' (アクション: ' + e.action + '): ' + e.error;
            });
            if (results.errors.length > 10) {
              msg += '\n  ...他 ' + (results.errors.length - 10) + ' 件';
            }
          }
          console.log('[INFO]', msg);
          alert(msg);

          // ページをリロードして最新状態を反映
          location.reload();
        })
        .catch(function(err) {
          console.error('[ERROR] 予期しないエラー:', err);
          alert('エラーが発生しました:\n' + (err.message || JSON.stringify(err)));
          resetButton();
        });
    });

    function resetButton() {
      button.disabled = false;
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
      progressSpan.textContent = '';
    }

    // --- DOM に追加 ---
    headerSpace.appendChild(button);
    headerSpace.appendChild(progressSpan);

    console.log('[INIT] 一括ステータス進めボタンを追加しました');
    return event;
  });
})();
