/**
 * kintone_inspection_pdf.js
 *
 * 【概要】
 * [NW伝送]011_オーダーフロー アプリ用。
 * 部分検収サブテーブルの内容をもとに検収書PDFを生成し、
 * ブラウザからダウンロードする。
 *
 * 【機能一覧】
 * 1. 検収書PDF発行ボタン
 *    - レコード詳細/編集画面にボタンを配置（スペース: pdfGen_oder-inspection）。
 *    - ボタン押下でPDFを生成しダウンロード。
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
 * 【参照フィールドコード】
 *   メイン: 発注先, Record_No, 発注番号_G番号, 検収担当者, 特記事項
 *   部分検収_テーブル: 明細名_検収テーブル, 金額_検収, 検収日, 部分検収
 *   検収対象日テーブル: 検収対象日
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

        // サブテーブル
        SUBTABLE_FIELD:     '部分検収_テーブル',
        ITEM_NAME_FIELD:    '明細名_検収テーブル',
        AMOUNT_FIELD:       '金額_検収',
        INSPECTION_DATE_FIELD: '検収日',
        CHECKBOX_FIELD:     '部分検収',

        // 検収対象日テーブル
        TARGET_DATE_SUBTABLE: '検収対象日テーブル',
        TARGET_DATE_FIELD:    '検収対象日',

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
        STAMP_VERTICAL: true         // 縦書き風に1文字ずつ配置
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
            console.log('[inspection-pdf] 日本語フォント(IPAexGothic)を登録しました');
            return 'IPAexGothic';
        }
        // NotoSansJP も試行
        if (typeof window.NOTOSANSJP_BASE64 === 'string') {
            doc.addFileToVFS('NotoSansJP-Regular.ttf', window.NOTOSANSJP_BASE64);
            doc.addFont('NotoSansJP-Regular.ttf', 'NotoSansJP', 'normal');
            fontLoaded = true;
            console.log('[inspection-pdf] 日本語フォント(NotoSansJP)を登録しました');
            return 'NotoSansJP';
        }
        console.warn('[inspection-pdf] 日本語フォントが見つかりません。Helvetica で代替します。');
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
        var recordNo = record[CONFIG.RECORD_NO_FIELD] ? record[CONFIG.RECORD_NO_FIELD].value : '';
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
                    console.log('[inspection-pdf] 印鑑用の姓: "' + sei + '" (' + sei.length + '文字)');
                    var stampDataUrl = generateStampImage(sei);
                    // テキスト右端のすぐ右に印鑑を配置（縦中央揃え）
                    var stampX = rightX - stampSize - 2;
                    var stampY = y - stampSize / 2 - 2;
                    doc.addImage(stampDataUrl, 'PNG', stampX, stampY, stampSize, stampSize);
                    console.log('[inspection-pdf] 印鑑画像を追加: ' + sei);
                } catch (stampErr) {
                    console.warn('[inspection-pdf] 印鑑画像の生成に失敗:', stampErr);
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

        // ----- ダウンロード -----
        var baseName = '検収書_' + (vendor || 'unknown') + '_' + todayStr().replace(/\//g, '');
        var pdfFilename = baseName + '.pdf';

        // PDFをArrayBufferとして取得
        var pdfArrayBuffer = doc.output('arraybuffer');
        var pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });

        // 1. 通常PDFをダウンロード
        var pdfUrl = URL.createObjectURL(pdfBlob);
        var pdfLink = document.createElement('a');
        pdfLink.href = pdfUrl;
        pdfLink.download = pdfFilename;
        document.body.appendChild(pdfLink);
        pdfLink.click();
        document.body.removeChild(pdfLink);

        // 2. 暗号化ZIPをダウンロード（ブラウザの複数ダウンロードブロック回避のため遅延実行）
        var zipPassword = '';
        if (CONFIG.ZIP_PASSWORD_FIELD && record[CONFIG.ZIP_PASSWORD_FIELD]) {
            zipPassword = record[CONFIG.ZIP_PASSWORD_FIELD].value || '';
        }

        if (zipPassword && typeof window.createEncryptedZip === 'function') {
            setTimeout(function () {
                try {
                    var pdfData = new Uint8Array(pdfArrayBuffer);
                    var zipBlob = window.createEncryptedZip(pdfFilename, pdfData, zipPassword);
                    var zipUrl = URL.createObjectURL(zipBlob);
                    var zipLink = document.createElement('a');
                    zipLink.href = zipUrl;
                    zipLink.download = baseName + '.zip';
                    document.body.appendChild(zipLink);
                    zipLink.click();
                    document.body.removeChild(zipLink);
                    setTimeout(function () {
                        URL.revokeObjectURL(pdfUrl);
                        URL.revokeObjectURL(zipUrl);
                    }, 2000);
                    console.log('[inspection-pdf] 暗号化ZIP生成完了:', baseName + '.zip');

                    // Kintone添付ファイルフィールドにZIPをアップロード
                    if (CONFIG.ZIP_ATTACHMENT_FIELD) {
                        uploadZipToRecord(zipBlob, baseName + '.zip');
                    }
                } catch (zipErr) {
                    console.error('[inspection-pdf] 暗号化ZIP生成エラー:', zipErr);
                    URL.revokeObjectURL(pdfUrl);
                }
            }, 500);
        } else {
            if (!zipPassword) {
                console.log('[inspection-pdf] ZIPパスワードが未設定のため暗号化ZIPはスキップ');
            }
            if (typeof window.createEncryptedZip !== 'function') {
                console.warn('[inspection-pdf] zip_encrypt.js が読み込まれていません');
            }
            setTimeout(function () { URL.revokeObjectURL(pdfUrl); }, 2000);
        }

        console.log('[inspection-pdf] PDF生成完了:', pdfFilename);
        return pdfFilename;
    }

    // =============================================
    // ZIPファイルを添付フィールドにアップロード
    // =============================================
    function uploadZipToRecord(zipBlob, zipFilename) {
        var recordId = kintone.app.record.getId();
        if (!recordId) {
            console.warn('[inspection-pdf] レコードIDが取得できないため添付をスキップ');
            return;
        }

        // 1. ファイルアップロード
        var formData = new FormData();
        formData.append('file', zipBlob, zipFilename);

        kintone.api(kintone.api.url('/k/v1/file', true), 'POST', formData)
            .then(function (uploadResp) {
                console.log('[inspection-pdf] ZIPアップロード成功: fileKey=' + uploadResp.fileKey);

                // 2. 現在の添付ファイルを取得して追加
                return kintone.api(kintone.api.url('/k/v1/record', true), 'GET', {
                    app: kintone.app.getId(),
                    id: recordId
                }).then(function (getResp) {
                    var currentFiles = [];
                    if (getResp.record[CONFIG.ZIP_ATTACHMENT_FIELD]) {
                        currentFiles = getResp.record[CONFIG.ZIP_ATTACHMENT_FIELD].value || [];
                    }

                    // 既存ファイルのfileKeyを保持しつつ新しいファイルを追加
                    var fileList = currentFiles.map(function (f) {
                        return { fileKey: f.fileKey };
                    });
                    fileList.push({ fileKey: uploadResp.fileKey });

                    // 3. レコード更新
                    var updateBody = {
                        app: kintone.app.getId(),
                        id: recordId,
                        record: {}
                    };
                    updateBody.record[CONFIG.ZIP_ATTACHMENT_FIELD] = {
                        value: fileList
                    };

                    return kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', updateBody);
                });
            })
            .then(function () {
                console.log('[inspection-pdf] ZIPを「' + CONFIG.ZIP_ATTACHMENT_FIELD + '」に添付しました');
            })
            .catch(function (err) {
                console.error('[inspection-pdf] ZIP添付エラー:', err);
                alert('ZIPファイルの添付に失敗しました。\nダウンロード済みZIPを手動で添付してください。');
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

        if (!confirm('検収書PDFを発行します。よろしいですか？')) {
            return;
        }

        // PDF生成
        generatePDF(record);
    }

    // =============================================
    // ボタン配置
    // =============================================

    kintone.events.on(
        ['app.record.detail.show', 'app.record.edit.show'],
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
                    console.warn('[inspection-pdf] getSpaceElement失敗:', e0);
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
                    console.warn('[inspection-pdf] getHeaderMenuSpaceElement失敗:', e1);
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

    console.log('[INIT] 検収書PDF生成スクリプト読み込み完了');
})();
