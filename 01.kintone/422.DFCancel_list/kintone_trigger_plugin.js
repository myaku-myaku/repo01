(function() {
  'use strict';

  console.log('[INIT] kintone_trigger_plugin.js スクリプトが読み込まれました');

  // ========== 設定 ==========
  const CONFIG = {
    // トリガーとなるステータス遷移
    TRIGGER_FROM_STATUS: 'チェック完了',
    TRIGGER_TO_STATUS: '申請依頼完了',
    
    // プラグインボタンのテキスト
    BUTTON_TEXT: 'DFの解約を依頼する',
    
    // プラグインボタンのCSSクラス
    BUTTON_CLASS: 'custom-elements-tabletransfer'
  };

  /**
   * プラグインボタンを非表示にする
   */
  function hidePluginButton() {
    setTimeout(function() {
      var buttons = document.querySelectorAll('.' + CONFIG.BUTTON_CLASS);
      console.log('[DEBUG] 検出されたプラグインボタン数:', buttons.length);
      
      for (var i = 0; i < buttons.length; i++) {
        var button = buttons[i];
        var buttonText = button.textContent || button.innerText;
        
        console.log('[DEBUG] ボタン' + i + 'のテキスト:', buttonText);
        
        if (buttonText.indexOf(CONFIG.BUTTON_TEXT) > -1) {
          button.style.display = 'none';
          console.log('[INFO] プラグインボタンを非表示にしました:', buttonText);
        }
      }
    }, 500); // DOMが完全に構築されるまで待機
  }

  /**
   * プラグインボタンをクリックする
   */
  function clickPluginButton() {
    var buttons = document.querySelectorAll('.' + CONFIG.BUTTON_CLASS);
    console.log('[DEBUG] クリック対象のボタン数:', buttons.length);
    
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      var buttonText = button.textContent || button.innerText;
      
      if (buttonText.indexOf(CONFIG.BUTTON_TEXT) > -1) {
        console.log('[INFO] プラグインボタンをクリックします:', buttonText);
        button.click();
        return true;
      }
    }
    
    console.warn('[WARN] プラグインボタンが見つかりませんでした');
    return false;
  }

  /**
   * ステータス変更時のイベント（申請実施ボタンクリック時）
   */
  kintone.events.on('app.record.detail.process.proceed', function(event) {
    console.log('[DEBUG] app.record.detail.process.proceed イベント発火');
    
    var currentStatus = event.status.value;
    var nextStatus = event.nextStatus.value;

    console.log('[DEBUG] 現在のステータス:', currentStatus);
    console.log('[DEBUG] 次のステータス:', nextStatus);
    console.log('[DEBUG] 期待する遷移:', CONFIG.TRIGGER_FROM_STATUS, '→', CONFIG.TRIGGER_TO_STATUS);

    // トリガーとなるステータス遷移の場合、フラグを保存
    if (currentStatus === CONFIG.TRIGGER_FROM_STATUS && nextStatus === CONFIG.TRIGGER_TO_STATUS) {
      console.log('[INFO] ステータス遷移検知:', currentStatus, '→', nextStatus);
      console.log('[INFO] プラグイン自動実行フラグを設定します');
      
      // sessionStorageにフラグを保存（ページリロード後に実行）
      sessionStorage.setItem('triggerPluginAfterReload', 'true');
    }

    // イベントハンドラはすぐに返す（UIブロックを防ぐ）
    return event;
  });

  /**
   * レコード詳細画面表示時のイベント
   */
  kintone.events.on('app.record.detail.show', function(event) {
    console.log('[DEBUG] app.record.detail.show イベント発火');
    hidePluginButton();
    
    // ステータス変更後のフラグをチェック
    var shouldTrigger = sessionStorage.getItem('triggerPluginAfterReload');
    if (shouldTrigger === 'true') {
      console.log('[INFO] ステータス変更後のプラグイン自動実行を開始します');
      
      // フラグをクリア
      sessionStorage.removeItem('triggerPluginAfterReload');
      
      // プラグインボタンをクリック（DOMが完全に構築されるまで待機）
      setTimeout(function() {
        var clicked = clickPluginButton();
        
        if (!clicked) {
          alert('プラグインボタンが見つかりませんでした。\n手動でコピーボタンをクリックしてください。');
        }
      }, 1000); // 十分な待機時間を確保
    }
    
    return event;
  });

  /**
   * レコード編集画面表示時のイベント
   */
  kintone.events.on('app.record.edit.show', function(event) {
    console.log('[DEBUG] app.record.edit.show イベント発火');
    hidePluginButton();
    return event;
  });

  /**
   * レコード作成画面表示時のイベント
   */
  kintone.events.on('app.record.create.show', function(event) {
    console.log('[DEBUG] app.record.create.show イベント発火');
    hidePluginButton();
    return event;
  });

  /**
   * レコード一覧画面表示時のイベント
   */
  kintone.events.on('app.record.index.show', function(event) {
    console.log('[DEBUG] app.record.index.show イベント発火');
    hidePluginButton();
    return event;
  });

})();
