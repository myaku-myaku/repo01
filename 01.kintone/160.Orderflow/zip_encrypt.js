/**
 * zip_encrypt.js
 *
 * 【概要】
 * ZipCrypto方式でパスワード付きZIPファイルをブラウザ上で生成するユーティリティ。
 * 外部ライブラリ不要。
 *
 * 【使い方】
 * var zipBlob = window.createEncryptedZip('file.pdf', uint8ArrayData, 'password');
 *
 * 【依存】なし（Web Crypto API の getRandomValues のみ使用）
 * 【配置】Kintone アプリの JS カスタマイズにアップロード（使用するスクリプトより前）
 */
(function () {
    'use strict';

    // =========================================================
    // CRC-32 テーブル
    // =========================================================
    var CRC32_TABLE = new Uint32Array(256);
    (function () {
        for (var i = 0; i < 256; i++) {
            var c = i >>> 0;
            for (var j = 0; j < 8; j++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            CRC32_TABLE[i] = c >>> 0;
        }
    })();

    function crc32(data) {
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < data.length; i++) {
            crc = (CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    // =========================================================
    // ZipCrypto 暗号化
    // =========================================================
    function ZipCrypto(password) {
        this.keys = new Uint32Array([0x12345678, 0x23456789, 0x34567890]);
        for (var i = 0; i < password.length; i++) {
            this._updateKeys(password.charCodeAt(i));
        }
    }

    ZipCrypto.prototype._updateKeys = function (b) {
        this.keys[0] = CRC32_TABLE[(this.keys[0] ^ b) & 0xFF] ^ (this.keys[0] >>> 8);
        this.keys[1] = this.keys[1] + (this.keys[0] & 0xFF);
        this.keys[1] = Math.imul(this.keys[1], 134775813) + 1;
        this.keys[2] = CRC32_TABLE[(this.keys[2] ^ (this.keys[1] >>> 24)) & 0xFF] ^ (this.keys[2] >>> 8);
    };

    ZipCrypto.prototype._decryptByte = function () {
        var temp = ((this.keys[2] & 0xFFFF) | 2) >>> 0;
        return ((Math.imul(temp, temp ^ 1)) >>> 8) & 0xFF;
    };

    ZipCrypto.prototype.encrypt = function (data) {
        var result = new Uint8Array(data.length);
        for (var i = 0; i < data.length; i++) {
            var k = this._decryptByte();
            result[i] = (data[i] ^ k) & 0xFF;
            this._updateKeys(data[i]);
        }
        return result;
    };

    // =========================================================
    // ZIP ファイル生成
    // =========================================================

    /**
     * パスワード付きZIPファイルを生成する
     * @param {string} filename  - ZIP内に格納するファイル名
     * @param {Uint8Array} data  - ファイルデータ
     * @param {string} password  - ZIPパスワード
     * @returns {Blob} ZIPファイルのBlob
     */
    window.createEncryptedZip = function (filename, data, password) {
        var dataCrc = crc32(data);
        var filenameBytes = new TextEncoder().encode(filename);

        // --- ZipCrypto 暗号化 ---
        var zipcrypto = new ZipCrypto(password);

        // 12バイトの暗号化ヘッダー（最後の1バイトはCRCチェックバイト）
        var encHeader = new Uint8Array(12);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(encHeader);
        } else {
            for (var i = 0; i < 12; i++) {
                encHeader[i] = Math.floor(Math.random() * 256);
            }
        }
        encHeader[11] = (dataCrc >>> 24) & 0xFF;
        encHeader = zipcrypto.encrypt(encHeader);

        // ファイルデータの暗号化（キー状態はヘッダーから継続）
        var encData = zipcrypto.encrypt(data);

        var compressedSize = 12 + data.length;

        // --- DOS日時 ---
        var now = new Date();
        var dosTime = ((now.getHours() & 0x1F) << 11) |
                      ((now.getMinutes() & 0x3F) << 5) |
                      ((now.getSeconds() >> 1) & 0x1F);
        var dosDate = (((now.getFullYear() - 1980) & 0x7F) << 9) |
                      (((now.getMonth() + 1) & 0xF) << 5) |
                      (now.getDate() & 0x1F);

        // bit 0: encrypted, bit 11: UTF-8 filename
        var gpFlag = 0x0801;

        // --- Local File Header (30 + filename) ---
        var lfh = new ArrayBuffer(30 + filenameBytes.length);
        var lv = new DataView(lfh);
        lv.setUint32(0, 0x04034b50, true);              // signature
        lv.setUint16(4, 20, true);                       // version needed (2.0)
        lv.setUint16(6, gpFlag, true);                   // general purpose bit flag
        lv.setUint16(8, 0, true);                        // compression: stored
        lv.setUint16(10, dosTime, true);
        lv.setUint16(12, dosDate, true);
        lv.setUint32(14, dataCrc, true);                 // CRC-32
        lv.setUint32(18, compressedSize, true);          // compressed size
        lv.setUint32(22, data.length, true);             // uncompressed size
        lv.setUint16(26, filenameBytes.length, true);    // filename length
        lv.setUint16(28, 0, true);                       // extra field length
        new Uint8Array(lfh).set(filenameBytes, 30);

        // --- Central Directory Header (46 + filename) ---
        var cdOffset = lfh.byteLength + encHeader.length + encData.length;
        var cd = new ArrayBuffer(46 + filenameBytes.length);
        var cv = new DataView(cd);
        cv.setUint32(0, 0x02014b50, true);               // signature
        cv.setUint16(4, 20, true);                        // version made by
        cv.setUint16(6, 20, true);                        // version needed
        cv.setUint16(8, gpFlag, true);
        cv.setUint16(10, 0, true);                        // compression: stored
        cv.setUint16(12, dosTime, true);
        cv.setUint16(14, dosDate, true);
        cv.setUint32(16, dataCrc, true);
        cv.setUint32(20, compressedSize, true);
        cv.setUint32(24, data.length, true);
        cv.setUint16(28, filenameBytes.length, true);
        cv.setUint16(30, 0, true);                        // extra field length
        cv.setUint16(32, 0, true);                        // file comment length
        cv.setUint16(34, 0, true);                        // disk number start
        cv.setUint16(36, 0, true);                        // internal file attributes
        cv.setUint32(38, 0, true);                        // external file attributes
        cv.setUint32(42, 0, true);                        // local header offset
        new Uint8Array(cd).set(filenameBytes, 46);

        // --- End of Central Directory (22) ---
        var eocd = new ArrayBuffer(22);
        var ev = new DataView(eocd);
        ev.setUint32(0, 0x06054b50, true);                // signature
        ev.setUint16(4, 0, true);                          // disk number
        ev.setUint16(6, 0, true);                          // disk with central dir
        ev.setUint16(8, 1, true);                          // entries on this disk
        ev.setUint16(10, 1, true);                         // total entries
        ev.setUint32(12, cd.byteLength, true);             // central dir size
        ev.setUint32(16, cdOffset, true);                  // central dir offset
        ev.setUint16(20, 0, true);                         // comment length

        console.log('[zip-encrypt] 暗号化ZIP生成: ' + filename +
                    ' (' + data.length + ' bytes, CRC=' + dataCrc.toString(16) + ')');

        return new Blob([lfh, encHeader, encData, cd, eocd], { type: 'application/zip' });
    };

})();
