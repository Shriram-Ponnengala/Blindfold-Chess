
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, GamePhase, Difficulty, Piece, PieceType } from './types';
import { getRandomSquare, generateTargetSquare, canPieceReach } from './services/chessLogic';
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
    let pieceCount = diff === Difficulty.EASY ? 2 : diff === Difficulty.INTERMEDIATE ? 3 : 4;
    const availableTypes: PieceType[] = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'];
    const shuffledTypes = [...availableTypes].sort(() => Math.random() - 0.5);
    const selectedTypes = shuffledTypes.slice(0, pieceCount);
    
    const selectedPieces: Piece[] = [];
    const usedSquares: number[] = [];

    selectedTypes.forEach((type, i) => {
      const square = getRandomSquare(usedSquares);
      usedSquares.push(square);
      selectedPieces.push({ id: `p-${i}`, type, color: 'WHITE', square, isVisible: true });
    });

    setIsPaused(false);
    setIsProcessing(false);
    setCountdown(null);
    setState({
      phase: 'OBSERVING',
      difficulty: diff,
      pieces: selectedPieces,
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
        const nextTarget = generateTargetSquare(prev.pieces, prev.moveHistory);
        
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
    setState(prev => ({ ...prev, phase: 'START' }));
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
          const nextTarget = generateTargetSquare(updatedPieces, updatedHistory);
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

  const renderStartScreen = () => (
    <div className="flex flex-col items-center justify-center min-h-[85vh] space-y-16 animate-in fade-in duration-1000">
      <div className="text-center relative">
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-[1px] opacity-30" style={{ backgroundColor: PALETTE.PRIMARY_TEXT }} />
        <h1 className="text-6xl oleo tracking-wide mb-2 text-center" style={{ color: PALETTE.PRIMARY_TEXT }}>Blindfold Chess Trainer - MindBoard</h1>
        <p className="font-bold tracking-[0.6em] text-[10px] uppercase opacity-60 text-center" style={{ color: PALETTE.PRIMARY_TEXT }}>Train your blindfold chess the right way</p>
      </div>
      <div className="grid grid-cols-1 gap-6 w-80">
        {[ { id: Difficulty.EASY, label: 'Easy' }, { id: Difficulty.INTERMEDIATE, label: 'Medium' }, { id: Difficulty.HARD, label: 'Hard' } ].map(diff => (
          <button 
            key={diff.id} 
            onClick={() => startGame(diff.id)} 
            className="button-premium py-5 px-8 transition-all uppercase tracking-[0.25em] text-[11px] font-bold rounded-sm" 
            style={{ 
              backgroundColor: PALETTE.SECONDARY_BG, 
              border: `1px solid ${PALETTE.PRIMARY_TEXT}20`,
              color: PALETTE.PRIMARY_TEXT,
              boxShadow: `0 4px 6px -1px ${PALETTE.BOARD_DARK}10, 0 2px 4px -1px ${PALETTE.BOARD_DARK}06`
            }}
          >
            {diff.label}
          </button>
        ))}
      </div>
      <div className="pt-12 opacity-80 italic text-[14px] serif text-center" style={{ color: PALETTE.PRIMARY_TEXT }}>"Vision is the art of seeing what is invisible to others."</div>
    </div>
  );

  const renderGameScreen = () => (
    <div className="flex flex-col items-center w-full max-w-7xl px-4 animate-in fade-in duration-700 pb-10 pt-4 lg:pt-8">
      <div className="w-full max-w-[1000px] mb-4 lg:mb-8 select-none">
        <div 
          className="glass-panel p-4 lg:p-6 rounded-2xl flex items-center justify-between relative"
          style={{ borderColor: 'rgba(255, 255, 255, 0.6)' }}
        >
          
          {/* Left Section: Score & Time */}
          <div className="flex items-center space-x-6 lg:space-x-10">
            <div className="flex flex-col">
              <span className="text-[10px] font-black tracking-widest uppercase mb-1 opacity-40" style={{ color: PALETTE.PRIMARY_TEXT }}>Score</span>
              <span className="text-2xl lg:text-3xl font-black tracking-tighter tabular-nums leading-none" style={{ color: PALETTE.PRIMARY_TEXT }}>{state.score.toString().padStart(4, '0')}</span>
            </div>
            <div className="flex flex-col border-l pl-6 lg:pl-10" style={{ borderColor: `${PALETTE.PRIMARY_TEXT}15` }}>
              <span className="text-[10px] font-black tracking-widest uppercase mb-1 opacity-40" style={{ color: PALETTE.PRIMARY_TEXT }}>Time</span>
              <span className="text-2xl lg:text-3xl font-black tracking-tighter tabular-nums leading-none" style={{ color: state.timeLeft < 15 ? '#b91c1c' : PALETTE.PRIMARY_TEXT }}>{Math.floor(state.timeLeft / 60)}:{(state.timeLeft % 60).toString().padStart(2, '0')}</span>
            </div>
          </div>

          {/* Center Section: Strikes (Absolute Centered) */}
          <div className="hidden sm:flex flex-col items-center absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
             <span className="text-[10px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: PALETTE.PRIMARY_TEXT }}>Strikes</span>
             <div className="flex space-x-2">
                {Array.from({ length: MAX_STRIKES }).map((_, i) => (
                  <div key={i} className="w-8 h-2 rounded-sm" style={{ backgroundColor: i < state.strikes ? '#b91c1c' : `${PALETTE.BOARD_DARK}15` }} />
                ))}
             </div>
          </div>

          {/* Right Section: Buttons */}
          <div className="flex items-center space-x-2">
            <button 
              onClick={togglePause} 
              disabled={state.phase !== 'PLAYING'} 
              className="p-2 lg:p-2.5 rounded-full transition-all disabled:opacity-20 shadow-sm border"
              style={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                borderColor: 'rgba(255, 255, 255, 0.6)',
                color: PALETTE.PRIMARY_TEXT 
              }}
            >
              {isPaused ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>}
            </button>
            <button 
              onClick={toggleMute} 
              className="p-2 lg:p-2.5 rounded-full transition-all shadow-sm border"
              style={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                borderColor: 'rgba(255, 255, 255, 0.6)',
                color: PALETTE.PRIMARY_TEXT 
              }}
            >
              {isMuted ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
            </button>
            <button 
              onClick={toggleFullscreen} 
              className="p-2 lg:p-2.5 rounded-full transition-all shadow-sm border"
              style={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                borderColor: 'rgba(255, 255, 255, 0.6)',
                color: PALETTE.PRIMARY_TEXT 
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            </button>
          </div>
        </div>
      </div>
      {state.phase === 'OBSERVING' && (
        <div className="w-full text-center mb-6 animate-in slide-in-from-top-4 duration-500">
           <p className="serif italic text-2xl lg:text-3xl tracking-wide opacity-90" style={{ color: PALETTE.PRIMARY_TEXT }}>Analyze piece positions carefully.</p>
           <p className="text-[10px] uppercase font-black tracking-[0.4em] opacity-40 mt-1" style={{ color: PALETTE.PRIMARY_TEXT }}>Memorization Phase</p>
        </div>
      )}
      <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-6 lg:gap-12 w-full max-w-[1100px]">
        <div className="relative order-1">
          <ChessBoard pieces={state.pieces} targetSquare={isPaused ? null : state.targetSquare} lastMoveLine={isPaused ? null : state.lastMoveLine} />
          
          {/* Countdown Overlay */}
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center z-[60] pointer-events-none">
              <div key={countdown} className="text-8xl lg:text-9xl font-black italic serif animate-in zoom-in fade-in duration-500 drop-shadow-[0_10px_10px_rgba(85,30,25,0.2)]" style={{ color: PALETTE.SECONDARY_BG }}>
                {countdown > 0 ? countdown : 'GO!'}
              </div>
            </div>
          )}

          {state.phase === 'OBSERVING' && countdown === null && (
            <div className="absolute inset-0 flex items-center justify-center z-50">
               <button 
                onClick={beginDrill} 
                className="button-premium px-10 py-5 rounded-sm hover:scale-105 transition-all group border"
                style={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  borderColor: `${PALETTE.PRIMARY_TEXT}15`,
                  boxShadow: `0 20px 40px -10px ${PALETTE.BOARD_DARK}30`
                }}
               >
                  <span className="text-[12px] font-black uppercase tracking-[0.4em]" style={{ color: PALETTE.PRIMARY_TEXT }}>Start Blindfold Drill</span>
               </button>
            </div>
          )}
          {isPaused && (
            <div 
              className="absolute inset-0 glass-panel z-40 flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-300 rounded-sm"
              style={{ background: 'rgba(255, 255, 255, 0.85)' }}
            >
              <h2 className="serif italic text-3xl lg:text-4xl tracking-wide" style={{ color: PALETTE.PRIMARY_TEXT }}>Session Paused</h2>
              <div className="flex flex-col space-y-3 w-56">
                <button onClick={togglePause} className="button-premium py-3 px-6 font-bold uppercase tracking-[0.2em] text-[10px] rounded-sm" style={{ backgroundColor: PALETTE.PRIMARY_TEXT, color: PALETTE.SECONDARY_BG }}>Resume Game</button>
                <button onClick={restartCurrentDrill} className="button-premium py-3 px-6 font-bold uppercase tracking-[0.2em] text-[10px] rounded-sm" style={{ backgroundColor: PALETTE.SECONDARY_BG, border: `1px solid ${PALETTE.PRIMARY_TEXT}20`, color: PALETTE.PRIMARY_TEXT }}>Restart Game</button>
                <button onClick={goHome} className="button-premium py-3 px-6 font-bold uppercase tracking-[0.2em] text-[10px] rounded-sm" style={{ backgroundColor: PALETTE.SECONDARY_BG, border: `1px solid ${PALETTE.PRIMARY_TEXT}20`, color: PALETTE.PRIMARY_TEXT }}>Exit to Home</button>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center lg:items-start w-full lg:w-auto order-2">
          <div 
            className="flex flex-row lg:flex-col justify-center gap-3 lg:gap-6 w-full lg:w-40 p-4 lg:p-6 glass-panel rounded-xl lg:rounded-2xl" 
            style={{ 
              opacity: (state.phase !== 'PLAYING' || isPaused) ? 0.3 : 1,
              boxShadow: `0 20px 40px -10px ${PALETTE.BOARD_DARK}20` 
            }}
          >
            {(['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'] as PieceType[]).map((type) => {
              const isUsedInSession = state.pieces.some(p => p.type === type);
              const isDisabled = disabledOptions.includes(type) || isPaused || state.phase === 'OBSERVING' || isProcessing;
              const isPulsing = pulsingPiece === type;
              const feedback = moveFeedback?.type === type ? moveFeedback : null;
              if (!isUsedInSession) return null;
              return (
                <button 
                  key={type} 
                  onClick={() => handlePieceSelect(type)} 
                  disabled={isDisabled} 
                  className={`relative w-20 h-24 lg:w-28 lg:h-32 p-3 lg:p-4 transition-all flex flex-col items-center justify-between rounded-xl group ${isPulsing ? 'animate-subtle-pulse' : ''}`} 
                  style={{ 
                    backgroundColor: PALETTE.SECONDARY_BG, 
                    border: `1px solid ${isPulsing ? '#b91c1c' : `${PALETTE.BOARD_DARK}15`}`,
                    opacity: (isDisabled && !feedback && !isPulsing) ? 0.4 : 1,
                    boxShadow: `0 4px 6px -1px ${PALETTE.BOARD_DARK}05`
                  }}
                >
                  {feedback && (
                    <div className="absolute inset-0 flex items-center justify-center z-20 rounded-xl bg-white/90 backdrop-blur-md animate-in fade-in duration-300">
                      <div className={`${feedback.status === 'correct' ? 'text-green-700' : 'text-red-700'} font-black text-[8px] lg:text-[10px] uppercase text-center tracking-wider`}>{feedback.status === 'correct' ? 'CORRECT' : 'FAILED'}</div>
                    </div>
                  )}
                  <div className="w-full h-12 lg:h-16 flex items-center justify-center group-hover:scale-110 transition-transform"><div className="w-10 h-10 lg:w-14 lg:h-14">{PIECE_ICONS['WHITE'][type]}</div></div>
                  <span className="text-[8px] lg:text-[10px] font-black uppercase tracking-widest pt-1.5 w-full text-center opacity-40" style={{ color: PALETTE.PRIMARY_TEXT, borderTop: `1px solid ${PALETTE.PRIMARY_TEXT}10` }}>{type}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-6 lg:mt-8 text-[10px] lg:text-[11px] font-black uppercase tracking-[0.3em] lg:tracking-[0.4em] text-center lg:text-left serif italic opacity-40" style={{ color: PALETTE.PRIMARY_TEXT }}>{state.phase === 'OBSERVING' ? 'Awaiting mental snapshot' : isPaused ? 'Analysis Suspended' : ''}</div>
        </div>
      </div>
    </div>
  );

  const renderGameOver = () => {
    return (
      <div className="flex flex-col items-center justify-center min-h-[90vh] py-12 px-6 space-y-8 animate-in fade-in zoom-in duration-1000 max-w-3xl text-center">
        
        {/* Header */}
        <div className="space-y-4">
          <h2 className="text-5xl lg:text-6xl serif italic tracking-wide" style={{ color: PALETTE.PRIMARY_TEXT }}>Game Over</h2>
          <div className="h-[1px] w-32 mx-auto opacity-10" style={{ backgroundColor: PALETTE.PRIMARY_TEXT }} />
        </div>

        {/* Large Score */}
        <div className="flex flex-col items-center py-2 lg:py-4">
          <span className="text-[100px] lg:text-[140px] font-black tracking-tighter tabular-nums leading-none" style={{ color: PALETTE.PRIMARY_TEXT }}>
             {state.score}
          </span>
           <span className="uppercase tracking-[0.6em] text-[10px] font-bold opacity-40 mt-4" style={{ color: PALETTE.PRIMARY_TEXT }}>Final Score</span>
        </div>

        {/* Quote */}
        <div className="max-w-md mx-auto">
            <p className="text-lg lg:text-xl serif italic opacity-80" style={{ color: PALETTE.PRIMARY_TEXT }}>“Visualization improves by doing.”</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-8 w-full max-w-md pt-6 mt-4" style={{ borderTop: `1px solid ${PALETTE.PRIMARY_TEXT}10` }}>
          <div className="flex flex-col items-center justify-center space-y-1">
              <span className="uppercase tracking-[0.2em] text-[9px] font-black opacity-30" style={{ color: PALETTE.PRIMARY_TEXT }}>Correct Moves</span>
              <span className="text-2xl font-black tabular-nums" style={{ color: PALETTE.PRIMARY_TEXT }}>{state.correctMoves}</span>
          </div>
          <div className="flex flex-col items-center justify-center space-y-1 border-l" style={{ borderColor: `${PALETTE.PRIMARY_TEXT}10` }}>
              <span className="uppercase tracking-[0.2em] text-[9px] font-black opacity-30" style={{ color: PALETTE.PRIMARY_TEXT }}>Peak Streak</span>
              <span className="text-2xl font-black tabular-nums" style={{ color: PALETTE.BOARD_LIGHT }}>{state.bestStreak}</span>
          </div>
        </div>

        {/* CTA & Buttons */}
        <div className="flex flex-col items-center space-y-6 pt-8">
            <p className="uppercase tracking-[0.3em] text-[10px] font-black opacity-40" style={{ color: PALETTE.PRIMARY_TEXT }}>Ready to try again?</p>
            <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-6 lg:space-x-8">
            <button onClick={restartCurrentDrill} className="button-premium border py-4 px-10 text-[10px] font-black uppercase tracking-[0.3em] rounded-sm" style={{ backgroundColor: PALETTE.SECONDARY_BG, borderColor: `${PALETTE.PRIMARY_TEXT}20`, color: PALETTE.PRIMARY_TEXT, boxShadow: `0 4px 6px -1px ${PALETTE.BOARD_DARK}10` }}>Restart Game</button>
            <button onClick={goHome} className="button-premium py-4 px-10 text-[10px] font-black uppercase tracking-[0.3em] rounded-sm" style={{ backgroundColor: PALETTE.PRIMARY_TEXT, color: PALETTE.SECONDARY_BG, boxShadow: `0 10px 15px -3px ${PALETTE.BOARD_DARK}40` }}>Exit to Home</button>
            </div>
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
      <div className="fixed bottom-10 left-10 flex flex-col opacity-10 pointer-events-none hidden xl:flex">
        <div className="text-[14px] oleo tracking-widest" style={{ color: PALETTE.PRIMARY_TEXT }}>MindBoard</div>
        <div className="text-[9px] font-black uppercase tracking-[1.2em]" style={{ color: PALETTE.PRIMARY_TEXT }}>Blindfold Chess Trainer</div>
      </div>
    </div>
  );
};

export default App;
