/**
 * 421.DFcancel_mng_utils.js
 *
 * 【概要】
 * [NW伝送]421_DF解約管理 アプリの汎用ユーティリティ。
 * 条件分岐処理プラグイン (branchprocess) の代替として、
 * フィールド編集禁止・プロセスアクション時の自動入力を JS で実装する。
 *
 * 【機能一覧】
 * 1. フィールド編集禁止
 *    - マスタ系フィールド 21 項目を編集不可にする。
 *    - イベント: create.show / edit.show
 *
 * 2. プロセスアクション時の自動入力
 *    a) 「依頼受領→F課確認」アクション時
 *       - F課依頼受領日 = 現在日時
 *       - F課依頼受領者 = ログインユーザー
 *    b) 「NTT申請完了」アクション時
 *       - NTT_解約申請日 = 現在日時
 *       - ユーザー選択 = ログインユーザー
 *    - イベント: detail.process.proceed
 *
 * 3. 自動入力補完（REST API フォールバック）
 *    - bulk_status_advance 等の API 経由ステータス変更では
 *      process.proceed が発火しないため、detail.show で未入力を検知し補完する。
 *    - イベント: detail.show
 *
 * 【元プラグイン設定】config (4).json (branchprocess)
 * 【依存】なし（Kintone JS API のみ使用）
 * 【配置】Kintone アプリの JS カスタマイズにアップロード
 */
(function () {
    'use strict';

    // =========================================================
    // 設定
    // =========================================================
    var CONFIG = {
        // フィールド編集禁止リスト
        DISABLED_FIELDS: [
            'ListRecordNo',
            '調査対象中継回線ID',
            'グループ内連番',
            'エリア',
            '県域',
            '回線ID',
            'ルートコード',
            '始点回線種別',
            '始点通信用建物',
            '始点回線ID',
            '終点回線種別',
            '終点通信用建物',
            '終点回線ID',
            '添付ファイル',
            '接続開始日',
            '解約依頼日',
            '依頼者',
            'F課依頼受領日',
            'F課依頼受領者',
            'NTT_解約申請日',
            'ユーザー選択'
        ],

        // プロセスアクション → 自動入力マッピング
        // key: アクション名, value: { dateField, userField }
        ACTION_AUTOFILL: {
            '依頼受領→F課確認': {
                dateField: 'F課依頼受領日',
                userField: 'F課依頼受領者'
            },
            'NTT申請完了': {
                dateField: 'NTT_解約申請日',
                userField: 'ユーザー選択'
            }
        },

        // detail.show 補完: ステータス → 必須フィールドのマッピング
        // このステータス以降で dateField が空なら REST API で補完する
        STATUS_AUTOFILL: {
            '11.依頼受領・F課確認': {
                dateField: 'F課依頼受領日',
                userField: 'F課依頼受領者'
            },
            '12.確認完了・NTT申請前': {
                dateField: 'F課依頼受領日',
                userField: 'F課依頼受領者'
            },
            '13.NTT申請完了': {
                dateField: 'NTT_解約申請日',
                userField: 'ユーザー選択'
            }
        }
    };

    // =========================================================
    // 1. フィールド編集禁止
    // =========================================================
    kintone.events.on([
        'app.record.create.show',
        'app.record.edit.show'
    ], function (event) {
        var record = event.record;
        CONFIG.DISABLED_FIELDS.forEach(function (fieldCode) {
            if (record[fieldCode]) {
                record[fieldCode].disabled = true;
            }
        });
        console.log('[DFcancel-utils] フィールド編集禁止: ' + CONFIG.DISABLED_FIELDS.length + '項目');
        return event;
    });

    // =========================================================
    // 2. プロセスアクション時の自動入力
    // =========================================================
    kintone.events.on('app.record.detail.process.proceed', function (event) {
        var action = event.action.value;
        var record = event.record;
        var mapping = CONFIG.ACTION_AUTOFILL[action];

        if (!mapping) {
            return event;
        }

        var user = kintone.getLoginUser();
        var now = new Date();
        // Kintone の DATETIME フィールド用 ISO 文字列
        var nowISO = now.toISOString();

        // 日時フィールド
        if (mapping.dateField && record[mapping.dateField]) {
            record[mapping.dateField].value = nowISO;
            console.log('[DFcancel-utils] ' + mapping.dateField + ' = ' + nowISO);
        }

        // ユーザー選択フィールド
        if (mapping.userField && record[mapping.userField]) {
            record[mapping.userField].value = [{ code: user.code, name: user.name }];
            console.log('[DFcancel-utils] ' + mapping.userField + ' = ' + user.name);
        }

        return event;
    });

    // =========================================================
    // 3. 自動入力補完（detail.show / REST API フォールバック）
    //    bulk_status_advance 等で API 経由でステータスが変わった場合、
    //    process.proceed は発火しない。詳細画面を開いた時点で補完する。
    // =========================================================
    kintone.events.on('app.record.detail.show', function (event) {
        var record = event.record;
        var status = record['ステータス'] ? record['ステータス'].value : '';

        var mapping = CONFIG.STATUS_AUTOFILL[status];
        if (!mapping) {
            return event;
        }

        // 対象フィールドが既に入力済みなら何もしない
        var dateVal = record[mapping.dateField] ? record[mapping.dateField].value : '';
        if (dateVal) {
            return event;
        }

        // 無限リロード防止
        var recId = String(record['$id'].value);
        var guardKey = 'dfcancel_autofill_' + kintone.app.getId() + '_' + recId + '_' + mapping.dateField;
        if (sessionStorage.getItem(guardKey)) {
            console.log('[DFcancel-utils] 補完済み（sessionStorage）。スキップ: ' + mapping.dateField);
            return event;
        }

        // REST API で補完
        var now = new Date().toISOString();
        var user = kintone.getLoginUser();

        var body = {
            app: kintone.app.getId(),
            id: recId,
            record: {}
        };
        body.record[mapping.dateField] = { value: now };
        if (mapping.userField) {
            body.record[mapping.userField] = {
                value: [{ code: user.code, name: user.name }]
            };
        }

        console.log('[DFcancel-utils] 自動入力補完開始: ステータス="' + status + '", ' + mapping.dateField);
        kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', body)
            .then(function () {
                console.log('[DFcancel-utils] 自動入力補完完了。リロードします');
                sessionStorage.setItem(guardKey, '1');
                location.reload();
            })
            .catch(function (err) {
                console.error('[DFcancel-utils] 自動入力補完エラー:', err);
                sessionStorage.setItem(guardKey, 'error');
            });

        return event;
    });

    console.log('[INIT] DFcancel_mng_utils 読み込み完了');
})();
