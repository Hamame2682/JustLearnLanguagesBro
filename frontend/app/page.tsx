'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function Home() {
  const { isAuthenticated, loading, user, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <p>読み込み中...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>AI言語学習アプリ</h1>
          <div className={styles.userInfo}>
            <span className={styles.studentId}>{user?.student_id}</span>
            {user?.is_admin && <span className={styles.adminBadge}>管理者</span>}
            <button onClick={logout} className={styles.logoutButton}>
              ログアウト
            </button>
          </div>
        </div>
        <p className={styles.description}>
          手書き入力とAI採点で言語を学習しましょう
        </p>
        
        <div className={styles.menu}>
          <Link href="/learn" className={styles.menuItem}>
            <div className={styles.menuIcon}>📚</div>
            <h2>学習する</h2>
            <p>手書き・並べ替え・作文の問題に挑戦</p>
          </Link>
          
          <Link href="/admin" className={styles.menuItem}>
            <div className={styles.menuIcon}>⚙️</div>
            <h2>管理画面</h2>
            <p>教科書をアップロードしてデータを追加</p>
          </Link>
          
          {user?.is_admin && (
            <Link href="/admin/users" className={styles.menuItem}>
              <div className={styles.menuIcon}>👥</div>
              <h2>ユーザー管理</h2>
              <p>ユーザー一覧と権限管理</p>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

