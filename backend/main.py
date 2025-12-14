from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import google.generativeai as genai
import os
from dotenv import load_dotenv
import json
import asyncio
import traceback  # ← これがエラー追跡のキモや
import sys  # 標準エラー出力用
from typing import Optional
from pydantic import BaseModel
from PIL import Image
import io
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import secrets
from supabase import create_client, Client

load_dotenv()

app = FastAPI(title="AI Language Tutor API")

# Supabase接続設定
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase接続成功")
    except Exception as e:
        print(f"⚠️ Supabase接続エラー: {e}")
        print("💡 ローカルJSONモードで動作します")
else:
    print("⚠️ SUPABASE_URL/SUPABASE_KEYが設定されていません")
    print("💡 ローカルJSONモードで動作します")

# データベースファイルの場所（フォールバック用）
DB_FILE = "database.json"
GRAMMAR_DB_FILE = "grammar.json"  # 文法用のファイル
USERS_FILE = "users.json"  # ユーザー情報

# 認証設定
SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_urlsafe(32))  # JWT署名用の秘密鍵
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7日間

# パスワードハッシュ化（bcryptの72バイト制限を避けるため、pbkdf2_sha256を使用）
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# JWT認証
security = HTTPBearer()

# CORS設定（スマホからのアクセスを許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番環境では適切に制限
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== 認証関連の関数 ====================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """パスワード検証"""
    if not hashed_password:
        return not plain_password or len(plain_password) == 0  # パスワードが任意の場合は空文字列でもOK
    if not plain_password or len(plain_password) == 0:
        return not hashed_password or len(hashed_password) == 0  # 入力が空の場合、ハッシュも空ならOK
    # pbkdf2_sha256は72バイト制限がないので、そのまま検証
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """パスワードハッシュ化"""
    # 空文字列の場合はハッシュ化せずに空文字列を返す
    if not password or len(password.strip()) == 0:
        return ""  # パスワードが任意の場合は空文字列（ハッシュ化しない）
    # pbkdf2_sha256は72バイト制限がないので、そのままハッシュ化
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """JWTトークン生成"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """現在のユーザーを取得（JWT認証）"""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        student_id: str = payload.get("sub")
        if student_id is None:
            raise HTTPException(status_code=401, detail="認証情報が無効です")
        return student_id
    except JWTError:
        raise HTTPException(status_code=401, detail="認証情報が無効です")

def get_current_admin(current_user: str = Depends(get_current_user)):
    """現在のユーザーがadminかどうかを確認"""
    user = get_user_by_student_id(current_user)
    if not user:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="管理者権限が必要です")
    return current_user

def load_users():
    """ユーザー情報を読み込む（Supabase優先、フォールバックはJSON）"""
    if supabase:
        try:
            response = supabase.table("users").select("*").execute()
            return response.data if response.data else []
        except Exception as e:
            print(f"⚠️ Supabase読み込みエラー: {e}")
            # フォールバック: JSON
            pass
    
    # フォールバック: ローカルJSON
    if not os.path.exists(USERS_FILE):
        return []
    with open(USERS_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []

def save_users(users: list):
    """ユーザー情報を保存（Supabase優先、フォールバックはJSON）"""
    if supabase:
        try:
            # Supabaseの場合は全件削除してから再挿入（簡易実装）
            # 本番ではupsertを使うべき
            for user in users:
                # student_idで既存をチェック
                existing = supabase.table("users").select("*").eq("student_id", user["student_id"]).execute()
                if existing.data:
                    # 更新
                    supabase.table("users").update({
                        "password_hash": user.get("password_hash", ""),
                        "is_admin": user.get("is_admin", False),
                        "language": user.get("language", "chinese"),
                        "created_at": user.get("created_at", ""),
                        "webauthn_credentials": user.get("webauthn_credentials", [])
                    }).eq("student_id", user["student_id"]).execute()
                else:
                    # 新規挿入
                    supabase.table("users").insert({
                        "student_id": user["student_id"],
                        "password_hash": user.get("password_hash", ""),
                        "is_admin": user.get("is_admin", False),
                        "language": user.get("language", "chinese"),
                        "created_at": user.get("created_at", ""),
                        "webauthn_credentials": user.get("webauthn_credentials", [])
                    }).execute()
            print("💾 Supabaseにユーザーを保存したで！")
            return
        except Exception as e:
            print(f"⚠️ Supabase保存エラー: {e}")
            # フォールバック: JSON
            pass
    
    # フォールバック: ローカルJSON
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)

def get_user_by_student_id(student_id: str):
    """学生IDでユーザーを検索（Supabase優先、フォールバックはJSON）"""
    if supabase:
        try:
            response = supabase.table("users").select("*").eq("student_id", student_id).execute()
            if response.data and len(response.data) > 0:
                return response.data[0]
            return None
        except Exception as e:
            print(f"⚠️ Supabase検索エラー: {e}")
            # フォールバック: JSON
            pass
    
    # フォールバック: ローカルJSON
    users = load_users()
    for user in users:
        if user.get("student_id") == student_id:
            return user
    return None

def is_first_user():
    """最初のユーザーかどうかチェック"""
    if supabase:
        try:
            response = supabase.table("users").select("id", count="exact").execute()
            return response.count == 0 if hasattr(response, 'count') else len(response.data) == 0
        except Exception as e:
            print(f"⚠️ Supabaseチェックエラー: {e}")
            # フォールバック: JSON
            pass
    
    # フォールバック: ローカルJSON
    users = load_users()
    return len(users) == 0

# ==================== 認証API ====================

class RegisterRequest(BaseModel):
    student_id: str
    password: Optional[str] = None
    language: str = "chinese"  # デフォルトは中国語（後方互換性のため）

class LoginRequest(BaseModel):
    student_id: str
    password: Optional[str] = None

@app.post("/api/auth/register")
async def register(request: RegisterRequest):
    """ユーザー登録"""
    users = load_users()
    
    # 既存ユーザーチェック
    if get_user_by_student_id(request.student_id):
        raise HTTPException(status_code=400, detail="この学生IDは既に登録されています")
    
    # ユーザー作成
    # パスワードハッシュ化（空文字列の場合は空文字列を返す）
    password_hash = ""
    if request.password and len(request.password.strip()) > 0:
        password_hash = get_password_hash(request.password)
    
    # 言語の検証（許可された言語のみ）
    allowed_languages = ["chinese", "english", "german", "spanish"]
    language = request.language.lower() if request.language else "chinese"
    if language not in allowed_languages:
        language = "chinese"  # 無効な場合はデフォルト
    
    is_admin = is_first_user()  # 最初のユーザーがadmin
    
    new_user = {
        "student_id": request.student_id,
        "password_hash": password_hash,
        "is_admin": is_admin,
        "language": language,  # 学習言語を追加
        "created_at": datetime.utcnow().isoformat(),
        "webauthn_credentials": []  # WebAuthn認証情報（後で追加）
    }
    
    # Supabaseに直接保存（フォールバックはsave_users）
    if supabase:
        try:
            supabase.table("users").insert({
                "student_id": request.student_id,
                "password_hash": password_hash,
                "is_admin": is_admin,
                "language": language,
                "created_at": datetime.utcnow().isoformat(),
                "webauthn_credentials": []
            }).execute()
            print(f"💾 Supabaseにユーザーを登録したで！: {request.student_id}")
        except Exception as e:
            print(f"⚠️ Supabase登録エラー: {e}")
            # フォールバック: JSON
            users = load_users()
            users.append(new_user)
            save_users(users)
    else:
        # フォールバック: ローカルJSON
        users = load_users()
        users.append(new_user)
        save_users(users)
    
    # アクセストークン生成
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": request.student_id}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "student_id": request.student_id,
        "is_admin": new_user["is_admin"]
    }

@app.post("/api/auth/login")
async def login(request: LoginRequest):
    """ログイン（学生ID + パスワード）"""
    user = get_user_by_student_id(request.student_id)
    if not user:
        raise HTTPException(status_code=401, detail="学生IDまたはパスワードが正しくありません")
    
    # パスワード検証
    if not verify_password(request.password or "", user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="学生IDまたはパスワードが正しくありません")
    
    # アクセストークン生成
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": request.student_id}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "student_id": request.student_id,
        "is_admin": user.get("is_admin", False)
    }

@app.get("/api/auth/me")
async def get_current_user_info(current_user: str = Depends(get_current_user)):
    """現在のユーザー情報を取得"""
    user = get_user_by_student_id(current_user)
    if not user:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    
    return {
        "student_id": user["student_id"],
        "is_admin": user.get("is_admin", False),
        "language": user.get("language", "chinese")  # 言語情報も返す
    }

def get_current_admin(current_user: str = Depends(get_current_user)):
    """現在のユーザーがadminかどうかを確認"""
    user = get_user_by_student_id(current_user)
    if not user:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="管理者権限が必要です")
    return current_user

# ==================== 管理者用API ====================

@app.get("/api/admin/users")
async def get_all_users(admin_user: str = Depends(get_current_admin)):
    """全ユーザー一覧を取得（管理者のみ）"""
    users = load_users()
    # パスワードハッシュは返さない
    user_list = []
    for user in users:
        user_list.append({
            "student_id": user["student_id"],
            "is_admin": user.get("is_admin", False),
            "language": user.get("language", "chinese"),
            "created_at": user.get("created_at", "")
        })
    return {"users": user_list}

class UpdateUserRequest(BaseModel):
    student_id: str
    is_admin: Optional[bool] = None

@app.put("/api/admin/users/{target_student_id}")
async def update_user(
    target_student_id: str,
    request: UpdateUserRequest,
    admin_user: str = Depends(get_current_admin)
):
    """ユーザー情報を更新（管理者のみ、Supabase優先、フォールバックはJSON）"""
    target_user = get_user_by_student_id(target_student_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    
    # 自分自身のadmin権限を削除することはできない
    if target_student_id == admin_user and request.is_admin == False:
        raise HTTPException(status_code=400, detail="自分自身の管理者権限を削除することはできません")
    
    if supabase:
        try:
            update_data = {}
            if request.is_admin is not None:
                update_data["is_admin"] = request.is_admin
            
            if update_data:
                supabase.table("users").update(update_data).eq("student_id", target_student_id).execute()
            return {"message": "ユーザー情報を更新しました", "student_id": target_student_id}
        except Exception as e:
            print(f"⚠️ Supabase更新エラー: {e}")
            # フォールバック: JSON
            pass
    
    # フォールバック: ローカルJSON
    users = load_users()
    for user in users:
        if user["student_id"] == target_student_id:
            if request.is_admin is not None:
                user["is_admin"] = request.is_admin
            break
    
    save_users(users)
    return {"message": "ユーザー情報を更新しました", "student_id": target_student_id}

@app.delete("/api/admin/users/{target_student_id}")
async def delete_user(
    target_student_id: str,
    admin_user: str = Depends(get_current_admin)
):
    """ユーザーを削除（管理者のみ、Supabase優先、フォールバックはJSON）"""
    # 自分自身を削除することはできない
    if target_student_id == admin_user:
        raise HTTPException(status_code=400, detail="自分自身を削除することはできません")
    
    target_user = get_user_by_student_id(target_student_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    
    if supabase:
        try:
            supabase.table("users").delete().eq("student_id", target_student_id).execute()
            return {"message": "ユーザーを削除しました", "student_id": target_student_id}
        except Exception as e:
            print(f"⚠️ Supabase削除エラー: {e}")
            # フォールバック: JSON
            pass
    
    # フォールバック: ローカルJSON
    users = load_users()
    users = [user for user in users if user["student_id"] != target_student_id]
    save_users(users)
    
    return {"message": "ユーザーを削除しました", "student_id": target_student_id}

# Gemini API設定
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    
    # 利用可能なモデルをリストアップ
    print("🔍 利用可能なGeminiモデルを確認中...")
    available_model_names = []
    try:
        available_models = genai.list_models()
        print("📋 利用可能なモデル一覧:")
        for m in available_models:
            if 'generateContent' in m.supported_generation_methods:
                model_name = m.name.replace("models/", "")
                print(f"  - {model_name}")
                available_model_names.append(model_name)
    except Exception as e:
        print(f"⚠️ モデル一覧の取得に失敗: {e}")
    
    # モデル名を修正: v1beta APIで使えるモデルを試す
    model = None
    vision_model = None
    # まずリストアップしたモデルを試し、その後フォールバック
    model_names = available_model_names if available_model_names else ["gemini-pro"]
    
    print(f"🧪 試行するモデル名: {model_names[:5]}...")  # 最初の5つだけ表示
    
    for model_name in model_names:
        try:
            print(f"🔄 {model_name} を試行中...")
            test_model = genai.GenerativeModel(model_name)
            model = test_model
            vision_model = test_model
            print(f"✅ Geminiモデル初期化成功: {model_name}")
            break
        except Exception as e:
            error_msg = str(e)
            if "404" not in error_msg and "not found" not in error_msg.lower():
                # 404以外のエラーは無視（モデルは存在するが他の問題）
                print(f"⚠️ {model_name} でエラー: {error_msg[:100]}")
            continue
    
    if model is None:
        print("❌ エラー: 利用可能なGeminiモデルが見つかりませんでした")
        print("💡 ヒント: APIキーが正しいか、google-generativeaiライブラリを最新版に更新してください")
else:
    print("⚠️ 警告: GEMINI_API_KEY が読み込めてへんで！ .envを確認してな！")
    model = None
    vision_model = None


# データモデル
class HandwritingSubmission(BaseModel):
    image_data: str  # base64エンコードされた画像
    question_id: str
    expected_answer: str


class SortingSubmission(BaseModel):
    words: list[str]
    question_id: str
    expected_order: list[str]


class WritingSubmission(BaseModel):
    text: str
    question_id: str
    expected_answer: Optional[str] = None


class TextbookImage(BaseModel):
    image_data: str  # base64エンコードされた画像
    page_number: Optional[int] = None


# 非同期採点結果を保存する簡易ストレージ（本番ではDBを使用）
scoring_results = {}


@app.get("/")
async def root():
    return {"message": "AI Language Tutor API", "status": "running"}


@app.post("/api/score/handwriting")
async def score_handwriting(submission: HandwritingSubmission):
    """
    手書き回答を採点（非同期処理）
    """
    try:
        import base64
        from io import BytesIO
        from PIL import Image
        
        # base64デコード
        image_bytes = base64.b64decode(submission.image_data.split(",")[-1])
        image = Image.open(BytesIO(image_bytes))
        
        # ★★★ 透明部分を白にする魔法のコード ★★★
        if image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info):
            # 白いキャンバスを作る
            background = Image.new("RGB", image.size, (255, 255, 255))
            # 元の画像（文字）を上に乗せる（透明部分は背景の白が出る）
            if image.mode != 'RGBA':
                image = image.convert('RGBA')
            
            # アルファチャンネルをマスクに使って合成
            if image.mode == 'RGBA':
                background.paste(image, mask=image.split()[3])  # アルファチャンネルをマスクに使う
            else:
                background.paste(image)
            image = background  # これで「白背景に黒文字」の画像になった！
        
        # モードがRGBAやLAのままの場合はRGBに変換
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        print(f"✅ 画像処理完了: {image.mode} モード、サイズ: {image.size}", flush=True)
        # ★★★ 追加ここまで ★★★
        
        # Gemini Visionで採点
        prompt = f"""
        この手書きの中国語文字を認識し、正解「{submission.expected_answer}」と比較して採点してください。
        
        回答形式:
        - 認識結果: [認識した文字]
        - 正誤判定: [正解/不正解]
        - フィードバック: [詳細なコメント]
        """
        
        # 非同期で実行（Fire-and-Forget）
        task_id = f"handwriting_{submission.question_id}_{len(scoring_results)}"
        
        async def async_score():
            try:
                response = vision_model.generate_content([prompt, image])
                result = {
                    "task_id": task_id,
                    "question_id": submission.question_id,
                    "recognized_text": response.text,
                    "status": "completed"
                }
                scoring_results[task_id] = result
            except Exception as e:
                scoring_results[task_id] = {
                    "task_id": task_id,
                    "question_id": submission.question_id,
                    "error": str(e),
                    "status": "error"
                }
        
        asyncio.create_task(async_score())
        
        return {"task_id": task_id, "status": "processing"}
    
    except Exception as e:
        print(f"🔥 手書き採点エラー: {str(e)}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/score/sorting")
async def score_sorting(submission: SortingSubmission):
    """
    並べ替え問題を採点
    """
    try:
        user_order = submission.words
        expected_order = submission.expected_order
        
        is_correct = user_order == expected_order
        
        feedback = ""
        if not is_correct:
            feedback = f"正しい順序: {' → '.join(expected_order)}"
        
        return {
            "question_id": submission.question_id,
            "is_correct": is_correct,
            "user_order": user_order,
            "expected_order": expected_order,
            "feedback": feedback
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/score/writing")
async def score_writing(submission: WritingSubmission):
    """
    作文をGeminiで添削（非同期処理）
    """
    try:
        prompt = f"""
        以下の中国語の作文を添削してください。
        
        学生の回答:
        {submission.text}
        
        {f"期待される回答の参考: {submission.expected_answer}" if submission.expected_answer else ""}
        
        以下の観点で評価してください:
        1. 文法の正確性
        2. 語彙の適切性
        3. より自然な表現の提案
        4. 総合的なフィードバック
        
        JSON形式で返答してください:
        {{
            "grammar_score": 0-100,
            "vocabulary_score": 0-100,
            "suggestions": ["提案1", "提案2"],
            "feedback": "総合的なコメント"
        }}
        """
        
        task_id = f"writing_{submission.question_id}_{len(scoring_results)}"
        
        async def async_score():
            try:
                response = model.generate_content(prompt)
                result_text = response.text
                
                # JSON抽出を試行
                try:
                    import re
                    json_match = re.search(r'\{.*\}', result_text, re.DOTALL)
                    if json_match:
                        result_json = json.loads(json_match.group())
                    else:
                        result_json = {"raw_feedback": result_text}
                except:
                    result_json = {"raw_feedback": result_text}
                
                scoring_results[task_id] = {
                    "task_id": task_id,
                    "question_id": submission.question_id,
                    "result": result_json,
                    "status": "completed"
                }
            except Exception as e:
                scoring_results[task_id] = {
                    "task_id": task_id,
                    "question_id": submission.question_id,
                    "error": str(e),
                    "status": "error"
                }
        
        asyncio.create_task(async_score())
        
        return {"task_id": task_id, "status": "processing"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/score/result/{task_id}")
async def get_score_result(task_id: str):
    """
    採点結果を取得
    """
    if task_id not in scoring_results:
        return {"status": "not_found"}
    
    return scoring_results[task_id]


# --- 🛠️ 保存用の関数（ここが追加ポイント） ---
def save_to_supabase(new_words, lesson_num, user_id: str):
    """
    解析した単語データをSupabaseに保存（ユーザーID付き）
    フォールバック: ローカルJSON
    """
    data_to_insert = []
    for word in new_words:
        data_to_insert.append({
            "user_id": user_id,
            "lesson": lesson_num,
            "word": word.get("word", ""),
            "pinyin": word.get("pinyin", ""),
            "meaning": word.get("meaning", ""),
            "correct_count": 0,
            "miss_count": 0,
            "last_reviewed": None
        })
    
    if supabase:
        try:
            response = supabase.table("words").insert(data_to_insert).execute()
            print(f"💾 {len(new_words)}個の単語をSupabaseに保存したで！（ユーザー: {user_id}）")
            return
        except Exception as e:
            print(f"⚠️ Supabase保存エラー: {e}")
            print("💡 ローカルJSONにフォールバックします")
            # フォールバック: JSON
            pass
    
    # フォールバック: ローカルJSON
    if not os.path.exists(DB_FILE):
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, ensure_ascii=False, indent=2)
    
    with open(DB_FILE, "r", encoding="utf-8") as f:
        try:
            current_data = json.load(f)
        except json.JSONDecodeError:
            current_data = []

    start_id = len(current_data) + 1
    for i, word in enumerate(new_words):
        word_entry = {
            "id": start_id + i,
            "user_id": user_id,
            "lesson": lesson_num,
            "word": word.get("word", ""),
            "pinyin": word.get("pinyin", ""),
            "meaning": word.get("meaning", ""),
            "correct_count": 0,
            "miss_count": 0,
            "last_reviewed": None
        }
        current_data.append(word_entry)

    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(current_data, f, ensure_ascii=False, indent=2)
    
    print(f"💾 {len(new_words)}個の単語を database.json に保存したで！（ユーザー: {user_id}）")


def save_grammar_to_supabase(new_grammar, lesson_num, user_id: str):
    """
    解析した文法データをSupabaseに保存（ユーザーID付き）
    フォールバック: ローカルJSON
    """
    data_to_insert = []
    for item in new_grammar:
        data_to_insert.append({
            "user_id": user_id,
            "lesson": lesson_num,
            "title": item.get("title", "無題"),
            "description": item.get("description", ""),
            "example_cn": item.get("example_cn", ""),
            "example_jp": item.get("example_jp", "")
        })
    
    if supabase:
        try:
            response = supabase.table("grammar").insert(data_to_insert).execute()
            print(f"💾 文法 {len(new_grammar)}個をSupabaseに保存したで！（ユーザー: {user_id}）")
            return
        except Exception as e:
            print(f"⚠️ Supabase保存エラー: {e}")
            print("💡 ローカルJSONにフォールバックします")
            # フォールバック: JSON
            pass
    
    # フォールバック: ローカルJSON
    if not os.path.exists(GRAMMAR_DB_FILE):
        with open(GRAMMAR_DB_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, ensure_ascii=False, indent=2)
    
    with open(GRAMMAR_DB_FILE, "r", encoding="utf-8") as f:
        try:
            current_data = json.load(f)
        except json.JSONDecodeError:
            current_data = []

    start_id = len(current_data) + 1
    for i, item in enumerate(new_grammar):
        entry = {
            "id": start_id + i,
            "user_id": user_id,
            "lesson": lesson_num,
            "title": item.get("title", "無題"),
            "description": item.get("description", ""),
            "example_cn": item.get("example_cn", ""),
            "example_jp": item.get("example_jp", "")
        }
        current_data.append(entry)

    with open(GRAMMAR_DB_FILE, "w", encoding="utf-8") as f:
        json.dump(current_data, f, ensure_ascii=False, indent=2)
    print(f"💾 文法 {len(new_grammar)}個を grammar.json に保存したで！（ユーザー: {user_id}）")


@app.post("/api/admin/upload-textbook")
async def upload_textbook(
    file: UploadFile = File(...),
    lesson: int = Form(...),
    type: str = Form("word"),  # ★ここ重要！ 'word' か 'grammar' が来る（デフォルトは'word'）
    current_user: str = Depends(get_current_user)  # 認証必須
):
    """
    教科書画像をアップロードし、Gemini Visionで解析して保存
    type: 'word' または 'grammar' で処理を分岐
    """
    print(f"\n📩 画像受信: {type}モード, 第{lesson}課", flush=True)
    
    try:
        # 1. APIキーの確認
        if not GEMINI_API_KEY:
            raise Exception("APIキーが設定されてへん！ .envを見てくれ！")
        
        if vision_model is None:
            raise Exception("Geminiモデルが初期化されてへん！APIキーを確認してくれ！")

        # 2. 画像の読み込み
        print("📷 画像を読み込み中...", flush=True)
        contents = await file.read()
        if not contents:
            raise Exception("画像ファイルが空や！")
        
        try:
            image = Image.open(io.BytesIO(contents))
            print(f"✅ 画像読み込み成功: {image.format}, サイズ: {image.size}", flush=True)
        except Exception as img_error:
            raise Exception(f"画像の読み込みに失敗: {str(img_error)}")

        # 3. Geminiへの命令（タイプによって命令を変える！）
        if type == 'word':
            prompt = """
            この画像から「新しい単語（生詞）」を抽出して。
            以下のJSONリスト形式だけで返して。
            [{"word": "単語", "pinyin": "ピンイン", "meaning": "意味"}]
            """
        else:  # grammar
            prompt = """
            この画像から「文法解説（Grammar）」を抽出して。
            以下のJSONリスト形式だけで返して。
            [
                {
                    "title": "文法項目名（例: 是構文）",
                    "description": "解説文",
                    "example_cn": "例文(中国語)",
                    "example_jp": "例文(日本語)"
                }
            ]
            """
        
        print(f"🤖 Gemini ({type}) に解析依頼中...", flush=True)
        try:
            response = vision_model.generate_content([prompt, image])
            print("✅ Geminiから応答あり", flush=True)
        except Exception as gemini_error:
            raise Exception(f"Gemini API呼び出しエラー: {str(gemini_error)}")
        
        # 4. レスポンスの確認
        if not hasattr(response, 'text') or not response.text:
            raise Exception("Geminiからの応答が空や！")
        
        # 5. JSONのクリーニング（Geminiが ```json とか付けるのを防ぐ）
        text_data = response.text.strip()
        print(f"📝 Geminiの生レスポンス（最初の100文字）: {text_data[:100]}", flush=True)
        
        # JSONクリーニング
        text_data = text_data.replace("```json", "").replace("```", "").strip()
        
        try:
            json_data = json.loads(text_data)
            print(f"✨ {len(json_data)}個のデータを検出！", flush=True)
        except json.JSONDecodeError as json_error:
            print(f"⚠️ JSON解析エラー: {str(json_error)}", flush=True)
            print(f"⚠️ パースしようとしたテキスト: {text_data[:200]}", flush=True)
            raise Exception(f"JSONの解析に失敗: {str(json_error)}. レスポンス: {text_data[:200]}")

        # ★★★ タイプによって保存先を変える！ ★★★
        if type == 'word':
            save_to_supabase(json_data, lesson, current_user)
            message = f"単語 {len(json_data)}個を保存完了！"
        else:
            save_grammar_to_supabase(json_data, lesson, current_user)
            message = f"文法 {len(json_data)}個を保存完了！"

        return {
            "status": "success",
            "message": message,
            "data": json_data,
            "lesson": lesson,
            "type": type
        }

    except Exception as e:
        # ここでエラーの正体を暴く！！！
        # 標準エラー出力にも出力して、確実に表示されるようにする
        error_msg = f"\n{'='*60}\n🔥 蛆エラー発生 🔥\n{'='*60}\n"
        error_msg += f"エラー内容: {str(e)}\n"
        error_msg += f"エラータイプ: {type(e).__name__}\n"
        error_msg += f"\n詳細な場所:\n"
        
        # 両方の出力先に書き込む
        print(error_msg, flush=True)
        print(error_msg, file=sys.stderr, flush=True)
        
        traceback.print_exc()  # これが詳細ログや
        traceback.print_exc(file=sys.stderr)  # 標準エラーにも出力
        
        separator = "\n" + "="*60 + "\n"
        print(separator, flush=True)
        print(separator, file=sys.stderr, flush=True)
        
        raise HTTPException(status_code=500, detail=f"サーバー内部エラー: {str(e)}")


# --- 🛠️ ここを追加！データを読み出す機能 ---
@app.get("/api/words")
def get_words(
    lesson: Optional[int] = None,
    current_user: str = Depends(get_current_user)  # 認証必須
):
    """
    保存された単語データを取得（Supabase優先、フォールバックはJSON）
    lessonパラメータが指定されれば、そのレッスンの単語のみを返す
    """
    if supabase:
        try:
            query = supabase.table("words").select("*").eq("user_id", current_user)
            if lesson is not None:
                query = query.eq("lesson", lesson)
            response = query.execute()
            return response.data if response.data else []
        except Exception as e:
            print(f"⚠️ Supabase読み込みエラー: {e}")
            # フォールバック: JSON
            pass
    
    # フォールバック: ローカルJSON
    if not os.path.exists(DB_FILE):
        return []
    
    with open(DB_FILE, "r", encoding="utf-8") as f:
        try:
            words = json.load(f)
        except json.JSONDecodeError:
            return []
    
    # ユーザーIDでフィルタリング
    user_words = [w for w in words if w.get("user_id") == current_user]
    
    # レッスン番号で絞り込む（指定があれば）
    if lesson is not None:
        filtered_words = [w for w in user_words if str(w.get("lesson")) == str(lesson)]
        return filtered_words
    
    return user_words


# ★追加：文法データを取得するAPI
@app.get("/api/grammar")
def get_grammar(
    lesson: Optional[int] = None,
    current_user: str = Depends(get_current_user)  # 認証必須
):
    """
    保存された文法データを取得（Supabase優先、フォールバックはJSON）
    lessonパラメータが指定されれば、そのレッスンの文法のみを返す
    """
    if supabase:
        try:
            query = supabase.table("grammar").select("*").eq("user_id", current_user)
            if lesson is not None:
                query = query.eq("lesson", lesson)
            response = query.execute()
            return response.data if response.data else []
        except Exception as e:
            print(f"⚠️ Supabase読み込みエラー: {e}")
            # フォールバック: JSON
            pass
    
    # フォールバック: ローカルJSON
    if not os.path.exists(GRAMMAR_DB_FILE):
        return []
    
    with open(GRAMMAR_DB_FILE, "r", encoding="utf-8") as f:
        try:
            grammar_list = json.load(f)
        except json.JSONDecodeError:
            return []
    
    # ユーザーIDでフィルタリング（個人データのみ）
    user_grammar = [g for g in grammar_list if g.get("user_id") == current_user]
    
    if lesson is not None:
        # レッスン番号でフィルタリング（文字列と数字の不一致を防ぐため、全部文字列にして比較）
        filtered = [g for g in user_grammar if str(g.get("lesson")) == str(lesson)]
        return filtered
    
    return user_grammar


# ★追加：アップロードされたレッスン番号のリストを取得
@app.get("/api/lessons")
def get_lessons(current_user: str = Depends(get_current_user)):  # 認証必須
    """
    アップロードされたレッスン番号のリストを取得（Supabase優先、フォールバックはJSON）
    """
    lessons = set()
    
    if supabase:
        try:
            # wordsテーブルからレッスン番号を取得
            words_response = supabase.table("words").select("lesson").eq("user_id", current_user).execute()
            if words_response.data:
                for word in words_response.data:
                    if "lesson" in word:
                        lessons.add(word["lesson"])
            
            # grammarテーブルからレッスン番号を取得
            grammar_response = supabase.table("grammar").select("lesson").eq("user_id", current_user).execute()
            if grammar_response.data:
                for grammar in grammar_response.data:
                    if "lesson" in grammar:
                        lessons.add(grammar["lesson"])
            
            return sorted(list(lessons))
        except Exception as e:
            print(f"⚠️ Supabase読み込みエラー: {e}")
            # フォールバック: JSON
            pass
    
    # フォールバック: ローカルJSON
    # database.jsonからレッスン番号を取得（ユーザー固有）
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r", encoding="utf-8") as f:
            try:
                words = json.load(f)
                for word in words:
                    if word.get("user_id") == current_user and "lesson" in word:
                        lessons.add(word["lesson"])
            except json.JSONDecodeError:
                pass
    
    # grammar.jsonからレッスン番号を取得（ユーザー固有）
    if os.path.exists(GRAMMAR_DB_FILE):
        with open(GRAMMAR_DB_FILE, "r", encoding="utf-8") as f:
            try:
                grammar_list = json.load(f)
                for grammar in grammar_list:
                    if grammar.get("user_id") == current_user and "lesson" in grammar:
                        lessons.add(grammar["lesson"])
            except json.JSONDecodeError:
                pass
    
    # ソートして返す
    return sorted(list(lessons))


@app.get("/api/questions")
async def get_questions():
    """
    問題一覧を取得（現在はモックデータ）
    """
    # 本番ではDBから取得
    return {
        "questions": [
            {
                "id": "1",
                "type": "handwriting",
                "question": "「你好」を手書きで書いてください",
                "expected_answer": "你好"
            },
            {
                "id": "2",
                "type": "sorting",
                "question": "以下の単語を正しい順序に並べ替えてください",
                "words": ["我", "是", "学生"],
                "expected_order": ["我", "是", "学生"]
            },
            {
                "id": "3",
                "type": "writing",
                "question": "「私は学生です」を中国語で書いてください",
                "expected_answer": "我是学生"
            }
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

