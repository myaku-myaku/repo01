#!/bin/bash
# LXC 904 (Proxmox) へのデプロイスクリプト
# Usage: ./deploy.sh [user@host] [port]
set -e

REMOTE="${1:-root@172.30.66.194}"
SSH_PORT="${2:-9422}"
REMOTE_DIR="/opt/nw-device-manager"

echo "=== NW Device Manager デプロイ ==="
echo "ターゲット: ${REMOTE}:${SSH_PORT} ${REMOTE_DIR}"

# 1. リモートにディレクトリ作成
echo "[1/5] リモートディレクトリ準備..."
ssh -p "${SSH_PORT}" "${REMOTE}" "mkdir -p ${REMOTE_DIR}"

# 2. ファイルを転送 (rsyncがあれば使う、なければscp)
echo "[2/5] ファイル転送..."
if command -v rsync &> /dev/null; then
    rsync -avz -e "ssh -p ${SSH_PORT}" \
        --exclude 'node_modules' --exclude '.venv' --exclude '__pycache__' \
        --exclude '.git' --exclude 'dist' \
        ./ "${REMOTE}:${REMOTE_DIR}/"
else
    scp -P "${SSH_PORT}" -r ./backend ./frontend ./caddy ./docker-compose.yml ./.env "${REMOTE}:${REMOTE_DIR}/"
fi

# 3. リモートで Docker Compose ビルド＆起動
echo "[3/5] Docker Compose ビルド..."
ssh -p "${SSH_PORT}" "${REMOTE}" "cd ${REMOTE_DIR} && docker compose build"

echo "[4/5] サービス起動..."
ssh -p "${SSH_PORT}" "${REMOTE}" "cd ${REMOTE_DIR} && docker compose up -d"

# 4. 初回マイグレーション＆シード
echo "[5/5] DBテーブル作成 & マイグレーション..."
ssh -p "${SSH_PORT}" "${REMOTE}" "cd ${REMOTE_DIR} && docker compose exec backend python -c \"
from app.database import Base, engine
from app.models import *
import asyncio
async def create():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print('Tables synced.')
asyncio.run(create())
\""
ssh -p "${SSH_PORT}" "${REMOTE}" "cd ${REMOTE_DIR} && docker compose exec backend alembic upgrade head"
ssh -p "${SSH_PORT}" "${REMOTE}" "cd ${REMOTE_DIR} && docker compose exec backend python -m app.seed"

echo ""
echo "=== デプロイ完了 ==="
echo "URL: http://172.30.66.194"
echo "初期ログイン: admin / admin"
echo "※ 本番運用前にパスワードを変更してください"
