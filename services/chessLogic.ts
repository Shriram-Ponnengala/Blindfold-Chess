
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

export function findValidTarget(pieces: Piece[], difficulty: Difficulty): number {
  const usedSquares = pieces.map(p => p.square);
  
  // Try many random squares to find one that satisfies the "unique reachability" and "confuser" constraints
  for (let tt = 0; tt < 200; tt++) {
    const target = Math.floor(Math.random() * 64);
    if (usedSquares.includes(target)) continue;

    const reachable = pieces.filter(p => canPieceReach(p.square, target, p.type, pieces));
    if (reachable.length !== 1) continue;

    const tr = Math.floor(target / 8);
    const tc = target % 8;
    const confusers = pieces.filter(p => {
      if (reachable.includes(p)) return false;
      const pr = Math.floor(p.square / 8);
      const pc = p.square % 8;
      // Confusers: nearby (Manhattan distance <= 4) but can't legally reach
      return Math.abs(pr - tr) + Math.abs(pc - tc) <= 4;
    });

    const minConfusers = difficulty === Difficulty.EASY ? 1 : difficulty === Difficulty.INTERMEDIATE ? 1 : 2;
    if (confusers.length < minConfusers) continue;

    return target;
  }
  
  // Fallback: if no "perfect" target found, use a simpler reachability check
  const squareReachCounts = new Map<number, number>();
  pieces.forEach(p => {
    const blockers = pieces.map(b => b.square).filter(sq => sq !== p.square);
    const moves = getLegalMoves(p.square, p.type, blockers).filter(m => !usedSquares.includes(m));
    moves.forEach(m => {
      squareReachCounts.set(m, (squareReachCounts.get(m) || 0) + 1);
    });
  });

  const uniqueTargets = Array.from(squareReachCounts.entries())
    .filter(([_, count]) => count === 1)
    .map(([sq, _]) => sq);

  if (uniqueTargets.length > 0) {
    return uniqueTargets[Math.floor(Math.random() * uniqueTargets.length)];
  }

  return -1;
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

export function generateTargetSquare(pieces: Piece[], history: string[]): number {
  const pieceMoves = new Map<string, number[]>();
  const squareReachCounts = new Map<number, number>();
  const squareReacher = new Map<number, string>();

  // 1. Calculate all legal moves and reachability counts for the CURRENT board state
  pieces.forEach(p => {
    const blockers = pieces.map(b => b.square).filter(sq => sq !== p.square);
    const moves = getLegalMoves(p.square, p.type, blockers);
    // Target must be empty (no captures allowed in this drill mode)
    const validMoves = moves.filter(m => !pieces.some(occupied => occupied.square === m));
    
    pieceMoves.set(p.id, validMoves);
    
    validMoves.forEach(m => {
      const count = squareReachCounts.get(m) || 0;
      squareReachCounts.set(m, count + 1);
      if (count === 0) {
        squareReacher.set(m, p.id);
      }
    });
  });

  // 2. Identify unique targets (reachable by EXACTLY one piece)
  const uniqueTargets: number[] = [];
  for (const [sq, count] of squareReachCounts.entries()) {
    if (count === 1) {
      uniqueTargets.push(sq);
    }
  }

  // Fallback: if no unique targets exist, pick any valid target to prevent crash
  if (uniqueTargets.length === 0) {
    const allMoves: number[] = [];
    pieceMoves.forEach(moves => allMoves.push(...moves));
    if (allMoves.length === 0) return -1; // Stalemate / No moves possible
    return allMoves[Math.floor(Math.random() * allMoves.length)];
  }

  // 3. Weighting logic: Prefer moving pieces that haven't moved recently
  const pieceWeights = new Map<string, number>();
  pieces.forEach(p => {
    let weight = 1.0;
    const historyCount = history.filter(id => id === p.id).length;
    weight -= historyCount * 0.3; // Penalty for frequent moves
    
    // Strong penalty if it was the VERY last piece moved
    if (history.length > 0 && history[history.length - 1] === p.id) {
        weight -= 0.6;
    }
    
    // Max penalty if it moved twice in a row (prevent spamming same piece)
    if (history.length >= 2 && history[history.length - 1] === p.id && history[history.length - 2] === p.id) {
        weight = 0;
    }
    
    pieceWeights.set(p.id, Math.max(0, weight));
  });

  // 4. Select a target from uniqueTargets based on the weight of the piece that reaches it
  let totalPoolWeight = 0;
  const weightedPool = uniqueTargets.map(sq => {
    const pieceId = squareReacher.get(sq)!;
    const weight = pieceWeights.get(pieceId) || 0;
    totalPoolWeight += weight;
    return { sq, weight };
  });

  if (totalPoolWeight <= 0) {
    // If all weights are 0 (e.g. forced to move same piece), just pick random unique target
    return uniqueTargets[Math.floor(Math.random() * uniqueTargets.length)];
  }

  let random = Math.random() * totalPoolWeight;
  for (const item of weightedPool) {
    if (random < item.weight) return item.sq;
    random -= item.weight;
  }

  return weightedPool[0].sq;
}
