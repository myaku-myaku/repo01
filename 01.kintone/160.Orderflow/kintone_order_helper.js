/**
 * kintone_order_helper.js
 *
 * 【概要】
 * [NW伝送]011_オーダーフロー アプリ用。
 * 発注依頼に関するメール確認・フィールドセット機能を提供する。
 *
 * 【機能一覧】
 * 1. 発注依頼メール確認（Step1）
 *    - メール確認ボタンでメール本文をポップアップ表示する。
 *    - 発注内容_テーブルの全行からメール本文を組み立てる。
 *    - 複数行の場合は CSV テキストも合わせて表示する。
 *    - 添付: 発注内容 CSV（常時生成）。
 *    - スペース: order_mail_check に配置。
 *
 * 2. メールフィールドセット（Step2）
 *    - メールプレビュー確認後、「メールフィールドセット」ボタンで
 *      Boost! Mail プラグイン用フィールドへ値を書き込む。
 *    - 発注依頼メールCC / 件名 / 本文 / 添付: REST API PUT でセット（Toは参照元のため除外）。
 *    - 添付: 発注内容 CSV を常時生成。
 *    - プロセスアクション前に実行し、プラグインが読み取れるようにする。
 *
 * 【依存】なし（Kintone JS API のみ使用）
 * 【配置】Kintone アプリの JS カスタマイズにアップロード
 */
(function () {
    'use strict';

    // =============================================
    // ★ 設定 (CONFIG)
    // =============================================
    var CONFIG = {
        // ---------- Step1: メール確認 ----------
        MAIL_BUTTON_ID: 'order_mail_preview_btn',
        MAIL_BUTTON_LABEL: '発注依頼メール確認',
        SPACE_ELEMENT_ID: 'order_mail_check',

        // 発注内容サブテーブル
        SUBTABLE: '発注内容_テーブル',

        // メールテンプレート: レコード直下のフィールド
        MAIL_TO_FIELD: '発注依頼メールTo',         // Boost! Mail 用（手動入力、セット対象外）
        FIXED_CC_ADDRESS: 'SNC-bd-s@sony.com',    // CC固定アドレス
        RECORD_NO_FIELD: 'Record_No',
        // SUBJECT_TITLE_FIELD: '伝票案件名MLタイトル',  // ← 廃止予定: サブテーブル1行目の TBL_ITEM_NAME を使用
        DEPT_FIELD: '依頼部門',
        CREATOR_FIELD: '作成者',                   // レコード作成者
        APPROVER1_FIELD: '承認者1_発注時',
        EXTRA_APPROVER_TBL: '追加承認者_発注時TB',   // サブテーブル
        EXTRA_APPROVER_FIELD: '追加承認者_発注',      // サブテーブル内ドロップダウン

        // メール本文用: レコード直下のフィールド
        ORDER_SUPPLIER: '発注先',
        ORDER_SUPPLIER_ABBR: '発注先略称',
        CONTRACT_NO: '契約書番号計算',
        DEAL_CONTENT: '取引内容',
        ESTIMATE_NO: '見積書番号',
        DELIVERY_DATE: '納品予定日',              // 日付フィールド（YYYY-MM-DD）
        REMARKS: '備考',
        NOKIA_REMARKS_TEXT: '注文書に記載する支払期日は請求書発行日から30日以内としてください',
        STATUS_FIELD: 'ステータス',
        NOKIA_TARGET_STATUS: '01.未処理',

        // サブテーブル内フィールド
        TBL_APPROVAL_NO: '決裁番号',
        TBL_ITEM_NAME: '伝票案件名',
        TBL_DETAIL_NAME: '明細名',
        TBL_BUDGET_CODE: '予算CD',
        TBL_COST_CODE: '費用CD',
        TBL_AMOUNT: '金額_テーブル',
        TBL_ESTIMATE_FILE: '見積書_発注tbl',    // 添付ファイル（FILE型）

        // ---------- Step2: メールフィールドセット ----------
        ML_CC_FIELD: '発注依頼メールCC',            // 文字列1行
        ML_SUBJECT_FIELD: '発注依頼メール件名',        // 文字列1行
        ML_BODY_FIELD: '発注依頼メール本文',          // 複数行テキスト
        ML_ATTACHMENT_FIELD: '発注依頼メール添付',      // 添付ファイル（FILE型）
        SET_ML_BUTTON_ID: 'order_set_ml_btn',
        SET_ML_BUTTON_LABEL: 'メールフィールドセット',

        // CSV 生成対象フィールド（kintone_csv_attachment.js 互換形式）
        CSV_FIELDS: [
            { code: '決裁番号',     header: '決裁番号' },
            { code: '伝票案件名',   header: '伝票案件名' },
            { code: '明細名',       header: '明細名' },
            { code: '予算CD',       header: '予算CD' },
            { code: '費用CD',       header: '費用CD' },
            { code: '金額_テーブル', header: '金額' }
        ]
    };

    // =============================================
    // ユーティリティ
    // =============================================

    /** フィールド値を安全に取得 */
    function getFieldValue(record, fieldCode) {
        if (!record[fieldCode]) return '';
        var val = record[fieldCode].value;
        if (val === null || val === undefined) return '';
        // ユーザー選択フィールド（配列）
        if (Array.isArray(val)) {
            return val.map(function (u) {
                var name = u.name || u.code || '';
                // 【SNC】等のプレフィックスを除去
                return name.replace(/^[\[【\(（][^\]】\)）]*[\]】\)）]\s*/g, '').trim();
            }).join('、');
        }
        // オブジェクト型（単一ユーザー等）
        if (typeof val === 'object' && val.name) {
            return val.name.replace(/^[\[【\(（][^\]】\)）]*[\]】\)）]\s*/g, '').trim();
        }
        return String(val);
    }

    /** 金額をカンマ区切りに変換 */
    function formatAmount(val) {
        if (!val) return '';
        var n = Number(val);
        if (isNaN(n)) return val;
        return n.toLocaleString('ja-JP');
    }

    /** YYYY-MM-DD を YYYY年M月D日 に変換 */
    function formatDateJP(dateStr) {
        if (!dateStr) return '';
        var parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        var y = parts[0];
        var m = parseInt(parts[1], 10);
        var d = parseInt(parts[2], 10);
        return y + '年' + m + '月' + d + '日';
    }

    /** サブテーブル行のセル値を安全に取得 */
    function getCellValue(row, fieldCode) {
        if (!row || !row.value || !row.value[fieldCode]) return '';
        var val = row.value[fieldCode].value;
        if (val === null || val === undefined) return '';
        return String(val);
    }

    /** CSV 用エスケープ */
    function escapeCSV(val) {
        if (val === null || val === undefined) val = '';
        val = String(val);
        if (val.indexOf(',') >= 0 || val.indexOf('"') >= 0 || val.indexOf('\n') >= 0) {
            return '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
    }

    /**
     * 発注内容_テーブルの全行を取得
     */
    function getOrderRows(record) {
        var subtable = record[CONFIG.SUBTABLE];
        if (!subtable || !subtable.value) return [];
        return subtable.value;
    }

    /**
     * サブテーブル全行の見積書ファイルを重複除去して収集する
     * @param {Array} rows - サブテーブル行配列
     * @returns {Array} 重複除去済みファイルオブジェクト配列
     */
    function collectEstimateFiles(rows) {
        var allFiles = [];
        var seenNames = {};
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (row && row.value[CONFIG.TBL_ESTIMATE_FILE]) {
                var files = row.value[CONFIG.TBL_ESTIMATE_FILE].value;
                if (files) {
                    for (var j = 0; j < files.length; j++) {
                        if (!seenNames[files[j].name]) {
                            seenNames[files[j].name] = true;
                            allFiles.push(files[j]);
                        }
                    }
                }
            }
        }
        return allFiles;
    }

    /**
     * サブテーブル行から CSV テキストを生成
     * (kintone_csv_attachment.js 互換形式: ヘッダー + データ + 合計行)
     */
    function buildCsvFromRows(rows) {
        var lines = [];
        // ヘッダー
        lines.push(CONFIG.CSV_FIELDS.map(function (f) { return f.header; }).join(','));
        // データ行
        var totalAmount = 0;
        rows.forEach(function (row) {
            var cells = CONFIG.CSV_FIELDS.map(function (f) {
                var val = getCellValue(row, f.code);
                if (f.code === CONFIG.TBL_AMOUNT) {
                    totalAmount += (parseFloat(val) || 0);
                }
                return escapeCSV(val);
            });
            lines.push(cells.join(','));
        });
        // 合計行
        var totalCells = CONFIG.CSV_FIELDS.map(function (f) {
            if (f.code === CONFIG.TBL_AMOUNT) return escapeCSV(String(totalAmount));
            if (f.code === CONFIG.TBL_COST_CODE) return escapeCSV('合計');
            return '';
        });
        lines.push(totalCells.join(','));
        return lines.join('\n');
    }

    // =============================================
    // Step1: 発注依頼メール確認（プレビュー）
    // =============================================

    /**
     * レコードとサブテーブル行からメールデータを組み立てる
     * @param {Object} record     - kintone レコード
     * @param {Array}  rows       - 発注内容_テーブルの全行
     * @param {string} loginEmail - ログインユーザーのメールアドレス
     * @returns {Object} {to, cc, subject, body, attachNames}
     */
    function buildOrderMailPreview(record, rows, loginEmail) {
        // レコード直下のフィールド
        var to = getFieldValue(record, CONFIG.MAIL_TO_FIELD);
        // CC: ログインユーザー + 固定アドレス
        var ccParts = [];
        if (loginEmail) ccParts.push(loginEmail);
        ccParts.push(CONFIG.FIXED_CC_ADDRESS);
        var cc = ccParts.join(', ');

        var recNo       = getFieldValue(record, CONFIG.RECORD_NO_FIELD);
        var dept         = getFieldValue(record, CONFIG.DEPT_FIELD);
        var creator      = getFieldValue(record, CONFIG.CREATOR_FIELD);
        var approver1    = getFieldValue(record, CONFIG.APPROVER1_FIELD);

        // 追加承認者_発注時: サブテーブル内ドロップダウンから取得
        var extraApprover = '';
        var extraTbl = record[CONFIG.EXTRA_APPROVER_TBL];
        if (extraTbl && extraTbl.value && extraTbl.value.length > 0) {
            var names = [];
            for (var ei = 0; ei < extraTbl.value.length; ei++) {
                var ev = extraTbl.value[ei].value[CONFIG.EXTRA_APPROVER_FIELD];
                if (ev && ev.value) names.push(ev.value);
            }
            extraApprover = names.join(' → ');
        }
        console.log('[order-helper] 追加承認者_発注時:', extraApprover);

        // メール本文用: レコード直下のフィールド
        var supplier    = getFieldValue(record, CONFIG.ORDER_SUPPLIER);
        var contractNo  = getFieldValue(record, CONFIG.CONTRACT_NO);
        var dealContent = getFieldValue(record, CONFIG.DEAL_CONTENT);
        var estimateNo  = getFieldValue(record, CONFIG.ESTIMATE_NO);
        var deliveryDate = getFieldValue(record, CONFIG.DELIVERY_DATE);
        var deliveryDateJP = formatDateJP(deliveryDate);
        var remarks     = getFieldValue(record, CONFIG.REMARKS);

        // サブテーブル先頭行から直接取得
        var firstRow    = rows[0];
        var approvalNo  = getCellValue(firstRow, CONFIG.TBL_APPROVAL_NO);
        var itemName    = getCellValue(firstRow, CONFIG.TBL_ITEM_NAME);
        var detailName  = getCellValue(firstRow, CONFIG.TBL_DETAIL_NAME);
        var costCode    = getCellValue(firstRow, CONFIG.TBL_COST_CODE);
        var budgetCode  = getCellValue(firstRow, CONFIG.TBL_BUDGET_CODE);

        // 複数行ある場合は個別値ではなく CSV 添付への誘導文言にする
        if (rows.length > 1) {
            costCode   = '添付ご参照ください';
            budgetCode = '添付ご参照ください';
        }

        // 金額: 全行の合計
        var totalAmount = 0;
        for (var i = 0; i < rows.length; i++) {
            totalAmount += (parseFloat(getCellValue(rows[i], CONFIG.TBL_AMOUNT)) || 0);
        }
        var amountStr = formatAmount(totalAmount);

        // 添付ファイル: 全行の見積書_発注tblから収集（同名重複除去）
        var estimateFiles = collectEstimateFiles(rows);
        var attachParts = [];
        if (estimateFiles.length > 0) {
            attachParts.push(estimateFiles.map(function (f) { return f.name; }).join(', '));
        }
        if (rows.length > 1) {
            attachParts.push('発注内容_データ.csv');
        }
        var attachNames = attachParts.length > 0 ? attachParts.join(', ') : '（なし）';

        // 件名: サブテーブル1行目の伝票案件名を使用（伝票案件名MLタイトルは廃止予定）
        var subject = '【発注依頼】[' + recNo + ']' + itemName;

        // 本文: 既存プラグインテンプレート準拠
        var body = [
            'ご担当者様',
            '',
            'お疲れ様です。',
            dept + ' ' + creator + 'です。',
            '',
            '下記注文書の発行をお願いします。',
            '==================================================',
            '(1)決裁承認番号　:  ' + approvalNo,
            '(2)取引先名　　　:  ' + supplier,
            '(3)契約書番号    :  ' + contractNo,
            '(4)伝票案件名    : ' + itemName,
            '(5)明細名        :  ' + detailName,
            '(6)取引内容      :  ' + dealContent,
            '(7)費用コード    :  ' + costCode,
            '(8)予算CD       :  ' + budgetCode,
            '(9)金額          :  \\ ' + amountStr + '.-',
            '(10)見積書番号   :  ' + estimateNo,
            '(11)納品日       :  ' + deliveryDateJP,
            '(12)検収完了日   :  ' + deliveryDateJP,
            '(13)納入場所　   :  調整完了後に都度メールで連絡',
            '(14)作業場所     :　SNC港南オフィス',
            '(15)検査条件     :',
            '(16)承認ルート   :  ' + approver1 + ' → ' + extraApprover,
            '(17)備考　       : ' + remarks
        ].join('\n');

        return {
            to: to,
            cc: cc,
            subject: subject,
            body: body,
            attachNames: attachNames
        };
    }

    function showOrderMailPreview() {
        // REST API でサーバーから最新レコードを取得（保存済みデータを確実に反映）
        var recId = kintone.app.record.getId();
        if (!recId) {
            doShowOrderMailPreview(kintone.app.record.get().record, '');
            return;
        }

        kintone.api(kintone.api.url('/k/v1/record', true), 'GET', {
            app: kintone.app.getId(),
            id: recId
        }).then(function (resp) {
            console.log('[order-helper] REST API でレコード取得成功');
            var record = resp.record;
            // ログインユーザーのメールアドレスを User API で取得
            var loginUser = kintone.getLoginUser();
            if (loginUser && loginUser.code) {
                return kintone.api('/v1/users.json', 'GET', { codes: [loginUser.code] })
                    .then(function (userResp) {
                        var email = '';
                        if (userResp.users && userResp.users.length > 0) {
                            email = userResp.users[0].email || '';
                        }
                        console.log('[order-helper] ログインユーザーメール:', email);
                        doShowOrderMailPreview(record, email);
                    }).catch(function (uerr) {
                        console.warn('[order-helper] User API 取得失敗:', uerr);
                        doShowOrderMailPreview(record, '');
                    });
            }
            doShowOrderMailPreview(record, '');
        }).catch(function (err) {
            console.warn('[order-helper] REST API 取得失敗、フォームデータを使用:', err);
            doShowOrderMailPreview(
                kintone.app.record.get().record,
                ''
            );
        });
    }

    function doShowOrderMailPreview(record, loginEmail) {
        var rows = getOrderRows(record);
        if (rows.length === 0) {
            alert('発注内容_テーブルにデータがありません。');
            return;
        }

        var mail = buildOrderMailPreview(record, rows, loginEmail);

        var sections = [
            '━━━━ メールプレビュー ━━━━',
            '',
            '宛先：' + mail.to,
            'CC：' + mail.cc,
            '件名：' + mail.subject,
            '添付：' + (mail.attachNames || '（なし）'),
            '',
            '--- 本文 ---',
            mail.body,
            '',
            '━━━━━━━━━━━━━━━━━━━━'
        ];

        // 複数行の場合のみ CSV テキストも表示
        if (rows.length > 1) {
            sections.push('');
            sections.push('━━━━ 発注内容 CSV（' + rows.length + '行） ━━━━');
            sections.push(buildCsvFromRows(rows));
            sections.push('━━━━━━━━━━━━━━━━━━━━');
        }

        var preview = sections.join('\n');

        // モーダルダイアログで表示
        try {
            var overlay = document.createElement('div');
            overlay.style.cssText =
                'position:fixed;top:0;left:0;width:100%;height:100%;' +
                'background:rgba(0,0,0,0.5);z-index:99999;display:flex;' +
                'justify-content:center;align-items:center;';

            var dialog = document.createElement('div');
            dialog.style.cssText =
                'background:#fff;border-radius:8px;padding:24px;max-width:700px;' +
                'width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.3);' +
                'font-family:monospace;white-space:pre-wrap;font-size:13px;line-height:1.6;';

            var closeBtn = document.createElement('button');
            closeBtn.innerText = '閉じる';
            closeBtn.style.cssText =
                'display:block;margin:16px auto 0;padding:8px 32px;' +
                'background:#3498db;color:#fff;border:none;border-radius:4px;' +
                'font-size:14px;cursor:pointer;';
            closeBtn.addEventListener('click', function () {
                document.body.removeChild(overlay);
            });

            dialog.textContent = preview;

            // --- メールフィールドセットボタン ---
            var setMlBtn = document.createElement('button');
            setMlBtn.innerText = CONFIG.SET_ML_BUTTON_LABEL;
            setMlBtn.style.cssText =
                'display:block;margin:12px auto 0;padding:8px 32px;' +
                'background:#e67e22;color:#fff;border:none;border-radius:4px;' +
                'font-size:14px;cursor:pointer;font-weight:bold;';
            setMlBtn.addEventListener('click', function () {
                setMlBtn.disabled = true;
                setMlBtn.innerText = '処理中...';
                // メールフィールドセット開始時に閉じるボタンを非表示
                closeBtn.style.display = 'none';
                setOrderMailFields(record, mail, rows).then(function () {
                    setMlBtn.innerText = 'セット完了 ✓（リロード中…）';
                    setMlBtn.style.background = '#27ae60';
                    // PUT でリビジョンが進むため、ページをリロードして反映
                    setTimeout(function () { location.reload(); }, 800);
                }).catch(function (err) {
                    setMlBtn.innerText = 'エラー（コンソール参照）';
                    setMlBtn.style.background = '#e74c3c';
                    // エラー時は閉じるボタンを再表示
                    closeBtn.style.display = 'block';
                    console.error('[order-helper] メールフィールドセット失敗:', err);
                });
            });
            dialog.appendChild(setMlBtn);

            dialog.appendChild(closeBtn);
            overlay.appendChild(dialog);
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) {
                    document.body.removeChild(overlay);
                }
            });
            document.body.appendChild(overlay);
        } catch (e) {
            // フォールバック: alertで表示
            console.warn('[order-helper] ポップアップ表示失敗:', e);
            alert(preview);
        }

        console.log('[order-helper] メールプレビュー表示 (行数: ' + rows.length + ')');
    }

    // =============================================
    // ボタン配置
    // =============================================

    // メール確認ボタン（詳細画面のみ）
    kintone.events.on('app.record.detail.show', function (event) {
        if (!document.getElementById(CONFIG.MAIL_BUTTON_ID)) {
            var mailBtn = document.createElement('button');
            mailBtn.id = CONFIG.MAIL_BUTTON_ID;
            mailBtn.innerText = CONFIG.MAIL_BUTTON_LABEL;
            mailBtn.style.cssText =
                'padding: 8px 16px; background-color: #2980b9; color: #fff; ' +
                'border: none; border-radius: 4px; font-weight: bold; font-size: 13px; ' +
                'cursor: pointer;';
            mailBtn.addEventListener('click', function (e) {
                e.preventDefault();
                showOrderMailPreview();
            });
            placeButton(mailBtn, CONFIG.SPACE_ELEMENT_ID);
        }
        return event;
    });

    function placeButton(button, spaceId) {
        if (spaceId) {
            try {
                var spaceEl = kintone.app.record.getSpaceElement(spaceId);
                if (spaceEl) {
                    spaceEl.appendChild(button);
                    return;
                }
            } catch (e) {
                console.warn('[order-helper] getSpaceElement失敗:', e);
            }
        }
        // フォールバック: ヘッダーメニュー
        try {
            var header = kintone.app.record.getHeaderMenuSpaceElement();
            if (header) {
                header.appendChild(button);
                return;
            }
        } catch (e2) {
            console.warn('[order-helper] getHeaderMenuSpaceElement失敗:', e2);
        }
        // 最終手段: fixed
        button.style.cssText += 'position:fixed;top:12px;right:200px;z-index:10000;';
        document.body.appendChild(button);
    }

    // =============================================
    // Step2: メールフィールドセット（REST API PUT）
    // =============================================

    /**
     * ファイルをダウンロードして再アップロードし、新しい fileKey を返す
     * (REST API GET の fileKey はダウンロード専用で PUT に使えないため)
     * @param {string} fileKey - ダウンロード用 fileKey
     * @param {string} fileName - ファイル名
     * @returns {Promise<string>} 新しい fileKey
     */
    function reuploadFile(fileKey, fileName) {
        var downloadUrl = kintone.api.url('/k/v1/file', true) + '?fileKey=' + fileKey;
        return new kintone.Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', downloadUrl);
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.responseType = 'blob';
            xhr.onload = function () {
                if (xhr.status !== 200) {
                    reject(new Error('ダウンロード失敗: ' + xhr.status));
                    return;
                }
                var blob = xhr.response;
                var formData = new FormData();
                formData.append('__REQUEST_TOKEN__', kintone.getRequestToken());
                formData.append('file', blob, fileName);
                var uploadXhr = new XMLHttpRequest();
                uploadXhr.open('POST', kintone.api.url('/k/v1/file', true));
                uploadXhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
                uploadXhr.onload = function () {
                    if (uploadXhr.status !== 200) {
                        reject(new Error('アップロード失敗: ' + uploadXhr.status));
                        return;
                    }
                    var resp = JSON.parse(uploadXhr.responseText);
                    resolve(resp.fileKey);
                };
                uploadXhr.onerror = function () { reject(new Error('アップロード通信エラー')); };
                uploadXhr.send(formData);
            };
            xhr.onerror = function () { reject(new Error('ダウンロード通信エラー')); };
            xhr.send();
        });
    }

    /**
     * CSV テキストから Blob を作成し、アップロードして fileKey を返す
     * @param {string} csvText - CSV テキスト
     * @param {string} fileName - ファイル名
     * @returns {Promise<string>} 新しい fileKey
     */
    function uploadCsvBlob(csvText, fileName) {
        var csvContent = '\uFEFF' + csvText; // BOM付きUTF-8
        var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        var formData = new FormData();
        formData.append('__REQUEST_TOKEN__', kintone.getRequestToken());
        formData.append('file', blob, fileName);

        return new kintone.Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', kintone.api.url('/k/v1/file', true));
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.onload = function () {
                if (xhr.status !== 200) {
                    reject(new Error('CSVアップロード失敗: ' + xhr.status));
                    return;
                }
                var resp = JSON.parse(xhr.responseText);
                resolve(resp.fileKey);
            };
            xhr.onerror = function () { reject(new Error('CSVアップロード通信エラー')); };
            xhr.send(formData);
        });
    }

    /**
     * REST API PUT でメール用フィールド（4フィールド）をセットする
     * - 発注依頼メールCC / 件名 / 本文: テキストフィールド
     * - 発注依頼メール添付: 見積書再アップロード + CSV（複数行時）
     * ※ 発注依頼メールTo はプレビュー参照元のため書き込み対象外
     * @param {Object} record - kintone レコード
     * @param {Object} mail   - buildOrderMailPreview の戻り値 {to, cc, subject, body}
     * @param {Array}  rows   - 発注内容_テーブルの全行
     * @returns {Promise}
     */
    function setOrderMailFields(record, mail, rows) {
        var estimateFiles = collectEstimateFiles(rows);
        console.log('[order-helper] メールフィールドセット開始: 見積書 ' + estimateFiles.length + ' 件, ' + rows.length + ' 行');

        // 見積書ファイルを再アップロード
        var uploadPromises = estimateFiles.map(function (f) {
            return reuploadFile(f.fileKey, f.name);
        });

        // 複数行 → CSV ファイルも生成してアップロード
        if (rows.length > 1) {
            var csvText = buildCsvFromRows(rows);
            var now = new Date();
            var dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
            var timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
            var csvFileName = '発注内容_データ_' + dateStr + '_' + timeStr + '.csv';
            uploadPromises.push(uploadCsvBlob(csvText, csvFileName));
            console.log('[order-helper] CSV ファイル生成: ' + csvFileName);
        }

        if (uploadPromises.length === 0) {
            console.log('[order-helper] 添付ファイルなし');
        }

        return kintone.Promise.all(uploadPromises).then(function (newFileKeys) {
            var fileKeyValues = newFileKeys.map(function (key) {
                return { fileKey: key };
            });

            var recId = kintone.app.record.getId();
            var appId = kintone.app.getId();
            var body = {
                app: appId,
                id: recId,
                record: {}
            };

            // テキストフィールド（3フィールド）※ To は参照元のため除外
            body.record[CONFIG.ML_CC_FIELD] = { value: mail.cc };
            body.record[CONFIG.ML_SUBJECT_FIELD] = { value: mail.subject };
            body.record[CONFIG.ML_BODY_FIELD] = { value: mail.body };

            // 添付ファイル（見積書 + CSV）
            body.record[CONFIG.ML_ATTACHMENT_FIELD] = { value: fileKeyValues };

            return kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', body);
        }).then(function () {
            console.log('[order-helper] メールフィールドセット完了（REST API）');
        });
    }

    // =============================================
    // NOKIA 備考自動追記（レコード保存時）
    // =============================================
    // ステータスが「01.未処理」の場合のみ、発注先略称が NOKIA なら
    // 備考フィールドに定型テキストを追記する（重複追記防止付き）
    var submitEvents = [
        'app.record.create.submit',
        'app.record.edit.submit'
    ];
    kintone.events.on(submitEvents, function (event) {
        var record = event.record;
        var status = record[CONFIG.STATUS_FIELD] ? record[CONFIG.STATUS_FIELD].value : '';
        if (status !== CONFIG.NOKIA_TARGET_STATUS) {
            return event;
        }

        var supplierAbbr = getFieldValue(record, CONFIG.ORDER_SUPPLIER_ABBR);
        if (supplierAbbr !== 'NOKIA') {
            return event;
        }

        var currentRemarks = getFieldValue(record, CONFIG.REMARKS);
        if (currentRemarks.indexOf(CONFIG.NOKIA_REMARKS_TEXT) !== -1) {
            console.log('[order-helper] NOKIA備考: 既に追記済みのためスキップ');
            return event;
        }

        var newRemarks = currentRemarks
            ? (currentRemarks + '\n' + CONFIG.NOKIA_REMARKS_TEXT)
            : CONFIG.NOKIA_REMARKS_TEXT;
        event.record[CONFIG.REMARKS].value = newRemarks;
        console.log('[order-helper] NOKIA備考: 保存時に追記しました (ステータス: ' + status + ')');
        return event;
    });

    console.log('[INIT] kintone_order_helper 読み込み完了');
})();
