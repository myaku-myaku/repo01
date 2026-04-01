/**
 * kintone_inspection_helper.js
 *
 * 【概要】
 * [NW伝送]011_オーダーフロー アプリ用。
 * 検収書に関する補助機能を提供する。
 *
 * 【機能一覧】
 * 1. 検収書PDF発行ボタン
 *    - レコード詳細画面にボタンを配置（スペース: pdfGen_oder-inspection）。
 *    - ボタン押下でPDFを生成し「検収書」フィールドに添付。
 *    - 部分検収_テーブル内で検収日が検収対象日と一致する行の
 *      「検収書_検収tbl」にもPDFを添付（同一日付は最上行のみ）。
 *
 * 2. バリデーション
 *    - 検収対象日テーブルが空の場合、エラーメッセージを表示。
 *    - すべての検収対象日に対応する検収日がサブテーブルに存在するか確認。
 *
 * 3. PDF内容
 *    - タイトル「検収書」、発行日、発行番号（NW-INSyymmdd-XXXXX）
 *    - 宛先（発注先 御中）、発行元、発行者、検収担当者＋自動生成印鑑
 *    - 検収対象PO No.、検収対象日、検収額合計
 *    - 明細一覧テーブル（検収対象日に一致する行のみ）
 *    - 特記事項
 *
 * 4. 自動印鑑（ハンコ）生成
 *    - 検収担当者の姓からCanvas APIで丸印画像を動的生成。
 *
 * 5. 検収書メール確認ボタン
 *    - レコード詳細画面にボタンを配置（スペース: inspection_mail_check）。
 *    - ボタン押下でメールプレビューをポップアップ表示。
 *    - 「メールフィールドセット」ボタンで件名・本文をフィールドに転記。
 *
 * 【参照フィールドコード】
 *   メイン: 発注先, Record_No, 発注番号_G番号, 検収担当者, 特記事項
 *   部分検収_テーブル: 明細名_検収テーブル, 金額_検収, 検収日, 部分検収
 *   検収対象日テーブル: 検収対象日
 *   メール: 送付先担当者名, 送付先会社名, 送信先メールアドレス, 送信先メールCCアドレス, 検収依頼者名
 *
 * 【依存ライブラリ】（本スクリプトより前にアップロード）
 *   1. jspdf.umd.min.js (v2.5.1) — PDF生成エンジン
 *   2. ipaexg-font.js — IPAexゴシック Base64フォントデータ
 *   3. zip_encrypt.js — パスワード付きZIP生成（暗号化ZIPダウンロード機能用）
 *
 * 【配置】Kintone アプリの JS カスタマイズにアップロード
 */
(function () {
    'use strict';

    // =============================================
    // ★ 設定 (CONFIG)
    // =============================================
    var CONFIG = {
        // ---------- ボタン ----------
        BUTTON_ID: 'generate_inspection_pdf_button',
        BUTTON_LABEL: '検収書PDF発行',
        SPACE_ELEMENT_ID: 'pdfGen_oder-inspection',

        // ---------- フィールドコード ----------
        // メインフォーム
        VENDOR_FIELD:       '発注先',           // 宛先（B7: ○○株式会社 御中）
        RECORD_NO_FIELD:    'Record_No',         // 発行番号の一部
        PO_NO_FIELD:        '発注番号_G番号',   // 検収対象PO No.
        ISSUER_FIELD:       '',                   // 空なら固定文字列を使用
        ISSUER_DEFAULT:     'NURO技術部門　ネットワーク部',
        INSPECTOR_FIELD:    '検収担当者',       // 検収担当者フィールド
        NOTE_FIELD:         '特記事項',           // 特記事項フィールド
        ZIP_PASSWORD_FIELD: 'ZIPパスワード',    // ZIP暗号化用パスワードフィールド
        ZIP_ATTACHMENT_FIELD: '検収書_送付',       // ZIPを添付するフィールド
        PDF_ATTACHMENT_FIELD: '検収書',             // PDFを添付するフィールド

        // サブテーブル
        SUBTABLE_FIELD:     '部分検収_テーブル',
        ITEM_NAME_FIELD:    '明細名_検収テーブル',
        AMOUNT_FIELD:       '金額_検収',
        INSPECTION_DATE_FIELD: '検収日',
        CHECKBOX_FIELD:     '部分検収',

        // 検収対象日テーブル
        TARGET_DATE_SUBTABLE: '検収対象日テーブル',
        TARGET_DATE_FIELD:    '検収対象日',

        // サブテーブル行添付（検収書PDF → 部分検収_テーブル内の検収書_検収tbl）
        TBL_INSPECTION_PDF_FIELD: '検収書_検収tbl',

        // ---------- PDF レイアウト ----------
        PAGE_WIDTH:  595.28,  // A4 pt
        PAGE_HEIGHT: 841.89,
        MARGIN_LEFT:   50,
        MARGIN_RIGHT:  50,
        MARGIN_TOP:    40,

        // ---------- 発行番号プレフィックス ----------
        DOC_PREFIX: 'NW-INS',

        // ---------- 印鑑設定 ----------
        STAMP_ENABLED: true,         // 印鑑画像を表示するか
        STAMP_SIZE: 33,              // 印鑑の直径 (pt)
        STAMP_COLOR: [220, 40, 40],  // 印鑑の色 [R, G, B]
        STAMP_LINE_WIDTH: 2,         // 外枠の線幅 (pt)
        STAMP_FONT_SIZE_1: 16,       // 1文字の場合のフォントサイズ
        STAMP_FONT_SIZE_2: 14,       // 2文字の場合
        STAMP_FONT_SIZE_3: 10,       // 3文字の場合
        STAMP_VERTICAL: true,         // 縦書き風に1文字ずつ配置

        // ---------- 検収書メール確認 ----------
        MAIL_BUTTON_ID: 'inspection_mail_preview_btn',
        MAIL_BUTTON_LABEL: '検収書メール確認',
        MAIL_SPACE_ELEMENT_ID: 'inspection_mail_check',

        // メールテンプレート: レコード直下のフィールド
        MAIL_RECIPIENT_FIELD: '検収書送付先',
        MAIL_COMPANY_FIELD: '検収書送付先会社名',
        MAIL_TO_FIELD: '検収書送付メールTo',
        MAIL_CC_FIELD: '検収書送付メールCC',
        MAIL_REQUESTER_FIELD: '検収依頼者',

        // メールフィールドセット先
        ML_SUBJECT_FIELD: '検収書送付メール件名',
        ML_BODY_FIELD: '検収書送付メール本文',
        SET_ML_BUTTON_LABEL: 'メールフィールドセット'
    };

    // =============================================
    // 日本語フォント読み込み状態
    // =============================================
    var fontLoaded = false;
    var fontData = null;

    // =============================================
    // ユーティリティ
    // =============================================

    /** 今日の日付を YYYY/MM/DD 形式で返す */
    function todayStr() {
        var d = new Date();
        var yyyy = d.getFullYear();
        var mm = ('0' + (d.getMonth() + 1)).slice(-2);
        var dd = ('0' + d.getDate()).slice(-2);
        return yyyy + '/' + mm + '/' + dd;
    }

    /** 今日の日付を YYYY年M月 形式で返す */
    function todayMonthStr() {
        var d = new Date();
        return d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
    }

    /** 日付文字列を YYYY年MM月DD日 形式に変換 */
    function formatDateJP(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }

    /** 数値を通貨形式に変換 */
    function formatCurrency(num) {
        if (num === null || num === undefined || num === '') return '';
        var n = Number(num);
        if (isNaN(n)) return String(num);
        return '¥' + n.toLocaleString('ja-JP');
    }

    /** 発行番号を生成 */
    function buildDocNumber(recordNo) {
        var d = new Date();
        var yy = String(d.getFullYear()).slice(-2);
        var mm = ('0' + (d.getMonth() + 1)).slice(-2);
        var dd = ('0' + d.getDate()).slice(-2);
        var seq = String(recordNo || '0');
        while (seq.length < 5) seq = '0' + seq;
        return CONFIG.DOC_PREFIX + yy + mm + dd + '-' + seq;
    }

    // =============================================
    // 印鑑画像生成（Canvas → PNG Base64）
    // =============================================

    /**
     * ユーザー名の姓を抽出する
     * 「【SNC】黒崎　泰史」→「黒崎」
     * 「山田　太郎」→「山田」、「yamada taro」→「yamada」
     */
    function extractSei(fullName) {
        if (!fullName) return '';
        // 【...】や（...）などのプレフィックスを除去
        var cleaned = fullName.replace(/^[\[【\(（][^\]】\)）]*[\]】\)）]/g, '').trim();
        // 全角・半角スペースで分割して最初の要素
        var parts = cleaned.split(/[\s\u3000]+/);
        return parts[0] || cleaned || fullName;
    }

    /**
     * Canvas を使って印鑑風の丸印画像を生成し、PNG Base64 を返す
     * @param {string} name - 表示する名前（姓）
     * @returns {string} data:image/png;base64,... の文字列
     */
    function generateStampImage(name) {
        var size = CONFIG.STAMP_SIZE * 3;  // 高解像度で描画（3倍）
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        var cx = size / 2;
        var cy = size / 2;
        var radius = size / 2 - CONFIG.STAMP_LINE_WIDTH * 3;

        var r = CONFIG.STAMP_COLOR[0];
        var g = CONFIG.STAMP_COLOR[1];
        var b = CONFIG.STAMP_COLOR[2];
        var colorStr = 'rgb(' + r + ',' + g + ',' + b + ')';

        // 背景を透明に
        ctx.clearRect(0, 0, size, size);

        // 外円
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = colorStr;
        ctx.lineWidth = CONFIG.STAMP_LINE_WIDTH * 3;
        ctx.stroke();

        // テキスト描画
        ctx.fillStyle = colorStr;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        var chars = name.split('');
        var charCount = chars.length;

        // フォント設定
        var baseFontSize;
        if (charCount <= 1) baseFontSize = CONFIG.STAMP_FONT_SIZE_1 * 3;
        else if (charCount <= 2) baseFontSize = CONFIG.STAMP_FONT_SIZE_2 * 3;
        else baseFontSize = CONFIG.STAMP_FONT_SIZE_3 * 3;

        ctx.font = 'bold ' + baseFontSize + 'px "IPAexGothic", "Meiryo", "Yu Gothic", sans-serif';

        if (CONFIG.STAMP_VERTICAL && charCount >= 2) {
            if (charCount <= 3) {
                // 1〜3文字: 1列縦書き（上から下）
                var spacing = Math.min(baseFontSize, (radius * 1.6) / charCount);
                var startY = cy - (charCount - 1) * spacing / 2;
                chars.forEach(function (ch, i) {
                    ctx.fillText(ch, cx, startY + i * spacing);
                });
            } else {
                // 4〜5文字: 2列（右列→左列の順、各列は上から下）
                // 右列が先（日本語縦書きの右→左方向）
                var rightColChars, leftColChars;
                if (charCount === 4) {
                    rightColChars = chars.slice(0, 2);  // 1,2文字目 → 右列
                    leftColChars  = chars.slice(2, 4);   // 3,4文字目 → 左列
                } else {
                    rightColChars = chars.slice(0, 3);  // 1,2,3文字目 → 右列
                    leftColChars  = chars.slice(3, 5);   // 4,5文字目 → 左列
                }
                var colFontSize = Math.floor(baseFontSize * 0.85);
                ctx.font = 'bold ' + colFontSize + 'px "IPAexGothic", "Meiryo", "Yu Gothic", sans-serif';
                var colGap = colFontSize * 1.1;  // 列間隔
                var rightX2 = cx + colGap / 2;    // 右列のX
                var leftX2  = cx - colGap / 2;    // 左列のX

                // 右列を描画
                var rSpacing = Math.min(colFontSize, (radius * 1.4) / rightColChars.length);
                var rStartY = cy - (rightColChars.length - 1) * rSpacing / 2;
                rightColChars.forEach(function (ch, i) {
                    ctx.fillText(ch, rightX2, rStartY + i * rSpacing);
                });

                // 左列を描画
                var lSpacing = Math.min(colFontSize, (radius * 1.4) / leftColChars.length);
                var lStartY = cy - (leftColChars.length - 1) * lSpacing / 2;
                leftColChars.forEach(function (ch, i) {
                    ctx.fillText(ch, leftX2, lStartY + i * lSpacing);
                });
            }
        } else {
            // 1文字 or 横書き
            ctx.fillText(name, cx, cy);
        }

        return canvas.toDataURL('image/png');
    }

    // =============================================
    // jsPDF 日本語フォント登録
    // =============================================

    /**
     * IPAexゴシック等の日本語フォントを jsPDF に登録する。
     * フォントの Base64 データを別ファイル (ipaexg-base64.js) として
     * Kintone に登録し、window.IPAEXG_BASE64 に格納する想定。
     *
     * フォントファイルがない場合は Helvetica フォールバック
     * （日本語は文字化けする）。
     */
    function registerJapaneseFont(doc) {
        if (typeof window.IPAEXG_BASE64 === 'string') {
            doc.addFileToVFS('ipaexg.ttf', window.IPAEXG_BASE64);
            doc.addFont('ipaexg.ttf', 'IPAexGothic', 'normal');
            fontLoaded = true;
            console.log('[inspection-helper] 日本語フォント(IPAexGothic)を登録しました');
            return 'IPAexGothic';
        }
        // NotoSansJP も試行
        if (typeof window.NOTOSANSJP_BASE64 === 'string') {
            doc.addFileToVFS('NotoSansJP-Regular.ttf', window.NOTOSANSJP_BASE64);
            doc.addFont('NotoSansJP-Regular.ttf', 'NotoSansJP', 'normal');
            fontLoaded = true;
            console.log('[inspection-helper] 日本語フォント(NotoSansJP)を登録しました');
            return 'NotoSansJP';
        }
        console.warn('[inspection-helper] 日本語フォントが見つかりません。Helvetica で代替します。');
        return 'Helvetica';
    }

    // =============================================
    // PDF 描画
    // =============================================

    function generatePDF(record) {
        if (typeof window.jspdf === 'undefined' && typeof jspdf === 'undefined') {
            alert('jsPDF ライブラリが読み込まれていません。\n' +
                'Kintone の JS カスタマイズに jspdf.umd.min.js を\n' +
                '本スクリプトより前にアップロードしてください。');
            return;
        }

        var jsPDF = (window.jspdf && window.jspdf.jsPDF) || jspdf.jsPDF;

        // ===== バリデーション =====
        // 検収対象日テーブルのチェック
        var preTargetDates = [];
        if (CONFIG.TARGET_DATE_SUBTABLE && record[CONFIG.TARGET_DATE_SUBTABLE]) {
            var preTargetRows = record[CONFIG.TARGET_DATE_SUBTABLE].value || [];
            preTargetRows.forEach(function (row) {
                var dv = row.value[CONFIG.TARGET_DATE_FIELD]
                    ? row.value[CONFIG.TARGET_DATE_FIELD].value : '';
                if (dv) preTargetDates.push(dv);
            });
        }
        if (preTargetDates.length === 0) {
            alert('検収対象日が未入力です。\n検収対象日テーブルに日付を入力してください。');
            return;
        }

        // 部分検収テーブルに一致する検収日があるかチェック（すべての検収対象日について）
        var preSubRows = record[CONFIG.SUBTABLE_FIELD] ? record[CONFIG.SUBTABLE_FIELD].value : [];
        var matchedDates = [];
        preSubRows.forEach(function (row) {
            var inspDate = row.value[CONFIG.INSPECTION_DATE_FIELD]
                ? row.value[CONFIG.INSPECTION_DATE_FIELD].value : '';
            if (inspDate && preTargetDates.indexOf(inspDate) >= 0 && matchedDates.indexOf(inspDate) < 0) {
                matchedDates.push(inspDate);
            }
        });
        var unmatchedDates = preTargetDates.filter(function (d) {
            return matchedDates.indexOf(d) < 0;
        });
        if (unmatchedDates.length > 0) {
            var unmatchedStr = unmatchedDates.map(function (d) { return formatDateJP(d); }).join('、');
            alert('一致する検収日がありません。\n以下の検収対象日に対応する検収日が部分検収テーブルにありません：\n' + unmatchedStr);
            return;
        }

        var doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

        var fontName = registerJapaneseFont(doc);
        doc.setFont(fontName);

        var pw = CONFIG.PAGE_WIDTH;
        var ml = CONFIG.MARGIN_LEFT;
        var mr = CONFIG.MARGIN_RIGHT;
        var contentWidth = pw - ml - mr;
        var rightX = pw - mr;
        var y = CONFIG.MARGIN_TOP;

        // ----- タイトル -----
        doc.setFontSize(22);
        doc.text('検　　収　　書', pw / 2, y + 25, { align: 'center' });
        y += 50;

        // ----- 発行日 -----
        doc.setFontSize(10);
        doc.text('発行日：' + todayStr(), rightX, y, { align: 'right' });
        y += 15;

        // ----- 発行番号 -----
        var recordNo = '';
        // Record_No フィールドを優先、なければ $id（レコード番号）を使用
        if (CONFIG.RECORD_NO_FIELD && record[CONFIG.RECORD_NO_FIELD] && record[CONFIG.RECORD_NO_FIELD].value) {
            recordNo = record[CONFIG.RECORD_NO_FIELD].value;
        }
        if (!recordNo && record['$id']) {
            recordNo = record['$id'].value;
        }
        if (!recordNo) {
            recordNo = String(kintone.app.record.getId() || '0');
        }
        var docNumber = buildDocNumber(recordNo);
        doc.text('発行番号：' + docNumber, rightX, y, { align: 'right' });
        y += 25;

        // ----- 宛先 -----
        var vendor = record[CONFIG.VENDOR_FIELD] ? record[CONFIG.VENDOR_FIELD].value : '';
        doc.setFontSize(14);
        doc.text((vendor || '＿＿＿＿＿') + '　御中', ml, y);
        y += 5;
        // 宛先下線
        doc.setLineWidth(0.5);
        doc.line(ml, y, ml + 250, y);
        y += 25;

        // ----- 発行元 -----
        doc.setFontSize(10);
        doc.text('ソニーネットワークコミュニケーションズ株式会社', rightX, y, { align: 'right' });
        y += 15;

        // ----- 発行者 -----
        var issuer = CONFIG.ISSUER_DEFAULT;
        if (CONFIG.ISSUER_FIELD && record[CONFIG.ISSUER_FIELD]) {
            issuer = record[CONFIG.ISSUER_FIELD].value || issuer;
        }
        doc.text('発行者：' + issuer, rightX, y, { align: 'right' });
        y += 20;

        // ----- 検収担当 + 印鑑 -----
        var inspector = '';
        if (CONFIG.INSPECTOR_FIELD && record[CONFIG.INSPECTOR_FIELD]) {
            var inspVal = record[CONFIG.INSPECTOR_FIELD].value;
            // ユーザー選択フィールド等（配列やオブジェクト）の場合に対応
            if (Array.isArray(inspVal)) {
                // [{code: "xxx", name: "山田太郎"}, ...] 形式
                inspector = inspVal.map(function (u) { return u.name || u.code || ''; }).join('、');
            } else if (typeof inspVal === 'object' && inspVal !== null) {
                inspector = inspVal.name || inspVal.code || '';
            } else {
                inspector = String(inspVal || '');
            }
        }
        if (!inspector) {
            var loginUser = kintone.getLoginUser();
            inspector = loginUser ? loginUser.name : '';
        }
        // 表示名から【...】等のプレフィックスを除去
        var inspectorDisplay = inspector.replace(/^[\[\u3010\(\uff08][^\]\u3011\)\uff09]*[\]\u3011\)\uff09]/g, '').trim();

        var stampSize = CONFIG.STAMP_SIZE;
        var stampOffset = CONFIG.STAMP_ENABLED ? stampSize + 8 : 0;

        // テキストをハンコ分左に寄せて配置
        doc.text('検収担当：' + inspectorDisplay, rightX - stampOffset, y, { align: 'right' });

        // 印鑑画像をテキストの右横に配置
        if (CONFIG.STAMP_ENABLED && inspectorDisplay) {
            var sei = extractSei(inspectorDisplay);
            if (sei) {
                try {
                    console.log('[inspection-helper] 印鑑用の姓: "' + sei + '" (' + sei.length + '文字)');
                    var stampDataUrl = generateStampImage(sei);
                    // テキスト右端のすぐ右に印鑑を配置（縦中央揃え）
                    var stampX = rightX - stampSize - 2;
                    var stampY = y - stampSize / 2 - 2;
                    doc.addImage(stampDataUrl, 'PNG', stampX, stampY, stampSize, stampSize);
                    console.log('[inspection-helper] 印鑑画像を追加: ' + sei);
                } catch (stampErr) {
                    console.warn('[inspection-helper] 印鑑画像の生成に失敗:', stampErr);
                }
            }
        }
        y += 35;

        // ----- 挨拶文 -----
        doc.setFontSize(10);
        doc.text('平素よりお世話になっております、ご確認の上、請求書の発行をお願い致します。', ml, y);
        y += 40;

        // ----- 検収対象PO No. -----
        doc.setFontSize(11);
        var poNo = '';
        if (CONFIG.PO_NO_FIELD && record[CONFIG.PO_NO_FIELD]) {
            poNo = record[CONFIG.PO_NO_FIELD].value || '';
        }
        doc.text('検収対象PO No　　：', ml, y);
        doc.text(poNo, ml + 140, y);
        y += 25;

        // ----- 検収対象日 -----
        var targetDates = [];
        if (CONFIG.TARGET_DATE_SUBTABLE && record[CONFIG.TARGET_DATE_SUBTABLE]) {
            var targetDateRows = record[CONFIG.TARGET_DATE_SUBTABLE].value || [];
            targetDateRows.forEach(function (row) {
                var dateVal = row.value[CONFIG.TARGET_DATE_FIELD]
                    ? row.value[CONFIG.TARGET_DATE_FIELD].value : '';
                if (dateVal) targetDates.push(dateVal);
            });
        }
        doc.setFontSize(11);
        doc.text('検収対象日　　　　：', ml, y);
        var targetDatesStr = targetDates.length > 0
            ? targetDates.map(function (d) { return formatDateJP(d); }).join('、')
            : '';
        doc.text(targetDatesStr, ml + 140, y);
        y += 25;

        // ----- 検収額合計（検収対象日に一致する行の金額合計） -----
        var subtableRows = record[CONFIG.SUBTABLE_FIELD] ? record[CONFIG.SUBTABLE_FIELD].value : [];
        var inspectionTotal = 0;
        subtableRows.forEach(function (row) {
            var inspDate = row.value[CONFIG.INSPECTION_DATE_FIELD]
                ? row.value[CONFIG.INSPECTION_DATE_FIELD].value : '';
            var amount = row.value[CONFIG.AMOUNT_FIELD]
                ? row.value[CONFIG.AMOUNT_FIELD].value : '';
            // 検収日が検収対象日のいずれかと一致する行のみ合計
            if (inspDate && targetDates.indexOf(inspDate) >= 0) {
                var amountNum = Number(amount);
                if (!isNaN(amountNum)) inspectionTotal += amountNum;
            }
        });
        doc.text('検収額合計　　　　：', ml, y);
        doc.text(formatCurrency(inspectionTotal), ml + 140, y);
        y += 30;

        // ----- 明細一覧 -----

        // 検収日が検収対象日のいずれかと一致する行のみ抽出
        var filteredRows = subtableRows.filter(function (row) {
            var inspDate = row.value[CONFIG.INSPECTION_DATE_FIELD]
                ? row.value[CONFIG.INSPECTION_DATE_FIELD].value : '';
            return inspDate && targetDates.indexOf(inspDate) >= 0;
        });

        if (filteredRows.length > 0) {
            // テーブルヘッダー
            y += 10;
            var colX = {
                no:     ml,
                name:   ml + 30,
                amount: ml + 300,
                date:   ml + 400
            };

            doc.setFontSize(9);
            doc.setLineWidth(0.3);

            // ヘッダー行
            var headerY = y;
            doc.setFillColor(230, 240, 250);
            doc.rect(ml, headerY - 10, contentWidth, 15, 'F');
            doc.text('No.', colX.no, headerY);
            doc.text('明細名', colX.name, headerY);
            doc.text('金額', colX.amount, headerY);
            doc.text('検収日', colX.date, headerY);
            doc.line(ml, headerY + 3, ml + contentWidth, headerY + 3);
            y = headerY + 18;

            // データ行
            var totalAmount = 0;
            filteredRows.forEach(function (row, idx) {
                var itemName = row.value[CONFIG.ITEM_NAME_FIELD]
                    ? row.value[CONFIG.ITEM_NAME_FIELD].value : '';
                var amount = row.value[CONFIG.AMOUNT_FIELD]
                    ? row.value[CONFIG.AMOUNT_FIELD].value : '';
                var inspDate = row.value[CONFIG.INSPECTION_DATE_FIELD]
                    ? row.value[CONFIG.INSPECTION_DATE_FIELD].value : '';

                var amountNum = Number(amount);
                if (!isNaN(amountNum)) totalAmount += amountNum;

                doc.text(String(idx + 1), colX.no, y);
                // 明細名が長い場合は切り詰め
                var displayName = String(itemName);
                if (displayName.length > 40) displayName = displayName.substring(0, 40) + '…';
                doc.text(displayName, colX.name, y);
                doc.text(formatCurrency(amount), colX.amount, y);
                doc.text(formatDateJP(inspDate), colX.date, y);

                // 行区切り線
                y += 3;
                doc.setDrawColor(200, 200, 200);
                doc.line(ml, y, ml + contentWidth, y);
                doc.setDrawColor(0, 0, 0);
                y += 15;

                // ページ送り
                if (y > CONFIG.PAGE_HEIGHT - 80) {
                    doc.addPage();
                    y = CONFIG.MARGIN_TOP + 20;
                }
            });

            y += 5;
        } else {
            y += 15;
            doc.setFontSize(10);
            doc.text('（検収対象データなし）', ml + 140, y);
            y += 25;
        }

        // ----- 特記事項 -----
        y += 20;
        if (y > CONFIG.PAGE_HEIGHT - 60) {
            doc.addPage();
            y = CONFIG.MARGIN_TOP + 20;
        }
        doc.setFontSize(11);
        var noteText = '';
        if (CONFIG.NOTE_FIELD && record[CONFIG.NOTE_FIELD]) {
            noteText = record[CONFIG.NOTE_FIELD].value || '';
        }
        doc.text('特記事項　：' + noteText, ml, y);

        // ----- フィールドへ添付 -----
        var baseName = '検収書_' + (vendor || 'unknown') + '_' + todayStr().replace(/\//g, '');
        var pdfFilename = baseName + '.pdf';

        // PDFをArrayBufferとして取得
        var pdfArrayBuffer = doc.output('arraybuffer');
        var pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });

        // 添付 Promise を収集
        var attachPromises = [];
        var duplicateMessages = [];

        // 1. PDFを「検収書」フィールドに添付
        if (CONFIG.PDF_ATTACHMENT_FIELD) {
            attachPromises.push(
                uploadFileToRecord(pdfBlob, pdfFilename, CONFIG.PDF_ATTACHMENT_FIELD)
                    .then(function (result) {
                        if (result === 'duplicate') {
                            duplicateMessages.push('「' + CONFIG.PDF_ATTACHMENT_FIELD + '」に同名ファイルが添付済みです: ' + pdfFilename);
                        }
                    })
            );
        }

        // 2. 暗号化ZIPを「検収書_送付」フィールドに添付（パスワード設定時のみ）
        var zipPassword = '';
        if (CONFIG.ZIP_PASSWORD_FIELD && record[CONFIG.ZIP_PASSWORD_FIELD]) {
            zipPassword = record[CONFIG.ZIP_PASSWORD_FIELD].value || '';
        }

        if (zipPassword && typeof window.createEncryptedZip === 'function') {
            try {
                var pdfData = new Uint8Array(pdfArrayBuffer);
                var zipBlob = window.createEncryptedZip(pdfFilename, pdfData, zipPassword);
                var zipFilename = baseName + '.zip';
                console.log('[inspection-helper] 暗号化ZIP生成完了:', zipFilename);

                if (CONFIG.ZIP_ATTACHMENT_FIELD) {
                    attachPromises.push(
                        uploadFileToRecord(zipBlob, zipFilename, CONFIG.ZIP_ATTACHMENT_FIELD)
                            .then(function (result) {
                                if (result === 'duplicate') {
                                    duplicateMessages.push('「' + CONFIG.ZIP_ATTACHMENT_FIELD + '」に同名ファイルが添付済みです: ' + zipFilename);
                                }
                            })
                    );
                }
            } catch (zipErr) {
                console.error('[inspection-helper] 暗号化ZIP生成エラー:', zipErr);
            }
        } else {
            if (!zipPassword) {
                console.log('[inspection-helper] ZIPパスワードが未設定のため暗号化ZIPはスキップ');
            }
            if (typeof window.createEncryptedZip !== 'function') {
                console.warn('[inspection-helper] zip_encrypt.js が読み込まれていません');
            }
        }

        console.log('[inspection-helper] PDF生成完了:', pdfFilename);

        // 全添付完了後にサブテーブル行への添付を実行
        // （メインフォーム PUT が先に完了しないとリビジョン競合するため直列実行）
        return Promise.all(attachPromises).then(function () {
            // 3. PDFをサブテーブル（部分検収_テーブル）の検収書_検収tblに添付
            if (CONFIG.TBL_INSPECTION_PDF_FIELD && targetDates.length > 0) {
                return uploadFileToSubtableRow(pdfBlob, pdfFilename, targetDates)
                    .then(function (result) {
                        if (result === 'duplicate') {
                            duplicateMessages.push('サブテーブルの「' + CONFIG.TBL_INSPECTION_PDF_FIELD + '」に同名ファイルが添付済みです: ' + pdfFilename);
                        } else if (result === 'no-match') {
                            console.log('[inspection-helper] サブテーブルに検収対象日と一致する行がないためスキップ');
                        }
                    }).catch(function (err) {
                        console.error('[inspection-helper] サブテーブル添付エラー:', err);
                        duplicateMessages.push('サブテーブルへの添付でエラーが発生しました（コンソール参照）');
                    });
            }
        }).then(function () {
            return { pdfFilename: pdfFilename, duplicateMessages: duplicateMessages };
        });
    }

    // =============================================
    // ZIPファイルを添付フィールドにアップロード
    // =============================================
    /**
     * XMLHttpRequest でファイルを Kintone にアップロードし fileKey を返す。
     * kintone.api() は FormData (multipart/form-data) を扱えないため XHR を使う。
     */
    function uploadFile(blob, filename) {
        return new Promise(function (resolve, reject) {
            var formData = new FormData();
            formData.append('__REQUEST_TOKEN__', kintone.getRequestToken());
            formData.append('file', blob, filename);

            var xhr = new XMLHttpRequest();
            xhr.open('POST', kintone.api.url('/k/v1/file', true));
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.onload = function () {
                if (xhr.status === 200) {
                    try {
                        var resp = JSON.parse(xhr.responseText);
                        resolve(resp.fileKey);
                    } catch (e) {
                        reject(new Error('レスポンス解析エラー: ' + xhr.responseText));
                    }
                } else {
                    reject(new Error('ファイルアップロード失敗 (HTTP ' + xhr.status + '): ' + xhr.responseText));
                }
            };
            xhr.onerror = function () {
                reject(new Error('ファイルアップロード通信エラー'));
            };
            xhr.send(formData);
        });
    }

    /**
     * ファイルをKintoneレコードの添付フィールドにアップロードする汎用関数
     * 同名ファイルが既に添付されている場合はスキップし、メッセージを返す。
     * @param {Blob} blob - アップロードするBlob
     * @param {string} filename - ファイル名
     * @param {string} attachFieldCode - 添付先フィールドコード
     * @returns {Promise<string>} 結果メッセージ ('attached' | 'duplicate')
     */
    function uploadFileToRecord(blob, filename, attachFieldCode) {
        var recordId = kintone.app.record.getId();
        if (!recordId) {
            console.warn('[inspection-helper] レコードIDが取得できないため添付をスキップ');
            return Promise.resolve('skipped');
        }

        // まず現在の添付ファイルを取得して同名チェック
        return kintone.api(kintone.api.url('/k/v1/record', true), 'GET', {
            app: kintone.app.getId(),
            id: recordId
        }).then(function (getResp) {
            var currentFiles = [];
            if (getResp.record[attachFieldCode]) {
                currentFiles = getResp.record[attachFieldCode].value || [];
            }

            // 同名ファイルチェック
            var duplicate = currentFiles.some(function (f) {
                return f.name === filename;
            });
            if (duplicate) {
                console.log('[inspection-helper] 同名ファイル添付済み (' + attachFieldCode + '): ' + filename);
                return 'duplicate';
            }

            // XHR でファイルアップロード → fileKey 取得
            return uploadFile(blob, filename).then(function (fileKey) {
                console.log('[inspection-helper] アップロード成功 (' + attachFieldCode + '): fileKey=' + fileKey);

                // 既存ファイルのfileKeyを保持しつつ新しいファイルを追加
                var fileList = currentFiles.map(function (f) {
                    return { fileKey: f.fileKey };
                });
                fileList.push({ fileKey: fileKey });

                // レコード更新
                var updateBody = {
                    app: kintone.app.getId(),
                    id: recordId,
                    record: {}
                };
                updateBody.record[attachFieldCode] = {
                    value: fileList
                };

                return kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', updateBody)
                    .then(function () {
                        console.log('[inspection-helper] ファイルを「' + attachFieldCode + '」に添付しました');
                        return 'attached';
                    });
            });
        });
    }

    /**
     * サブテーブル（部分検収_テーブル）内の検収書_検収tbl にファイルを添付する。
     * 検収対象日と検収日が一致する行のうち、各日付の最上行のみ対象。
     * 同名ファイルが既に添付済みの場合はスキップ。
     *
     * ※ メインフォームの添付 PUT とリビジョン競合しないよう、
     *   それらが完了してから呼び出すこと。
     *
     * @param {Blob}   blob     - アップロードする Blob
     * @param {string} filename - ファイル名
     * @param {Array}  targetDates - 検収対象日の配列 (YYYY-MM-DD)
     * @returns {Promise<string>} 'attached' | 'duplicate' | 'no-match' | 'skipped'
     */
    function uploadFileToSubtableRow(blob, filename, targetDates) {
        var recordId = kintone.app.record.getId();
        if (!recordId) {
            console.warn('[inspection-helper] レコードIDが取得できないためサブテーブル添付をスキップ');
            return Promise.resolve('skipped');
        }
        if (!CONFIG.TBL_INSPECTION_PDF_FIELD) {
            return Promise.resolve('skipped');
        }

        // 1. 最新レコードを取得して対象行を特定
        return kintone.api(kintone.api.url('/k/v1/record', true), 'GET', {
            app: kintone.app.getId(),
            id: recordId
        }).then(function (getResp) {
            var subtable = getResp.record[CONFIG.SUBTABLE_FIELD];
            if (!subtable || !subtable.value || subtable.value.length === 0) {
                console.warn('[inspection-helper] サブテーブルが空のためスキップ');
                return 'no-match';
            }

            var rows = subtable.value;
            var attachedDates = {};  // 各日付の最上行のみ添付するための重複チェック
            var targetRowInfos = []; // 添付対象行 { rowIndex, rowId, existingFiles }
            var duplicateFound = false;

            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                var inspDate = (row.value[CONFIG.INSPECTION_DATE_FIELD] &&
                                row.value[CONFIG.INSPECTION_DATE_FIELD].value) || '';

                // 検収日が検収対象日のいずれかに一致 かつ その日付の最上行
                if (inspDate && targetDates.indexOf(inspDate) >= 0 && !attachedDates[inspDate]) {
                    attachedDates[inspDate] = true;

                    var fileField = row.value[CONFIG.TBL_INSPECTION_PDF_FIELD];
                    var currentFiles = (fileField && fileField.value) ? fileField.value : [];

                    // 同名ファイルチェック
                    var isDup = currentFiles.some(function (f) { return f.name === filename; });
                    if (isDup) {
                        console.log('[inspection-helper] サブテーブル行に同名ファイル添付済み (検収日=' + inspDate + '): ' + filename);
                        duplicateFound = true;
                        continue;
                    }

                    targetRowInfos.push({
                        rowIndex: i,
                        rowId: row.id,
                        inspDate: inspDate,
                        existingFiles: currentFiles
                    });
                    console.log('[inspection-helper] サブテーブル行に添付予定 (検収日=' + inspDate + ', 行index=' + i + ')');
                }
            }

            if (targetRowInfos.length === 0) {
                return duplicateFound ? 'duplicate' : 'no-match';
            }

            // 2. 対象行の数だけファイルをアップロード（各行に専用の fileKey が必要）
            var uploadPromises = targetRowInfos.map(function () {
                return uploadFile(blob, filename);
            });

            return Promise.all(uploadPromises).then(function (fileKeys) {
                console.log('[inspection-helper] サブテーブル添付用アップロード成功: ' + fileKeys.length + '件');

                // 3. 行 id → 新しい fileList のマッピングを作成
                var modifiedRowIds = {};
                for (var j = 0; j < targetRowInfos.length; j++) {
                    var info = targetRowInfos[j];
                    var newFileList = info.existingFiles.map(function (f) {
                        return { fileKey: f.fileKey };
                    });
                    newFileList.push({ fileKey: fileKeys[j] });
                    modifiedRowIds[info.rowId] = newFileList;
                }

                // 4. サブテーブル PUT
                //    - 変更しない行: { id, value: {} }（既存値維持）
                //    - 変更する行:   { id, value: { 検収書_検収tbl のみ } }
                var subtableForPut = rows.map(function (row) {
                    if (modifiedRowIds[row.id]) {
                        var rowData = { id: row.id, value: {} };
                        rowData.value[CONFIG.TBL_INSPECTION_PDF_FIELD] = {
                            value: modifiedRowIds[row.id]
                        };
                        return rowData;
                    }
                    return { id: row.id, value: {} };
                });

                var updateBody = {
                    app: kintone.app.getId(),
                    id: recordId,
                    record: {}
                };
                updateBody.record[CONFIG.SUBTABLE_FIELD] = { value: subtableForPut };

                return kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', updateBody)
                    .then(function () {
                        console.log('[inspection-helper] サブテーブル行の検収書_検収tblに添付完了');
                        return 'attached';
                    });
            });
        });
    }

    // =============================================
    // メイン処理（ボタンクリック）
    // =============================================

    function handleGeneratePDF() {
        var recordObj = kintone.app.record.get();
        var record = recordObj.record;

        var subtableRows = record[CONFIG.SUBTABLE_FIELD] ? record[CONFIG.SUBTABLE_FIELD].value : [];
        if (!subtableRows || subtableRows.length === 0) {
            alert('「' + CONFIG.SUBTABLE_FIELD + '」にデータがありません。\n先に「発注内容 → 部分検収へコピー」を実行してください。');
            return;
        }

        // ボタンを処理中表示に変更
        var btn = document.getElementById(CONFIG.BUTTON_ID);
        if (btn) {
            btn.disabled = true;
            btn.innerText = '処理中...';
            btn.style.backgroundColor = '#999';
            btn.style.cursor = 'not-allowed';
        }

        // PDF生成 & 添付
        var result = generatePDF(record);
        if (result && typeof result.then === 'function') {
            result.then(function (res) {
                if (res.duplicateMessages && res.duplicateMessages.length > 0) {
                    // 同名ファイルがあった場合はメッセージを表示
                    if (btn) {
                        btn.innerText = '添付済み';
                        btn.style.backgroundColor = '#e67e22';
                    }
                    alert(res.duplicateMessages.join('\n'));
                } else {
                    // 正常完了 → リロード
                    if (btn) {
                        btn.innerText = '完了 ✓（リロード中…）';
                        btn.style.backgroundColor = '#27ae60';
                    }
                    setTimeout(function () { location.reload(); }, 800);
                }
            }).catch(function (err) {
                console.error('[inspection-helper] PDF添付エラー:', err);
                if (btn) {
                    btn.innerText = 'エラー（コンソール参照）';
                    btn.style.backgroundColor = '#e74c3c';
                    btn.disabled = false;
                    btn.style.cursor = 'pointer';
                }
            });
        }
    }

    // =============================================
    // ボタン配置ユーティリティ
    // =============================================

    function placeButton(button, spaceId) {
        if (spaceId) {
            try {
                var spaceEl = kintone.app.record.getSpaceElement(spaceId);
                if (spaceEl) {
                    spaceEl.appendChild(button);
                    return;
                }
            } catch (e) {
                console.warn('[inspection-helper] getSpaceElement失敗:', e);
            }
        }
        try {
            var header = kintone.app.record.getHeaderMenuSpaceElement();
            if (header) {
                header.appendChild(button);
                return;
            }
        } catch (e2) {
            console.warn('[inspection-helper] getHeaderMenuSpaceElement失敗:', e2);
        }
        button.style.cssText += 'position:fixed;top:12px;right:200px;z-index:10000;';
        document.body.appendChild(button);
    }

    // =============================================
    // ボタン配置: 検収書PDF発行
    // =============================================

    kintone.events.on(
        'app.record.detail.show',
        function (event) {
            if (document.getElementById(CONFIG.BUTTON_ID)) {
                return event;
            }

            var button = document.createElement('button');
            button.id = CONFIG.BUTTON_ID;
            button.innerText = CONFIG.BUTTON_LABEL;
            button.style.cssText =
                'padding: 10px 20px; background-color: #e74c3c; color: #fff; ' +
                'border: none; border-radius: 6px; font-weight: bold; font-size: 14px; ' +
                'cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2); ' +
                'transition: background-color 0.3s; margin-left: 10px;';
            button.addEventListener('mouseenter', function () {
                button.style.backgroundColor = '#c0392b';
            });
            button.addEventListener('mouseleave', function () {
                button.style.backgroundColor = '#e74c3c';
            });
            button.addEventListener('click', function (e) {
                e.preventDefault();
                handleGeneratePDF();
            });

            // 配置
            var placed = false;

            // 1. スペースフィールド
            if (CONFIG.SPACE_ELEMENT_ID) {
                try {
                    var spaceEl = kintone.app.record.getSpaceElement(CONFIG.SPACE_ELEMENT_ID);
                    if (spaceEl) {
                        spaceEl.appendChild(button);
                        placed = true;
                    }
                } catch (e0) {
                    console.warn('[inspection-helper] getSpaceElement失敗:', e0);
                }
            }

            // 2. ヘッダーメニュー
            if (!placed) {
                try {
                    var headerSpace = kintone.app.record.getHeaderMenuSpaceElement();
                    if (headerSpace) {
                        headerSpace.appendChild(button);
                        placed = true;
                    }
                } catch (e1) {
                    console.warn('[inspection-helper] getHeaderMenuSpaceElement失敗:', e1);
                }
            }

            // 3. floating
            if (!placed) {
                button.style.cssText += 'position: fixed; top: 12px; right: 80px; z-index: 10000;';
                document.body.appendChild(button);
            }

            return event;
        }
    );

    // =============================================
    // Step2: 検収書メール確認（プレビュー）
    // =============================================

    /** フィールド値を安全に取得（ユーザー選択フィールド対応） */
    function getFieldValue(record, fieldCode) {
        if (!record[fieldCode]) return '';
        var val = record[fieldCode].value;
        if (val === null || val === undefined) return '';
        if (Array.isArray(val)) {
            return val.map(function (u) {
                var name = u.name || u.code || '';
                return name.replace(/^[\[【\(（][^\]】\)）]*[\]】\)）]\s*/g, '').trim();
            }).join('、');
        }
        if (typeof val === 'object' && val.name) {
            return val.name.replace(/^[\[【\(（][^\]】\)）]*[\]】\)）]\s*/g, '').trim();
        }
        return String(val);
    }

    /**
     * メールプレビューデータを組み立てる
     */
    function buildInspectionMailPreview(record) {
        var to = getFieldValue(record, CONFIG.MAIL_TO_FIELD);
        var cc = getFieldValue(record, CONFIG.MAIL_CC_FIELD);
        var recipientFull = getFieldValue(record, CONFIG.MAIL_RECIPIENT_FIELD);
        var company = getFieldValue(record, CONFIG.MAIL_COMPANY_FIELD);
        var requesterFull = getFieldValue(record, CONFIG.MAIL_REQUESTER_FIELD);
        var poNo = getFieldValue(record, CONFIG.PO_NO_FIELD);

        // 姓を抽出（半角・全角スペースの前まで）
        var recipientSei = recipientFull.split(/[\s\u3000]/)[0] || recipientFull;
        var requesterSei = requesterFull.split(/[\s\u3000]/)[0] || requesterFull;

        var subject = '【検収書】' + poNo + ' 検収書送付';
        var body = [
            company,
            recipientSei + '様',
            '',
            'いつもお世話になっております。',
            'ソニーネットワークコミュニケーションズ ' + requesterSei + 'です。',
            '',
            '掲題の件にて検収書をお送りいたしますので、ご確認の程宜しくお願い致します。',
            '尚、本件に関するご請求書につきましては私までご連絡願います。',
            '',
            '以上よろしくお願い致します。'
        ].join('\n');

        return {
            to: to,
            cc: cc,
            subject: subject,
            body: body
        };
    }

    function showInspectionMailPreview() {
        var recId = kintone.app.record.getId();
        if (!recId) {
            doShowInspectionMailPreview(kintone.app.record.get().record);
            return;
        }
        kintone.api(kintone.api.url('/k/v1/record', true), 'GET', {
            app: kintone.app.getId(),
            id: recId
        }).then(function (resp) {
            console.log('[inspection-helper] REST API でレコード取得成功');
            doShowInspectionMailPreview(resp.record);
        }).catch(function (err) {
            console.warn('[inspection-helper] REST API 取得失敗、フォームデータを使用:', err);
            doShowInspectionMailPreview(kintone.app.record.get().record);
        });
    }

    function doShowInspectionMailPreview(record) {
        var mail = buildInspectionMailPreview(record);

        var sections = [
            '━━━━ メールプレビュー ━━━━',
            '',
            '宛先：' + mail.to,
            'CC：' + mail.cc,
            '件名：' + mail.subject,
            '',
            '--- 本文 ---',
            mail.body,
            '',
            '━━━━━━━━━━━━━━━━━━━━'
        ];

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
                closeBtn.style.display = 'none';
                setInspectionMailFields(record, mail).then(function () {
                    setMlBtn.innerText = 'セット完了 ✓（リロード中…）';
                    setMlBtn.style.background = '#27ae60';
                    setTimeout(function () { location.reload(); }, 800);
                }).catch(function (err) {
                    setMlBtn.innerText = 'エラー（コンソール参照）';
                    setMlBtn.style.background = '#e74c3c';
                    closeBtn.style.display = 'block';
                    console.error('[inspection-helper] メールフィールドセット失敗:', err);
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
            console.warn('[inspection-helper] ポップアップ表示失敗:', e);
            alert(preview);
        }

        console.log('[inspection-helper] 検収書メールプレビュー表示');
    }

    /**
     * REST API PUT で検収書送付メール件名・本文フィールドをセットする
     */
    function setInspectionMailFields(record, mail) {
        var recId = kintone.app.record.getId();
        var appId = kintone.app.getId();
        var body = {
            app: appId,
            id: recId,
            record: {}
        };
        body.record[CONFIG.ML_SUBJECT_FIELD] = { value: mail.subject };
        body.record[CONFIG.ML_BODY_FIELD] = { value: mail.body };

        return kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', body)
            .then(function () {
                console.log('[inspection-helper] メールフィールドセット完了');
            });
    }

    // 検収書メール確認ボタン（詳細画面のみ）
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
                showInspectionMailPreview();
            });
            placeButton(mailBtn, CONFIG.MAIL_SPACE_ELEMENT_ID);
        }
        return event;
    });

    console.log('[INIT] kintone_inspection_helper 読み込み完了');
})();
