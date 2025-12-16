'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getApiUrl, getAuthHeaders } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import HandwritingMode from '@/components/HandwritingMode';
import SortingMode from '@/components/SortingMode';
import WritingMode from '@/components/WritingMode';
import TranslationCard from '@/components/TranslationCard';
import styles from './page.module.css';

type QuestionType = 'handwriting' | 'sorting' | 'writing';
type QuizMode = 'handwriting' | 'reorder' | 'translation';

interface Question {
  id: string;
  type: QuestionType;
  question: string;
  expected_answer?: string;
  words?: string[];
  expected_order?: string[];
  meaning?: string; // 和訳を追加
  pinyin?: string; // ピンインを追加
}

interface Word {
  id: number;
  lesson: number;
  word: string;
  pinyin: string;
  meaning: string;
  correct_count?: number;
  miss_count?: number;
  last_reviewed?: string | null;
}

interface Grammar {
  id: number;
  lesson: number;
  title: string;
  description: string;
  example_cn: string;
  example_jp: string;
}

export default function LearnPage() {
  // 1. 状態（State）を定義
  const [lessonInput, setLessonInput] = useState(""); // 入力された数字
  const [words, setWords] = useState<Word[]>([]); // 単語データ（直接使用）
  const [grammarData, setGrammarData] = useState<Grammar[]>([]); // 文法データ（並べ替え用）
  const [currentIndex, setCurrentIndex] = useState(0); // 今何問目か
  const [isStarted, setIsStarted] = useState(false); // ★重要：始まったかどうかのフラグ
  const [loading, setLoading] = useState(false); // 読み込み中フラグ
  const [selectedLesson, setSelectedLesson] = useState<number | null>(null);
  const [currentMode, setCurrentMode] = useState<QuizMode>('translation'); // デフォルトは和文中訳
  const [availableLessons, setAvailableLessons] = useState<number[]>([]); // アップロードされたレッスン番号のリスト
  const [handwritingResults, setHandwritingResults] = useState<any[]>([]); // 手書きモードの採点結果を保存
  const [showResultScreen, setShowResultScreen] = useState(false); // リザルト画面の表示フラグ
  const QUESTIONS_PER_SET = 10; // 10問ごとにリザルト表示

  // --- 🛠️ アップロードされたレッスン番号を取得 ---
  useEffect(() => {
    const fetchLessons = async () => {
      try {
        const apiUrl = getApiUrl();
        const res = await fetch(`${apiUrl}/api/lessons`, {
          headers: getAuthHeaders()
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          console.error('レッスン番号の取得に失敗:', errorText);
          return;
        }
        
        const data = await res.json();
        console.log('📚 取得したレッスン番号:', data);
        setAvailableLessons(data);
      } catch (e) {
        console.error('レッスン番号の取得に失敗:', e);
      }
    };
    fetchLessons();
  }, []);

  // --- 🛠️ 必須機能: 配列をグシャグシャに混ぜる関数（フィッシャー–イェーツ法） ---
  const shuffleArray = <T,>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  };

  // 2. スタートボタンを押した時の動き
  const handleStart = async () => {
    if (!lessonInput) {
      alert("レッスン番号を入れてな！");
      return;
    }

    const lesson = parseInt(lessonInput);
    if (isNaN(lesson) || lesson < 1) {
      alert("有効なレッスン番号を入れてな！");
      return;
    }

    setLoading(true);
    try {
      const apiUrl = getApiUrl();
      
      // ★★★ ここを変更！モードによって宛先を変える！ ★★★
      let endpoint = "/api/words";
      if (currentMode === 'reorder') {
        endpoint = "/api/grammar";
      }

      const res = await fetch(`${apiUrl}${endpoint}?lesson=${lesson}`, {
        headers: getAuthHeaders()
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage = 'データの取得に失敗しました';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      const data = await res.json();
      console.log(`📖 取得したデータ: ${data.length}個`, data);

      if (data.length > 0) {
        if (currentMode === 'reorder') {
          // 文法データの場合、複数の例文を個別の問題に分割
          const expandedGrammar: Grammar[] = [];
          data.forEach((grammar: Grammar) => {
            // example_cnとexample_jpを改行で分割
            const cnLines = grammar.example_cn.split('\n').filter(line => line.trim() !== '');
            const jpLines = grammar.example_jp.split('\n').filter(line => line.trim() !== '');
            
            // カテゴリ行（「A 単純方向補語」など）を除外し、数字で始まる行だけを例文として扱う
            const cnExamples = cnLines.filter(line => {
              const trimmed = line.trim();
              // 数字で始まる行（例: "1. "）だけを例文として扱う
              // カテゴリ行（「A」「B」で始まる行）は除外
              return /^\d+\./.test(trimmed) && !/^[A-Z]\s/.test(trimmed);
            });
            
            const jpExamples = jpLines.filter(line => {
              const trimmed = line.trim();
              return /^\d+\./.test(trimmed) && !/^[A-Z]\s/.test(trimmed);
            });
            
            // 例文の数だけ個別の問題を作成
            const maxExamples = Math.max(cnExamples.length, jpExamples.length);
            for (let i = 0; i < maxExamples; i++) {
              // 番号や記号を除去（例: "1. " など）
              const cleanCn = cnExamples[i]?.replace(/^\d+\.\s*/, '').trim() || '';
              const cleanJp = jpExamples[i]?.replace(/^\d+\.\s*/, '').trim() || '';
              
              // 空でない、かつ実際の例文（句点や文字が含まれる）だけを追加
              if (cleanCn && cleanJp && (cleanCn.includes('。') || cleanCn.length > 2)) {
                expandedGrammar.push({
                  id: grammar.id * 1000 + i, // ユニークなIDを生成
                  lesson: grammar.lesson,
                  title: grammar.title, // 元のタイトルを保持（例番号は付けない）
                  description: grammar.description, // 解説も保持
                  example_cn: cleanCn,
                  example_jp: cleanJp
                });
              }
            }
          });
          
          // ★ここでランダム化を発動！蛆（強調）！
          const shuffled = shuffleArray(expandedGrammar);
          // 10問に制限
          setGrammarData(shuffled.slice(0, QUESTIONS_PER_SET));
          setWords([]);
        } else {
          // ★ここでランダム化を発動！蛆（強調）！
          const shuffled = shuffleArray(data);
          // 10問に制限
          setWords(shuffled.slice(0, QUESTIONS_PER_SET));
          setGrammarData([]);
        }
        // 手書きモードの結果をリセット
        setHandwritingResults([]);
        setShowResultScreen(false);
        setCurrentIndex(0); // 1問目から
        setSelectedLesson(lesson);
        setIsStarted(true); // ★ここで画面を切り替えるスイッチON！
      } else {
        alert(`${currentMode === 'reorder' ? '文法' : '単語'}データが見つからんかったわ... アップロードした？`);
      }
    } catch (error: any) {
      console.error("エラー:", error);
      const errorMessage = error?.message || 'データの読み込みに失敗しました';
      alert(`エラー: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // 手書きモードの完了処理（結果を保存してから次の問題へ）
  const handleHandwritingComplete = (result: any) => {
    // 送信直後（status: 'processing'）の場合は、次の問題へ進むだけ（結果は保存しない）
    if (result && result.status === 'processing') {
      // すぐに次の問題へ進む（結果は後で裏で取得される）
      handleNext();
      return;
    }
    
    // 完了した結果の場合、handleNextに結果を渡す（handleNextが結果を保存する）
    handleNext(result);
  };

  // --- 次の問題へ進む処理 ---
  const handleNext = (result?: any) => {
    // 手書きモードの場合、結果を保存（status: 'processing'の場合は保存しない）
    if (currentMode === 'handwriting' && result && result.status !== 'processing') {
      const newResults = [...handwritingResults, result];
      setHandwritingResults(newResults);
      
      // 10問ごとにリザルト画面を表示
      if (newResults.length >= QUESTIONS_PER_SET) {
        setShowResultScreen(true);
        return;
      }
    }
    
    const dataLength = currentMode === 'reorder' ? grammarData.length : words.length;
    if (currentIndex < dataLength - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // 最後の問題が終わったらリザルト画面を表示（手書きモードの場合）
      if (currentMode === 'handwriting' && handwritingResults.length > 0) {
        setShowResultScreen(true);
      } else {
        alert("学習完了！お疲れ！オサーショ！");
        handleBackToSelection(); // 最初に戻る
      }
    }
  };
  
  // リザルト画面を閉じて続ける
  const handleContinueFromResult = () => {
    setShowResultScreen(false);
    const dataLength = currentMode === 'reorder' ? grammarData.length : words.length;
    if (currentIndex < dataLength - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      alert("学習完了！お疲れ！オサーショ！");
      handleBackToSelection();
    }
  };
  
  // リザルト画面から終了
  const handleFinishFromResult = () => {
    setShowResultScreen(false);
    handleBackToSelection();
  };

  const handleBackToSelection = () => {
    setIsStarted(false);
    setLessonInput("");
    setWords([]);
    setGrammarData([]);
    setCurrentIndex(0);
    setSelectedLesson(null);
  };

  // --- 現在のデータ（1問だけ取得） ---
  const currentWord = currentMode === 'reorder' 
    ? (grammarData.length > 0 && currentIndex < grammarData.length ? grammarData[currentIndex] : undefined)
    : (words.length > 0 && currentIndex < words.length ? words[currentIndex] : undefined);

  // 3. 画面の表示（条件分岐）
  return (
    <div className={styles.container}>
      {/* --- ▼ セットアップ画面（レッスン選択 & モード選択） --- */}
      {!isStarted ? (
        <div className={styles.selectionScreen}>
          <div className={styles.selectionContent}>
            <h1 className={styles.selectionTitle}>学習モード設定</h1>
            
            <div className={styles.selectionBox}>
              {/* 1. レッスン番号選択 */}
              <div className={styles.inputGroup}>
                <label className={styles.lessonLabel}>レッスン番号</label>
                {availableLessons.length > 0 ? (
                  <div className={styles.lessonButtons}>
                    {availableLessons.map((lessonNum) => (
                      <button
                        key={lessonNum}
                        onClick={() => setLessonInput(lessonNum.toString())}
                        className={`${styles.lessonButton} ${lessonInput === lessonNum.toString() ? styles.lessonButtonActive : ''}`}
                      >
                        {lessonNum}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input 
                    type="number" 
                    min="1"
                    value={lessonInput}
                    onChange={(e) => setLessonInput(e.target.value)}
                    className={styles.lessonInput}
                    placeholder="例: 13"
                  />
                )}
              </div>

              {/* 2. モード選択ボタン（3択） */}
              <div className={styles.modeSelection}>
                <label className={styles.lessonLabel}>学習モード選択</label>
                <div className={styles.modeButtons}>
                  <button 
                    onClick={() => setCurrentMode('handwriting')}
                    className={`${styles.modeButton} ${currentMode === 'handwriting' ? styles.modeButtonActive : ''}`}
                  >
                    ✍️ 手書き特訓
                    <span className={styles.modeDescription}>書いて覚える！最強の定着率</span>
                  </button>

                  <button 
                    onClick={() => setCurrentMode('reorder')}
                    className={`${styles.modeButton} ${currentMode === 'reorder' ? styles.modeButtonActiveReorder : ''}`}
                  >
                    🧩 並べ替え
                    <span className={styles.modeDescription}>ピンイン・語順をマスター</span>
                  </button>

                  <button 
                    onClick={() => setCurrentMode('translation')}
                    className={`${styles.modeButton} ${currentMode === 'translation' ? styles.modeButtonActiveTranslation : ''}`}
                  >
                    🇨🇳 和文中訳 (カード)
                    <span className={styles.modeDescription}>意味から中国語を思い出す</span>
                  </button>
                </div>
              </div>

              {/* 3. スタートボタン */}
              <button 
                onClick={handleStart}
                disabled={loading}
                className={styles.startButton}
              >
                {loading ? "準備中..." : "スタート！"}
              </button>
              
              <p className={styles.hint}>
                ※ PCでアップロードした課の番号を入れてな
              </p>
            </div>
            <Link href="/" className={styles.backLink}>← ホームに戻る</Link>
          </div>
        </div>
      ) : (
        /* --- ▼ クイズ本番画面（モードによって表示を変える！） --- */
        <>
          {loading ? (
            <div className={styles.loading}>読み込み中...</div>
          ) : (currentMode === 'reorder' ? grammarData.length : words.length) === 0 ? (
            <div className={styles.error}>問題が見つかりませんでした</div>
          ) : currentWord && (currentMode !== 'reorder' || (currentMode === 'reorder' && grammarData.length > 0 && currentIndex < grammarData.length)) ? (
            <div className={styles.quizScreen}>
              {/* 進捗バー */}
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressFill} 
                  style={{ width: `${((currentIndex + 1) / (currentMode === 'reorder' ? grammarData.length : words.length)) * 100}%` }}
                ></div>
              </div>

              <div className={styles.progressText}>
                問 {currentIndex + 1} / {currentMode === 'reorder' ? grammarData.length : words.length}
              </div>

              {/* ==================================================== */}
              {/* ここからモード別分岐エリア！                        */}
              {/* ==================================================== */}

              {/* パターンA: 手書きモード */}
              {currentMode === 'handwriting' && (
                <div className={styles.quizContent}>
                  <div className={styles.questionDisplay}>
                    <h2 className={styles.pinyinText}>
                      {currentWord.pinyin}
                    </h2>
                    <p className={styles.meaningText}>
                      意味: {currentWord.meaning}
                    </p>
                    <p className={styles.hintText}>
                      （この発音の漢字を書いてな！）
                    </p>
                  </div>
                  
                  <HandwritingMode
                    question={{
                      id: `handwriting-${currentWord.id}`,
                      question: `「${currentWord.word}」を手書きで書いてください`,
                      expected_answer: currentWord.word,
                      pinyin: currentWord.pinyin,
                      meaning: currentWord.meaning
                    }}
                    onComplete={handleHandwritingComplete}
                    backgroundMode={true} // 裏で採点するモード
                  />
                </div>
              )}

              {/* パターンB: 並べ替えモード（例文を1文字ずつバラバラにする） - 1問ずつ表示 */}
              {currentMode === 'reorder' && currentWord && grammarData.length > 0 && currentIndex < grammarData.length && (
                <div className={styles.quizContent} key={`reorder-${currentIndex}-${(currentWord as Grammar).id}`}>
                  <ReorderQuiz
                    key={`reorder-quiz-${currentIndex}-${(currentWord as Grammar).id}`}
                    questionText={(currentWord as Grammar).example_jp || ""}
                    answerText={(currentWord as Grammar).example_cn || ""}
                    description={(currentWord as Grammar).description || ""}
                    title={(currentWord as Grammar).title || ""}
                    onCorrect={handleNext}
                  />
                </div>
              )}

              {/* パターンC: 和文中訳（フラッシュカード）モード */}
              {currentMode === 'translation' && (
                <TranslationCard
                  word={currentWord}
                  onNext={handleNext}
                />
              )}

              {/* ==================================================== */}

              <button 
                onClick={handleBackToSelection}
                className={styles.backToMenuButton}
              >
                やめる（メニューに戻る）
              </button>
            </div>
          ) : showResultScreen ? (
            /* --- ▼ リザルト画面（10問ごと） --- */
            <div className={styles.resultScreen}>
              <h2 className={styles.resultTitle}>リザルト</h2>
              <div className={styles.resultStats}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>正解数:</span>
                  <span className={styles.statValue}>
                    {handwritingResults.filter(r => r.is_correct).length} / {handwritingResults.length}
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>正答率:</span>
                  <span className={styles.statValue}>
                    {handwritingResults.length > 0 
                      ? Math.round((handwritingResults.filter(r => r.is_correct).length / handwritingResults.length) * 100)
                      : 0}%
                  </span>
                </div>
              </div>
              
              <div className={styles.resultDetails}>
                <h3>詳細</h3>
                {handwritingResults.map((result, index) => (
                  <div key={index} className={styles.resultDetailItem}>
                    <div className={styles.resultDetailHeader}>
                      <span>問題 {index + 1}</span>
                      <span className={result.is_correct ? styles.correctBadge : styles.incorrectBadge}>
                        {result.is_correct ? '✓ 正解' : '✗ 不正解'}
                      </span>
                    </div>
                    {result.recognized_text && (
                      <p className={styles.recognizedText}>
                        認識された文字: {result.recognized_text}
                      </p>
                    )}
                    {result.feedback && (
                      <p className={styles.feedbackText}>{result.feedback}</p>
                    )}
                  </div>
                ))}
              </div>
              
              <div className={styles.resultActions}>
                <button 
                  onClick={handleContinueFromResult}
                  className={styles.continueButton}
                >
                  続ける
                </button>
                <button 
                  onClick={handleFinishFromResult}
                  className={styles.finishButton}
                >
                  終了
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.error}>単語データがありません</div>
          )}
        </>
      )}
    </div>
  );
}

// 🧩 並べ替えクイズコンポーネント（例文を1文字ずつバラバラにする）
function ReorderQuiz({ questionText, answerText, description, title, onCorrect }: { questionText: string, answerText: string, description: string, title: string, onCorrect: () => void }) {
  // 1. 例文を1文字ずつバラバラにする（最初はシャッフル済み）
  const [shuffledChars, setShuffledChars] = useState<string[]>([]);
  const [selectedChars, setSelectedChars] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  
  // 初期化：答えが変わったらリセット（1回だけ実行）
  useEffect(() => {
    if (!answerText || initialized) return;
    // 中国語はスペースがないから1文字ずつ分割
    const chars = answerText.split('').filter(c => c.trim() !== ''); 
    // シャッフル（ランダム順にする）
    const shuffled = [...chars].sort(() => Math.random() - 0.5);
    
    setShuffledChars(shuffled);
    setSelectedChars([]);
    setInitialized(true);
  }, [answerText, initialized]);
  
  // answerTextが変わったらリセット
  useEffect(() => {
    if (answerText) {
      setInitialized(false);
    }
  }, [answerText]);

  // 文字を選んだ時の処理
  const handleSelect = (char: string, index: number) => {
    // 選んだ文字リストに追加
    setSelectedChars([...selectedChars, char]);
    // 残りの文字リストから削除
    const newShuffled = [...shuffledChars];
    newShuffled.splice(index, 1);
    setShuffledChars(newShuffled);
  };

  // 選択した文字を戻す処理
  const handleUnselect = (char: string, index: number) => {
    // 選択リストから削除
    setSelectedChars(selectedChars.filter((_, i) => i !== index));
    // 残りの文字リストに戻す
    setShuffledChars([...shuffledChars, char]);
  };

  // リセットボタン
  const handleReset = () => {
    if (!answerText) return;
    const chars = answerText.split('').filter(c => c.trim() !== '');
    setShuffledChars(chars.sort(() => Math.random() - 0.5));
    setSelectedChars([]);
  };

  // 送信（答え合わせ）
  const handleSubmit = () => {
    const userAnswer = selectedChars.join('');
    if (userAnswer === answerText) {
      alert("蛆アツ！正解や！🎉");
      onCorrect(); // 次の問題へ
    } else {
      // 不正解の時は解説も表示する
      let errorMessage = `ちゃうで...\n\n正解は: ${answerText}\n君の答え: ${userAnswer}`;
      if (description) {
        errorMessage += `\n\n📚 解説:\n${title ? `【${title}】\n` : ''}${description}`;
      }
      alert(errorMessage);
      handleReset(); // もう一回
    }
  };

  return (
    <div className={styles.reorderQuiz}>
      <h2 className={styles.reorderTitle}>並べ替え問題</h2>
      
      {/* 問題文（日本語） */}
      <div className={styles.reorderQuestion}>
        <p className={styles.reorderQuestionText}>
          意味: {questionText || "（データがないで...）"}
        </p>
      </div>

      {/* 選択した文字（回答欄） */}
      <div className={styles.reorderAnswerArea}>
        {selectedChars.length === 0 && (
          <span className={styles.reorderPlaceholder}>ここをタップして文を作ってな</span>
        )}
        {selectedChars.map((char, i) => (
          <button
            key={i}
            onClick={() => handleUnselect(char, i)}
            className={styles.reorderSelectedChar}
          >
            {char}
          </button>
        ))}
      </div>

      {/* バラバラの文字たち（選択肢） */}
      <div className={styles.reorderCharsContainer}>
        {shuffledChars.map((char, i) => (
          <button 
            key={i} 
            onClick={() => handleSelect(char, i)}
            className={styles.reorderCharButton}
          >
            {char}
          </button>
        ))}
      </div>

      {/* 操作ボタン */}
      <div className={styles.reorderControls}>
        <button onClick={handleReset} className={styles.reorderResetButton}>
          リセット
        </button>
        <button 
          onClick={handleSubmit} 
          disabled={selectedChars.length === 0}
          className={styles.reorderSubmitButton}
        >
          決定！
        </button>
      </div>
    </div>
  );
}

