
import { PieceType } from '../types';

/**
 * Generates legal moves for a piece at a given square, considering blockers.
 * @param square The square the piece is currently on (0-63).
 * @param type The type of the piece.
 * @param blockers Array of square indices (0-63) that are occupied by other pieces.
 */
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

  // Helper for sliding pieces
  const addSlidingMoves = (directions: [number, number][]) => {
    directions.forEach(([dr, dc]) => {
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const targetSquare = r * 8 + c;
        moves.push(targetSquare);
        // If there's a blocker, stop sliding
        if (blockers.includes(targetSquare)) {
          break;
        }
        r += dr;
        c += dc;
      }
    });
  };

  switch (type) {
    case 'KNIGHT': {
      const knightOffsets: [number, number][] = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      knightOffsets.forEach(([dr, dc]) => {
        const target = addIfOnBoard(row + dr, col + dc);
        if (target !== null) moves.push(target);
      });
      break;
    }
    case 'ROOK': {
      addSlidingMoves([[-1, 0], [1, 0], [0, -1], [0, 1]]);
      break;
    }
    case 'BISHOP': {
      addSlidingMoves([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
      break;
    }
    case 'QUEEN': {
      addSlidingMoves([
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-1, -1], [-1, 1], [1, -1], [1, 1]
      ]);
      break;
    }
    case 'KING': {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const target = addIfOnBoard(row + dr, col + dc);
          if (target !== null) moves.push(target);
        }
      }
      break;
    }
  }

  return [...new Set(moves)];
}

/**
 * Checks if a piece can reach a target square from its current position.
 */
export function canPieceReach(from: number, to: number, type: PieceType, pieces: { square: number }[]): boolean {
  // Extract blocker positions excluding the moving piece itself
  const blockers = pieces
    .map(p => p.square)
    .filter(sq => sq !== from);
    
  return getLegalMoves(from, type, blockers).includes(to);
}

export function getRandomSquare(exclude: number[] = []): number {
  let sq;
  do {
    sq = Math.floor(Math.random() * 64);
  } while (exclude.includes(sq));
  return sq;
}
