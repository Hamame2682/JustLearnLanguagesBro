/**
 * API URLを動的に取得
 * クライアントサイドでは現在のホスト名を使用
 * サーバーサイドでは環境変数またはデフォルト値を使用
 */
// 認証トークンを取得
export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('auth_token');
  }
  return null;
}

// 認証ヘッダーを取得（JSON用）
export function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// 認証ヘッダーを取得（FormData用 - Content-Typeは設定しない）
export function getAuthHeadersForFormData(): HeadersInit {
  const token = getAuthToken();
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export function getApiUrl(): string {
  // クライアントサイド（ブラウザ）の場合
  if (typeof window !== 'undefined') {
    // 環境変数が設定されている場合はそれを使用
    if (process.env.NEXT_PUBLIC_API_URL) {
      return process.env.NEXT_PUBLIC_API_URL;
    }
    
    // 現在のホスト名からAPI URLを構築
    // 例: http://192.168.1.100:3000 -> http://192.168.1.100:8000
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    return `${protocol}//${hostname}:8000`;
  }
  
  // サーバーサイドの場合
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
}

