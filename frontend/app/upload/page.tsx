'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { getApiUrl, getAuthHeaders } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import styles from './page.module.css';

export default function UploadPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  
  // 認証チェック
  if (authLoading) {
    return <div>読み込み中...</div>;
  }
  
  if (!isAuthenticated) {
    return <div>ログインが必要です</div>;
  }
  
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [lessonNumber, setLessonNumber] = useState<number>(1);
  // ★追加: アップロードの種類を選ぶ状態
  const [uploadType, setUploadType] = useState<'word' | 'grammar'>('word');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await uploadImage(file);
  };

  const handleCameraClick = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      // ★重要：バックエンドが 'file' という名前を期待しているので、'file' で送る！
      formData.append('file', file);
      // ★重要：レッスン番号を送信（必須）
      formData.append('lesson', lessonNumber.toString());
      // ★追加: ここでタイプも送る！
      formData.append('type', uploadType);

      const apiUrl = getApiUrl();
      const headers = getAuthHeaders();
      
      // ★変更: /api/admin/upload-textbook から /api/upload-textbook に変更
      const response = await fetch(`${apiUrl}/api/upload-textbook`, {
        method: 'POST',
        headers: headers, // 認証ヘッダーを追加
        body: formData, // Content-Typeは自動で設定されるので、手動で設定しない！
      });

      if (!response.ok) {
        throw new Error('アップロードに失敗しました');
      }

      const data = await response.json();
      setResult(data);
      
      // 成功メッセージを表示
      if (data.status === 'success') {
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'エラーが発生しました');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>← ホーム</Link>
        <h1>教材を追加</h1>
      </header>

      <div className={styles.content}>
          <div className={styles.section}>
          <h2>教科書をアップロード</h2>
          <p className={styles.description}>
            スマホカメラで教科書を撮影するか、画像ファイルを選択してください。
            Gemini Visionが自動的に解析し、単語・文法・問題を抽出します。
            あなただけの単語帳を作成できます！
          </p>

          <div className={styles.lessonInput}>
            <label htmlFor="lesson-number">レッスン番号:</label>
            <input
              id="lesson-number"
              type="number"
              min="1"
              value={lessonNumber}
              onChange={(e) => setLessonNumber(parseInt(e.target.value) || 1)}
              className={styles.lessonNumberInput}
              disabled={uploading}
            />
          </div>

          {/* ★追加: モード選択スイッチ */}
          <div className={styles.typeSelection}>
            <label className={styles.typeLabel}>アップロードする内容</label>
            <div className={styles.typeButtons}>
              <button
                onClick={() => setUploadType('word')}
                disabled={uploading}
                className={`${styles.typeButton} ${uploadType === 'word' ? styles.typeButtonActive : ''}`}
              >
                単語 (Words)
              </button>
              <button
                onClick={() => setUploadType('grammar')}
                disabled={uploading}
                className={`${styles.typeButton} ${uploadType === 'grammar' ? styles.typeButtonActiveGrammar : ''}`}
              >
                文法 (Grammar)
              </button>
            </div>
          </div>

          <div className={styles.uploadOptions}>
            <button
              onClick={handleCameraClick}
              className={styles.cameraButton}
              disabled={uploading}
            >
              📷 カメラで撮影
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className={styles.fileButton}
              disabled={uploading}
            >
              📁 ファイルを選択
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          {uploading && (
            <div className={styles.loading}>
              <p>画像を解析中...</p>
            </div>
          )}

          {error && (
            <div className={styles.error}>
              <p>エラー: {error}</p>
            </div>
          )}

          {result && (
            <div className={styles.result}>
              <h3>解析結果</h3>
              {result.message && (
                <div className={styles.successMessage}>
                  {result.message}
                </div>
              )}
              <div className={styles.resultContent}>
                {result.data && Array.isArray(result.data) && (
                  <div>
                    {result.type === 'word' ? (
                      <div className={styles.dataSection}>
                        <h4>単語 ({result.data.length}個)</h4>
                        <ul>
                          {result.data.slice(0, 10).map((word: any, index: number) => (
                            <li key={index}>
                              {word.word} ({word.pinyin}) - {word.meaning}
                            </li>
                          ))}
                          {result.data.length > 10 && (
                            <li>...他 {result.data.length - 10} 個</li>
                          )}
                        </ul>
                      </div>
                    ) : (
                      <div className={styles.dataSection}>
                        <h4>文法 ({result.data.length}個)</h4>
                        <ul>
                          {result.data.map((grammar: any, index: number) => (
                            <li key={index}>
                              <strong>{grammar.title || '無題'}</strong><br />
                              {grammar.description && <span>{grammar.description}<br /></span>}
                              {grammar.example_cn && <span>例文(中): {grammar.example_cn}<br /></span>}
                              {grammar.example_jp && <span>例文(日): {grammar.example_jp}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

