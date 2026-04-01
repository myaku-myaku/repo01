(() => {
    'use strict';
 /////////////////////////////// レコード作成・編集の保存時に処理実行 ////////////////////////////// 
    kintone.events.on([
       'app.record.create.submit',
       'app.record.edit.submit',
       ], (event) => {
         
      const record = event.record;    
 /////////////////////////////// 発注内容テーブル、テーブルIDフィールドに採番 ////////////////////////////// 
      const count= record['発注内容_テーブル']['value']['length'];
      
      for (let i = 0; i < count; i++) 
      {
        record['発注内容_テーブル'].value[i].value['テーブルID'].value = i + 1;
        console.log ("テーブルNo- ",record['発注内容_テーブル'].value[i].value['テーブルID'].value ); 
      }
 /////////////////////////////// レコード保存時に注意事項ポップアップ ////////////////////////////// 
        //  if (!window.confirm('伝票案件名に「概要」「発注先」の追記を確認してください')) {
        //  return false;
        //    }

      return event;
    });
  })();