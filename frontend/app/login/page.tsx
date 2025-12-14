'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function LoginPage() {
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('chinese');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await register(studentId, password, selectedLanguage);
      } else {
        await login(studentId, password);
      }
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>
          {isRegister ? 'アカウント作成' : 'ログイン'}
        </h1>
        
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="studentId" className={styles.label}>
              学生ID
            </label>
            <input
              id="studentId"
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className={styles.input}
              placeholder="学生IDを入力"
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password" className={styles.label}>
              パスワード（任意）
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              placeholder="パスワードを入力（任意）"
            />
          </div>

          {isRegister && (
            <div className={styles.inputGroup}>
              <label htmlFor="language" className={styles.label}>
                どの言語を学習しますか？
              </label>
              <div className={styles.languageOptions}>
                {[
                  { value: 'chinese', label: '中国語' },
                  { value: 'english', label: '英語' },
                  { value: 'german', label: 'ドイツ語' },
                  { value: 'spanish', label: 'スペイン語' },
                ].map((lang) => (
                  <button
                    key={lang.value}
                    type="button"
                    onClick={() => setSelectedLanguage(lang.value)}
                    className={`${styles.languageButton} ${
                      selectedLanguage === lang.value ? styles.languageButtonActive : ''
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !studentId}
            className={styles.submitButton}
          >
            {loading ? '処理中...' : (isRegister ? '登録' : 'ログイン')}
          </button>
        </form>

        <div className={styles.switch}>
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            className={styles.switchButton}
          >
            {isRegister ? '既にアカウントをお持ちの方はログイン' : 'アカウントを作成する'}
          </button>
        </div>
      </div>
    </div>
  );
}

