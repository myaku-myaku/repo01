(() => {
  'use strict';
  kintone.events.on('portal.show', (event) => {
    // ========================================
    // アクセス制限設定
    // ========================================
    
    // 【設定1】制限モード
    // 'none'       : 制限なし（全ユーザーが利用可能）
    // 'individual' : 個別ID制限（allowedUserIDs に登録されたユーザーのみ利用可能）
    const restrictionMode = 'none';
    
    // 【設定2】許可するユーザーIDのリスト
    // restrictionMode が 'individual' の場合のみ有効
    const allowedUserIDs = [
      '0073001692', '0073002219', '0073900329', '0073900500', '0073900555',
      '9004046908', '9004055520', '9004057033', '9004058457', '9004060777',
      '9004065187', '9004067840', '9004084588', '9004086854', '9004087852',
      '9004089255', '9004089495', '9004090356', '9004091246', '9004093051',
      '9004093052', '9004093728', '9004094017', '9004094590', '9004095430',
      '9004096512', '9004097290', '9004098651'
    ];
    
    // ※グループ単位の制限について
    // kintone.getLoginUser() では所属グループ情報が取得できないため、
    // グループ単位での制限を実装するには、別途kintone REST APIを使用して
    // ユーザー情報を取得する必要があります。
    // REST APIの例: /v1/users.json?codes=[ユーザーコード]
    // ただし、API呼び出しが必要になるため処理が複雑化し、
    // パフォーマンスへの影響も考慮が必要です。
    
    // ========================================
    // アクセスチェック処理
    // ========================================
    const user = kintone.getLoginUser();
    
    // 制限モードに応じたチェック
    if (restrictionMode === 'individual') {
      // 個別ID制限: 許可リストに含まれていない場合は終了
      if (!allowedUserIDs.includes(user.code)) {
        return;
      }
    }
    // restrictionMode === 'none' の場合は何もチェックせず続行
    
    if (document.getElementById('my_index_button')) return;

    const myIndexButton = document.createElement('button');
    myIndexButton.id = 'my_index_button';
    myIndexButton.innerText = '一括既読';

    myIndexButton.addEventListener('click', async () => {
      console.log('【一括既読ボタン押下】');

      // 「未読→既読にする」アイコンだけ取得
      const selector = '.ocean-ntf-ntfitem-mark[title="既読にする"]';
      let items = Array.from(document.querySelectorAll(selector));
      console.log('未読件数:', items.length);

      if (items.length === 0) {
        alert('未読通知が見つかりません');
        return;
      }

      // 順番にクリック（軽いディレイ付き）
      myIndexButton.disabled = true;
      for (let i = 0; i < items.length; i++) {
        const el = items[i];
        console.log(`click #${i}`, el);
        try { el.click(); } catch(e) { console.warn('el.click error', e); }
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 150));
      }
      myIndexButton.disabled = false;
      console.log('完了: 未読通知をすべて既読化しました');
    });

    kintone.portal.getContentSpaceElement().appendChild(myIndexButton);
  });
})();
