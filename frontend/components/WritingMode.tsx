'use client';

import { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/api';
import styles from './WritingMode.module.css';

interface Question {
  id: string;
  question: string;
  expected_answer?: string;
}

interface WritingModeProps {
  question: Question;
  onComplete: () => void;
}

export default function WritingMode({ question, onComplete }: WritingModeProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!text.trim()) return;

    setSubmitting(true);
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/score/writing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          question_id: question.id,
          expected_answer: question.expected_answer,
        }),
      });

      const data = await response.json();
      setTaskId(data.task_id);
      
      // 結果をポーリング
      pollResult(data.task_id);
    } catch (error) {
      console.error('送信エラー:', error);
      setSubmitting(false);
    }
  };

  const pollResult = async (tid: string) => {
    const apiUrl = getApiUrl();
    const maxAttempts = 30;
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;
      try {
        const response = await fetch(`${apiUrl}/api/score/result/${tid}`);
        const data = await response.json();

        if (data.status === 'completed') {
          clearInterval(interval);
          setResult(data.result || data);
          setSubmitting(false);
        } else if (data.status === 'error' || attempts >= maxAttempts) {
          clearInterval(interval);
          setSubmitting(false);
          setResult({ error: '採点に失敗しました' });
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

  return (
    <div className={styles.container}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="中国語で回答を入力してください..."
        className={styles.textarea}
        rows={8}
      />

      <div className={styles.controls}>
        <button
          onClick={handleSubmit}
          disabled={submitting || !text.trim()}
          className={styles.submitButton}
        >
          {submitting ? '採点中...' : '送信'}
        </button>
      </div>

      {result && (
        <div className={styles.result}>
          <h3>添削結果</h3>
          {result.error ? (
            <p className={styles.error}>{result.error}</p>
          ) : (
            <div className={styles.feedback}>
              {result.grammar_score !== undefined && (
                <div className={styles.score}>
                  <p>文法スコア: {result.grammar_score} / 100</p>
                  <p>語彙スコア: {result.vocabulary_score || 'N/A'} / 100</p>
                </div>
              )}
              {result.suggestions && result.suggestions.length > 0 && (
                <div className={styles.suggestions}>
                  <h4>改善提案:</h4>
                  <ul>
                    {result.suggestions.map((suggestion: string, index: number) => (
                      <li key={index}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.feedback && (
                <div className={styles.comment}>
                  <h4>フィードバック:</h4>
                  <p>{result.feedback}</p>
                </div>
              )}
              {result.raw_feedback && (
                <div className={styles.comment}>
                  <p>{result.raw_feedback}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

