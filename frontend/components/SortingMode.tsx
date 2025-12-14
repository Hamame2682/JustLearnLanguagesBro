'use client';

import { useState } from 'react';
import { getApiUrl, getAuthHeaders } from '@/lib/api';
import styles from './SortingMode.module.css';

interface Question {
  id: string;
  question: string;
  words?: string[];
  expected_order?: string[];
  meaning?: string; // 和訳を追加
}

interface SortingModeProps {
  question: Question;
  onComplete: () => void;
}

export default function SortingMode({ question, onComplete }: SortingModeProps) {
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [remainingWords, setRemainingWords] = useState<string[]>(
    question.words ? [...question.words] : []
  );
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleWordClick = (word: string, fromSelected: boolean) => {
    if (fromSelected) {
      setSelectedWords(selectedWords.filter((w) => w !== word));
      setRemainingWords([...remainingWords, word]);
    } else {
      setRemainingWords(remainingWords.filter((w) => w !== word));
      setSelectedWords([...selectedWords, word]);
    }
  };

  const handleSubmit = async () => {
    if (selectedWords.length === 0) return;

    setSubmitting(true);
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/score/sorting`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          words: selectedWords,
          question_id: question.id,
          expected_order: question.expected_order || [],
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('送信エラー:', error);
      setResult({ error: '採点に失敗しました' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedWords([]);
    setRemainingWords(question.words ? [...question.words] : []);
    setResult(null);
  };

  return (
    <div className={styles.container}>
      {/* ★重要：和訳を表示する ★ */}
      {question.meaning && (
        <div className={styles.meaningDisplay}>
          <p className={styles.meaningText}>意味: {question.meaning}</p>
        </div>
      )}
      
      <div className={styles.wordsContainer}>
        <div className={styles.section}>
          <h3>選択した順序</h3>
          <div className={styles.wordList}>
            {selectedWords.length === 0 ? (
              <p className={styles.empty}>単語を選択してください</p>
            ) : (
              selectedWords.map((word, index) => (
                <button
                  key={`${word}-${index}`}
                  onClick={() => handleWordClick(word, true)}
                  className={styles.wordButton}
                >
                  {word}
                </button>
              ))
            )}
          </div>
        </div>

        <div className={styles.section}>
          <h3>残りの単語</h3>
          <div className={styles.wordList}>
            {remainingWords.map((word, index) => (
              <button
                key={`${word}-${index}`}
                onClick={() => handleWordClick(word, false)}
                className={styles.wordButton}
              >
                {word}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        <button onClick={handleReset} className={styles.resetButton}>
          リセット
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || selectedWords.length === 0}
          className={styles.submitButton}
        >
          {submitting ? '採点中...' : '送信'}
        </button>
      </div>

      {result && (
        <div className={styles.result}>
          <h3>採点結果</h3>
          {result.error ? (
            <p className={styles.error}>{result.error}</p>
          ) : (
            <div className={styles.feedback}>
              <p className={result.is_correct ? styles.correct : styles.incorrect}>
                {result.is_correct ? '✓ 正解です！' : '✗ 不正解です'}
              </p>
              {result.feedback && <p>{result.feedback}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

