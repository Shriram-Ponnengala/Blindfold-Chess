
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, GamePhase, Difficulty, Piece, PieceType } from './types';
import { canPieceReach, generatePosition, findValidTarget, squareToNotation } from './services/chessLogic';
import { PALETTE, PIECE_ICONS } from './constants';
import ChessBoard from './components/ChessBoard';
import { soundService, haptics } from './services/soundService';

const START_TIME = 120;
const MAX_STRIKES = 5;
const BASE_POINTS = 10;

/** Speed bonus on top of the base points. */
const speedBonus = (secs: number) => (secs < 2 ? { pts: 5, label: 'Lightning' } : secs < 4 ? { pts: 3, label: 'Quick' } : { pts: 0, label: '' });

const App: React.FC = () => {
  const [state, setState] = useState<GameState>({
    phase: 'START',
    difficulty: Difficulty.EASY,
    pieces: [],
    targetSquare: null,
    score: 0,
    strikes: 0,
    timeLeft: START_TIME,
    lastMoveLine: null,
    correctMoves: 0,
    currentStreak: 0,
    bestStreak: 0,
    moveHistory: [],
  });

  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // Prevents race conditions on rapid clicks
  const timerRef = useRef<any>(null);
  const [disabledOptions, setDisabledOptions] = useState<PieceType[]>([]);
  const [pulsingPiece, setPulsingPiece] = useState<PieceType | null>(null);
  const [moveFeedback, setMoveFeedback] = useState<{ type: PieceType; status: 'correct' | 'incorrect' } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pop, setPop] = useState<{ id: number; square: number; text: string; sub?: string; tone: 'good' | 'bad' } | null>(null);
  const targetShownAt = useRef<number>(Date.now());
  const popId = useRef(0);

  const showPop = (square: number, text: string, tone: 'good' | 'bad', sub?: string) => {
    const id = ++popId.current;
    setPop({ id, square, text, sub, tone });
    setTimeout(() => setPop(p => (p?.id === id ? null : p)), 1100);
  };

  // Start the answer clock whenever a new target appears or play resumes
  useEffect(() => {
    if (state.phase === 'PLAYING' && !isPaused) targetShownAt.current = Date.now();
  }, [state.targetSquare, state.phase, isPaused]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    soundService.setMute(nextMuted);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const startGame = (diff: Difficulty) => {
    const setup = generatePosition(diff);
    if (!setup) return; // Should not happen with 300 attempts

    setIsPaused(false);
    setIsProcessing(false);
    setCountdown(null);
    setDisabledOptions([]);
    setPulsingPiece(null);
    setMoveFeedback(null);
    setPop(null);
    setState({
      phase: 'OBSERVING',
      difficulty: diff,
      pieces: setup.pieces,
      targetSquare: null,
      score: 0,
      strikes: 0,
      timeLeft: START_TIME,
      lastMoveLine: null,
      correctMoves: 0,
      currentStreak: 0,
      bestStreak: 0,
      moveHistory: [],
    });
  };

  const beginDrill = () => {
    setCountdown(3);
  };

  useEffect(() => {
    if (countdown === null) return;

    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Countdown finished: transition to PLAYING phase
      setState(prev => {
        if (prev.phase !== 'OBSERVING') return prev;
        
        // Generate the first target based on initial positions
        const nextTarget = findValidTarget(prev.pieces, prev.difficulty, prev.moveHistory);
        
        return {
          ...prev,
          phase: 'PLAYING',
          pieces: prev.pieces.map(p => ({ ...p, isVisible: false })),
          targetSquare: nextTarget,
          lastMoveLine: null, // Ensure no arrow appears on game start
        };
      });
      soundService.playCorrect();
      
      const clearCountdown = setTimeout(() => setCountdown(null), 800);
      return () => clearTimeout(clearCountdown);
    }
  }, [countdown]);

  const restartCurrentDrill = () => {
    startGame(state.difficulty);
  };

  const goHome = () => {
    setIsPaused(false);
    setIsProcessing(false);
    setCountdown(null);
    setDisabledOptions([]);
    setPulsingPiece(null);
    setMoveFeedback(null);
    setPop(null);
    setState({
      phase: 'START',
      difficulty: Difficulty.EASY,
      pieces: [],
      targetSquare: null,
      score: 0,
      strikes: 0,
      timeLeft: START_TIME,
      lastMoveLine: null,
      correctMoves: 0,
      currentStreak: 0,
      bestStreak: 0,
      moveHistory: [],
    });
  };

  const togglePause = () => {
    if (state.phase === 'PLAYING') setIsPaused(prev => !prev);
  };

  useEffect(() => {
    if (state.phase === 'PLAYING' && !isPaused) {
      timerRef.current = setInterval(() => {
        setState(prev => {
          if (prev.timeLeft <= 1) {
            clearInterval(timerRef.current!);
            return { ...prev, timeLeft: 0, phase: 'GAMEOVER' };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state.phase, isPaused]);

  const handlePieceSelect = (type: PieceType) => {
    // GUARD: Prevent interaction if disabled, paused, not playing, or ALREADY PROCESSING a move
    if (state.phase !== 'PLAYING' || isPaused || state.targetSquare === null || isProcessing) return;

    const validPiece = state.pieces.find(p => p.type === type && canPieceReach(p.square, state.targetSquare!, p.type, state.pieces));

    if (validPiece) {
      setIsProcessing(true); // LOCK INPUT
      const secs = (Date.now() - targetShownAt.current) / 1000;
      const bonus = speedBonus(secs);
      const points = BASE_POINTS + bonus.pts;
      const streakHit = (state.currentStreak + 1) % 5 === 0;

      if (streakHit) { soundService.playStreak(); haptics.streak(); }
      else { soundService.playCorrect(bonus.pts > 0); haptics.correct(); }
      // 1) Arrow first: draw the move right away
      const answeredSquare = state.targetSquare;
      setState(prev => ({ ...prev, lastMoveLine: [validPiece.square, answeredSquare] }));
      // 2) Then the points pop, once the arrow has landed
      setTimeout(() => showPop(answeredSquare, `+${points}`, 'good', streakHit ? `${state.currentStreak + 1} in a row!` : bonus.label || undefined), 350);
      setMoveFeedback({ type, status: 'correct' });
      setDisabledOptions([]);

      setTimeout(() => {
        setMoveFeedback(null);
        setState(prev => {
          const userMoveFrom = validPiece.square;
          const userMoveTo = prev.targetSquare!;

          // Move the selected piece to the target
          const updatedPieces = prev.pieces.map(p => p.id === validPiece.id ? { ...p, square: userMoveTo } : p);

          // Update history
          const updatedHistory = [...prev.moveHistory, validPiece.id];
          if (updatedHistory.length > 5) updatedHistory.shift();

          const newStreak = prev.currentStreak + 1;
          const scored = {
            ...prev,
            score: prev.score + points,
            moveHistory: updatedHistory,
            correctMoves: prev.correctMoves + 1,
            currentStreak: newStreak,
            bestStreak: Math.max(prev.bestStreak, newStreak),
          };

          // Next target: always exactly one piece can reach it
          const nextTarget = findValidTarget(updatedPieces, prev.difficulty, updatedHistory);
          if (nextTarget !== -1) {
            return { ...scored, pieces: updatedPieces, lastMoveLine: [userMoveFrom, userMoveTo], targetSquare: nextTarget };
          }

          // No square has a single answer: deal a fresh position to memorize (clock stops meanwhile)
          const fresh = generatePosition(prev.difficulty);
          if (!fresh) return { ...scored, phase: 'GAMEOVER' };
          return { ...scored, phase: 'OBSERVING', pieces: fresh.pieces, lastMoveLine: null, targetSquare: null, moveHistory: [] };
        });
        setIsProcessing(false); // UNLOCK INPUT
      }, 750);
    } else {
      setIsProcessing(true); // LOCK INPUT
      soundService.playIncorrect();
      haptics.wrong();
      showPop(state.targetSquare, '−1', 'bad', 'life');
      setPulsingPiece(type);
      setMoveFeedback({ type, status: 'incorrect' });
      
      setTimeout(() => {
        setPulsingPiece(null);
        setMoveFeedback(null);
        setIsProcessing(false); // UNLOCK INPUT
      }, 400);

      setDisabledOptions(prev => [...prev, type]);
      setState(prev => {
        const newStrikes = prev.strikes + 1;
        if (newStrikes >= MAX_STRIKES) {
          clearInterval(timerRef.current!);
          return { ...prev, strikes: newStrikes, phase: 'GAMEOVER', currentStreak: 0 };
        }
        return { ...prev, strikes: newStrikes, currentStreak: 0 };
      });
    }
  };

  const calculateGrade = () => {
    const accuracy = state.correctMoves / (state.correctMoves + state.strikes || 1);
    const score = state.score;
    if (score >= 200 && accuracy >= 0.9) return { rank: 'S', label: 'Grandmaster Sight', desc: 'Flawless board tracking. Your visualization capacity exceeds standard academy metrics.' };
    if (score >= 150 && accuracy >= 0.8) return { rank: 'A', label: 'Masterful Control', desc: 'High accuracy and speed. You possess a strong mental grasp of board dynamics.' };
    if (score >= 80) return { rank: 'B', label: 'Tactical Competence', desc: 'Solid performance. Continue drilling to reduce tracking errors under time pressure.' };
    if (score >= 40) return { rank: 'C', label: 'Developing Vision', desc: 'Basic visualization established. Focus on identifying piece paths more consistently.' };
    return { rank: 'D', label: 'Vision Under Review', desc: 'Concentrate on static board memory before attempting rapid sequence tracking.' };
  };

  const renderStartScreen = () => {
    const levels = [
      { diff: Difficulty.EASY, name: 'Easy', icon: 'PAWN' as PieceType, tag: 'Beginner', pieces: 3, detail: 'Queen, rook, bishop or knight', dots: 1 },
      { diff: Difficulty.INTERMEDIATE, name: 'Medium', icon: 'KNIGHT' as PieceType, tag: 'Developing', pieces: 4, detail: 'One of each piece', dots: 2 },
      { diff: Difficulty.HARD, name: 'Hard', icon: 'QUEEN' as PieceType, tag: 'Advanced', pieces: 5, detail: 'Includes 2 knights or 2 bishops', dots: 3 },
    ];
    const steps = [
      { n: 1, title: 'Memorize', text: 'Study where each piece stands.' },
      { n: 2, title: 'Go blind', text: 'The pieces disappear from the board.' },
      { n: 3, title: 'Find the piece', text: 'Tap the one that can reach the target.' },
    ];

    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center px-4 py-10 lg:py-12 animate-in fade-in duration-700 box-border" style={{ color: PALETTE.PRIMARY_TEXT }}>
        {/* Brand */}
        <div className="flex flex-col items-center text-center">
          <h1 className="leading-tight font-semibold text-4xl sm:text-5xl">
            <span aria-hidden className="font-bold text-[#2f7d4f] mr-2">♞</span>
            <span className="brand">Blindfold Trainer</span>
          </h1>
          <p className="text-sm lg:text-base font-medium text-[#6f6a62] mt-2">by <a href="https://venturechessacademy.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1f1d1a] underline-offset-4 decoration-[#2f7d4f] decoration-2 hover:underline hover:text-[#2f7d4f] transition-colors">Venture Chess Academy</a></p>
        </div>

        {/* How it works */}
        <div className="w-full max-w-3xl mt-8 lg:mt-10 grid grid-cols-3 gap-2 sm:gap-4">
          {steps.map((s) => (
            <div key={s.n} className="flex flex-col sm:flex-row items-center sm:items-start gap-2 sm:gap-3 text-center sm:text-left">
              <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-[#1f1d1a] text-white">{s.n}</span>
              <div>
                <p className="text-sm font-bold">{s.title}</p>
                <p className="text-xs text-[#6f6a62] mt-0.5 hidden sm:block">{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Difficulty */}
        <div className="w-full max-w-3xl mt-8 lg:mt-10">
          <p className="text-sm font-semibold text-[#6f6a62] mb-3 text-center sm:text-left">Choose a level</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
            {levels.map((l) => (
              <button
                key={l.diff}
                onClick={() => startGame(l.diff)}
                className="group relative text-left card card-hover rounded-2xl p-4 sm:p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f7d4f] flex sm:flex-col items-center sm:items-stretch gap-4 sm:gap-0"
              >
                <div className="flex items-center justify-between sm:mb-5">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center p-1.5 transition-transform group-hover:scale-105" style={{ backgroundColor: 'rgba(31,29,26,0.05)' }}>
                    {PIECE_ICONS['BLACK'][l.icon]}
                  </div>
                  <div className="hidden sm:flex gap-1" aria-hidden="true">
                    {[1, 2, 3].map((d) => (
                      <span key={d} className="w-1.5 h-4 rounded-full" style={{ backgroundColor: d <= l.dots ? '#2f7d4f' : 'rgba(31,29,26,0.12)' }} />
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-xl font-extrabold">{l.name}</h3>
                    <span className="text-[11px] font-semibold text-[#6f6a62]">{l.tag}</span>
                  </div>
                  <p className="text-sm text-[#6f6a62] mt-1">{l.pieces} pieces · {l.detail}</p>
                </div>
                <div className="sm:mt-5 flex items-center justify-between">
                  <span className="hidden sm:inline text-xs text-[#6f6a62]">2 min · 5 lives</span>
                  <span className="w-9 h-9 rounded-full flex items-center justify-center transition-colors group-hover:bg-[#2f7d4f] group-hover:text-white" style={{ backgroundColor: 'rgba(31,29,26,0.06)' }} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <p className="serif italic text-sm lg:text-base text-[#6f6a62] mt-10 text-center px-6">“Vision is the art of seeing what is invisible to others.”</p>
      </div>
    );
  };

  const renderGameScreen = () => {
    // Back in memorize mode mid-game means the position was re-dealt
    const notice = state.phase === 'OBSERVING' && state.correctMoves > 0 ? 'New position. Memorize it, then continue.' : null;
    const sessionTypes = (['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'] as PieceType[]).filter(t => state.pieces.some(p => p.type === t));
    const timeLow = state.timeLeft < 15;
    const timeFrac = Math.max(0, Math.min(1, state.timeLeft / START_TIME));
    const timeColor = state.timeLeft < 15 ? '#c0392b' : state.timeLeft < 30 ? '#c9822b' : '#2f7d4f';
    const livesLeft = Math.max(0, MAX_STRIKES - state.strikes);
    const RING_C = 2 * Math.PI * 36;
    const iconBtn = "h-11 w-full flex items-center justify-center rounded-xl transition-all hover:bg-black/[0.06] active:scale-95 disabled:opacity-25 disabled:hover:bg-transparent";

    return (
      <div className="w-full min-h-screen flex items-center justify-center px-3 py-3 lg:px-8 lg:py-6 animate-in fade-in duration-700 box-border">
        <div className="game-grid">
          {/* ── Stats + controls: chess clock ring ── */}
          <section className="area-stats select-none flex flex-col gap-2">
            <div className="card rounded-2xl px-5 py-4 flex items-center justify-between" style={{ color: PALETTE.PRIMARY_TEXT }}>
              {/* Score */}
              <div className="flex flex-col min-w-[64px]">
                <span className="text-xs font-bold text-[#6f6a62]">Score</span>
                <span className="text-[28px] font-extrabold tabular-nums leading-tight">{state.score}</span>
              </div>

              {/* Clock ring */}
              <div className="relative w-[76px] h-[76px] lg:w-[92px] lg:h-[92px]" role="timer" aria-label={`${state.timeLeft} seconds left`}>
                <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90">
                  <circle cx="42" cy="42" r="36" fill="none" stroke="rgba(31,29,26,0.1)" strokeWidth="6" />
                  <circle
                    cx="42" cy="42" r="36" fill="none"
                    stroke={timeColor}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={RING_C}
                    strokeDashoffset={RING_C * (1 - timeFrac)}
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.4s ease' }}
                  />
                </svg>
                <div className={`absolute inset-0 flex items-center justify-center text-xl lg:text-[22px] font-extrabold tabular-nums ${timeLow ? 'animate-pulse' : ''}`} style={{ color: timeLow ? timeColor : PALETTE.PRIMARY_TEXT }}>
                  {Math.floor(state.timeLeft / 60)}:{(state.timeLeft % 60).toString().padStart(2, '0')}
                </div>
              </div>

              {/* Lives */}
              <div className="flex flex-col items-end min-w-[64px]">
                <span className="text-xs font-bold text-[#6f6a62]">Lives</span>
                <div className="flex gap-0.5 mt-1.5" aria-label={`${livesLeft} of ${MAX_STRIKES} lives left`}>
                  {Array.from({ length: MAX_STRIKES }).map((_, i) => {
                    const alive = i < livesLeft;
                    return (
                      <svg key={i} width="15" height="15" viewBox="0 0 24 24" className="transition-all duration-300" style={{ transform: alive ? 'scale(1)' : 'scale(0.85)' }}>
                        <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.4.6 1.6.6 2 0 .7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"
                          fill={alive ? '#c0392b' : 'none'} stroke={alive ? '#c0392b' : 'rgba(31,29,26,0.22)'} strokeWidth="2" />
                      </svg>
                    );
                  })}
                </div>
                <span className="text-[11px] font-semibold text-[#6f6a62] mt-1 tabular-nums">{livesLeft} left</span>
              </div>
            </div>

            {/* Controls */}
            <div className="card rounded-2xl p-1 grid grid-cols-3 lg:grid-cols-4 gap-1" style={{ color: PALETTE.PRIMARY_TEXT }}>
              <button onClick={goHome} className={iconBtn} aria-label="Home" title="Home">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </button>
              <button onClick={togglePause} disabled={state.phase !== 'PLAYING'} className={iconBtn} aria-label={isPaused ? 'Resume' : 'Pause'} title={isPaused ? 'Resume' : 'Pause'}>
                {isPaused ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>}
              </button>
              <button onClick={toggleMute} className={iconBtn} aria-label={isMuted ? 'Unmute' : 'Mute'} title={isMuted ? 'Unmute' : 'Mute'}>
                {isMuted ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/></svg> : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
              </button>
              <button onClick={toggleFullscreen} className={`${iconBtn} hidden lg:flex`} aria-label="Toggle fullscreen" title="Fullscreen">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
              </button>
            </div>
          </section>

          {/* ── What to do now ── */}
          <section className="area-prompt flex flex-col items-center lg:items-start text-center lg:text-left select-none">
            {state.phase === 'OBSERVING' && (
              <>
                <span className="text-xs font-bold opacity-45" style={{ color: PALETTE.PRIMARY_TEXT }}>{notice ? 'New position' : 'Step 1 · Memorize'}</span>
                <p className="serif font-semibold text-2xl lg:text-3xl mt-1" style={{ color: PALETTE.PRIMARY_TEXT }}>Study the position.</p>
                <p className="text-sm text-[#6f6a62] mt-1" style={{ color: PALETTE.PRIMARY_TEXT }}>{notice ?? 'The pieces disappear when you start.'}</p>
                <button
                  onClick={beginDrill}
                  disabled={countdown !== null}
                  className="mt-4 w-full max-w-xs lg:max-w-none min-h-12 rounded-full bg-[#2f7d4f] px-6 text-base font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                >
                  <span>{countdown !== null ? 'Get ready…' : notice ? 'Continue' : "I'm ready"}</span>
                </button>
              </>
            )}
            {state.phase === 'PLAYING' && (
              <>
                <span className="text-xs font-bold opacity-45" style={{ color: PALETTE.PRIMARY_TEXT }}>
                  {isPaused ? 'Paused' : 'Step 2 · Which piece can reach'}
                </span>
                <p className="leading-none mt-1" style={{ color: PALETTE.PRIMARY_TEXT }}>
                  <span className="serif font-bold text-5xl lg:text-6xl">
                    {isPaused || state.targetSquare === null ? '—' : squareToNotation(state.targetSquare).toLowerCase()}
                  </span>
                </p>
                <p className="text-sm text-[#6f6a62] mt-2" style={{ color: PALETTE.PRIMARY_TEXT }}>
                  {isPaused ? 'Resume when you’re ready.' : 'Tap the piece that can move there.'}
                </p>
              </>
            )}
          </section>

          {/* ── Board ── */}
          <section className="area-board relative flex items-center justify-center">
            <div className="relative">
              <ChessBoard pieces={state.pieces} targetSquare={isPaused ? null : state.targetSquare} lastMoveLine={isPaused ? null : state.lastMoveLine} pop={isPaused ? null : pop} />

              {countdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center z-[60] pointer-events-none rounded-[6px]" style={{ background: 'rgba(31, 29, 26, 0.45)' }}>
                  <div key={countdown} className="text-8xl lg:text-9xl font-bold serif animate-in zoom-in fade-in duration-500 drop-shadow-[0_8px_16px_rgba(0,0,0,0.45)]" style={{ color: PALETTE.SECONDARY_BG }}>
                    {countdown > 0 ? countdown : 'GO!'}
                  </div>
                </div>
              )}

              {isPaused && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 animate-in fade-in duration-300 rounded-[6px] backdrop-blur-md" style={{ background: 'rgba(246, 243, 238, 0.9)' }}>
                  <h2 className="serif font-semibold text-3xl lg:text-4xl" style={{ color: PALETTE.PRIMARY_TEXT }}>Paused</h2>
                  <div className="flex flex-col gap-2.5 w-56">
                    <button onClick={togglePause} className="min-h-12 rounded-full bg-[#2f7d4f] px-6 text-base font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98]">Resume</button>
                    <button onClick={restartCurrentDrill} className="min-h-12 rounded-full bg-black/5 px-6 text-base font-semibold text-[#1f1d1a] transition hover:bg-black/10 active:scale-[0.98]">Restart</button>
                    <button onClick={goHome} className="min-h-12 rounded-full bg-black/5 px-6 text-base font-semibold text-[#1f1d1a] transition hover:bg-black/10 active:scale-[0.98]">Exit to home</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ── Piece choices ── */}
          <section
            className="area-pieces grid gap-2.5 transition-opacity duration-300"
            style={{
              gridTemplateColumns: `repeat(${sessionTypes.length}, minmax(0, 1fr))`,
              opacity: state.phase !== 'PLAYING' || isPaused ? 0.35 : 1,
            }}
          >
            {sessionTypes.map((type) => {
              const isDisabled = disabledOptions.includes(type) || isPaused || state.phase !== 'PLAYING' || isProcessing;
              const isPulsing = pulsingPiece === type;
              const feedback = moveFeedback?.type === type ? moveFeedback : null;
              const ruledOut = disabledOptions.includes(type) && !feedback;
              return (
                <button
                  key={type}
                  onClick={() => handlePieceSelect(type)}
                  disabled={isDisabled}
                  className={`piece-btn card card-hover relative flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl group ${isPulsing ? 'animate-subtle-pulse' : ''}`}
                  style={{
                    ...(isPulsing ? { borderColor: '#c0392b' } : feedback?.status === 'correct' ? { borderColor: '#2f7d4f' } : {}),
                    opacity: ruledOut ? 0.3 : 1,
                  }}
                >
                  {feedback && (
                    <div className={`absolute inset-0 flex items-center justify-center z-20 rounded-xl animate-in fade-in duration-200 ${feedback.status === 'correct' ? 'bg-[#2f7d4f1a]' : 'bg-[#c0392b1a]'}`}>
                      <span className={`font-bold text-[11px] ${feedback.status === 'correct' ? 'text-[#2f7d4f]' : 'text-[#c0392b]'}`}>
                        {feedback.status === 'correct' ? '✓ Correct' : '✕ Wrong'}
                      </span>
                    </div>
                  )}
                  <div className="w-11 h-11 lg:w-14 lg:h-14 transition-transform group-enabled:group-hover:scale-110">{PIECE_ICONS['BLACK'][type]}</div>
                  <span className="text-xs lg:text-sm font-bold capitalize" style={{ color: PALETTE.PRIMARY_TEXT }}>{type.toLowerCase()}</span>
                </button>
              );
            })}
          </section>
        </div>
      </div>
    );
  };

  const renderGameOver = () => {
    const grade = calculateGrade();
    const attempts = state.correctMoves + state.strikes;
    const accuracy = attempts ? Math.round((state.correctMoves / attempts) * 100) : 0;
    const outOfLives = state.strikes >= MAX_STRIKES;
    const levelName = state.difficulty === Difficulty.EASY ? 'Easy' : state.difficulty === Difficulty.INTERMEDIATE ? 'Medium' : 'Hard';
    const stats = [
      { label: 'Correct', value: state.correctMoves },
      { label: 'Accuracy', value: `${accuracy}%` },
      { label: 'Best streak', value: state.bestStreak },
      { label: 'Mistakes', value: `${state.strikes}/${MAX_STRIKES}` },
    ];

    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center px-4 py-10 animate-in fade-in zoom-in-95 duration-700 box-border" style={{ color: PALETTE.PRIMARY_TEXT }}>
        <div className="w-full max-w-md flex flex-col items-center text-center">
          {/* Why it ended */}
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
            style={outOfLives ? { backgroundColor: '#c0392b1a', color: '#c0392b' } : { backgroundColor: 'rgba(47,125,79,0.12)', color: '#2f7d4f' }}
          >
            {outOfLives ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.4.6 1.6.6 2 0 .7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4"/></svg>
            )}
            {outOfLives ? 'Out of lives' : "Time's up"} · {levelName}
          </span>

          {/* Score + grade */}
          <div className="w-full mt-5 card rounded-3xl p-6 sm:p-8">
            <div className="flex items-center justify-between gap-6">
              <div className="text-left">
                <span className="text-xs font-bold text-[#6f6a62]">Final score</span>
                <div className="text-6xl sm:text-7xl font-extrabold tabular-nums leading-none mt-1">{state.score}</div>
              </div>
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0">
                <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90">
                  <circle cx="42" cy="42" r="36" fill="none" stroke="rgba(31,29,26,0.1)" strokeWidth="6" />
                  <circle cx="42" cy="42" r="36" fill="none" stroke="#2f7d4f" strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 36} strokeDashoffset={2 * Math.PI * 36 * (1 - accuracy / 100)} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="serif font-bold text-3xl sm:text-4xl leading-none">{grade.rank}</span>
                  <span className="text-xs font-bold text-[#6f6a62] mt-0.5">Grade</span>
                </div>
              </div>
            </div>

            <div className="text-left mt-6 pt-5 border-t border-black/5">
              <p className="serif font-semibold text-xl sm:text-2xl">{grade.label}</p>
              <p className="text-sm text-[#6f6a62] mt-1.5 leading-relaxed">{grade.desc}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="w-full grid grid-cols-4 gap-2 mt-3">
            {stats.map((s) => (
              <div key={s.label} className="card rounded-2xl py-3 px-1">
                <div className="text-lg sm:text-xl font-extrabold tabular-nums">{s.value}</div>
                <div className="text-xs font-medium text-[#6f6a62] mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="w-full flex flex-col sm:flex-row gap-2.5 mt-7">
            <button
              onClick={restartCurrentDrill}
              className="flex-1 inline-flex items-center justify-center gap-2 min-h-12 rounded-full bg-[#2f7d4f] px-6 text-base font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
              Play again
            </button>
            <button
              onClick={goHome}
              className="flex-1 min-h-12 rounded-full bg-black/5 px-6 text-base font-semibold text-[#1f1d1a] transition hover:bg-black/10 active:scale-[0.98]"
            >
              Change level
            </button>
          </div>

          <p className="serif italic text-sm text-[#6f6a62] mt-8">“Visualization improves by doing.”</p>
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center overflow-x-hidden">
      <main className="relative z-20 w-full h-full flex flex-col items-center flex-grow">
        {state.phase === 'START' && renderStartScreen()}
        {(state.phase === 'OBSERVING' || state.phase === 'PLAYING') && renderGameScreen()}
        {state.phase === 'GAMEOVER' && renderGameOver()}
      </main>
    </div>
  );
};

export default App;
