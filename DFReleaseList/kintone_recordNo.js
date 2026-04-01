(function() {
  'use strict';

  // レコード番号を設定するフィールドコード
  const RECORD_NO_FIELD = 'recordNo';

  /**
   * 編集画面表示時にレコード番号を自動設定
   */
  kintone.events.on('app.record.edit.show', function(event) {
    const record = event.record;

    // レコード番号フィールドが存在しない場合は何もしない
    if (!record[RECORD_NO_FIELD]) {
      console.log('フィールド "' + RECORD_NO_FIELD + '" が見つかりません');
      return event;
    }

    // レコード番号フィールドが既に入力されている場合はスキップ
    if (record[RECORD_NO_FIELD].value) {
      return event;
    }

    // レコード番号を取得して設定
    const recordId = event.recordId || record.$id.value;
    if (recordId) {
      record[RECORD_NO_FIELD].value = recordId;
      console.log('レコード番号 ' + recordId + ' を設定しました');
    }

    return event;
  });

  /**
   * レコード作成成功後、編集画面にリダイレクト
   */
  kintone.events.on('app.record.create.submit.success', function(event) {
    const appId = kintone.app.getId();
    const recordId = event.recordId;

    // 編集画面のURLを構築してリダイレクト
    const editUrl = '/k/' + appId + '/show/' + recordId + '?mode=edit';
    window.location.href = editUrl;

    return event;
  });

})();
