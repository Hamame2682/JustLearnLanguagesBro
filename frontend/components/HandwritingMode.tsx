'use client';

import { useState, useRef, useEffect } from 'react';
import CanvasDraw from 'react-canvas-draw';
import { getApiUrl, getAuthHeaders } from '@/lib/api';
import styles from './HandwritingMode.module.css';

interface Question {
  id: string;
  question: string;
  expected_answer: string;
  pinyin?: string; // ピンインを追加
  meaning?: string; // 意味を追加
}

interface HandwritingModeProps {
  question: Question;
  onComplete: (result?: any) => void;
  backgroundMode?: boolean; // 裏で採点するモード
}

export default function HandwritingMode({ question, onComplete, backgroundMode = false }: HandwritingModeProps) {
  const [canvasRef, setCanvasRef] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!canvasRef) return;

    setSubmitting(true);
    try {
      const imageData = canvasRef.getDataURL('image/png');
      const apiUrl = getApiUrl();
      
      const response = await fetch(`${apiUrl}/api/score/handwriting`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          image_data: imageData,
          question_id: question.id,
          expected_answer: question.expected_answer,
        }),
      });

      const data = await response.json();
      setTaskId(data.task_id);
      
      // 裏で採点するモードの場合、すぐに次の問題へ
      if (backgroundMode) {
        // 裏で結果をポーリング（結果は保存されるが、画面には表示しない）
        pollResultInBackground(data.task_id);
        // すぐに次の問題へ進む
        onComplete({ task_id: data.task_id, status: 'processing' });
      } else {
        // 通常モード：結果をポーリングして表示
        pollResult(data.task_id);
      }
    } catch (error) {
      console.error('送信エラー:', error);
      setSubmitting(false);
      if (backgroundMode) {
        // エラーでも次の問題へ進む
        onComplete({ error: '送信に失敗しました', is_correct: false });
      } else {
        setResult({ error: '送信に失敗しました' });
      }
    }
  };
  
  // 裏で結果をポーリング（結果を保存するが画面には表示しない）
  const pollResultInBackground = async (tid: string) => {
    const apiUrl = getApiUrl();
    const maxAttempts = 30;
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;
      try {
        const response = await fetch(`${apiUrl}/api/score/result/${tid}`, {
          headers: getAuthHeaders()
        });
        const data = await response.json();

        if (data.status === 'completed') {
          clearInterval(interval);
          // 結果を保存（リザルト画面で表示される）
          // 注意：onCompleteは呼ばない（既に次の問題へ進んでいるため）
          // 代わりに、結果を保存するためにonCompleteを呼ぶ（ただし、次の問題へは進まない）
          onComplete(data);
        } else if (data.status === 'error' || attempts >= maxAttempts) {
          clearInterval(interval);
          const errorResult = { error: '採点に失敗しました', is_correct: false, status: 'error' };
          // エラー結果も保存
          onComplete(errorResult);
        }
      } catch (error) {
        console.error('結果取得エラー:', error);
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          const errorResult = { error: '採点に失敗しました', is_correct: false };
          onComplete(errorResult);
        }
      }
    }, 1000);
  };

  const pollResult = async (tid: string) => {
    const apiUrl = getApiUrl();
    const maxAttempts = 30;
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;
      try {
        const response = await fetch(`${apiUrl}/api/score/result/${tid}`, {
          headers: getAuthHeaders()
        });
        const data = await response.json();

        if (data.status === 'completed') {
          clearInterval(interval);
          setResult(data);
          setSubmitting(false);
        } else if (data.status === 'error' || attempts >= maxAttempts) {
          clearInterval(interval);
          setSubmitting(false);
          const errorResult = { error: '採点に失敗しました', is_correct: false };
          setResult(errorResult);
        }
      } catch (error) {
        console.error('結果取得エラー:', error);
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          setSubmitting(false);
        }
      }
    }, 1000);
  };

  const handleClear = () => {
    if (canvasRef) {
      canvasRef.clear();
    }
  };

  return (
    <div className={styles.container}>
      {/* ★重要：ピンインと意味を表示する ★ */}
      {(question.pinyin || question.meaning) && (
        <div className={styles.questionDisplay}>
          {/* ピンインをデカデカと表示！これが問題文や！ */}
          {question.pinyin && (
            <h2 className={styles.pinyinText}>
              {question.pinyin}
            </h2>
          )}
          
          {/* 意味はヒントとして少し小さめに表示 */}
          {question.meaning && (
            <p className={styles.meaningText}>
              意味: {question.meaning}
            </p>
          )}
          
          <p className={styles.hintText}>
            （この発音の漢字を書いてな！）
          </p>
        </div>
      )}
      
      <div className={styles.canvasWrapper}>
        <CanvasDraw
          ref={(canvasDraw: any) => setCanvasRef(canvasDraw)}
          brushColor="#000000"      // 文字は黒
          backgroundColor="#FFFFFF"  // ★重要：背景は白！これで「真っ黒」回避
          lazyRadius={0}            // ★重要：手ぶれ補正ゼロ！これで「直線」回避してヌルヌル書ける
          brushRadius={3}           // 線の太さ
          hideGrid={true}           // グリッドはいらん
          canvasWidth={typeof window !== 'undefined' && window.innerWidth > 600 ? 500 : (typeof window !== 'undefined' ? window.innerWidth - 40 : 400)}
          canvasHeight={300}
          style={{ border: "2px solid #ccc", borderRadius: "8px" }} // 枠線つけると見やすい
        />
      </div>

      <div className={styles.controls}>
        <button onClick={handleClear} className={styles.clearButton}>
          クリア
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className={styles.submitButton}
        >
          {submitting ? (backgroundMode ? '送信中...' : '採点中...') : '送信'}
        </button>
      </div>

      {result && !backgroundMode && (
        <div className={styles.result}>
          <h3>採点結果</h3>
          {result.error ? (
            <p className={styles.error}>{result.error}</p>
          ) : (
            <div className={styles.feedback}>
              <p>{result.recognized_text || result.result?.feedback}</p>
            </div>
          )}
          {/* 次へボタンを追加 */}
          <button
            onClick={() => onComplete(result)}
            className={styles.nextButton}
          >
            次へ
          </button>
        </div>
      )}
      
      {/* 裏で採点するモードの場合、送信ボタンを押したら自動で次へ */}
      {backgroundMode && submitting && (
        <div className={styles.backgroundModeIndicator}>
          <p>送信しました。次の問題へ進みます...</p>
        </div>
      )}
    </div>
  );
}

