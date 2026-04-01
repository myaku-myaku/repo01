(() => {
  'use strict';
       
  kintone.events.on([
   'app.record.create.submit',
   'app.record.edit.submit',
   'app.record.index.edit.submit',
   
  ], (event) => {
      const record = event.record;
      const count_TBL = record['発注内容_テーブル']['value']['length'];
      record['案件一覧'].value = ''; // 案件名文字列を初期化

      for (let i = 0; i < count_TBL; i++) {
          const tblPG = record['発注内容_テーブル'].value[i].value['伝票案件名'].value;

          if (tblPG) {
              record['案件一覧'].value += tblPG + "\n";
              console.log(tblPG);
          }
      } 
      return event;
  });
})();
