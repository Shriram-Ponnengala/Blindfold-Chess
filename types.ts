
export type PieceType = 'QUEEN' | 'ROOK' | 'BISHOP' | 'KNIGHT' | 'KING' | 'PAWN';
export type PieceColor = 'WHITE' | 'BLACK';

export interface Piece {
  id: string;
  type: PieceType;
  color: PieceColor;
  square: number; // 0-63
  isVisible: boolean;
}

export type GamePhase = 'START' | 'OBSERVING' | 'PLAYING' | 'GAMEOVER';

export enum Difficulty {
  EASY = 'EASY',
  INTERMEDIATE = 'INTERMEDIATE',
  HARD = 'HARD'
}

export interface GameState {
  phase: GamePhase;
  difficulty: Difficulty;
  pieces: Piece[];
  targetSquare: number | null;
  score: number;
  strikes: number;
  timeLeft: number;
  lastMoveLine: [number, number] | null; // From square, To square
  correctMoves: number;
  currentStreak: number;
  bestStreak: number;
  moveHistory: string[];
}
