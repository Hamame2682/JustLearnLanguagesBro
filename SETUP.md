# セットアップガイド

## クイックスタート

### 1. バックエンドのセットアップ

```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate

# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 2. 環境変数の設定

`backend/.env` ファイルを作成し、以下を記述：

```
GEMINI_API_KEY=your_gemini_api_key_here
```

Gemini APIキーは [Google AI Studio](https://makersuite.google.com/app/apikey) で取得できます。

### 3. フロントエンドのセットアップ

```bash
cd frontend
npm install
```

### 4. 環境変数の設定（iPhoneからアクセスする場合）

iPhoneからアクセスする場合は、`frontend/.env.local` ファイルを作成し、PCのIPアドレスを設定：

```bash
# frontend/.env.local を作成
NEXT_PUBLIC_API_URL=http://192.168.1.45:8000
```

**PCのIPアドレスの確認方法:**
- Windows: `ipconfig` コマンドで「IPv4 アドレス」を確認
- Mac/Linux: `ifconfig` または `ip addr` コマンドで確認

**注意:** 環境変数を設定しない場合、アプリは自動的に現在のホスト名からAPI URLを構築します（例: iPhoneから `http://192.168.1.45:3000` でアクセス → APIは `http://192.168.1.45:8000` に自動設定）。

### 5. サーバーの起動

**ターミナル1（バックエンド）:**
```bash
cd backend
.\venv\Scripts\activate  # Windows
# または
source venv/bin/activate  # Mac/Linux

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**ターミナル2（フロントエンド）:**
```bash
cd frontend
npm run dev
```

### 6. アクセス

- PCから: http://localhost:3000
- スマホから: http://[PCのIPアドレス]:3000

PCのIPアドレスは以下のコマンドで確認できます：
- Windows: `ipconfig`
- Mac/Linux: `ifconfig` または `ip addr`

## トラブルシューティング

### バックエンドが起動しない

- Python 3.8以上がインストールされているか確認
- 仮想環境が正しくアクティベートされているか確認
- `GEMINI_API_KEY` が正しく設定されているか確認

### フロントエンドがバックエンドに接続できない

- バックエンドが起動しているか確認
- `NEXT_PUBLIC_API_URL` が正しく設定されているか確認
- ファイアウォールがポート8000をブロックしていないか確認

### スマホからアクセスできない

- PCとスマホが同じWi-Fiネットワークに接続されているか確認
- PCのファイアウォールでポート3000と8000が許可されているか確認

