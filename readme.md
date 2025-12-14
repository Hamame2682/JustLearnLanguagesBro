# AI Language Tutor (AI言語学習アプリ)

## 概要
教科書の内容に基づき、手書き入力とAIによる自動採点を組み合わせた多言語学習Webアプリケーションです。
現在はPCを計算サーバー（母艦）とする構成ですが、将来的にはクラウド（Vercel/Supabase）を活用した完全サーバーレス・スマホ完結型（PWA）への移行を想定しています。

## 対応言語
- 中国語 (Chinese)
- 英語 (English)
- ドイツ語 (German)
- スペイン語 (Spanish)

## 主な機能

### 1. 認証・ユーザー管理機能

#### ユーザー登録・ログイン
- **学生ID + パスワード（任意）による認証**
- **言語選択**: 登録時に学習言語を選択（中国語、英語、ドイツ語、スペイン語）
- **JWT認証**: 7日間有効なトークンによる認証
- **最初のユーザーが自動的に管理者になる**

#### 管理者機能（管理者のみ）
- **ユーザー一覧表示**: 全ユーザーの情報を表示
- **ユーザー権限管理**: 管理者権限の付与/削除
- **ユーザー削除**: 不要なユーザーの削除（自分自身は削除不可）
- **ユーザー管理画面**: `/admin/users` でアクセス可能

### 2. 学習モード (Client)

#### 手書き練習モード
- **手書き入力**: スマホ画面への手書き入力（Canvas対応）
- **非同期採点**: 送信後すぐに次の問題へ進み、裏でAI採点を実行
- **10問ごとの結果表示**: 10問終了後にまとめて結果を確認
- **ピンイン表示**: 問題文にピンインと意味を表示

#### 並べ替え問題モード
- **文法例文の並べ替え**: 例文を1文字ずつバラバラにして並べ替える
- **日本語訳をヒント**: 日本語訳から正しい順序を推測
- **不正解時の解説表示**: 間違えた場合に文法解説を表示
- **10問制限**: 1セット10問まで

#### 作文添削モード
- **キーボード入力**: テキストエリアで作文を入力
- **AI添削**: Geminiによる詳細な添削（文法ミス、より自然な表現の提案）
- **非同期処理**: バックグラウンドで添削を実行

#### 学習データの個人化
- **ユーザーごとのデータ分離**: 各ユーザーの学習データは完全に分離
- **レッスン選択**: アップロード済みのレッスン番号をボタンで選択
- **進捗管理**: 正解数、誤答数、最終復習日時を記録

### 3. データ管理 (Admin)

#### 教科書デジタル化ダッシュボード (`/admin`)
- **スマホカメラ対応**: スマホカメラで教科書を撮影し、そのままアップロード可能
- **Gemini Vision解析**: 画像を解析し、単語・ピンイン・意味・文法事項を構造化データ（JSON）へ自動変換
- **2種類のデータタイプ**:
  - **単語 (Words)**: 単語、ピンイン、意味を抽出
  - **文法 (Grammar)**: 文法項目名、解説、例文（中国語/日本語）を抽出
- **レッスン番号指定**: アップロード時にレッスン番号を指定
- **手書きメモ認識**: 手書きメモの認識にも対応
- **データ保存**: `database.json`（単語）と`grammar.json`（文法）に保存

### 4. パフォーマンス最適化

#### 非同期採点システム
- **Fire-and-Forget アーキテクチャ**: ユーザーの待ち時間をゼロにする設計
- **バックグラウンド処理**: AI採点をバックグラウンドで実行
- **結果ポーリング**: タスクIDで結果を取得
- **まとめてフィードバック**: 10問終了後にまとめて結果を表示

### 5. PWA対応
- **オフライン対応**: Service Workerによるオフライン機能
- **ホーム画面追加**: スマホのホーム画面からネイティブアプリのように起動可能
- **マニフェスト設定**: `manifest.json`によるPWA設定

## システム構成 (Architecture)

### Phase 1: Local Server (現在の開発環境)
RTX 4060 Ti等のPCスペックを活かし、ローカルでバックエンドを稼働させる構成。

```text
+-------------------+          +---------------------+
| Smartphone (User) |          |   PC (Server/Dev)   |
+-------------------+          +---------------------+
|                   |          |                     |
|  [Frontend App]   | ~Wi-Fi~> |  [Backend API]      |
|  (Next.js/PWA)    |          |  (FastAPI/Python)   |
|         |         |          |          |          |
|  (Handwriting)    |          |   (Image Process)   |
|         |         |          |          |          |
+---------+---------+          +----------+----------+
                                          |
                                          v
                               +---------------------+
                               | Google Gemini API   |
                               | (Vision & Scoring) |
                               +---------------------+
```

### Phase 2: Serverless (将来の運用環境)
PC不要。スマホとクラウドのみで完結する構成。

```text
+-------------------+          +---------------------+
| Smartphone (PWA)  |          |   Cloud Services    |
+-------------------+          +---------------------+
|                   |          |                     |
|  [App Logic]      | -------> |  [Vercel Hosting]   |
|  (Browser)        |          |                     |
|         |         |          |  [Supabase DB]      |
|         |         |          |  (Data Storage)     |
|         +---------+--------> |                     |
|                              +----------+----------+
|                                         |
+-----------------------------------------+
       (Direct API Call / Edge Function)
                   |
                   v
          +------------------+
          | Google Gemini API|
          +------------------+
```

## APIエンドポイント一覧

### 認証API
- `POST /api/auth/register` - ユーザー登録（言語選択付き）
- `POST /api/auth/login` - ログイン
- `GET /api/auth/me` - 現在のユーザー情報取得

### 管理者API（認証必須・管理者のみ）
- `GET /api/admin/users` - 全ユーザー一覧取得
- `PUT /api/admin/users/{target_student_id}` - ユーザー情報更新（権限変更）
- `DELETE /api/admin/users/{target_student_id}` - ユーザー削除
- `POST /api/admin/upload-textbook` - 教科書画像アップロード（単語/文法）

### 学習データAPI（認証必須）
- `GET /api/words` - 単語データ取得（レッスン番号・ユーザーIDでフィルタリング）
- `GET /api/grammar` - 文法データ取得（レッスン番号・ユーザーIDでフィルタリング）
- `GET /api/lessons` - 利用可能なレッスン番号一覧取得

### 採点API（認証必須）
- `POST /api/score/handwriting` - 手書き採点（非同期）
- `POST /api/score/sorting` - 並べ替え問題採点
- `POST /api/score/writing` - 作文添削（非同期）
- `GET /api/score/result/{task_id}` - 非同期採点結果取得

### その他
- `GET /` - APIステータス確認

## 技術スタック

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **UI Library**: React
- **Canvas**: React Canvas Draw
- **PWA**: next-pwa
- **認証**: JWT (localStorage)
- **状態管理**: React Context API

### Backend
- **Framework**: FastAPI
- **Language**: Python 3.10+
- **Server**: Uvicorn
- **認証**: JWT (python-jose)
- **パスワードハッシュ**: passlib (pbkdf2_sha256)
- **画像処理**: Pillow (PIL)
- **CORS**: FastAPI CORS Middleware

### AI/ML
- **AI Model**: Google Gemini API
  - Gemini 2.5 Flash / Gemini 2.0 Flash / Gemini Pro（フォールバック対応）
- **Vision API**: Gemini Vision（画像解析）

### Database
- **開発環境**: Local JSON Files
  - `database.json` - 単語データ
  - `grammar.json` - 文法データ
  - `users.json` - ユーザーデータ
- **本番環境（予定）**: Supabase (PostgreSQL) / Firebase

### Dev Tools
- **Editor**: Cursor (AI Editor)
- **Version Control**: Git

## セットアップ手順 (Installation)

### 1. プロジェクトの準備
```bash
git clone https://github.com/your-username/ai-language-tutor.git
cd ai-language-tutor
```

### 2. バックエンド (Python)

#### 仮想環境の作成と有効化
```bash
cd backend
python -m venv venv

# Windowsの場合:
.\venv\Scripts\activate

# Mac/Linuxの場合:
source venv/bin/activate
```

#### 依存関係のインストール
```bash
pip install -r requirements.txt
```

#### 環境変数の設定
`.env` ファイルを `backend/` ディレクトリに作成し、以下を記述：

```env
GEMINI_API_KEY=your_gemini_api_key_here
SECRET_KEY=your_secret_key_here  # JWT署名用（任意、自動生成も可能）
```

### 3. フロントエンド (Next.js)

#### 依存関係のインストール
```bash
cd ../frontend
npm install
```

#### 環境変数の設定（オプション）
`.env.local` ファイルを `frontend/` ディレクトリに作成：

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 実行コマンド (Usage)

### サーバー起動

#### Backend (PC)
```bash
# /backend ディレクトリ内で実行
cd backend
.\venv\Scripts\activate  # Windows
# または
source venv/bin/activate  # Mac/Linux

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend (PC)
```bash
# /frontend ディレクトリ内で実行
cd frontend
npm run dev
```

### アプリ利用方法

1. **PCでサーバー起動**
   - バックエンド: `http://localhost:8000`
   - フロントエンド: `http://localhost:3000`

2. **スマホからアクセス**
   - PCのIPアドレスを確認（例: `192.168.1.45`）
   - スマホのブラウザで `http://192.168.1.45:3000` にアクセス

3. **初回利用**
   - ログインページで「アカウントを作成する」をクリック
   - 学生ID、パスワード（任意）、学習言語を選択して登録
   - 最初のユーザーが自動的に管理者になる

4. **学習する**
   - ホーム画面から「学習する」を選択
   - レッスン番号を選択（アップロード済みのレッスンのみ表示）
   - 学習モードを選択（手書き/並べ替え/作文）
   - 10問ずつ学習

5. **データを追加する（管理者のみ）**
   - ホーム画面から「管理画面」を選択
   - レッスン番号とデータタイプ（単語/文法）を選択
   - カメラで教科書を撮影してアップロード
   - Gemini Visionが自動解析してデータベースに保存

6. **ユーザー管理（管理者のみ）**
   - ホーム画面から「ユーザー管理」を選択
   - ユーザー一覧を確認
   - 権限変更や削除が可能

## データ構造

### 単語データ (database.json)
```json
{
  "id": 1,
  "user_id": "student001",
  "lesson": 1,
  "word": "你好",
  "pinyin": "nǐ hǎo",
  "meaning": "こんにちは",
  "correct_count": 5,
  "miss_count": 2,
  "last_reviewed": "2024-01-15T10:30:00"
}
```

### 文法データ (grammar.json)
```json
{
  "id": 1,
  "user_id": "student001",
  "lesson": 1,
  "title": "是構文",
  "description": "「是」は「〜です」を表す動詞です。",
  "example_cn": "我是学生",
  "example_jp": "私は学生です"
}
```

### ユーザーデータ (users.json)
```json
{
  "student_id": "student001",
  "password_hash": "...",
  "is_admin": true,
  "language": "chinese",
  "created_at": "2024-01-01T00:00:00",
  "webauthn_credentials": []
}
```

## セキュリティ機能

- **JWT認証**: トークンベースの認証システム
- **パスワードハッシュ**: pbkdf2_sha256による安全なパスワード保存
- **CORS設定**: クロスオリジンリクエストの制御
- **管理者権限チェック**: 管理者専用機能へのアクセス制御
- **データ分離**: ユーザーごとのデータ完全分離
- **自己保護**: 自分自身の削除や権限削除を防止

## 今後の開発予定

### Phase 2: オンライン化（クラウド移行）
- [ ] **Vercelデプロイ**: フロントエンドのクラウドホスティング
- [ ] **Supabase連携**: クラウドDBへの移行
- [ ] **Edge Functions**: サーバーレス関数でのAPI実装
- [ ] **環境変数の管理**: クラウド環境での設定管理

### 機能拡張
- [ ] **WebAuthn/Face ID対応**: 生体認証によるログイン
- [ ] **学習進捗の可視化**: グラフや統計情報の表示
- [ ] **復習機能**: 間違えた問題の自動復習
- [ ] **音声認識**: 発音練習機能
- [ ] **多言語UI**: アプリ自体の多言語化

### パフォーマンス改善
- [ ] **ローカルOCR実装**: Python側でOCRモデルを動かし高速化
- [ ] **キャッシュ機能**: よく使うデータのキャッシュ
- [ ] **画像最適化**: アップロード画像の自動圧縮

## トラブルシューティング

### バックエンドが起動しない
- 仮想環境が有効化されているか確認
- `requirements.txt`の依存関係がインストールされているか確認
- `.env`ファイルに`GEMINI_API_KEY`が設定されているか確認

### スマホからアクセスできない
- PCとスマホが同じWi-Fiネットワークに接続されているか確認
- PCのファイアウォールでポート8000と3000が開放されているか確認
- PCのIPアドレスが正しいか確認（`ipconfig` / `ifconfig`で確認）

### 認証エラーが発生する
- トークンが期限切れの可能性（再ログイン）
- ブラウザのlocalStorageをクリアして再試行

## Supabaseテーブル構造

Supabaseを使用する場合、以下のテーブルを作成する必要があります。

### users テーブル
```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  language TEXT DEFAULT 'chinese',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  webauthn_credentials JSONB DEFAULT '[]'::jsonb
);
```

### words テーブル
```sql
CREATE TABLE words (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  lesson INTEGER NOT NULL,
  word TEXT NOT NULL,
  pinyin TEXT,
  meaning TEXT,
  correct_count INTEGER DEFAULT 0,
  miss_count INTEGER DEFAULT 0,
  last_reviewed TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_words_user_id ON words(user_id);
CREATE INDEX idx_words_lesson ON words(lesson);
```

### grammar テーブル
```sql
CREATE TABLE grammar (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  lesson INTEGER NOT NULL,
  title TEXT,
  description TEXT,
  example_cn TEXT,
  example_jp TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_grammar_user_id ON grammar(user_id);
CREATE INDEX idx_grammar_lesson ON grammar(lesson);
```

### 環境変数の設定
`.env`ファイルに以下を追加：
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
```

**注意**: Supabaseの設定がない場合、自動的にローカルJSONモードにフォールバックします。

## License
MIT

## 開発者向け情報

### プロジェクト構造
```
LearnChineseBro/
├── backend/
│   ├── main.py              # FastAPIアプリケーション
│   ├── requirements.txt      # Python依存関係
│   ├── .env                  # 環境変数（要作成）
│   ├── database.json        # 単語データ（自動生成）
│   ├── grammar.json         # 文法データ（自動生成）
│   └── users.json           # ユーザーデータ（自動生成）
├── frontend/
│   ├── app/                  # Next.js App Router
│   │   ├── page.tsx         # ホームページ
│   │   ├── login/           # ログイン・登録ページ
│   │   ├── learn/           # 学習ページ
│   │   └── admin/           # 管理画面
│   ├── components/          # Reactコンポーネント
│   ├── contexts/            # React Context（認証など）
│   ├── lib/                 # ユーティリティ関数
│   └── public/              # 静的ファイル
└── readme.md                # このファイル
```

### 開発時の注意点
- バックエンドとフロントエンドは別々のターミナルで起動
- コード変更時は自動リロードされる（`--reload`オプション）
- データファイル（JSON）は`.gitignore`に追加済み
