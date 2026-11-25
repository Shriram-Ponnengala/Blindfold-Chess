import React from 'react';
import { Piece } from '../types';
import { BOARD_THEME, PIECE_ICONS } from '../constants';

interface ChessBoardProps {
  pieces: Piece[];
  targetSquare: number | null;
  lastMoveLine: [number, number] | null;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const isLight = (idx: number) => (Math.floor(idx / 8) + (idx % 8)) % 2 === 0;

const center = (idx: number) => ({
  x: (idx % 8) * 12.5 + 6.25,
  y: Math.floor(idx / 8) * 12.5 + 6.25,
});

const ChessBoard: React.FC<ChessBoardProps> = ({ pieces, targetSquare, lastMoveLine }) => {
  const arrow = (() => {
    if (!lastMoveLine) return null;
    const a = center(lastMoveLine[0]);
    const b = center(lastMoveLine[1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // Stop the shaft short so the head lands inside the target square.
    const trim = 4.5;
    return { x1: a.x, y1: a.y, x2: b.x - (dx / len) * trim, y2: b.y - (dy / len) * trim };
  })();

  return (
    <div
      className="relative p-[10px] sm:p-[15px] rounded-[6px]"
      style={{
        border: '1px solid color-mix(in srgb, #7d371d 35%, black)',
        // VCA Studio wood frame: faint grain over mahogany, lit from the top-left
        background: [
          'repeating-linear-gradient(100deg, rgb(255 255 255 / 0.035) 0 2px, transparent 2px 7px)',
          'repeating-linear-gradient(80deg, rgb(0 0 0 / 0.05) 0 1px, transparent 1px 11px)',
          `linear-gradient(135deg, color-mix(in srgb, ${BOARD_THEME.FRAME} 90%, white) 0%, color-mix(in srgb, ${BOARD_THEME.FRAME} 88%, black) 45%, ${BOARD_THEME.FRAME} 70%, color-mix(in srgb, ${BOARD_THEME.FRAME} 74%, black) 100%)`,
        ].join(', '),
        boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.18), inset 0 -1px 0 rgb(0 0 0 / 0.35), 0 1px 2px rgb(0 0 0 / 0.25), 0 18px 40px -20px rgb(0 0 0 / 0.35)',
      }}
    >
      <div
        className="board-size relative grid grid-cols-8 grid-rows-8 overflow-hidden select-none"
        style={{ boxShadow: '0 0 0 1px rgb(0 0 0 / 0.45)' }}
      >
        {Array.from({ length: 64 }).map((_, i) => {
          const light = isLight(i);
          const row = Math.floor(i / 8);
          const col = i % 8;
          const piece = pieces.find((p) => p.square === i);
          const isTarget = targetSquare === i;
          const isFrom = lastMoveLine?.[0] === i;
          const isTo = lastMoveLine?.[1] === i;
          const coordColor = light ? BOARD_THEME.COORD_LIGHT : BOARD_THEME.COORD_DARK;

          return (
            <div
              key={i}
              className="relative flex items-center justify-center"
              style={{ backgroundColor: light ? BOARD_THEME.LIGHT : BOARD_THEME.DARK }}
            >
              {/* Last move tint */}
              {(isFrom || isTo) && (
                <div
                  className="absolute inset-0 animate-move-tint"
                  style={{ backgroundColor: BOARD_THEME.LAST_MOVE }}
                />
              )}

              {/* Target square */}
              {isTarget && (
                <div className="absolute inset-0 z-10 pointer-events-none">
                  <div className="absolute inset-0" style={{ backgroundColor: BOARD_THEME.TARGET_FILL }} />
                  <div
                    className="absolute inset-[3px] sm:inset-[4px] rounded-[4px] animate-target-ring"
                    style={{ boxShadow: `inset 0 0 0 4px ${BOARD_THEME.TARGET}, 0 0 0 1px rgba(255,255,255,0.5)` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className="font-bold text-[11px] sm:text-sm md:text-base px-1.5 py-0.5 rounded-md leading-none"
                      style={{ color: '#fff', backgroundColor: BOARD_THEME.TARGET }}
                    >
                      {FILES[col]}
                      {RANKS[row]}
                    </span>
                  </div>
                </div>
              )}

              {/* Coordinates, lichess-style inside edge squares */}
              {col === 0 && (
                <span
                  className="absolute top-[2px] left-[3px] text-[10px] sm:text-[12px] font-bold leading-none pointer-events-none"
                  style={{ color: coordColor, opacity: 0.95 }}
                >
                  {RANKS[row]}
                </span>
              )}
              {row === 7 && (
                <span
                  className="absolute bottom-[2px] right-[4px] text-[10px] sm:text-[12px] font-bold leading-none pointer-events-none"
                  style={{ color: coordColor, opacity: 0.95 }}
                >
                  {FILES[col]}
                </span>
              )}

              {/* Piece */}
              {piece && (
                <div
                  className="relative z-20 w-[86%] h-[86%] transition-all duration-700 ease-out pointer-events-none"
                  style={{
                    opacity: piece.isVisible ? 1 : 0,
                    transform: piece.isVisible ? 'scale(1)' : 'scale(0.75)',
                    filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.28))',
                  }}
                >
                  {PIECE_ICONS[piece.color][piece.type]}
                </div>
              )}
            </div>
          );
        })}

        {/* Last move arrow */}
        {arrow && (
          <svg
            key={`${lastMoveLine![0]}-${lastMoveLine![1]}`}
            className="absolute inset-0 w-full h-full pointer-events-none z-30 animate-arrow-fade"
            viewBox="0 0 100 100"
          >
            <defs>
              <marker id="mb-arrowhead" markerWidth="3" markerHeight="3" refX="0.6" refY="1.5" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L3,1.5 L0,3 z" fill={BOARD_THEME.ARROW} />
              </marker>
            </defs>
            <line
              x1={arrow.x1}
              y1={arrow.y1}
              x2={arrow.x2}
              y2={arrow.y2}
              stroke={BOARD_THEME.ARROW}
              strokeWidth="2.2"
              strokeLinecap="round"
              markerEnd="url(#mb-arrowhead)"
            />
          </svg>
        )}
      </div>
    </div>
  );
};

export default ChessBoard;
