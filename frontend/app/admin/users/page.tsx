'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getApiUrl, getAuthHeaders } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import styles from './page.module.css';

interface User {
  student_id: string;
  is_admin: boolean;
  created_at: string;
}

export default function UserManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // 認証チェック
  useEffect(() => {
    if (!authLoading && (!user || !user.is_admin)) {
      setError('管理者権限が必要です');
      setLoading(false);
    }
  }, [user, authLoading]);

  // ユーザー一覧を取得
  useEffect(() => {
    if (user && user.is_admin) {
      fetchUsers();
    }
  }, [user]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/admin/users`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('管理者権限が必要です');
        }
        throw new Error('ユーザー一覧の取得に失敗しました');
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAdmin = async (targetStudentId: string, currentIsAdmin: boolean) => {
    if (!confirm(`${targetStudentId}の管理者権限を${currentIsAdmin ? '削除' : '付与'}しますか？`)) {
      return;
    }

    try {
      setError(null);
      setMessage(null);
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/admin/users/${targetStudentId}`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          student_id: targetStudentId,
          is_admin: !currentIsAdmin,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '更新に失敗しました');
      }

      setMessage('ユーザー情報を更新しました');
      fetchUsers(); // 一覧を再取得
    } catch (err: any) {
      setError(err.message || 'エラーが発生しました');
    }
  };

  const handleDeleteUser = async (targetStudentId: string) => {
    if (!confirm(`${targetStudentId}を削除しますか？この操作は取り消せません。`)) {
      return;
    }

    try {
      setError(null);
      setMessage(null);
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/admin/users/${targetStudentId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '削除に失敗しました');
      }

      setMessage('ユーザーを削除しました');
      fetchUsers(); // 一覧を再取得
    } catch (err: any) {
      setError(err.message || 'エラーが発生しました');
    }
  };

  if (authLoading || loading) {
    return (
      <div className={styles.container}>
        <p>読み込み中...</p>
      </div>
    );
  }

  if (!user || !user.is_admin) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>管理者権限が必要です</div>
        <Link href="/" className={styles.backLink}>
          ← ホームに戻る
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link href="/" className={styles.backLink}>
          ← ホームに戻る
        </Link>
        <h1 className={styles.title}>ユーザー管理</h1>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.message}>{message}</div>}

      <div className={styles.userList}>
        <div className={styles.userListHeader}>
          <h2>登録ユーザー一覧 ({users.length}人)</h2>
          <button onClick={fetchUsers} className={styles.refreshButton}>
            🔄 更新
          </button>
        </div>

        {users.length === 0 ? (
          <div className={styles.emptyMessage}>ユーザーが登録されていません</div>
        ) : (
          <div className={styles.userTable}>
            <div className={styles.userRowHeader}>
              <div className={styles.userCell}>学生ID</div>
              <div className={styles.userCell}>管理者</div>
              <div className={styles.userCell}>登録日時</div>
              <div className={styles.userCell}>操作</div>
            </div>
            {users.map((u) => (
              <div key={u.student_id} className={styles.userRow}>
                <div className={styles.userCell}>
                  {u.student_id}
                  {u.student_id === user.student_id && (
                    <span className={styles.currentUserBadge}>（あなた）</span>
                  )}
                </div>
                <div className={styles.userCell}>
                  {u.is_admin ? (
                    <span className={styles.adminBadge}>管理者</span>
                  ) : (
                    <span className={styles.userBadge}>一般</span>
                  )}
                </div>
                <div className={styles.userCell}>
                  {u.created_at
                    ? new Date(u.created_at).toLocaleString('ja-JP')
                    : '-'}
                </div>
                <div className={styles.userCell}>
                  <div className={styles.actionButtons}>
                    {u.student_id !== user.student_id && (
                      <>
                        <button
                          onClick={() => handleToggleAdmin(u.student_id, u.is_admin)}
                          className={`${styles.actionButton} ${styles.toggleButton}`}
                        >
                          {u.is_admin ? '管理者解除' : '管理者にする'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.student_id)}
                          className={`${styles.actionButton} ${styles.deleteButton}`}
                        >
                          削除
                        </button>
                      </>
                    )}
                    {u.student_id === user.student_id && (
                      <span className={styles.noActionText}>操作不可</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

