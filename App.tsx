
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, GamePhase, Difficulty, Piece, PieceType } from './types';
import { getRandomSquare, getLegalMoves, canPieceReach } from './services/chessLogic';
import { PALETTE, PIECE_ICONS } from './constants';
import ChessBoard from './components/ChessBoard';
import { soundService } from './services/soundService';

const OBSERVATION_TIME = 5;
const START_TIME = 180; 
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
  });

  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const timerRef = useRef<any>(null);
  const [disabledOptions, setDisabledOptions] = useState<PieceType[]>([]);
  const [pulsingPiece, setPulsingPiece] = useState<PieceType | null>(null);
  const [moveFeedback, setMoveFeedback] = useState<{ type: PieceType; status: 'correct' | 'incorrect' } | null>(null);

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

  const generateNewTarget = useCallback((currentPieces: Piece[]) => {
    const randomPiece = currentPieces[Math.floor(Math.random() * currentPieces.length)];
    const blockers = currentPieces.map(p => p.square).filter(sq => sq !== randomPiece.square);
    const legalMoves = getLegalMoves(randomPiece.square, randomPiece.type, blockers);
    const availableTargets = legalMoves.filter(m => !currentPieces.some(p => p.square === m));
    
    if (availableTargets.length === 0) {
      return legalMoves[Math.floor(Math.random() * legalMoves.length)];
    }
    
    return availableTargets[Math.floor(Math.random() * availableTargets.length)];
  }, []);

  const startGame = (diff: Difficulty) => {
    let pieceCount = 2;
    if (diff === Difficulty.INTERMEDIATE) pieceCount = 3;
    if (diff === Difficulty.HARD) pieceCount = 4;

    const availableTypes: PieceType[] = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'];
    const shuffledTypes = [...availableTypes].sort(() => Math.random() - 0.5);
    const selectedTypes = shuffledTypes.slice(0, pieceCount);
    
    const selectedPieces: Piece[] = [];
    const usedSquares: number[] = [];

    selectedTypes.forEach((type, i) => {
      const square = getRandomSquare(usedSquares);
      usedSquares.push(square);
      selectedPieces.push({
        id: `p-${i}`,
        type,
        color: 'WHITE', 
        square,
        isVisible: true
      });
    });

    setIsPaused(false);
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
    });

    setTimeout(() => {
      setState(prev => {
        if (prev.phase !== 'OBSERVING') return prev; 
        const nextTarget = generateNewTarget(prev.pieces);
        return {
          ...prev,
          phase: 'PLAYING',
          pieces: prev.pieces.map(p => ({ ...p, isVisible: false })),
          targetSquare: nextTarget,
        };
      });
    }, OBSERVATION_TIME * 1000);
  };

  const restartCurrentDrill = () => {
    startGame(state.difficulty);
  };

  const goHome = () => {
    setIsPaused(false);
    setState(prev => ({ ...prev, phase: 'START' }));
  };

  const togglePause = () => {
    if (state.phase === 'PLAYING') {
      setIsPaused(prev => !prev);
    }
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
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.phase, isPaused]);

  const handlePieceSelect = (type: PieceType) => {
    if (state.phase !== 'PLAYING' || isPaused || state.targetSquare === null) return;

    const validPiece = state.pieces.find(p => p.type === type && canPieceReach(p.square, state.targetSquare!, p.type, state.pieces));

    if (validPiece) {
      soundService.playCorrect();
      const oldSquare = validPiece.square;
      const newSquare = state.targetSquare!;
      
      const updatedPieces = state.pieces.map(p => 
        p.id === validPiece.id ? { ...p, square: newSquare } : p
      );

      setDisabledOptions([]);
      setMoveFeedback({ type, status: 'correct' });
      const nextTarget = generateNewTarget(updatedPieces);
      
      setState(prev => {
        const newStreak = prev.currentStreak + 1;
        return {
          ...prev,
          score: prev.score + 10,
          pieces: updatedPieces,
          lastMoveLine: [oldSquare, newSquare],
          targetSquare: nextTarget,
          correctMoves: prev.correctMoves + 1,
          currentStreak: newStreak,
          bestStreak: Math.max(prev.bestStreak, newStreak),
        };
      });
    } else {
      soundService.playIncorrect();
      setPulsingPiece(type);
      setMoveFeedback({ type, status: 'incorrect' });
      setTimeout(() => setPulsingPiece(null), 400);

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
        <h1 
          className="text-6xl oleo tracking-wide mb-2 text-center"
          style={{ color: PALETTE.PRIMARY_TEXT }}
        >Blindfold Chess Trainer - MindBoard</h1>
        <p 
          className="font-bold tracking-[0.6em] text-[10px] uppercase opacity-60 text-center"
          style={{ color: PALETTE.PRIMARY_TEXT }}
        >Train your blindfold chess the right way</p>
      </div>
      
      <div className="grid grid-cols-1 gap-6 w-80">
        {[
          { id: Difficulty.EASY, label: 'Easy' },
          { id: Difficulty.INTERMEDIATE, label: 'Medium' },
          { id: Difficulty.HARD, label: 'Hard' }
        ].map(diff => (
          <button 
            key={diff.id}
            onClick={() => startGame(diff.id)}
            className="button-premium border py-5 px-8 transition-all uppercase tracking-[0.25em] text-[11px] font-bold shadow-sm rounded-sm overflow-hidden"
            style={{ 
              backgroundColor: PALETTE.SECONDARY_BG,
              borderColor: `${PALETTE.PRIMARY_TEXT}25`,
              color: PALETTE.PRIMARY_TEXT
            }}
          >
            {diff.label}
          </button>
        ))}
      </div>
      
      <div className="pt-12 opacity-80 italic text-[14px] serif text-center" style={{ color: PALETTE.PRIMARY_TEXT }}>
        "Vision is the art of seeing what is invisible to others."
      </div>
    </div>
  );

  const renderGameScreen = () => (
    <div className="flex flex-col items-center w-full max-w-7xl px-4 animate-in fade-in duration-700 pb-10 pt-4 lg:pt-8">
      {/* HUD Dashboard */}
      <div className="w-full max-w-[1000px] mb-4 lg:mb-8 select-none">
        <div className="glass-panel p-4 lg:p-6 rounded-2xl shadow-xl flex items-center justify-between border-white/50">
          <div className="flex items-center space-x-6 lg:space-x-10">
            <div className="flex flex-col">
              <span className="text-[10px] font-black tracking-widest uppercase mb-1 opacity-40">Score</span>
              <span className="text-2xl lg:text-3xl font-black tracking-tighter tabular-nums leading-none">{state.score.toString().padStart(4, '0')}</span>
            </div>
            <div className="flex flex-col border-l border-black/10 pl-6 lg:pl-10">
              <span className="text-[10px] font-black tracking-widest uppercase mb-1 opacity-40">Time</span>
              <span className="text-2xl lg:text-3xl font-black tracking-tighter tabular-nums leading-none" style={{ color: state.timeLeft < 15 ? '#b91c1c' : PALETTE.PRIMARY_TEXT }}>
                {Math.floor(state.timeLeft / 60)}:{(state.timeLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4 lg:space-x-6">
            <div className="hidden sm:flex flex-col items-end pr-6 border-r border-black/10">
              <span className="text-[9px] font-black tracking-widest uppercase mb-2 opacity-40">Strikes</span>
              <div className="flex space-x-1.5">
                {Array.from({ length: MAX_STRIKES }).map((_, i) => (
                  <div 
                    key={i} 
                    className="w-4 lg:w-5 h-1.5 transition-all duration-500 rounded-sm"
                    style={{ 
                      backgroundColor: i < state.strikes ? '#b91c1c' : `${PALETTE.PRIMARY_TEXT}10`,
                      boxShadow: i < state.strikes ? '0 0 8px rgba(185, 28, 28, 0.4)' : 'none'
                    }} 
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button 
                onClick={togglePause} 
                disabled={state.phase !== 'PLAYING'}
                className="p-2 lg:p-2.5 bg-white/40 hover:bg-white/80 rounded-full transition-all active:scale-95 disabled:opacity-20 shadow-sm border border-white/40"
                style={{ color: PALETTE.PRIMARY_TEXT }}
              >
                {isPaused ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                )}
              </button>
              
              <button 
                onClick={toggleMute}
                className="p-2 lg:p-2.5 bg-white/40 hover:bg-white/80 rounded-full transition-all active:scale-95 shadow-sm border border-white/40"
                style={{ color: PALETTE.PRIMARY_TEXT }}
              >
                {isMuted ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  </svg>
                )}
              </button>

              <button 
                onClick={toggleFullscreen}
                className="p-2 lg:p-2.5 bg-white/40 hover:bg-white/80 rounded-full transition-all active:scale-95 shadow-sm border border-white/40"
                style={{ color: PALETTE.PRIMARY_TEXT }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Responsive Game Area */}
      <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-6 lg:gap-12 w-full max-w-[1100px]">
        {/* Left: Board Section */}
        <div className="relative order-1">
          <ChessBoard 
            pieces={state.pieces} 
            targetSquare={isPaused ? null : state.targetSquare} 
            lastMoveLine={isPaused ? null : state.lastMoveLine} 
          />
          
          {/* Overlays (Snapshots & Pause) */}
          {state.phase === 'OBSERVING' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
               <div className="glass-panel px-8 py-4 rounded-full shadow-2xl animate-in zoom-in duration-300">
                  <span className="serif italic text-xl lg:text-2xl tracking-wide">Observe and Memorize</span>
               </div>
            </div>
          )}

          {isPaused && (
            <div className="absolute inset-0 glass-panel z-40 flex flex-col items-center justify-center space-y-6 lg:space-y-8 animate-in fade-in duration-300 rounded-sm">
              <h2 className="serif italic text-3xl lg:text-4xl tracking-wide">Session Paused</h2>
              <div className="flex flex-col space-y-3 lg:space-y-4 w-56 lg:w-64">
                <button 
                  onClick={togglePause}
                  className="button-premium py-3 lg:py-4 px-6 font-bold uppercase tracking-[0.2em] text-[10px] rounded-sm shadow-xl"
                  style={{ backgroundColor: PALETTE.PRIMARY_TEXT, color: '#FFF' }}
                >
                  Resume Analysis
                </button>
                <button 
                  onClick={restartCurrentDrill}
                  className="button-premium py-3 lg:py-4 px-6 font-bold uppercase tracking-[0.2em] text-[10px] rounded-sm bg-white border border-black/10 shadow-lg"
                  style={{ color: PALETTE.PRIMARY_TEXT }}
                >
                  Restart Drill
                </button>
                <button 
                  onClick={goHome}
                  className="button-premium py-3 lg:py-4 px-6 font-bold uppercase tracking-[0.2em] text-[10px] rounded-sm bg-white border border-black/10 shadow-lg"
                  style={{ color: PALETTE.PRIMARY_TEXT }}
                >
                  Exit to Hub
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Piece Selection UI */}
        <div className="flex flex-col items-center lg:items-start w-full lg:w-auto order-2">
          <div 
            className="flex flex-row lg:flex-col justify-center gap-3 lg:gap-6 w-full lg:w-40 p-4 lg:p-6 glass-panel rounded-xl lg:rounded-2xl shadow-2xl transition-all"
            style={{ opacity: (state.phase !== 'PLAYING' || isPaused) ? 0.3 : 1 }}
          >
            {(['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'] as PieceType[]).map((type) => {
              const isUsedInSession = state.pieces.some(p => p.type === type);
              const isDisabled = disabledOptions.includes(type) || isPaused;
              const isPulsing = pulsingPiece === type;
              const feedback = moveFeedback?.type === type ? moveFeedback : null;

              if (!isUsedInSession) return null;

              return (
                <button
                  key={type}
                  onClick={() => handlePieceSelect(type)}
                  disabled={isDisabled}
                  className={`relative w-20 h-24 lg:w-28 lg:h-32 p-3 lg:p-4 transition-all active:scale-95 flex flex-col items-center justify-between rounded-xl group ${isPulsing ? 'animate-subtle-pulse' : ''}`}
                  style={{ 
                    backgroundColor: PALETTE.SECONDARY_BG,
                    border: `1px solid ${isPulsing ? '#b91c1c' : 'rgba(85, 30, 25, 0.1)'}`,
                    opacity: (isDisabled && !feedback && !isPulsing) ? 0.4 : 1,
                    boxShadow: '0 8px 16px -4px rgba(85, 30, 25, 0.05)'
                  }}
                >
                  {feedback && (
                    <div className={`absolute inset-0 flex items-center justify-center z-20 rounded-xl bg-white/70 backdrop-blur-md animate-in fade-in duration-300`}>
                      {feedback.status === 'correct' ? (
                        <div className="text-green-600 font-black text-[8px] lg:text-[10px] tracking-widest uppercase text-center">CORRECT</div>
                      ) : (
                        <div className="text-red-600 font-black text-[8px] lg:text-[10px] tracking-widest uppercase text-center">FAILED</div>
                      )}
                    </div>
                  )}

                  <div className="w-full h-12 lg:h-16 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <div className="w-10 h-10 lg:w-14 lg:h-14">
                      {PIECE_ICONS['WHITE'][type]}
                    </div>
                  </div>
                  <span className="text-[8px] lg:text-[10px] font-black uppercase tracking-widest pt-1.5 border-t border-black/5 w-full text-center opacity-40">{type}</span>
                </button>
              );
            })}
          </div>
          
          <div 
            className="mt-6 lg:mt-8 text-[10px] lg:text-[11px] font-black uppercase tracking-[0.3em] lg:tracking-[0.4em] text-center lg:text-left serif italic transition-opacity w-full max-w-[200px]"
            style={{ opacity: state.phase === 'OBSERVING' ? 1 : 0.4 }}
          >
            {state.phase === 'OBSERVING' ? 'Mental Snapshot Phase' : isPaused ? 'Analysis Suspended' : 'Select reachable asset'}
          </div>
        </div>
      </div>
    </div>
  );

  const renderGameOver = () => {
    const grade = calculateGrade();
    return (
      <div className="flex flex-col items-center justify-center min-h-[90vh] py-12 px-6 space-y-10 animate-in fade-in zoom-in duration-1000 max-w-3xl text-center">
        <div className="space-y-4">
          <h2 className="text-4xl lg:text-5xl serif italic tracking-wide">Analysis Complete</h2>
          <div className="h-[1px] w-32 mx-auto bg-black opacity-10" />
        </div>

        <div className="flex flex-col items-center space-y-6">
          <div 
            className="w-32 h-32 lg:w-40 lg:h-40 rounded-full border-[10px] lg:border-[12px] flex items-center justify-center text-6xl lg:text-7xl font-black shadow-2xl animate-bounce-subtle bg-white relative"
            style={{ borderColor: PALETTE.PRIMARY_TEXT }}
          >
            <div className="absolute -inset-4 border border-black/5 rounded-full" />
            {grade.rank}
          </div>
          <div className="space-y-3">
            <p className="uppercase tracking-[0.5em] text-[13px] lg:text-[15px] font-black opacity-80">{grade.label}</p>
            <p className="text-xs lg:text-sm max-w-md mx-auto leading-relaxed serif italic opacity-60">{grade.desc}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 w-full max-w-lg pt-4">
          <div className="flex flex-col items-center justify-center space-y-1">
            <span className="uppercase tracking-[0.2em] text-[10px] font-black opacity-30">Correct Moves</span>
            <span className="text-4xl lg:text-5xl font-black tracking-tighter tabular-nums">{state.correctMoves}</span>
          </div>
          <div className="flex flex-col items-center justify-center space-y-1 border-l border-black/10">
            <span className="uppercase tracking-[0.2em] text-[10px] font-black opacity-30">Peak Streak</span>
            <span className="text-4xl lg:text-5xl font-black tracking-tighter tabular-nums" style={{ color: PALETTE.BOARD_LIGHT }}>{state.bestStreak}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-6 lg:space-x-8 pt-8">
          <button 
            onClick={restartCurrentDrill}
            className="button-premium border py-4 lg:py-5 px-10 lg:px-14 text-[10px] lg:text-[11px] font-black uppercase tracking-[0.3em] transition-all bg-white shadow-lg rounded-sm"
            style={{ borderColor: `${PALETTE.PRIMARY_TEXT}20` }}
          >
            Repeat Drill
          </button>
          <button 
            onClick={goHome}
            className="button-premium py-4 lg:py-5 px-10 lg:px-14 text-[10px] lg:text-[11px] font-black uppercase tracking-[0.3em] transition-all shadow-2xl rounded-sm"
            style={{ backgroundColor: PALETTE.PRIMARY_TEXT, color: PALETTE.SECONDARY_BG }}
          >
            Hub Dashboard
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center overflow-x-hidden">
      {/* Background Decorative Elements */}
      <div className="fixed -top-32 -right-32 w-96 h-96 rounded-full opacity-[0.03] pointer-events-none" style={{ backgroundColor: PALETTE.PRIMARY_TEXT }} />
      <div className="fixed -bottom-32 -left-32 w-96 h-96 rounded-full opacity-[0.03] pointer-events-none" style={{ backgroundColor: PALETTE.PRIMARY_TEXT }} />
      
      <main className="relative z-20 w-full h-full flex flex-col items-center flex-grow">
        {state.phase === 'START' && renderStartScreen()}
        {(state.phase === 'OBSERVING' || state.phase === 'PLAYING') && renderGameScreen()}
        {state.phase === 'GAMEOVER' && renderGameOver()}
      </main>

      {/* Aesthetic Footer Brand */}
      <div className="fixed bottom-10 left-10 flex flex-col opacity-10 pointer-events-none hidden xl:flex">
        <div className="text-[14px] oleo tracking-widest">MindBoard</div>
        <div className="text-[9px] font-black uppercase tracking-[1.2em]">Blindfold Chess Trainer</div>
      </div>
    </div>
  );
};

export default App;
