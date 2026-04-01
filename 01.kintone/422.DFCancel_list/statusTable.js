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
    }
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
    
    // CSSで行追加・削除ボタンを強制的に非表示にする
    const styleId = 'subtable-readonly-style-' + CONFIG.subtableFieldCode;
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        /* サブテーブル ${CONFIG.subtableFieldCode} の行追加・削除ボタンを非表示 */
        button.add-row-image-gaia,
        button.remove-row-image-gaia,
        button.delete-row-image-gaia {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `;
      document.head.appendChild(style);
      console.log('[DEBUG] CSSスタイルを追加してボタンを非表示にしました');
    }
    
    console.log('[INFO] サブテーブルを読み取り専用にしました');
    return event;
  }

  /**
   * イベント登録
   */
  
  // プロセス変更時にサブテーブルへ履歴を記録
  kintone.events.on('app.record.detail.process.proceed', function(event) {
    console.log('[DEBUG] app.record.detail.process.proceed イベント発火');
    return addStatusHistoryToSubtable(event);
  });
  
  // レコード作成・編集時にサブテーブルを読み取り専用化
  kintone.events.on(['app.record.create.show', 'app.record.edit.show'], function(event) {
    console.log('[DEBUG] app.record.create/edit.show イベント発火');
    return setSubtableReadonly(event);
  });

})();
