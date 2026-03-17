(() => {
  'use strict';

  // 担当者名から姓を抽出する関数
  const extractSei = (record) => {
    const tanto = record['担当者名'].value;
    console.log('担当者名フィールドの値:', tanto);

    if (tanto) {
      // 左からスペース（半角・全角）までの文字を取得（姓）
      const match = tanto.match(/^([^\s　]+)/);
      if (match) {
        record['姓'].value = match[1];
        console.log('姓フィールドに設定:', match[1]);
      } else {
        // スペースがない場合は全体を姓とする
        record['姓'].value = tanto; 
        console.log('姓フィールドに設定（全体）:', tanto);
      }
    } else {
      // 担当者が空の場合は姓も空にする
      record['姓'].value = '';
      console.log('姓フィールドをクリア');
    }
  };

  // 担当者名フィールドの変更時イベント（新規作成・編集時）
  kintone.events.on([
    'app.record.create.change.担当者名',
    'app.record.edit.change.担当者名'
  ], (event) => {
    console.log('担当者名フィールド変更イベント発火');
    extractSei(event.record);
    return event;
  });

})();
