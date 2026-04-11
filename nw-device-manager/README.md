# NW Device Manager

ネットワーク装置（PTN等）の設置状況を管理するWebアプリケーション。
局舎・装置・スロット・ポートを階層管理し、CSVインポートによるデータ投入、統計ダッシュボードを提供する。

## アーキテクチャ

```
┌──────────┐    ┌────────────┐    ┌──────────┐    ┌────────────┐
│  Caddy   │───▶│  Frontend  │    │ Backend  │───▶│ PostgreSQL │
│  :80     │    │  (Vite)    │    │ (FastAPI) │    │   :5432    │
│          │───▶│  :3000     │    │  :8000   │    │            │
└──────────┘    └────────────┘    └──────────┘    └────────────┘
  /api/* → backend:8000
  /*     → frontend:3000
```

| 層 | 技術スタック |
|----|-------------|
| Frontend | React 18 + TypeScript + Ant Design + React Query + Zustand |
| Backend | FastAPI + SQLAlchemy 2.0 (async) + Alembic + Pydantic v2 |
| DB | PostgreSQL 16 |
| リバースプロキシ | Caddy 2 |
| コンテナ | Docker Compose |

## デプロイ先

| 項目 | 値 |
|------|-----|
| Proxmoxホスト | `root@172.30.65.42` |
| LXCコンテナ | 904 |
| LXC SSH | `ssh -p 9422 root@172.30.66.194` |
| アプリURL | http://172.30.66.194 |
| アプリパス | `/opt/nw-device-manager` |
| 初期ログイン | admin / admin |

## デプロイ手順

```bash
cd nw-device-manager
./deploy.sh
```

deploy.sh は以下を実行する:
1. rsync でファイル転送（node_modules, .venv, __pycache__, .git, dist を除外）
2. `docker compose build`（backend / frontend イメージをビルド）
3. `docker compose up -d`（全サービス起動）
4. `alembic upgrade head`（DBマイグレーション）
5. `python -m app.seed`（初期ユーザー作成）

## ローカル開発

```bash
# Frontend
cd frontend
npm install
npm run dev          # http://localhost:5173

# Backend
cd backend
pip install -e .
uvicorn app.main:app --reload --port 8000

# DB (Docker)
docker compose up db -d
```

## ディレクトリ構成

```
nw-device-manager/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI エントリポイント (root_path=/api)
│   │   ├── config.py            # 環境変数設定 (Pydantic Settings)
│   │   ├── database.py          # SQLAlchemy async engine / session
│   │   ├── auth/                # JWT認証 (dependencies, jwt)
│   │   ├── models/              # SQLAlchemy モデル
│   │   │   ├── region.py        # 地域 (北海道, 東北, ...)
│   │   │   ├── prefecture.py    # 都道府県
│   │   │   ├── office.py        # 局舎
│   │   │   ├── host.py          # 装置 (hostname, model, vendor, ...)
│   │   │   ├── slot.py          # スロット (board)
│   │   │   ├── port.py          # ポート (port_rate, usage_status, ...)
│   │   │   ├── reservation.py   # ポート予約
│   │   │   ├── user.py          # ユーザー
│   │   │   └── audit_log.py     # 監査ログ
│   │   ├── routers/             # APIルーター
│   │   │   ├── auth.py          # POST /auth/login, GET /auth/me
│   │   │   ├── regions.py       # GET /regions (ツリー構造)
│   │   │   ├── offices.py       # GET /offices/device-list (局舎別装置一覧)
│   │   │   ├── hosts.py         # GET /hosts/{id} (装置詳細+スロット+ポート)
│   │   │   ├── ports.py         # PATCH /ports/{id} (ステータス更新)
│   │   │   ├── reservations.py  # ポート予約 CRUD
│   │   │   ├── import_.py       # POST /import/upload (CSVインポート)
│   │   │   └── statistics.py    # 統計API (summary, by-model, by-region, by-rate)
│   │   ├── schemas/             # Pydantic レスポンススキーマ
│   │   ├── services/
│   │   │   ├── import_service.py  # CSV解析・DB登録 (Huawei LTP, CTNSDH, Card/SFP)
│   │   │   └── task_manager.py    # バックグラウンドタスク管理
│   │   ├── csv_parsers/         # CSVパーサー
│   │   ├── seed.py              # 初期ユーザー (admin) 作成
│   │   └── seed_locations.py    # 地域・都道府県マスタ投入
│   ├── alembic/                 # DBマイグレーション
│   └── alembic.ini
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # ルーティング定義
│   │   ├── main.tsx             # エントリポイント
│   │   ├── api/
│   │   │   ├── client.ts        # Axios クライアント (baseURL=/api)
│   │   │   └── hooks.ts         # React Query カスタムフック
│   │   ├── stores/
│   │   │   └── authStore.ts     # Zustand 認証ストア
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx    # ログイン画面
│   │   │   ├── DevicePage.tsx   # 装置管理 (ツリー + 詳細)
│   │   │   ├── OfficeListPage.tsx # 局舎別設置装置一覧
│   │   │   ├── StatisticsPage.tsx # 統計ダッシュボード
│   │   │   └── ImportPage.tsx   # CSVインポート
│   │   ├── components/
│   │   │   ├── Layout/AppLayout.tsx  # サイドメニュー付きレイアウト
│   │   │   ├── DeviceTree/          # 地域→都道府県→局舎→装置ツリー
│   │   │   ├── HostDetail/          # 装置詳細ビュー
│   │   │   └── ResizableTable.tsx   # リサイズ可能テーブル
│   │   └── types/index.ts      # TypeScript 型定義
│   ├── package.json
│   └── vite.config.ts
├── caddy/
│   └── Caddyfile               # リバースプロキシ設定
├── data/                        # 拠点マスタCSV等
├── docker-compose.yml
├── deploy.sh
├── .env                         # 環境変数 (git管理外)
└── .env.example
```

## ページ一覧

| パス | ページ | 概要 |
|------|--------|------|
| `/login` | ログイン | JWT認証 |
| `/` | 装置管理 | 地域→局舎→装置のツリー表示、装置詳細（スロット・ポート） |
| `/offices` | 局舎一覧 | 局舎別の設置装置数・機種別台数テーブル |
| `/statistics` | 統計 | サマリー、機種別、地域別、回線速度別の統計 |
| `/import` | インポート | Huawei LTP / CTNSDH / Card / SFP CSVのアップロード |

## APIエンドポイント

| メソッド | パス | 概要 |
|----------|------|------|
| POST | `/api/auth/login` | ログイン (JWT発行) |
| GET | `/api/auth/me` | 認証ユーザー情報 |
| GET | `/api/regions` | 地域ツリー (地域→都道府県→局舎→装置) |
| GET | `/api/offices/device-list` | 局舎別設置装置一覧 |
| GET | `/api/hosts/{id}` | 装置詳細 (スロット・ポート含む) |
| PATCH | `/api/ports/{id}` | ポートステータス更新 |
| GET | `/api/reservations` | ポート予約一覧 |
| POST | `/api/import/upload` | CSVインポート |
| GET | `/api/statistics/summary` | 全体サマリー |
| GET | `/api/statistics/by-model` | 機種別統計 |
| GET | `/api/statistics/by-region` | 地域別統計 |
| GET | `/api/statistics/by-rate` | 回線速度別統計 |
| GET | `/api/health` | ヘルスチェック |

## 環境変数 (.env)

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `DB_PASSWORD` | PostgreSQL パスワード | (必須) |
| `SECRET_KEY` | JWT署名キー | (必須) |
| `CORS_ORIGINS` | CORS許可オリジン | `http://localhost:5173` |

## データモデル

```
Region (地域)
  └── Prefecture (都道府県)
       └── Office (局舎)
            └── Host (装置)
                 └── Slot (スロット/ボード)
                      └── Port (ポート)
                           └── Reservation (予約)
```

## CSVインポート対応形式

- **Huawei LTP Report**: 装置・スロット・ポート情報 (Port Full Name からボード名を抽出)
- **CTNSDH Port Status Detailed Report**: ポート詳細情報
- **Card Inventory**: カード(ボード)情報
- **SFP Inventory**: SFPモジュール情報
