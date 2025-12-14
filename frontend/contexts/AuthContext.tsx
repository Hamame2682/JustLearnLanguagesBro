'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getApiUrl } from '@/lib/api';

interface User {
  student_id: string;
  is_admin: boolean;
  language?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (studentId: string, password?: string) => Promise<void>;
  register: (studentId: string, password?: string, language?: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ローカルストレージからトークンを読み込む
  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      setToken(storedToken);
      // ユーザー情報を取得
      fetchUserInfo(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUserInfo = async (authToken: string) => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser({
          ...userData,
          language: userData.language || 'chinese'
        });
      } else {
        // トークンが無効な場合
        localStorage.removeItem('auth_token');
        setToken(null);
      }
    } catch (error) {
      console.error('ユーザー情報の取得に失敗:', error);
      localStorage.removeItem('auth_token');
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (studentId: string, password?: string) => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          student_id: studentId,
          password: password || ''
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'ログインに失敗しました');
      }

      const data = await response.json();
      setToken(data.access_token);
      setUser({
        student_id: data.student_id,
        is_admin: data.is_admin
      });
      localStorage.setItem('auth_token', data.access_token);
    } catch (error: any) {
      throw error;
    }
  };

  const register = async (studentId: string, password?: string, language?: string) => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          student_id: studentId,
          password: password || '',
          language: language || 'chinese'
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || '登録に失敗しました');
      }

      const data = await response.json();
      setToken(data.access_token);
      setUser({
        student_id: data.student_id,
        is_admin: data.is_admin,
        language: language || 'chinese'
      });
      localStorage.setItem('auth_token', data.access_token);
    } catch (error: any) {
      throw error;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        register,
        logout,
        isAuthenticated: !!token && !!user,
        loading
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

