
import { PieceType, Piece, Difficulty } from '../types';

export function getLegalMoves(square: number, type: PieceType, blockers: number[] = []): number[] {
  const row = Math.floor(square / 8);
  const col = square % 8;
  const moves: number[] = [];

  const addIfOnBoard = (r: number, c: number) => {
    if (r >= 0 && r < 8 && c >= 0 && c < 8) {
      return r * 8 + c;
    }
    return null;
  };

  const addSlidingMoves = (directions: [number, number][]) => {
    directions.forEach(([dr, dc]) => {
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const targetSquare = r * 8 + c;
        moves.push(targetSquare);
        if (blockers.includes(targetSquare)) break;
        r += dr;
        c += dc;
      }
    });
  };

  switch (type) {
    case 'KNIGHT': {
      const knightOffsets: [number, number][] = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      knightOffsets.forEach(([dr, dc]) => {
        const target = addIfOnBoard(row + dr, col + dc);
        if (target !== null) moves.push(target);
      });
      break;
    }
    case 'ROOK':
      addSlidingMoves([[-1, 0], [1, 0], [0, -1], [0, 1]]);
      break;
    case 'BISHOP':
      addSlidingMoves([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
      break;
    case 'QUEEN':
      addSlidingMoves([[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]);
      break;
    case 'KING':
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const target = addIfOnBoard(row + dr, col + dc);
          if (target !== null) moves.push(target);
        }
      }
      break;
  }
  return [...new Set(moves)];
}

export function canPieceReach(from: number, to: number, type: PieceType, pieces: { square: number }[]): boolean {
  const blockers = pieces.map(p => p.square).filter(sq => sq !== from);
  return getLegalMoves(from, type, blockers).includes(to);
}

export function getRandomSquare(exclude: number[] = []): number {
  let sq;
  do {
    sq = Math.floor(Math.random() * 64);
  } while (exclude.includes(sq));
  return sq;
}

/**
 * For every empty square, list the pieces that can legally move there.
 */
function reachersBySquare(pieces: Piece[]): Map<number, Piece[]> {
  const occupied = new Set(pieces.map(p => p.square));
  const map = new Map<number, Piece[]>();
  pieces.forEach(p => {
    const blockers = pieces.map(b => b.square).filter(sq => sq !== p.square);
    getLegalMoves(p.square, p.type, blockers).forEach(m => {
      if (occupied.has(m)) return; // targets are always empty squares
      const list = map.get(m) || [];
      list.push(p);
      map.set(m, list);
    });
  });
  return map;
}

/**
 * A "confuser" is a piece that sits close to the target (within 2 squares)
 * but cannot move there, so it looks like a plausible answer.
 */
function countConfusers(target: number, answer: Piece, pieces: Piece[]): number {
  const tr = Math.floor(target / 8);
  const tc = target % 8;
  return pieces.filter(p => {
    if (p.id === answer.id || p.type === answer.type) return false;
    const pr = Math.floor(p.square / 8);
    const pc = p.square % 8;
    return Math.max(Math.abs(pr - tr), Math.abs(pc - tc)) <= 2;
  }).length;
}

/**
 * Pick the next target square. The returned square is ALWAYS empty and
 * reachable by EXACTLY ONE piece, so there is exactly one right answer.
 * Returns -1 only when no such square exists (the caller must then
 * set up a fresh position).
 *
 * Among valid squares it prefers ones with nearby confusers (more on
 * harder levels) and pieces that haven't been the answer recently.
 */
export function findValidTarget(pieces: Piece[], difficulty: Difficulty, history: string[] = []): number {
  const candidates = Array.from(reachersBySquare(pieces).entries())
    .filter(([, reachers]) => reachers.length === 1)
    .map(([sq, reachers]) => ({ sq, answer: reachers[0] }));

  if (candidates.length === 0) return -1;

  const wantConfusers = difficulty === Difficulty.EASY ? 0 : difficulty === Difficulty.INTERMEDIATE ? 1 : 2;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];

  const weighted = candidates.map(c => {
    let w = 1;
    const confusers = countConfusers(c.sq, c.answer, pieces);
    if (confusers >= wantConfusers) w *= 3;
    // Rotate answers: avoid the same piece over and over
    const recent = history.filter(id => id === c.answer.id).length;
    w *= Math.max(0.15, 1 - recent * 0.25);
    if (last === c.answer.id) w *= 0.3;
    if (last === c.answer.id && prev === c.answer.id) w *= 0.1;
    return { ...c, w };
  });

  const total = weighted.reduce((sum, c) => sum + c.w, 0);
  let r = Math.random() * total;
  for (const c of weighted) {
    if (r < c.w) return c.sq;
    r -= c.w;
  }
  return weighted[weighted.length - 1].sq;
}

/** True when the square has exactly one piece that can reach it. */
export function hasUniqueAnswer(target: number, pieces: Piece[]): boolean {
  if (target < 0 || target > 63 || pieces.some(p => p.square === target)) return false;
  return pieces.filter(p => canPieceReach(p.square, target, p.type, pieces)).length === 1;
}

export function generatePosition(difficulty: Difficulty): { pieces: Piece[], targetSquare: number } | null {
  const PIECES_LIST: PieceType[] = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'];
  
  const getPieceTypes = (level: Difficulty): PieceType[] => {
    const shuffle = (arr: PieceType[]) => [...arr].sort(() => Math.random() - 0.5);
    if (level === Difficulty.EASY) return shuffle([...PIECES_LIST]).slice(0, 3);
    if (level === Difficulty.INTERMEDIATE) return shuffle([...PIECES_LIST]).slice(0, 4);
    const double = Math.random() < 0.5 ? 'KNIGHT' : 'BISHOP';
    const rest = PIECES_LIST.filter(t => t !== double);
    return shuffle([double, double, ...rest]);
  };

  let attempts = 0;
  while (attempts++ < 300) {
    const pickedTypes = getPieceTypes(difficulty);
    const pieces: Piece[] = [];
    const usedSquares: number[] = [];
    let ok = true;

    for (let i = 0; i < pickedTypes.length; i++) {
      const type = pickedTypes[i];
      let placed = false;
      for (let t = 0; t < 20; t++) {
        const sq = Math.floor(Math.random() * 64);
        if (usedSquares.includes(sq)) continue;
        
        if (type === 'BISHOP') {
          const row = Math.floor(sq / 8);
          const col = sq % 8;
          const color = (row + col) % 2;
          if (pieces.some(p => p.type === 'BISHOP' && (Math.floor(p.square / 8) + (p.square % 8)) % 2 === color)) {
            continue;
          }
        }

        usedSquares.push(sq);
        pieces.push({ id: `p-${i}`, type, color: 'WHITE', square: sq, isVisible: true });
        placed = true;
        break;
      }
      if (!placed) { ok = false; break; }
    }
    if (!ok) continue;

    const target = findValidTarget(pieces, difficulty);
    if (target !== -1) {
      return { pieces, targetSquare: target };
    }
  }
  return null;
}

export function squareToNotation(square: number): string {
  if (square < 0 || square > 63) return '';
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const file = files[square % 8];
  const rank = 8 - Math.floor(square / 8);
  return `${file}${rank}`;
}
