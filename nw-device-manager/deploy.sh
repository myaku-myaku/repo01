#!/bin/bash
# Proxmoxサーバーへのデプロイスクリプト
# Usage: ./deploy.sh [user@host]
set -e

REMOTE="${1:-root@172.30.65.42}"
REMOTE_DIR="/opt/nw-device-manager"

echo "=== NW Device Manager デプロイ ==="
echo "ターゲット: ${REMOTE}:${REMOTE_DIR}"

# 1. リモートにディレクトリ作成
echo "[1/5] リモートディレクトリ準備..."
ssh "${REMOTE}" "mkdir -p ${REMOTE_DIR}"

# 2. ファイルを転送 (rsyncがあれば使う、なければscp)
echo "[2/5] ファイル転送..."
if command -v rsync &> /dev/null; then
    rsync -avz --exclude 'node_modules' --exclude '.venv' --exclude '__pycache__' \
        --exclude '.git' --exclude 'dist' \
        ./ "${REMOTE}:${REMOTE_DIR}/"
else
    scp -r ./backend ./frontend ./caddy ./docker-compose.yml ./.env "${REMOTE}:${REMOTE_DIR}/"
fi

# 3. リモートで Docker Compose ビルド＆起動
echo "[3/5] Docker Compose ビルド..."
ssh "${REMOTE}" "cd ${REMOTE_DIR} && docker compose build"

echo "[4/5] サービス起動..."
ssh "${REMOTE}" "cd ${REMOTE_DIR} && docker compose up -d"

# 4. 初回マイグレーション＆シード
echo "[5/5] DBマイグレーション & 初期ユーザー作成..."
ssh "${REMOTE}" "cd ${REMOTE_DIR} && docker compose exec backend alembic upgrade head"
ssh "${REMOTE}" "cd ${REMOTE_DIR} && docker compose exec backend python -m app.seed"

echo ""
echo "=== デプロイ完了 ==="
echo "URL: http://172.30.65.42"
echo "初期ログイン: admin / admin"
echo "※ 本番運用前にパスワードを変更してください"
