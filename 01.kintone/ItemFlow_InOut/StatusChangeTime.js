(function() {
  'use strict';

  // ステータスとフィールドのマッピング
  const statusFieldMapping = {
    '11a.出庫依頼中': '_11a_出庫依頼中',
    '11b.出庫依頼中(倉庫)': '_11b_出庫依頼中_倉庫_',
    '12a.出庫依頼受領(発送待ち)': '_12a_出庫依頼受領_発送待ち_',
    '12b.出庫依頼受領(倉庫発送待ち)': '_12b_出庫依頼受領_倉庫発送待ち_',
    '13.完了(出庫)': '_13_完了_出庫_',
    '21a.入庫依頼中': '_21a_入庫依頼中',
    '21b.入庫依頼中(倉庫)': '_21b_入庫依頼中_倉庫_',
    '22a.入庫依頼受領(到着待ち)': '_22a_入庫依頼受領_到着待ち_',
    '22b.入庫依頼受領(倉庫到着待ち)': '_22b_入庫依頼受領_倉庫到着待ち_',
    '23a.物品受領(入庫)': '_23a_物品受領_入庫_',
    '23b.物品受領(倉庫確認中)': '_23b_物品受領_倉庫確認中_',
    '24.完了(入庫)': '_24_完了_入庫_'
  };

  // ステータス変更時のイベント
  kintone.events.on('app.record.detail.process.proceed', function(event) {
    var record = event.record;
    var nextStatus = event.nextStatus.value;
    
    // ステータスに対応するフィールドが存在する場合
    if (statusFieldMapping[nextStatus]) {
      var fieldCode = statusFieldMapping[nextStatus];
      
      // フィールドがレコードに存在するかチェック
      if (record[fieldCode]) {
        // 現在時刻をISO形式の文字列で設定
        var now = new Date();
        var isoString = now.toISOString();
        record[fieldCode].value = isoString;
      }
    }

    return event;
  });

})();
