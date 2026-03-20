/**
 * kintone_payment_helper.js
 *
 * 【概要】
 * [NW伝送]011_オーダーフロー アプリ用。
 * 支払い依頼に関する補助機能を提供する。
 *
 * 【機能一覧】
 * 1. 支払いテーブルコピーボタン（Step1）
 *    - 発注内容_テーブル → 支払い金額テーブルへフィールドをコピー。
 *    - スペース: payment_table_copy に配置。
 *
 * 2. 支払依頼メール確認（Step2）
 *    - メール確認ボタンでメール本文をポップアップ表示する。
 *    - 支払い金額テーブルの「支払い依頼日」が当日の行を抽出し、
 *      一番上の行のフィールド値をメール本文に反映する。
 *    - 当日行が複数ある場合、kintone_csv_attachment.js 形式の
 *      CSV テキストも合わせて表示する。
 *    - 添付ファイル: 請求書_支払tbl（当日行の先頭行）。
 *    - スペース: payment_mail_check に配置。
 *
 * 3. メールフィールドセット（Step3）
 *    - メールプレビュー確認後、「メールフィールドセット」ボタンで
 *      Boost! Mail プラグイン用フィールドへ値を書き込む。
 *    - 請求書_ML: 当日行の請求書_支払tblから重複除去したファイルをREST APIでコピー。
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
        // ---------- Step1: テーブルコピー ----------
        COPY_BUTTON_ID: 'payment_table_copy_btn',
        COPY_BUTTON_LABEL: '発注→支払テーブルコピー',
        SPACE_ELEMENT_ID: 'payment_table_copy',

        SOURCE_SUBTABLE: '発注内容_テーブル',
        TARGET_SUBTABLE: '支払い金額テーブル',

        // 発注内容_テーブル → 支払い金額テーブル のフィールドマッピング
        FIELD_MAPPING: {
            '決裁番号':   '決裁番号_支払tbl',
            '予算CD':     '予算CD_支払tbl',
            '金額_テーブル': '金額_支払tbl',
            '伝票案件名': '伝票案件名_支払tbl',
            '費用CD':     '費用CD_支払tbl'
        },

        // ---------- Step2: メール確認 ----------
        MAIL_BUTTON_ID: 'payment_mail_preview_btn',
        MAIL_BUTTON_LABEL: '支払依頼メール確認',
        MAIL_CONFIRM_FIELD: '支払いメール確認',  // 複数行テキスト（フォールバック用）

        // 当日行フィルタ用（サブテーブル内フィールド）
        PAYMENT_DATE_FIELD: '支払依頼日_支払tbl',   // 日付 YYYY-MM-DD

        // メールテンプレート: レコード直下のフィールド
        MAIL_TO_FIELD: '支払依頼メール送信先',
        MAIL_CC_FIELD: 'レコード作成者アドレス',
        RECORD_NO_FIELD: 'レコード番号',
        SUBJECT_TITLE_FIELD: '伝票案件名MLタイトル',
        DEPT_FIELD: '依頼部門',
        REQUESTER_FIELD: '支払い依頼者',
        PO_NO_FIELD: '発注番号_G番号',
        APPROVER1_FIELD: '承認者1_支払',
        EXTRA_APPROVER_FIELD: '追加承認者_支払',

        // メールテンプレート: サブテーブル行から取得するフィールド
        TBL_PAYMENT_DUE: '支払い期日_支払tbl',     // 支払期日
        TBL_ITEM_NAME: '伝票案件名_支払tbl',
        TBL_APPROVAL_NO: '決裁番号_支払tbl',
        TBL_COST_CODE: '費用CD_支払tbl',
        TBL_BUDGET_CODE: '予算CD_支払tbl',

        // 添付ファイル（サブテーブル内）
        ATTACHMENT_FIELD: '請求書_支払tbl',

        // ---------- Step3: メールフィールドセット ----------
        PROCESS_ACTION: '支払完了→クローズ',
        ML_ATTACHMENT_FIELD: '請求書_ML',   // プラグイン用: メール添付ファイル（FILE型）
        SET_ML_BUTTON_ID: 'payment_set_ml_btn',
        SET_ML_BUTTON_LABEL: 'メールフィールドセット',

        // CSV 生成対象フィールド（kintone_csv_attachment.js 互換形式）
        CSV_FIELDS: [
            { code: '決裁番号_支払tbl',   header: '決裁番号' },
            { code: '伝票案件名_支払tbl', header: '伝票案件名' },
            { code: '予算CD_支払tbl',     header: '予算CD' },
            { code: '費用CD_支払tbl',     header: '費用CD' },
            { code: '金額_支払tbl',       header: '金額' }
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

    /** サブテーブル行のセル値を安全に取得 */
    function getCellValue(row, fieldCode) {
        if (!row || !row.value || !row.value[fieldCode]) return '';
        var val = row.value[fieldCode].value;
        if (val === null || val === undefined) return '';
        return String(val);
    }

    /**
     * 当日行の請求書ファイルを重複除去して収集する
     * @param {Object} record - kintone レコード
     * @returns {Array} 重複除去済みファイルオブジェクト配列
     */
    function collectTodayAttachments(record) {
        var todayRows = getTodayRows(record);
        var allFiles = [];
        var seenNames = {};
        for (var i = 0; i < todayRows.length; i++) {
            var row = todayRows[i];
            if (row && row.value[CONFIG.ATTACHMENT_FIELD]) {
                var files = row.value[CONFIG.ATTACHMENT_FIELD].value;
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

    /** 今日の日付を YYYY-MM-DD で返す */
    function getTodayStr() {
        var d = new Date();
        var yyyy = d.getFullYear();
        var mm = ('0' + (d.getMonth() + 1)).slice(-2);
        var dd = ('0' + d.getDate()).slice(-2);
        return yyyy + '-' + mm + '-' + dd;
    }

    /**
     * 支払い金額テーブルから「支払い依頼日 == 今日」の行を返す
     */
    function getTodayRows(record) {
        var subtable = record[CONFIG.TARGET_SUBTABLE];
        if (!subtable || !subtable.value) return [];
        var today = getTodayStr();
        return subtable.value.filter(function (row) {
            return getCellValue(row, CONFIG.PAYMENT_DATE_FIELD) === today;
        });
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
     * 当日行が複数ある場合の CSV テキストを生成
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
                if (f.code === '金額_支払tbl') {
                    totalAmount += (parseFloat(val) || 0);
                }
                return escapeCSV(val);
            });
            lines.push(cells.join(','));
        });
        // 合計行
        var totalCells = CONFIG.CSV_FIELDS.map(function (f) {
            if (f.code === '金額_支払tbl') return escapeCSV(String(totalAmount));
            if (f.code === '費用CD_支払tbl') return escapeCSV('合計');
            return '';
        });
        lines.push(totalCells.join(','));
        return lines.join('\n');
    }

    // =============================================
    // Step1: 発注テーブル → 支払テーブル コピー
    // =============================================
    function copyOrderToPayment() {
        var obj = kintone.app.record.get();
        var record = obj.record;

        var srcRows = record[CONFIG.SOURCE_SUBTABLE]
            ? record[CONFIG.SOURCE_SUBTABLE].value : [];
        if (!srcRows || srcRows.length === 0) {
            alert('発注内容_テーブルにデータがありません。');
            return;
        }

        // 支払い金額テーブルに既にデータがあるか確認
        var dstRows = record[CONFIG.TARGET_SUBTABLE]
            ? record[CONFIG.TARGET_SUBTABLE].value : [];
        var hasData = dstRows.length > 0 && dstRows.some(function (row) {
            return Object.keys(CONFIG.FIELD_MAPPING).some(function (srcField) {
                var dstField = CONFIG.FIELD_MAPPING[srcField];
                var cell = row.value[dstField];
                return cell && cell.value != null && cell.value !== '';
            });
        });
        if (hasData) {
            if (!confirm('支払い金額テーブルに既にデータがあります。上書きしますか？')) {
                return;
            }
        }

        // コピー実行
        // 既存行をベースに保持し、マッピング対象だけ上書きする
        // （サブテーブルの全フィールドを含まないと type 不正エラーになるため）
        var newRows = srcRows.map(function (srcRow, idx) {
            var baseRow;
            if (dstRows[idx]) {
                // 既存行をクローン（部分支払い等の他フィールドを保持）
                baseRow = JSON.parse(JSON.stringify(dstRows[idx]));
            } else if (dstRows.length > 0) {
                // 行が足りない場合は先頭行をテンプレートにして値をクリア
                baseRow = JSON.parse(JSON.stringify(dstRows[0]));
                Object.keys(baseRow.value).forEach(function (key) {
                    var cell = baseRow.value[key];
                    if (!cell || !cell.type) return;
                    if (cell.type === 'FILE') {
                        cell.value = [];
                    } else if (cell.type === 'CHECK_BOX' || cell.type === 'MULTI_SELECT') {
                        cell.value = [];
                    } else if (cell.type === 'USER_SELECT' || cell.type === 'ORGANIZATION_SELECT' || cell.type === 'GROUP_SELECT') {
                        cell.value = [];
                    } else if (cell.type === 'DATE' || cell.type === 'DATETIME' || cell.type === 'TIME') {
                        cell.value = null;
                    } else {
                        cell.value = '';
                    }
                });
            } else {
                // 既存行が全くない場合（フォールバック）
                baseRow = { value: {} };
            }
            // 新規行として扱うため id を除去
            delete baseRow.id;

            // 日付・時刻フィールドのサニタイズ（空文字 → null）
            // Kintone は新規行の DATE/DATETIME/TIME に '' を許容しない
            Object.keys(baseRow.value).forEach(function (key) {
                var cell = baseRow.value[key];
                if (cell && (cell.type === 'DATE' || cell.type === 'DATETIME' || cell.type === 'TIME')) {
                    if (!cell.value) {
                        cell.value = null;
                    }
                }
            });

            // マッピング対象フィールドを上書き
            Object.keys(CONFIG.FIELD_MAPPING).forEach(function (srcField) {
                var dstField = CONFIG.FIELD_MAPPING[srcField];
                var srcCell = srcRow.value[srcField];
                if (srcCell && srcCell.value !== undefined) {
                    baseRow.value[dstField] = { type: srcCell.type, value: srcCell.value };
                }
            });
            return baseRow;
        });

        record[CONFIG.TARGET_SUBTABLE].value = newRows;
        kintone.app.record.set(obj);
        console.log('[payment-helper] 発注→支払テーブルコピー完了: ' + newRows.length + '行');
        alert('支払い金額テーブルに ' + newRows.length + ' 行コピーしました。');
    }

    // =============================================
    // Step2: 支払依頼メール確認（プレビュー）
    // =============================================

    /**
     * 当日行（先頭）とレコードからメールデータを組み立てる
     * @param {Object} record  - kintone レコード
     * @param {Object} todayRow - 支払い金額テーブルの当日先頭行
     */
    function buildMailPreview(record, todayRow, allTodayRows, ccEmail) {
        // レコード直下のフィールド
        var to = getFieldValue(record, CONFIG.MAIL_TO_FIELD);
        var cc = ccEmail || getFieldValue(record, CONFIG.MAIL_CC_FIELD);
        var recNo = getFieldValue(record, CONFIG.RECORD_NO_FIELD);
        var subjectTitle = getFieldValue(record, CONFIG.SUBJECT_TITLE_FIELD);
        var dept = getFieldValue(record, CONFIG.DEPT_FIELD);
        var requester = getFieldValue(record, CONFIG.REQUESTER_FIELD);
        var poNo = getFieldValue(record, CONFIG.PO_NO_FIELD);
        var approver1 = getFieldValue(record, CONFIG.APPROVER1_FIELD);

        // 追加承認者_支払: サブテーブル内ドロップダウンから取得
        var extraApprover = '';
        var extraTbl = record['追加承認者_支払TB'];
        if (extraTbl && extraTbl.value && extraTbl.value.length > 0) {
            var names = [];
            for (var ei = 0; ei < extraTbl.value.length; ei++) {
                var ev = extraTbl.value[ei].value['追加承認者_支払'];
                if (ev && ev.value) names.push(ev.value);
            }
            extraApprover = names.join(' → ');
        }
        console.log('[payment-helper] 追加承認者_支払:', extraApprover);

        // サブテーブル行のフィールド
        var paymentDue = getCellValue(todayRow, CONFIG.TBL_PAYMENT_DUE);
        var itemName   = getCellValue(todayRow, CONFIG.TBL_ITEM_NAME);
        var approvalNo = getCellValue(todayRow, CONFIG.TBL_APPROVAL_NO);
        var costCode   = getCellValue(todayRow, CONFIG.TBL_COST_CODE);
        var budgetCode = getCellValue(todayRow, CONFIG.TBL_BUDGET_CODE);

        // 添付ファイル: 当日全行から収集し、同名ファイルは1つだけ残す
        var attachNames = '';
        var allFiles = [];
        var seenNames = {};
        var rows = allTodayRows || [todayRow];
        for (var fi = 0; fi < rows.length; fi++) {
            var r = rows[fi];
            if (r && r.value[CONFIG.ATTACHMENT_FIELD]) {
                var files = r.value[CONFIG.ATTACHMENT_FIELD].value;
                if (files && files.length > 0) {
                    for (var fj = 0; fj < files.length; fj++) {
                        var fname = files[fj].name;
                        if (!seenNames[fname]) {
                            seenNames[fname] = true;
                            allFiles.push(files[fj]);
                        }
                    }
                }
            }
        }
        if (allFiles.length > 0) {
            attachNames = allFiles.map(function (f) { return f.name; }).join(', ');
        }
        console.log('[payment-helper] 添付ファイル（重複除去後）:', allFiles.length + '件', attachNames);

        var subject = '【支払依頼】[' + recNo + ']' + subjectTitle;

        var body = [
            'ご担当者様',
            '',
            'お疲れ様です。' + dept + ' ' + requester + 'です。',
            '',
            '添付の支払処理をお願い致します。',
            '--------------------------------------',
            '■支払依頼メモ',
            '支払期日  ：' + paymentDue,
            '支払内容  ：' + itemName,
            '発注WF番号：' + poNo,
            '決裁番号  ：' + approvalNo,
            '費用コード：' + costCode,
            '予算CD   ：' + budgetCode,
            '--------------------------------------',
            '承認ルート :  ' + approver1 + ' → ' + extraApprover,
            '',
            '以上、よろしくお願いいたします。'
        ].join('\n');

        return {
            to: to,
            cc: cc,
            subject: subject,
            body: body,
            attachNames: attachNames
        };
    }

    function showMailPreview() {
        // REST API でサーバーから最新レコードを取得（保存済みデータを確実に反映）
        var recId = kintone.app.record.getId();
        if (!recId) {
            doShowMailPreview(kintone.app.record.get().record, '');
            return;
        }

        kintone.api(kintone.api.url('/k/v1/record', true), 'GET', {
            app: kintone.app.getId(),
            id: recId
        }).then(function (resp) {
            console.log('[payment-helper] REST API でレコード取得成功');
            var record = resp.record;
            // 支払い依頼者のメールアドレスを User API で取得
            var reqField = record[CONFIG.REQUESTER_FIELD];
            if (reqField && reqField.value && reqField.value.length > 0) {
                var userCode = reqField.value[0].code;
                return kintone.api('/v1/users.json', 'GET', { codes: [userCode] })
                    .then(function (userResp) {
                        var email = '';
                        if (userResp.users && userResp.users.length > 0) {
                            email = userResp.users[0].email || '';
                        }
                        console.log('[payment-helper] 支払い依頼者メール:', email);
                        doShowMailPreview(record, email);
                    }).catch(function (uerr) {
                        console.warn('[payment-helper] User API 取得失敗:', uerr);
                        doShowMailPreview(record, '');
                    });
            }
            doShowMailPreview(record, '');
        }).catch(function (err) {
            console.warn('[payment-helper] REST API 取得失敗、フォームデータを使用:', err);
            doShowMailPreview(kintone.app.record.get().record, '');
        });
    }

    function doShowMailPreview(record, ccEmail) {
        var todayRows = getTodayRows(record);
        if (todayRows.length === 0) {
            alert('支払い金額テーブルに本日（' + getTodayStr() + '）の行がありません。');
            return;
        }

        // 先頭行でメール組み立て
        var firstRow = todayRows[0];
        var mail = buildMailPreview(record, firstRow, todayRows, ccEmail);

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

        // 当日行が複数 → CSV テキストも表示
        if (todayRows.length > 1) {
            sections.push('');
            sections.push('━━━━ 当日行 CSV（' + todayRows.length + '行） ━━━━');
            sections.push(buildCsvFromRows(todayRows));
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
                setMailFields(record).then(function () {
                    setMlBtn.innerText = 'セット完了 ✓（リロード中…）';
                    setMlBtn.style.background = '#27ae60';
                    // PUT でリビジョンが進むため、ページをリロードして反映
                    setTimeout(function () { location.reload(); }, 800);
                }).catch(function (err) {
                    setMlBtn.innerText = 'エラー（コンソール参照）';
                    setMlBtn.style.background = '#e74c3c';
                    console.error('[payment-helper] メールフィールドセット失敗:', err);
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
            console.warn('[payment-helper] ポップアップ表示失敗:', e);
            alert(preview);
        }

        console.log('[payment-helper] メールプレビュー表示 (当日行: ' + todayRows.length + '件)');
    }

    // =============================================
    // ボタン配置
    // =============================================

    // コピーボタン（編集画面のみ）
    kintone.events.on('app.record.edit.show', function (event) {
        if (!document.getElementById(CONFIG.COPY_BUTTON_ID)) {
            var copyBtn = document.createElement('button');
            copyBtn.id = CONFIG.COPY_BUTTON_ID;
            copyBtn.innerText = CONFIG.COPY_BUTTON_LABEL;
            copyBtn.style.cssText =
                'padding: 8px 16px; background-color: #3498db; color: #fff; ' +
                'border: none; border-radius: 4px; font-weight: bold; font-size: 13px; ' +
                'cursor: pointer; margin-right: 8px;';
            copyBtn.addEventListener('click', function (e) {
                e.preventDefault();
                copyOrderToPayment();
            });
            placeButton(copyBtn, CONFIG.SPACE_ELEMENT_ID);
        }
        return event;
    });

    // メール確認ボタン（詳細画面のみ）
    kintone.events.on('app.record.detail.show', function (event) {
        if (!document.getElementById(CONFIG.MAIL_BUTTON_ID)) {
            var mailBtn = document.createElement('button');
            mailBtn.id = CONFIG.MAIL_BUTTON_ID;
            mailBtn.innerText = CONFIG.MAIL_BUTTON_LABEL;
            mailBtn.style.cssText =
                'padding: 8px 16px; background-color: #27ae60; color: #fff; ' +
                'border: none; border-radius: 4px; font-weight: bold; font-size: 13px; ' +
                'cursor: pointer;';
            mailBtn.addEventListener('click', function (e) {
                e.preventDefault();
                showMailPreview();
            });
            placeButton(mailBtn, 'payment_mail_check');
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
                console.warn('[payment-helper] getSpaceElement失敗:', e);
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
            console.warn('[payment-helper] getHeaderMenuSpaceElement失敗:', e2);
        }
        // 最終手段: fixed
        button.style.cssText += 'position:fixed;top:12px;right:200px;z-index:10000;';
        document.body.appendChild(button);
    }

    // =============================================
    // Step3: メールフィールドセット（REST API PUT）
    // =============================================
    // process.proceed 内では FILE 型の書き込みや REST API PUT が
    // リビジョン競合を起こすため、プレビューポップアップから実行する。

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
            // 1. ファイルをダウンロード
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
                // 2. ファイルをアップロード（CSRF トークン必須）
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
     * REST API PUT で請求書_ML に添付ファイルをセットする
     * ファイルを再アップロードして新 fileKey を取得してから PUT する
     * 当日行が複数ある場合は CSV ファイルも生成して添付する
     * @param {Object} record - kintone レコード
     * @returns {Promise}
     */
    function setMailFields(record) {
        var attachFiles = collectTodayAttachments(record);
        var todayRows = getTodayRows(record);

        console.log('[payment-helper] 請求書_ML セット開始: 添付 ' + attachFiles.length + ' 件, 当日行 ' + todayRows.length + ' 行');

        // 請求書ファイルを再アップロード
        var uploadPromises = attachFiles.map(function (f) {
            return reuploadFile(f.fileKey, f.name);
        });

        // 当日行が複数 → CSV ファイルも生成してアップロード
        if (todayRows.length > 1) {
            var csvText = buildCsvFromRows(todayRows);
            var now = new Date();
            var dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
            var timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
            var csvFileName = '支払依頼明細_' + dateStr + '_' + timeStr + '.csv';
            uploadPromises.push(uploadCsvBlob(csvText, csvFileName));
            console.log('[payment-helper] CSV ファイル生成: ' + csvFileName);
        }

        if (uploadPromises.length === 0) {
            console.log('[payment-helper] 添付ファイルなし、スキップ');
            return kintone.Promise.resolve();
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
            body.record[CONFIG.ML_ATTACHMENT_FIELD] = { value: fileKeyValues };

            return kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', body);
        }).then(function () {
            console.log('[payment-helper] 請求書_ML セット完了（REST API）: ' + uploadPromises.length + ' 件');
        });
    }

    console.log('[INIT] kintone_payment_helper 読み込み完了');
})();
