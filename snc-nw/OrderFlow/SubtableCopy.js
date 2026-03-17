(function() {
  'use strict';

  // レコード保存成功後、処理フラグをセッションストレージに保存
  kintone.events.on([
    'app.record.create.submit.success',
    'app.record.edit.submit.success'
  ], function(event) {
    const recordId = event.recordId;
    const appId = kintone.app.getId();
    
    // 処理が必要であることをセッションストレージに保存
    sessionStorage.setItem('needFileCopy', JSON.stringify({
      appId: appId,
      recordId: recordId
    }));
    
    return event;
  });

  // レコード詳細表示時または編集画面表示時に、ファイルコピー処理を実行
  kintone.events.on(['app.record.detail.show', 'app.record.edit.show'], async function(event) {
    try {
      const stored = sessionStorage.getItem('needFileCopy');
      if (!stored) {
        return event;
      }

      const data = JSON.parse(stored);
      const recordId = event.recordId;
      
      // 対象レコードかチェック
      if (data.recordId !== recordId) {
        return event;
      }

      // フラグをクリア（2重実行防止）
      sessionStorage.removeItem('needFileCopy');
      
      console.log('ファイルコピー処理開始');

      const appId = kintone.app.getId();
      const record = event.record;
      const subtable = record['支払い金額テーブル'];
      
      console.log('サブテーブル:', subtable);

      // 「メール送付」にチェックが入っている行を検索
      let targetRow = null;
      
      if (subtable && subtable.value && subtable.value.length > 0) {
        for (let i = 0; i < subtable.value.length; i++) {
          const row = subtable.value[i].value;
          const mailSend = row['メール送付'] ? row['メール送付'].value : [];
          
          if (Array.isArray(mailSend) && mailSend.includes('メール送付')) {
            targetRow = row;
            console.log('コピー対象の行が見つかりました:', targetRow);
            console.log('請求書の値:', row['請求書'] ? row['請求書'].value : 'フィールドなし');
            break;
          }
        }
      }

      // チェックが入っている行が見つかり、かつ添付ファイルがある場合
      if (targetRow && targetRow['請求書'] && targetRow['請求書'].value && targetRow['請求書'].value.length > 0) {
        const sourceFiles = targetRow['請求書'].value;
        console.log('添付ファイル数:', sourceFiles.length);
        
        const uploadedFiles = [];
        const csrfToken = kintone.getRequestToken();
        console.log('CSRFトークン取得:', csrfToken ? 'OK' : 'NG');

        // 各ファイルをダウンロードして再アップロード
        for (const file of sourceFiles) {
          try {
            console.log('ファイル処理開始:', file.name);
            
            // ファイルをダウンロード
            const fileUrl = `${location.origin}/k/v1/file.json?fileKey=${file.fileKey}`;
            const response = await fetch(fileUrl, {
              method: 'GET',
              headers: {
                'X-Requested-With': 'XMLHttpRequest'
              },
              credentials: 'same-origin'
            });
            
            if (!response.ok) {
              console.error(`ファイルのダウンロードに失敗: ${response.status}`);
              continue;
            }
            
            console.log('ファイルダウンロード成功:', file.name);
            const blob = await response.blob();
            console.log('Blob取得成功、サイズ:', blob.size);
            
            // FormDataを作成してファイルをアップロード
            const formData = new FormData();
            formData.append('file', blob, file.name);
            
            const uploadUrl = `${location.origin}/k/v1/file.json`;
            const uploadResponse = await fetch(uploadUrl, {
              method: 'POST',
              headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-TOKEN': csrfToken
              },
              credentials: 'same-origin',
              body: formData
            });
            
            if (!uploadResponse.ok) {
              const errorText = await uploadResponse.text();
              console.error(`ファイルのアップロードに失敗: ${uploadResponse.status}`, errorText);
              continue;
            }
            
            const uploadResult = await uploadResponse.json();
            console.log('ファイルアップロード成功:', file.name, 'fileKey:', uploadResult.fileKey);
            
            uploadedFiles.push({
              fileKey: uploadResult.fileKey
            });
          } catch (fileError) {
            console.error('ファイルのコピーに失敗しました:', file.name, fileError);
          }
        }

        // アップロードしたファイルをレコードに設定
        if (uploadedFiles.length > 0) {
          // 通常フィールドも一緒に更新
          const updateParam = {
            app: appId,
            id: recordId,
            record: {
              '金額支払_ML': {
                value: targetRow['金額支払'] ? targetRow['金額支払'].value : ''
              },
              '支払い期日_ML': {
                value: targetRow['支払い期日'] ? targetRow['支払い期日'].value : ''
              },
              '支払いテーブルメモ_ML': {
                value: targetRow['支払いテーブルメモ'] ? targetRow['支払いテーブルメモ'].value : ''
              },
              '請求書_ML': {
                value: uploadedFiles
              }
            }
          };

          await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', updateParam);
          console.log('レコード更新完了');
          
          // ページをリロードして更新を反映
          location.reload();
        }
      } else {
        console.log('添付ファイルなし、通常フィールドのみ更新');
        
        // 添付ファイルがない場合も通常フィールドは更新
        if (targetRow) {
          const updateParam = {
            app: appId,
            id: recordId,
            record: {
              '金額支払_ML': {
                value: targetRow['金額支払'] ? targetRow['金額支払'].value : ''
              },
              '支払い期日_ML': {
                value: targetRow['支払い期日'] ? targetRow['支払い期日'].value : ''
              },
              '支払いテーブルメモ_ML': {
                value: targetRow['支払いテーブルメモ'] ? targetRow['支払いテーブルメモ'].value : ''
              }
            }
          };

          await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', updateParam);
          console.log('レコード更新完了（添付ファイルなし）');
          location.reload();
        }
      }

      return event;
      
    } catch (error) {
      console.error('コピー処理でエラーが発生しました:', error);
      return event;
    }
  });

})();
