'use client';

import { useState } from 'react';
import styles from './TranslationCard.module.css';

interface Word {
  id: number;
  word: string;
  pinyin: string;
  meaning: string;
}

interface TranslationCardProps {
  word: Word;
  onNext: () => void;
}

export default function TranslationCard({ word, onNext }: TranslationCardProps) {
  const [showAnswer, setShowAnswer] = useState(false);

  const handleNext = () => {
    setShowAnswer(false);
    onNext();
  };

  return (
    <div className={styles.cardContainer}>
      <div className={styles.card}>
        <div className={styles.questionSection}>
          <p className={styles.questionHint}>この日本語の意味は？</p>
          <h2 className={styles.questionText}>{word.meaning}</h2>
        </div>
        
        {/* 答えを表示するロジック */}
        <div className={styles.answerSection}>
          {!showAnswer ? (
            <button
              onClick={() => setShowAnswer(true)}
              className={styles.showAnswerButton}
            >
              答えを見る
            </button>
          ) : (
            <div className={styles.answerContent}>
              <p className={styles.answerWord}>{word.word}</p>
              <p className={styles.answerPinyin}>{word.pinyin}</p>
            </div>
          )}
        </div>

        {showAnswer && (
          <div className={styles.actionButtons}>
            <button
              onClick={handleNext}
              className={styles.wrongButton}
            >
              まだ...
            </button>
            <button
              onClick={handleNext}
              className={styles.correctButton}
            >
              覚えた！
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

