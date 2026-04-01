(function() {
  'use strict';

  console.log('[INIT] kintone_trigger_plugin_on_status.js スクリプトが読み込まれました');

  // ========== 設定 ==========
  const CONFIG = {
    // トリガーとなるステータス遷移
    TRIGGER_FROM_STATUS: 'チェック完了',
    TRIGGER_TO_STATUS: '申請依頼完了',
    
    // プラグインのボタンを識別するためのセレクタ（実際の値に変更してください）
    // 例: ボタンのID、クラス、テキストなど
    BUTTON_SELECTOR: 'button:contains("コピー")',  // ★要変更: 実際のボタンのセレクタ
    BUTTON_TEXT: 'サブテーブルをコピー',  // ★要変更: ボタンに表示されているテキスト
    
    // ボタンを非表示にするかどうか
    HIDE_BUTTON: true,
  };

  /**
   * ステータス変更時のイベント（申請実施ボタンクリック時）
   */
  kintone.events.on('app.record.detail.process.proceed', function(event) {
    console.log('[DEBUG] app.record.detail.process.proceed イベント発火');
    
    const currentStatus = event.status.value;
    const nextStatus = event.nextStatus.value;

    console.log('[DEBUG] 現在のステータス:', currentStatus);
    console.log('[DEBUG] 次のステータス:', nextStatus);

    // トリガーとなるステータス遷移でない場合は何もしない
    if (currentStatus !== CONFIG.TRIGGER_FROM_STATUS || nextStatus !== CONFIG.TRIGGER_TO_STATUS) {
      console.log('[DEBUG] ステータス遷移が一致しません。処理をスキップします。');
      return event;
    }

    console.log('ステータス遷移検知:', currentStatus, '→', nextStatus);
    console.log('プラグインのボタンを自動的にクリックします...');

    // 少し待ってからボタンをクリック（DOMの準備を待つ）
    setTimeout(function() {
      clickPluginButton();
    }, 500);

    return event;
  });

  /**
   * プラグインのボタンをプログラムでクリックする
   */
  function clickPluginButton() {
    // ボタンをテキストで検索
    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], a.button'));
    const targetButton = buttons.find(function(btn) {
      return btn.textContent.trim() === CONFIG.BUTTON_TEXT || 
             btn.innerText.trim() === CONFIG.BUTTON_TEXT ||
             btn.value === CONFIG.BUTTON_TEXT;
    });

    if (targetButton) {
      console.log('プラグインのボタンが見つかりました:', targetButton);
      targetButton.click();
      console.log('ボタンをクリックしました');
    } else {
      console.warn('プラグインのボタンが見つかりませんでした。ボタンテキスト:', CONFIG.BUTTON_TEXT);
      console.log('[DEBUG] 利用可能なボタン一覧:');
      buttons.forEach(function(btn, index) {
        console.log(index + ':', btn.textContent.trim() || btn.innerText.trim() || btn.value);
      });
    }
  }

  /**
   * 詳細画面表示時にボタンを非表示にする
   */
  kintone.events.on('app.record.detail.show', function(event) {
    if (!CONFIG.HIDE_BUTTON) {
      return event;
    }

    console.log('プラグインのボタンを非表示にします...');

    // 少し待ってからボタンを非表示（プラグインの読み込みを待つ）
    setTimeout(function() {
      hidePluginButton();
    }, 1000);

    return event;
  });

  /**
   * プラグインのボタンを非表示にする
   */
  function hidePluginButton() {
    // ボタンをテキストで検索
    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], a.button'));
    const targetButton = buttons.find(function(btn) {
      return btn.textContent.trim() === CONFIG.BUTTON_TEXT || 
             btn.innerText.trim() === CONFIG.BUTTON_TEXT ||
             btn.value === CONFIG.BUTTON_TEXT;
    });

    if (targetButton) {
      console.log('プラグインのボタンが見つかりました。非表示にします。');
      targetButton.style.display = 'none';
      
      // 親要素も非表示にする場合（ボタンの周りの余白も消す）
      if (targetButton.parentElement) {
        const parent = targetButton.parentElement;
        // 親要素に他のボタンがない場合のみ非表示
        const siblingButtons = Array.from(parent.querySelectorAll('button, input[type="button"]'));
        if (siblingButtons.length === 1) {
          parent.style.display = 'none';
        }
      }
    } else {
      console.log('プラグインのボタンが見つかりませんでした（既に非表示か、まだ読み込まれていない可能性があります）');
    }
  }

  /**
   * 編集画面表示時にもボタンを非表示にする
   */
  kintone.events.on('app.record.edit.show', function(event) {
    if (!CONFIG.HIDE_BUTTON) {
      return event;
    }

    setTimeout(function() {
      hidePluginButton();
    }, 1000);

    return event;
  });

})();
