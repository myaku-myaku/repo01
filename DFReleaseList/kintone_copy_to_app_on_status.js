(function() {
  'use strict';

  // ========== 設定 ==========
  const CONFIG = {
    // コピー先アプリID（必ず実際のアプリIDに変更してください）
    TARGET_APP_ID: 0,  // ★要変更: コピー先アプリのID
    
    // トリガーとなるステータス（このステータスに変更されたときにコピーを実行）
    TRIGGER_STATUSES: ['完了', '承認済み'],  // ★要変更: 実際のステータス名
    
    // サブテーブルフィールドコード（サブテーブルがある場合）
    SUBTABLE_FIELD: 'サブテーブル',  // ★要変更: 実際のフィールドコード
  };

  // メインフィールドのマッピング（コピー元フィールドコード → コピー先フィールドコード）
  const MAIN_FIELD_MAPPING = {
    // 例: 'フィールドコード1': 'コピー先フィールドコード1',
    'レコード番号': 'レコード番号',
    '件名': '件名',
    '作成日時': '作成日時',
    '作成者': '作成者',
    // ★要変更: 実際のフィールドマッピングに変更してください
  };

  // サブテーブルフィールドのマッピング（コピー元フィールドコード → コピー先フィールドコード）
  const SUBTABLE_FIELD_MAPPING = {
    // 例: 'サブテーブル内フィールド1': 'コピー先フィールド1',
    '品目': '品目',
    '数量': '数量',
    '金額': '金額',
    // ★要変更: 実際のフィールドマッピングに変更してください
  };

  /**
   * ステータス変更時のイベント
   */
  kintone.events.on('app.record.detail.process.proceed', function(event) {
    const record = event.record;
    const nextStatus = event.nextStatus.value;

    // トリガーステータスでない場合は何もしない
    if (CONFIG.TRIGGER_STATUSES.indexOf(nextStatus) === -1) {
      return event;
    }

    // アプリIDのチェック
    if (!CONFIG.TARGET_APP_ID || CONFIG.TARGET_APP_ID === 0) {
      console.error('設定エラー: TARGET_APP_IDが設定されていません。');
      alert('設定エラー: スクリプトのCONFIG.TARGET_APP_IDにコピー先アプリIDを設定してください。');
      return event;
    }

    console.log('ステータス更新検知:', nextStatus);
    console.log('レコードを別アプリ(ID: ' + CONFIG.TARGET_APP_ID + ')にコピーします');

    // 別アプリにコピーを実行
    copyRecordToAnotherApp(record);

    return event;
  });

  /**
   * レコードを別アプリにコピーする関数
   */
  function copyRecordToAnotherApp(sourceRecord) {
    // コピー先レコードのデータを構築
    const targetRecord = {};

    // メインフィールドをコピー
    Object.keys(MAIN_FIELD_MAPPING).forEach(function(sourceField) {
      const targetField = MAIN_FIELD_MAPPING[sourceField];
      
      if (sourceRecord[sourceField]) {
        // フィールドタイプに応じて値をコピー
        const fieldValue = sourceRecord[sourceField].value;
        const fieldType = sourceRecord[sourceField].type;
        
        targetRecord[targetField] = {
          value: copyFieldValue(fieldValue, fieldType)
        };
        
        console.log('コピー: ' + sourceField + ' → ' + targetField, fieldValue);
      }
    });

    // サブテーブルをコピー（サブテーブルが存在する場合）
    if (CONFIG.SUBTABLE_FIELD && sourceRecord[CONFIG.SUBTABLE_FIELD]) {
      const subtableRows = sourceRecord[CONFIG.SUBTABLE_FIELD].value;
      const copiedRows = [];

      subtableRows.forEach(function(row) {
        const newRow = { value: {} };
        
        Object.keys(SUBTABLE_FIELD_MAPPING).forEach(function(sourceField) {
          const targetField = SUBTABLE_FIELD_MAPPING[sourceField];
          
          if (row.value[sourceField]) {
            const fieldValue = row.value[sourceField].value;
            const fieldType = row.value[sourceField].type;
            
            newRow.value[targetField] = {
              value: copyFieldValue(fieldValue, fieldType)
            };
          }
        });
        
        copiedRows.push(newRow);
      });

      targetRecord[CONFIG.SUBTABLE_FIELD] = {
        value: copiedRows
      };
      
      console.log('サブテーブルをコピー: ' + copiedRows.length + '行');
    }

    // コピー先アプリにレコードを作成
    createRecordInTargetApp(targetRecord);
  }

  /**
   * フィールドタイプに応じて値をコピー
   */
  function copyFieldValue(value, fieldType) {
    // ユーザー選択、組織選択、グループ選択の場合は配列のまま返す
    if (fieldType === 'USER_SELECT' || fieldType === 'ORGANIZATION_SELECT' || fieldType === 'GROUP_SELECT') {
      return value;
    }
    
    // チェックボックス、複数選択の場合は配列のまま返す
    if (fieldType === 'CHECK_BOX' || fieldType === 'MULTI_SELECT') {
      return value;
    }
    
    // ファイルの場合は配列のまま返す（注意: fileKeyは同じアプリ内でのみ有効な場合があります）
    if (fieldType === 'FILE') {
      return value;
    }
    
    // その他の場合はそのまま返す
    return value;
  }

  /**
   * コピー先アプリにレコードを作成
   */
  function createRecordInTargetApp(record) {
    const body = {
      app: CONFIG.TARGET_APP_ID,
      record: record
    };

    console.log('レコード作成リクエスト:', JSON.stringify(body, null, 2));

    kintone.api(kintone.api.url('/k/v1/record', true), 'POST', body)
      .then(function(resp) {
        console.log('レコード作成成功:', resp);
        alert('レコードをアプリID ' + CONFIG.TARGET_APP_ID + ' にコピーしました。\nレコード番号: ' + resp.id);
      })
      .catch(function(error) {
        console.error('レコード作成エラー:', error);
        alert('レコードのコピーに失敗しました。\n' + error.message);
      });
  }

})();
