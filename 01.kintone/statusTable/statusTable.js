(function() {
  'use strict';

  /**
   * Kintone プロセス管理ステータス履歴記録
   * ステータス変更時にサブテーブルへ自動記録（読み取り専用）
   */

  // 設定
  const CONFIG = {
    // ステータス履歴を記録するサブテーブルのフィールドコード
    subtableFieldCode: 'status_history',
    
    // サブテーブル内のフィールドコード
    subtableFields: {
      datetime: 'datetime_sh',   // 日時
      status: 'status_sh',        // ステータス
      action: 'action_sh',        // アクション
      user: 'user_sh'             // ユーザー
    },
    
    // レコード新規作成時の初期ステータス名
    initialStatus: '解約依頼',

    // ボタン非表示の対象範囲
    // true: アプリ内の全てのサブテーブルのボタンを非表示
    // false: 上記 subtableFieldCode で指定したサブテーブルのみボタンを非表示
    hideAllSubtableButtons: false
  };

  /**
   * ステータス変更時にサブテーブルへ履歴を追加
   */
  function addStatusHistoryToSubtable(event) {
    console.log('[DEBUG] ステータス履歴追加開始');
    console.log('[DEBUG] 現在のステータス:', event.status.value);
    console.log('[DEBUG] 次のステータス:', event.nextStatus.value);
    console.log('[DEBUG] アクション:', event.action.value);
    
    const record = event.record;
    
    // サブテーブルが存在しない場合は初期化
    if (!record[CONFIG.subtableFieldCode]) {
      console.log('[WARN] サブテーブルフィールドが存在しません:', CONFIG.subtableFieldCode);
      return event;
    }
    
    if (!record[CONFIG.subtableFieldCode].value) {
      record[CONFIG.subtableFieldCode].value = [];
    }
    
    // 現在時刻を取得
    const now = new Date();
    const isoString = now.toISOString();
    
    // ログインユーザー情報取得
    const loginUser = kintone.getLoginUser();
    
    // 新しい履歴行を作成
    const newRow = {
      value: {}
    };
    newRow.value[CONFIG.subtableFields.datetime] = { 
      type: 'DATETIME',
      value: isoString 
    };
    newRow.value[CONFIG.subtableFields.status] = { 
      type: 'SINGLE_LINE_TEXT',
      value: event.nextStatus.value 
    };
    newRow.value[CONFIG.subtableFields.action] = { 
      type: 'SINGLE_LINE_TEXT',
      value: event.action.value 
    };
    newRow.value[CONFIG.subtableFields.user] = { 
      type: 'SINGLE_LINE_TEXT',
      value: loginUser.name || loginUser.code 
    };
    
    // サブテーブルの先頭に追加（最新が上）
    record[CONFIG.subtableFieldCode].value.unshift(newRow);
    
    console.log('[INFO] ステータス履歴をサブテーブルに追加しました:', newRow);
    
    return event;
  }

  /**
   * サブテーブルを読み取り専用にする
   */
  function setSubtableReadonly(event) {
    console.log('[DEBUG] サブテーブルを読み取り専用に設定');
    
    const record = event.record;
    
    // サブテーブルが存在しない場合は何もしない
    if (!record[CONFIG.subtableFieldCode]) {
      console.log('[WARN] サブテーブルフィールドが存在しません:', CONFIG.subtableFieldCode);
      return event;
    }
    
    // サブテーブル内の全フィールドを無効化
    const subtableRows = record[CONFIG.subtableFieldCode].value;
    if (subtableRows && subtableRows.length > 0) {
      subtableRows.forEach(function(row) {
        // 各フィールドを無効化
        Object.keys(CONFIG.subtableFields).forEach(function(key) {
          const fieldCode = CONFIG.subtableFields[key];
          if (row.value[fieldCode]) {
            row.value[fieldCode].disabled = true;
          }
        });
      });
      console.log('[DEBUG] サブテーブルの', subtableRows.length, '行のフィールドを無効化しました');
    }
    
    // DOM から対象サブテーブルの行追加・削除ボタンを非表示にする
    // Kintone の DOM 描画完了後に実行するため setTimeout で遅延
    hideSubtableButtons();
    
    console.log('[INFO] サブテーブルを読み取り専用にしました');
    return event;
  }

  /**
   * 対象サブテーブルの行追加・削除ボタンを非表示にする
   * subtable-row-gaia の親要素を辿ってコンテナを特定する
   */
  function hideSubtableButtons() {
    var maxRetry = 15;
    var retryCount = 0;
    var interval = 500; // ms

    // ボタンを非表示にする関数
    function hideButtons(container) {
      var buttons = container.querySelectorAll(
        'button.add-row-image-gaia, button.remove-row-image-gaia, button.delete-row-image-gaia'
      );
      buttons.forEach(function(btn) {
        btn.style.display = 'none';
      });
      return buttons.length;
    }

    function findSubtableContainer() {
      // subtable-row-gaia 要素を起点に、親をたどってサブテーブルコンテナを特定
      var rows = document.querySelectorAll('div.subtable-row-gaia');
      if (rows.length === 0) return null;

      // 行の親を辿り、add-row-image-gaia ボタンを含む最小の要素を返す
      // ただし layout-gaia（フォーム全体）まで到達したら止める
      var row = rows[0];
      var parent = row.parentElement;
      while (parent && parent !== document.body) {
        var cls = (parent.className || '');
        // フォーム全体のレイアウトに到達 → これ以上は広すぎるので止める
        if (cls.indexOf('layout-gaia') !== -1) {
          break;
        }
        var addBtn = parent.querySelector('button.add-row-image-gaia');
        if (addBtn) {
          console.log('[DEBUG] サブテーブルコンテナ検出:', parent.tagName, 'class:', cls.substring(0, 120));
          return parent;
        }
        parent = parent.parentElement;
      }

      // layout-gaia に到達した場合、ボタンから直接探す
      // 各ボタンの直近の subtable-row-gaia を確認し、関連するボタンだけを集める
      console.log('[DEBUG] コンテナ未検出。ボタン直接非表示モードに切り替え');
      return null;
    }

    // コンテナが見つからない場合、ボタンを直接探して非表示にする
    function hideButtonsDirect() {
      var allAddBtns = document.querySelectorAll('button.add-row-image-gaia');
      var allRemoveBtns = document.querySelectorAll('button.remove-row-image-gaia');
      var allDeleteBtns = document.querySelectorAll('button.delete-row-image-gaia');
      var allBtns = [];
      allAddBtns.forEach(function(b) { allBtns.push(b); });
      allRemoveBtns.forEach(function(b) { allBtns.push(b); });
      allDeleteBtns.forEach(function(b) { allBtns.push(b); });

      // subtable-row-gaia の近くにあるボタンのみ対象にする
      var rows = document.querySelectorAll('div.subtable-row-gaia');
      var hidden = 0;
      allBtns.forEach(function(btn) {
        // ボタンの兄弟要素や親の兄弟に subtable-row-gaia があるか確認
        var btnParent = btn.parentElement;
        for (var depth = 0; depth < 5 && btnParent; depth++) {
          var hasRow = btnParent.querySelector('div.subtable-row-gaia');
          if (hasRow) {
            btn.style.display = 'none';
            hidden++;
            break;
          }
          btnParent = btnParent.parentElement;
        }
      });
      return hidden;
    }

    function tryHide() {
      var container = findSubtableContainer();

      if (container) {
        var count = hideButtons(container);
        console.log('[DEBUG] サブテーブルのボタンを', count, '個非表示にしました');

        // DOM 変化を監視して追加されるボタンも非表示にする
        var observer = new MutationObserver(function() {
          hideButtons(container);
        });
        observer.observe(container, { childList: true, subtree: true });
        console.log('[DEBUG] MutationObserver を設定しました');
        return;
      }

      // コンテナが見つからない場合、ボタンを直接非表示にする
      var rows = document.querySelectorAll('div.subtable-row-gaia');
      if (rows.length > 0) {
        var count2 = hideButtonsDirect();
        console.log('[DEBUG] ボタン直接非表示:', count2, '個');

        // MutationObserver をフォーム全体に設定
        var formEl = document.querySelector('.layout-gaia') || document.body;
        var observer2 = new MutationObserver(function() {
          hideButtonsDirect();
        });
        observer2.observe(formEl, { childList: true, subtree: true });
        console.log('[DEBUG] MutationObserver を設定しました（フォーム全体監視）');
        return;
      }

      retryCount++;
      if (retryCount < maxRetry) {
        console.log('[DEBUG] サブテーブルDOM未検出、リトライ', retryCount, '/', maxRetry);
        setTimeout(tryHide, interval);
      } else {
        console.log('[WARN] サブテーブルDOMが見つかりませんでした。ボタン非表示をスキップします');
      }
    }

    setTimeout(tryHide, 100);
  }

  /**
   * レコード新規作成時（UI経由）に初期ステータスをサブテーブルへ記録
   */
  function addInitialStatusToSubtable(event) {
    console.log('[DEBUG] 初期ステータス履歴追加開始（create.submit）');

    const record = event.record;

    // サブテーブルが存在しない場合は何もしない
    if (!record[CONFIG.subtableFieldCode]) {
      console.log('[WARN] サブテーブルフィールドが存在しません:', CONFIG.subtableFieldCode);
      return event;
    }

    if (!record[CONFIG.subtableFieldCode].value) {
      record[CONFIG.subtableFieldCode].value = [];
    }

    // 現在時刻を取得
    const now = new Date();
    const isoString = now.toISOString();

    // ログインユーザー情報取得
    const loginUser = kintone.getLoginUser();

    // 初期ステータス行を作成
    var newRow = {
      value: {}
    };
    newRow.value[CONFIG.subtableFields.datetime] = {
      type: 'DATETIME',
      value: isoString
    };
    newRow.value[CONFIG.subtableFields.status] = {
      type: 'SINGLE_LINE_TEXT',
      value: CONFIG.initialStatus
    };
    newRow.value[CONFIG.subtableFields.action] = {
      type: 'SINGLE_LINE_TEXT',
      value: 'レコード作成'
    };
    newRow.value[CONFIG.subtableFields.user] = {
      type: 'SINGLE_LINE_TEXT',
      value: loginUser.name || loginUser.code
    };

    // サブテーブルの先頭に追加
    record[CONFIG.subtableFieldCode].value.unshift(newRow);

    console.log('[INFO] 初期ステータス履歴をサブテーブルに追加しました:', newRow);

    return event;
  }

  /**
   * レコード詳細表示時にサブテーブルが空なら初期ステータスをAPI経由で補完
   * （別アプリやプラグインからAPI経由で作成されたレコードに対応）
   */
  function backfillInitialStatus(event) {
    var record = event.record;

    // サブテーブルが存在しない場合は何もしない
    if (!record[CONFIG.subtableFieldCode]) {
      console.log('[WARN] サブテーブルフィールドが存在しません:', CONFIG.subtableFieldCode);
      return event;
    }

    var rows = record[CONFIG.subtableFieldCode].value;
    // 既に履歴がある場合は何もしない
    if (rows && rows.length > 0) {
      return event;
    }

    console.log('[INFO] ステータス履歴が空のため、初期ステータスをAPI経由で補完します');

    var recordId = record['$id'].value;
    var appId = kintone.app.getId();
    var loginUser = kintone.getLoginUser();
    var now = new Date();

    // レコード作成日時があればそちらを使用、なければ現在時刻
    var createdTime = record['作成日時'] ? record['作成日時'].value : now.toISOString();

    var newRow = {
      value: {}
    };
    newRow.value[CONFIG.subtableFields.datetime] = {
      type: 'DATETIME',
      value: createdTime
    };
    newRow.value[CONFIG.subtableFields.status] = {
      type: 'SINGLE_LINE_TEXT',
      value: CONFIG.initialStatus
    };
    newRow.value[CONFIG.subtableFields.action] = {
      type: 'SINGLE_LINE_TEXT',
      value: 'レコード作成'
    };
    newRow.value[CONFIG.subtableFields.user] = {
      type: 'SINGLE_LINE_TEXT',
      value: record['作成者'] ? record['作成者'].value.name : (loginUser.name || loginUser.code)
    };

    var body = {
      app: appId,
      id: recordId,
      record: {}
    };
    body.record[CONFIG.subtableFieldCode] = {
      value: [newRow]
    };

    return kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', body).then(function() {
      console.log('[INFO] 初期ステータスをAPI経由で補完しました。画面をリロードします。');
      location.reload();
    }).catch(function(error) {
      console.error('[ERROR] 初期ステータスの補完に失敗しました:', error);
    });
  }

  /**
   * イベント登録
   */
  
  // プロセス変更時にサブテーブルへ履歴を記録
  kintone.events.on('app.record.detail.process.proceed', function(event) {
    console.log('[DEBUG] app.record.detail.process.proceed イベント発火');
    return addStatusHistoryToSubtable(event);
  });

  // レコード新規作成の保存時に初期ステータスを記録（UI経由の場合）
  kintone.events.on('app.record.create.submit', function(event) {
    console.log('[DEBUG] app.record.create.submit イベント発火');
    return addInitialStatusToSubtable(event);
  });

  // レコード詳細表示時に初期ステータスが未記録であればAPI経由で補完
  // （別アプリのプラグイン等からAPI経由で作成されたレコードに対応）
  kintone.events.on('app.record.detail.show', function(event) {
    console.log('[DEBUG] app.record.detail.show イベント発火');
    return backfillInitialStatus(event);
  });
  
  // レコード作成・編集時にサブテーブルを読み取り専用化
  kintone.events.on(['app.record.create.show', 'app.record.edit.show'], function(event) {
    console.log('[DEBUG] app.record.create/edit.show イベント発火');
    return setSubtableReadonly(event);
  });

})();
