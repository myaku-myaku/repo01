(function() {
  'use strict';

  console.log('SubtableCopy.js が読み込まれました');

  // レコード保存前に通常フィールドをコピー（添付ファイル以外）
  kintone.events.on([
    'app.record.create.submit',
    'app.record.edit.submit'
  ], function(event) {
    console.log('保存前イベント発火');
    
    const record = event.record;
    const subtable = record['支払い金額テーブル'];
    
    // 「メール送付」にチェックが入っている行を検索
    let targetRow = null;
    
    if (subtable && subtable.value && subtable.value.length > 0) {
      for (let i = 0; i < subtable.value.length; i++) {
        const row = subtable.value[i].value;
        const mailSend = row['メール送付'] ? row['メール送付'].value : [];
        
        if (Array.isArray(mailSend) && mailSend.includes('メール送付')) {
          targetRow = row;
          console.log('コピー対象の行が見つかりました');
          break;
        }
      }
    }
    
    // 対象行が見つかった場合、通常フィールドをコピー
    if (targetRow) {
      // 通常フィールドをコピー
      if (record['金額支払_ML']) {
        record['金額支払_ML'].value = targetRow['金額支払'] ? targetRow['金額支払'].value : '';
      }
      if (record['支払い期日_ML']) {
        record['支払い期日_ML'].value = targetRow['支払い期日'] ? targetRow['支払い期日'].value : '';
      }
      if (record['支払いテーブルメモ_ML']) {
        record['支払いテーブルメモ_ML'].value = targetRow['支払いテーブルメモ'] ? targetRow['支払いテーブルメモ'].value : '';
      }
      
      console.log('通常フィールドのコピーが完了しました');
    }
    
    return event;
  });

})();
