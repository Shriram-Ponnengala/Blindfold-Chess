
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, GamePhase, Difficulty, Piece, PieceType } from './types';
import { getRandomSquare, generateTargetSquare, canPieceReach, generatePosition, findValidTarget, squareToNotation } from './services/chessLogic';
import { PALETTE, PIECE_ICONS } from './constants';
import ChessBoard from './components/ChessBoard';
import { soundService } from './services/soundService';

const START_TIME = 120;
const MAX_STRIKES = 5;

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
        const nextTarget = findValidTarget(prev.pieces, prev.difficulty);
        
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
      soundService.playCorrect();
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

          // Generate next target based on new positions
          const nextTarget = findValidTarget(updatedPieces, prev.difficulty);
          const newStreak = prev.currentStreak + 1;
          
          return {
            ...prev,
            score: prev.score + 10,
            pieces: updatedPieces,
            moveHistory: updatedHistory,
            // Show arrow from the piece's original square to the target square the user just hit
            lastMoveLine: [userMoveFrom, userMoveTo],
            targetSquare: nextTarget,
            correctMoves: prev.correctMoves + 1,
            currentStreak: newStreak,
            bestStreak: Math.max(prev.bestStreak, newStreak),
          };
        });
        setIsProcessing(false); // UNLOCK INPUT
      }, 500);
    } else {
      setIsProcessing(true); // LOCK INPUT
      soundService.playIncorrect();
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
      { diff: Difficulty.EASY, name: 'Easy', icon: 'PAWN' as PieceType, tag: 'Beginner', pieces: 3, detail: '1 confuser nearby', dots: 1 },
      { diff: Difficulty.INTERMEDIATE, name: 'Medium', icon: 'KNIGHT' as PieceType, tag: 'Developing', pieces: 4, detail: '2 confusers nearby', dots: 2 },
      { diff: Difficulty.HARD, name: 'Hard', icon: 'QUEEN' as PieceType, tag: 'Advanced', pieces: 5, detail: '2 knights or 2 bishops', dots: 3 },
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
          <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl bg-[#fffaf5] border border-black/5 shadow-sm flex items-center justify-center p-2">
            {PIECE_ICONS['WHITE']['KNIGHT']}
          </div>
          <h1 className="serif italic text-5xl sm:text-6xl lg:text-7xl leading-none mt-5">Blindfold Trainer</h1>
          <p className="text-base lg:text-lg opacity-70 mt-3 max-w-lg text-balance">Train your board vision, one blindfold move at a time.</p>
        </div>

        {/* How it works */}
        <div className="w-full max-w-3xl mt-8 lg:mt-10 grid grid-cols-3 gap-2 sm:gap-4">
          {steps.map((s) => (
            <div key={s.n} className="flex flex-col sm:flex-row items-center sm:items-start gap-2 sm:gap-3 text-center sm:text-left">
              <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: 'rgba(23,105,91,0.12)', color: '#17695b' }}>{s.n}</span>
              <div>
                <p className="text-sm font-bold">{s.title}</p>
                <p className="text-xs opacity-60 mt-0.5 hidden sm:block">{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Difficulty */}
        <div className="w-full max-w-3xl mt-8 lg:mt-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] opacity-50 mb-3 text-center sm:text-left">Choose a level</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
            {levels.map((l) => (
              <button
                key={l.diff}
                onClick={() => startGame(l.diff)}
                className="group relative text-left bg-[#fffaf5] rounded-2xl border border-black/5 shadow-sm p-4 sm:p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-[#17695b]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17695b] flex sm:flex-col items-center sm:items-stretch gap-4 sm:gap-0"
              >
                <div className="flex items-center justify-between sm:mb-5">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center p-1.5 transition-transform group-hover:scale-105" style={{ backgroundColor: 'rgba(85,30,25,0.05)' }}>
                    {PIECE_ICONS['WHITE'][l.icon]}
                  </div>
                  <div className="hidden sm:flex gap-1" aria-hidden="true">
                    {[1, 2, 3].map((d) => (
                      <span key={d} className="w-1.5 h-4 rounded-full" style={{ backgroundColor: d <= l.dots ? '#17695b' : 'rgba(85,30,25,0.12)' }} />
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-xl font-extrabold">{l.name}</h3>
                    <span className="text-[11px] font-semibold opacity-50">{l.tag}</span>
                  </div>
                  <p className="text-sm opacity-65 mt-1">{l.pieces} pieces · {l.detail}</p>
                </div>
                <div className="sm:mt-5 flex items-center justify-between">
                  <span className="hidden sm:inline text-xs opacity-50">2 min · 5 lives</span>
                  <span className="w-9 h-9 rounded-full flex items-center justify-center transition-colors group-hover:bg-[#17695b] group-hover:text-white" style={{ backgroundColor: 'rgba(85,30,25,0.06)' }} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <p className="serif italic text-sm lg:text-base opacity-60 mt-10 text-center px-6">“Vision is the art of seeing what is invisible to others.”</p>
      </div>
    );
  };

  const renderGameScreen = () => {
    const sessionTypes = (['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'] as PieceType[]).filter(t => state.pieces.some(p => p.type === t));
    const timeLow = state.timeLeft < 15;
    const timeFrac = Math.max(0, Math.min(1, state.timeLeft / START_TIME));
    const timeColor = state.timeLeft < 15 ? '#d9473f' : state.timeLeft < 30 ? '#c9822b' : '#17695b';
    const livesLeft = Math.max(0, MAX_STRIKES - state.strikes);
    const RING_C = 2 * Math.PI * 36;
    const iconBtn = "w-10 h-10 flex items-center justify-center rounded-full transition-all hover:bg-black/5 active:scale-90 disabled:opacity-25 disabled:hover:bg-transparent";

    return (
      <div className="w-full min-h-screen flex items-center justify-center px-3 py-3 lg:px-8 lg:py-6 animate-in fade-in duration-700 box-border">
        <div className="game-grid">
          {/* ── Stats + controls: chess clock ring ── */}
          <section className="area-stats select-none flex flex-col gap-2">
            <div className="bg-[#fffaf5] rounded-2xl border border-black/5 shadow-sm px-5 py-4 flex items-center justify-between" style={{ color: PALETTE.PRIMARY_TEXT }}>
              {/* Score */}
              <div className="flex flex-col min-w-[64px]">
                <span className="text-[10px] font-bold tracking-[0.18em] uppercase opacity-50">Score</span>
                <span className="text-[28px] font-extrabold tabular-nums leading-tight">{state.score}</span>
              </div>

              {/* Clock ring */}
              <div className="relative w-[76px] h-[76px] lg:w-[92px] lg:h-[92px]" role="timer" aria-label={`${state.timeLeft} seconds left`}>
                <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90">
                  <circle cx="42" cy="42" r="36" fill="none" stroke="rgba(85,30,25,0.1)" strokeWidth="6" />
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
                <span className="text-[10px] font-bold tracking-[0.18em] uppercase opacity-50">Lives</span>
                <div className="flex gap-0.5 mt-1.5" aria-label={`${livesLeft} of ${MAX_STRIKES} lives left`}>
                  {Array.from({ length: MAX_STRIKES }).map((_, i) => {
                    const alive = i < livesLeft;
                    return (
                      <svg key={i} width="15" height="15" viewBox="0 0 24 24" className="transition-all duration-300" style={{ transform: alive ? 'scale(1)' : 'scale(0.85)' }}>
                        <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.4.6 1.6.6 2 0 .7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"
                          fill={alive ? '#d9473f' : 'none'} stroke={alive ? '#d9473f' : 'rgba(85,30,25,0.22)'} strokeWidth="2" />
                      </svg>
                    );
                  })}
                </div>
                <span className="text-[11px] font-semibold opacity-50 mt-1 tabular-nums">{livesLeft} left</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-2" style={{ color: PALETTE.PRIMARY_TEXT }}>
              <button onClick={goHome} className={iconBtn} aria-label="Home" title="Home">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </button>
              <button onClick={togglePause} disabled={state.phase !== 'PLAYING'} className={iconBtn} aria-label={isPaused ? 'Resume' : 'Pause'} title={isPaused ? 'Resume' : 'Pause'}>
                {isPaused ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>}
              </button>
              <button onClick={toggleMute} className={iconBtn} aria-label={isMuted ? 'Unmute' : 'Mute'} title={isMuted ? 'Unmute' : 'Mute'}>
                {isMuted ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/></svg> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
              </button>
              <button onClick={toggleFullscreen} className={`${iconBtn} hidden lg:flex`} aria-label="Toggle fullscreen" title="Fullscreen">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
              </button>
            </div>
          </section>

          {/* ── What to do now ── */}
          <section className="area-prompt flex flex-col items-center lg:items-start text-center lg:text-left select-none">
            {state.phase === 'OBSERVING' && (
              <>
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] opacity-45" style={{ color: PALETTE.PRIMARY_TEXT }}>Step 1 · Memorize</span>
                <p className="serif italic text-2xl lg:text-3xl mt-1" style={{ color: PALETTE.PRIMARY_TEXT }}>Study the position.</p>
                <p className="text-sm opacity-60 mt-1" style={{ color: PALETTE.PRIMARY_TEXT }}>The pieces disappear when you start.</p>
                <button
                  onClick={beginDrill}
                  disabled={countdown !== null}
                  className="button-premium mt-4 w-full max-w-xs lg:max-w-none py-3.5 rounded-xl transition-all disabled:opacity-50"
                  style={{ backgroundColor: PALETTE.PRIMARY_TEXT, color: PALETTE.SECONDARY_BG, boxShadow: `0 12px 24px -12px ${PALETTE.BOARD_DARK}` }}
                >
                  <span className="text-xs font-bold uppercase tracking-[0.2em]">{countdown !== null ? 'Get ready…' : "I'm ready"}</span>
                </button>
              </>
            )}
            {state.phase === 'PLAYING' && (
              <>
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] opacity-45" style={{ color: PALETTE.PRIMARY_TEXT }}>
                  {isPaused ? 'Paused' : 'Step 2 · Which piece can reach'}
                </span>
                <p className="leading-none mt-1" style={{ color: PALETTE.PRIMARY_TEXT }}>
                  <span className="serif font-bold text-5xl lg:text-6xl">
                    {isPaused || state.targetSquare === null ? '—' : squareToNotation(state.targetSquare).toLowerCase()}
                  </span>
                </p>
                <p className="text-sm opacity-60 mt-2" style={{ color: PALETTE.PRIMARY_TEXT }}>
                  {isPaused ? 'Resume when you’re ready.' : 'Tap the piece that can move there.'}
                </p>
              </>
            )}
          </section>

          {/* ── Board ── */}
          <section className="area-board relative flex items-center justify-center">
            <div className="relative">
              <ChessBoard pieces={state.pieces} targetSquare={isPaused ? null : state.targetSquare} lastMoveLine={isPaused ? null : state.lastMoveLine} />

              {countdown !== null && (
                <div className="absolute inset-0 flex items-center justify-center z-[60] pointer-events-none rounded-[14px]" style={{ background: 'rgba(40, 15, 10, 0.35)' }}>
                  <div key={countdown} className="text-8xl lg:text-9xl font-black italic serif animate-in zoom-in fade-in duration-500 drop-shadow-[0_8px_16px_rgba(0,0,0,0.45)]" style={{ color: PALETTE.SECONDARY_BG }}>
                    {countdown > 0 ? countdown : 'GO!'}
                  </div>
                </div>
              )}

              {isPaused && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 animate-in fade-in duration-300 rounded-[14px] backdrop-blur-md" style={{ background: 'rgba(255, 250, 244, 0.88)' }}>
                  <h2 className="serif italic text-3xl lg:text-4xl" style={{ color: PALETTE.PRIMARY_TEXT }}>Paused</h2>
                  <div className="flex flex-col gap-2.5 w-56">
                    <button onClick={togglePause} className="button-premium py-3 rounded-xl font-bold uppercase tracking-[0.18em] text-[11px]" style={{ backgroundColor: PALETTE.PRIMARY_TEXT, color: PALETTE.SECONDARY_BG }}>Resume</button>
                    <button onClick={restartCurrentDrill} className="button-premium py-3 rounded-xl font-bold uppercase tracking-[0.18em] text-[11px]" style={{ backgroundColor: PALETTE.SECONDARY_BG, border: `1px solid ${PALETTE.PRIMARY_TEXT}20`, color: PALETTE.PRIMARY_TEXT }}>Restart</button>
                    <button onClick={goHome} className="button-premium py-3 rounded-xl font-bold uppercase tracking-[0.18em] text-[11px]" style={{ backgroundColor: PALETTE.SECONDARY_BG, border: `1px solid ${PALETTE.PRIMARY_TEXT}20`, color: PALETTE.PRIMARY_TEXT }}>Exit to home</button>
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
                  className={`piece-btn relative flex flex-col items-center justify-center gap-1 py-3 rounded-xl bg-white transition-all enabled:hover:-translate-y-0.5 enabled:hover:shadow-md group ${isPulsing ? 'animate-subtle-pulse' : ''}`}
                  style={{
                    border: `1.5px solid ${isPulsing ? '#d9473f' : feedback?.status === 'correct' ? '#17695b' : 'rgba(85,30,25,0.1)'}`,
                    opacity: ruledOut ? 0.35 : 1,
                    boxShadow: '0 2px 6px -2px rgba(85,30,25,0.12)',
                  }}
                >
                  {feedback && (
                    <div className={`absolute inset-0 flex items-center justify-center z-20 rounded-xl animate-in fade-in duration-200 ${feedback.status === 'correct' ? 'bg-[#e7f3f0]' : 'bg-[#fbeceb]'}`}>
                      <span className={`font-bold text-[11px] uppercase tracking-wider ${feedback.status === 'correct' ? 'text-[#17695b]' : 'text-[#b3332c]'}`}>
                        {feedback.status === 'correct' ? '✓ Correct' : '✕ Wrong'}
                      </span>
                    </div>
                  )}
                  <div className="w-10 h-10 lg:w-12 lg:h-12 transition-transform group-enabled:group-hover:scale-110">{PIECE_ICONS['WHITE'][type]}</div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-55" style={{ color: PALETTE.PRIMARY_TEXT }}>{type.toLowerCase()}</span>
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
            style={outOfLives ? { backgroundColor: '#fbeceb', color: '#a3352e' } : { backgroundColor: 'rgba(23,105,91,0.12)', color: '#17695b' }}
          >
            {outOfLives ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.4.6 1.6.6 2 0 .7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4"/></svg>
            )}
            {outOfLives ? 'Out of lives' : "Time's up"} · {levelName}
          </span>

          {/* Score + grade */}
          <div className="w-full mt-5 bg-[#fffaf5] rounded-3xl border border-black/5 shadow-sm p-6 sm:p-8">
            <div className="flex items-center justify-between gap-6">
              <div className="text-left">
                <span className="text-[10px] font-bold tracking-[0.18em] uppercase opacity-50">Final score</span>
                <div className="text-6xl sm:text-7xl font-extrabold tabular-nums leading-none mt-1">{state.score}</div>
              </div>
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0">
                <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90">
                  <circle cx="42" cy="42" r="36" fill="none" stroke="rgba(85,30,25,0.1)" strokeWidth="6" />
                  <circle cx="42" cy="42" r="36" fill="none" stroke="#17695b" strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 36} strokeDashoffset={2 * Math.PI * 36 * (1 - accuracy / 100)} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="serif font-bold text-3xl sm:text-4xl leading-none">{grade.rank}</span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.15em] opacity-50 mt-0.5">Grade</span>
                </div>
              </div>
            </div>

            <div className="text-left mt-6 pt-5 border-t border-black/5">
              <p className="serif italic text-xl sm:text-2xl">{grade.label}</p>
              <p className="text-sm opacity-65 mt-1.5 leading-relaxed">{grade.desc}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="w-full grid grid-cols-4 gap-2 mt-3">
            {stats.map((s) => (
              <div key={s.label} className="bg-[#fffaf5]/70 rounded-2xl border border-black/5 py-3 px-1">
                <div className="text-lg sm:text-xl font-extrabold tabular-nums">{s.value}</div>
                <div className="text-[10px] font-semibold opacity-50 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="w-full flex flex-col sm:flex-row gap-2.5 mt-7">
            <button
              onClick={restartCurrentDrill}
              className="button-premium flex-1 py-3.5 rounded-xl text-xs font-bold uppercase tracking-[0.2em] inline-flex items-center justify-center gap-2"
              style={{ backgroundColor: PALETTE.PRIMARY_TEXT, color: PALETTE.SECONDARY_BG, boxShadow: `0 12px 24px -12px ${PALETTE.BOARD_DARK}` }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
              Play again
            </button>
            <button
              onClick={goHome}
              className="button-premium flex-1 py-3.5 rounded-xl text-xs font-bold uppercase tracking-[0.2em] bg-white"
              style={{ border: `1px solid ${PALETTE.PRIMARY_TEXT}20`, color: PALETTE.PRIMARY_TEXT }}
            >
              Change level
            </button>
          </div>

          <p className="serif italic text-sm opacity-55 mt-8">“Visualization improves by doing.”</p>
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center overflow-x-hidden">
      <div className="fixed -top-32 -right-32 w-96 h-96 rounded-full opacity-[0.03] pointer-events-none" style={{ backgroundColor: PALETTE.PRIMARY_TEXT }} />
      <div className="fixed -bottom-32 -left-32 w-96 h-96 rounded-full opacity-[0.03] pointer-events-none" style={{ backgroundColor: PALETTE.PRIMARY_TEXT }} />
      <main className="relative z-20 w-full h-full flex flex-col items-center flex-grow">
        {state.phase === 'START' && renderStartScreen()}
        {(state.phase === 'OBSERVING' || state.phase === 'PLAYING') && renderGameScreen()}
        {state.phase === 'GAMEOVER' && renderGameOver()}
      </main>
    </div>
  );
};

export default App;
