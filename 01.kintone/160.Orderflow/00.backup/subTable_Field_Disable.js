(() => {
    'use strict';
 /////////////////////////////// レコード作成・編集の表示時に処理実行 ////////////////////////////// 
    kintone.events.on([
      'app.record.detail.show',
       'app.record.create.show',
       'app.record.edit.show',
       ], (event) => {
         
      const record = event.record;    
 /////////////////////////////// 発注内容テーブル、決裁種別フィールド、テーブルIDフィールドを非表示 ////////////////////////////// 

        kintone.app.record.setFieldShown('テーブルID', false);
        kintone.app.record.setFieldShown('決裁種別', false);
       // kintone.app.record.setFieldShown('明細名', false);   
        
      return event;
    });
  })();