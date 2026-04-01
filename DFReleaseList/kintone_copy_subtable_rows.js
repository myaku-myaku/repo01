(function() {
  'use strict';

  console.log('[INIT] kintone_copy_subtable_rows.js スクリプトが読み込まれました');

  // ========== 設定 ==========
  const CONFIG = {
    // コピー元アプリID: DF解約リスト
    SOURCE_APP_ID: 422,
    
    // コピー先アプリID: DF解約管理
    TARGET_APP_ID: 421,
    
    // トリガーとなるステータス遷移
    TRIGGER_FROM_STATUS: 'チェック完了',
    TRIGGER_TO_STATUS: '申請依頼完了',
    
    // サブテーブルフィールドコード
    SUBTABLE_FIELD: '回線グループ',
    
    // 管理レコードNoフィールド（サブテーブル内）
    MANAGEMENT_RECORD_NO_FIELD: '管理レコードNo',
  };

  // サブテーブルフィールドのマッピング（コピー元422 > コピー先421）
  const FIELD_MAPPING = {
    '調査対象中継回線ID_tbl': '調査対象中継回線ID',
    'グループ内連番_tbl': 'グループ内連番',
    'エリア_tbl': 'エリア',
    '県域': '県域',
    '回線ID_tbl': '回線ID',
    '始点回線種別_tbl': '始点回線種別',
    '始点回線ID_tbl': '始点回線ID',
    '終点回線種別_tbl': '終点回線種別',
    '終点回線ID_tbl': '終点回線ID',
    '始点通信用建物_tbl': '始点通信用建物',
    '終点通信用建物_tbl': '終点通信用建物',
    'ルートコード_tbl': 'ルートコード',
    '接続開始日_tbl': '接続開始日',
    // '添付ファイル': '添付ファイル',  // ファイルは別アプリにコピー不可のためスキップ
    'ListRecordNo': 'ListRecordNo'
  };

  /**
   * ステータス変更時のイベント（申請実施ボタンクリック時）
   */
  kintone.events.on('app.record.detail.process.proceed', function(event) {
    console.log('[DEBUG] app.record.detail.process.proceed イベント発火');
    
    const record = event.record;
    const nextStatus = event.nextStatus.value;
    const currentStatus = event.status.value;

    console.log('[DEBUG] 現在のステータス:', currentStatus);
    console.log('[DEBUG] 次のステータス:', nextStatus);
    console.log('[DEBUG] 期待する遷移:', CONFIG.TRIGGER_FROM_STATUS, '→', CONFIG.TRIGGER_TO_STATUS);

    // トリガーとなるステータス遷移でない場合は何もしない
    if (currentStatus !== CONFIG.TRIGGER_FROM_STATUS || nextStatus !== CONFIG.TRIGGER_TO_STATUS) {
      console.log('[DEBUG] ステータス遷移が一致しません。処理をスキップします。');
      return event;
    }

    console.log('ステータス遷移検知:', currentStatus, '→', nextStatus);

    // デバッグ: レコードに存在するフィールドコードを確認
    console.log('[DEBUG] レコード内の全フィールドコード:', Object.keys(record));
    console.log('[DEBUG] 探しているサブテーブルフィールド:', CONFIG.SUBTABLE_FIELD);
    console.log('[DEBUG] サブテーブルフィールドの存在:', record[CONFIG.SUBTABLE_FIELD]);

    // サブテーブルが存在しない場合
    if (!record[CONFIG.SUBTABLE_FIELD] || !record[CONFIG.SUBTABLE_FIELD].value) {
      console.log('サブテーブルが空です');
      console.log('[DEBUG] フィールド "' + CONFIG.SUBTABLE_FIELD + '" が見つからないか、値が空です。');
      console.log('[DEBUG] 上記の全フィールドコード一覧から正しいサブテーブルフィールドコードを確認してください。');
      return event;
    }

    const subtableRows = record[CONFIG.SUBTABLE_FIELD].value;
    console.log('サブテーブル行数:', subtableRows.length);

    // デバッグ: サブテーブルの最初の行のフィールドコードを確認
    if (subtableRows.length > 0) {
      console.log('[DEBUG] サブテーブル1行目のフィールドコード:', Object.keys(subtableRows[0].value));
    }

    // サブテーブルの各行を別アプリにコピー
    copySubtableRowsToAnotherApp(event.recordId, subtableRows);

    return event;
  });

  /**
   * サブテーブルの各行を別アプリに個別レコードとしてコピー
   */
  function copySubtableRowsToAnotherApp(sourceRecordId, subtableRows) {
    // 処理中メッセージを表示
    const processingMsg = 'サブテーブルの ' + subtableRows.length + ' 行を処理中...';
    console.log(processingMsg);

    // 各行を順次処理
    const promises = [];
    subtableRows.forEach(function(row, index) {
      const promise = createOrUpdateRecordFromSubtableRow(row, index);
      promises.push(promise);
    });

    // すべてのレコード作成/更新が完了したら、元のサブテーブルを更新
    Promise.all(promises)
      .then(function(results) {
        console.log('全レコード処理完了:', results.length + '件');
        
        // 作成されたレコード番号をサブテーブルに書き戻す（新規作成の場合のみ）
        updateSubtableWithRecordNumbers(sourceRecordId, subtableRows, results);
      })
      .catch(function(error) {
        console.error('レコード処理エラー:', error);
        alert('一部のレコード処理に失敗しました。\n詳細はコンソールログを確認してください。');
      });
  }

  /**
   * サブテーブルの1行から1レコードを作成または更新
   */
  function createOrUpdateRecordFromSubtableRow(row, rowIndex) {
    const targetRecord = {};

    // フィールドマッピングに従ってデータをコピー
    Object.keys(FIELD_MAPPING).forEach(function(sourceField) {
      const targetField = FIELD_MAPPING[sourceField];
      
      if (row.value[sourceField]) {
        const fieldValue = row.value[sourceField].value;
        const fieldType = row.value[sourceField].type;
        
        targetRecord[targetField] = {
          value: copyFieldValue(fieldValue, fieldType)
        };
        
        console.log('行' + rowIndex + ': ' + sourceField + ' → ' + targetField, fieldValue);
      }
    });

    // 回線IDを取得（重複チェック用）
    const circuitId = row.value['回線ID_tbl'] ? row.value['回線ID_tbl'].value : null;
    
    // 管理レコードNoをチェック
    const managementRecordNo = row.value[CONFIG.MANAGEMENT_RECORD_NO_FIELD] 
      ? row.value[CONFIG.MANAGEMENT_RECORD_NO_FIELD].value 
      : null;

    // 既存レコードを検索（管理レコードNoまたは回線IDで）
    return findExistingRecord(managementRecordNo, circuitId, rowIndex)
      .then(function(existingRecordId) {
        if (existingRecordId) {
          // 既存レコードを更新
          console.log('行' + rowIndex + ': レコードID ' + existingRecordId + ' を更新します');
          
          const updateBody = {
            app: CONFIG.TARGET_APP_ID,
            id: existingRecordId,
            record: targetRecord
          };

          return kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', updateBody)
            .then(function(resp) {
              console.log('レコード更新成功 (行' + rowIndex + '):', existingRecordId);
              return {
                rowIndex: rowIndex,
                recordId: existingRecordId,
                row: row,
                isNew: false
              };
            })
            .catch(function(error) {
              console.error('レコード更新失敗 (行' + rowIndex + '):', error);
              if (error.errors) {
                console.error('エラー詳細 (行' + rowIndex + '):', JSON.stringify(error.errors, null, 2));
              }
              throw error;
            });
        } else {
          // 新規レコードを作成
          console.log('行' + rowIndex + ': 新規レコードを作成します');
          
          const createBody = {
            app: CONFIG.TARGET_APP_ID,
            record: targetRecord
          };

          return kintone.api(kintone.api.url('/k/v1/record', true), 'POST', createBody)
            .then(function(resp) {
              console.log('レコード作成成功 (行' + rowIndex + '):', resp.id);
              return {
                rowIndex: rowIndex,
                recordId: resp.id,
                row: row,
                isNew: true
              };
            })
            .catch(function(error) {
              console.error('レコード作成失敗 (行' + rowIndex + '):', error);
              if (error.errors) {
                console.error('エラー詳細 (行' + rowIndex + '):', JSON.stringify(error.errors, null, 2));
              }
              throw error;
            });
        }
      });
  }

  /**
   * 既存レコードを検索（管理レコードNoまたは回線IDで）
   */
  function findExistingRecord(managementRecordNo, circuitId, rowIndex) {
    // 管理レコードNoが存在する場合は、それを使用
    if (managementRecordNo) {
      console.log('行' + rowIndex + ': 管理レコードNo ' + managementRecordNo + ' で検索');
      return Promise.resolve(managementRecordNo);
    }

    // 回線IDで既存レコードを検索
    if (circuitId) {
      console.log('行' + rowIndex + ': 回線ID "' + circuitId + '" で既存レコードを検索中...');
      
      const query = '回線ID = "' + circuitId + '"';
      
      return kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
        app: CONFIG.TARGET_APP_ID,
        query: query,
        fields: ['$id']
      }).then(function(resp) {
        if (resp.records && resp.records.length > 0) {
          const existingId = resp.records[0].$id.value;
          console.log('行' + rowIndex + ': 既存レコード発見 (ID: ' + existingId + ')');
          return existingId;
        } else {
          console.log('行' + rowIndex + ': 既存レコードなし');
          return null;
        }
      }).catch(function(error) {
        console.error('行' + rowIndex + ': レコード検索エラー:', error);
        return null;
      });
    }

    // 両方ともない場合は新規作成
    return Promise.resolve(null);
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
    
    // ファイルの場合は配列のまま返す
    if (fieldType === 'FILE') {
      return value;
    }
    
    // その他の場合はそのまま返す
    return value;
  }

  /**
   * 元のサブテーブルに作成したレコード番号を書き戻す（新規作成のみ）
   */
  function updateSubtableWithRecordNumbers(sourceRecordId, originalSubtableRows, results) {
    console.log('サブテーブルを更新中...');
    console.log('[DEBUG] sourceRecordId:', sourceRecordId);

    // 新規作成されたレコードのみ抽出
    const newRecords = results.filter(function(result) {
      return result.isNew === true;
    });

    // 新規作成がない場合はサブテーブル更新をスキップ
    if (newRecords.length === 0) {
      console.log('新規作成されたレコードがないため、サブテーブル更新をスキップします');
      
      const updatedCount = results.filter(function(r) { return !r.isNew; }).length;
      alert('サブテーブルの ' + results.length + ' 行を処理しました。\n新規作成: 0件\n更新: ' + updatedCount + '件');
      
      // ページをリロードして更新内容を反映
      location.reload();
      return;
    }

    // 元のサブテーブルデータを取得
    const getParams = {
      app: CONFIG.SOURCE_APP_ID,
      id: sourceRecordId
    };
    console.log('[DEBUG] レコード取得パラメータ:', JSON.stringify(getParams));
    
    kintone.api(kintone.api.url('/k/v1/record', true), 'GET', getParams).then(function(resp) {
      const record = resp.record;
      const subtable = record[CONFIG.SUBTABLE_FIELD].value;

      // 新規作成された行にのみ管理レコードNoを設定
      newRecords.forEach(function(result) {
        const rowIndex = result.rowIndex;
        const recordId = result.recordId;
        
        if (subtable[rowIndex] && subtable[rowIndex].value[CONFIG.MANAGEMENT_RECORD_NO_FIELD]) {
          subtable[rowIndex].value[CONFIG.MANAGEMENT_RECORD_NO_FIELD].value = String(recordId);
          console.log('行' + rowIndex + 'に管理レコードNo ' + recordId + ' を設定');
        }
      });

      // レコードを更新
      const updateBody = {
        app: CONFIG.SOURCE_APP_ID,
        id: sourceRecordId,
        record: {}
      };
      updateBody.record[CONFIG.SUBTABLE_FIELD] = {
        value: subtable
      };

      return kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', updateBody);
    }).then(function(resp) {
      console.log('サブテーブル更新成功');
      
      const createdCount = newRecords.length;
      const updatedCount = results.length - createdCount;
      alert('サブテーブルの ' + results.length + ' 行を処理しました。\n新規作成: ' + createdCount + '件\n更新: ' + updatedCount + '件');
      
      // ページをリロードして更新内容を反映
      location.reload();
    }).catch(function(error) {
      console.error('サブテーブル更新エラー:', error);
      alert('レコードは処理されましたが、管理レコードNoの設定に失敗しました。\n詳細はコンソールログを確認してください。');
    });
  }

})();
