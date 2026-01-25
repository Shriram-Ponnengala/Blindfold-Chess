
import React from 'react';
import { Piece } from '../types';
import { PALETTE, PIECE_ICONS } from '../constants';

interface ChessBoardProps {
  pieces: Piece[];
  targetSquare: number | null;
  lastMoveLine: [number, number] | null;
}

const ChessBoard: React.FC<ChessBoardProps> = ({ pieces, targetSquare, lastMoveLine }) => {
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  const getSquareColor = (idx: number) => {
    const row = Math.floor(idx / 8);
    const col = idx % 8;
    return (row + col) % 2 === 0 ? PALETTE.BOARD_LIGHT : PALETTE.BOARD_DARK;
  };

  const getCoordinatesForLine = (idx: number) => {
    const row = Math.floor(idx / 8);
    const col = idx % 8;
    return {
      x: col * 12.5 + 6.25,
      y: row * 12.5 + 6.25,
    };
  };

  return (
    <div 
      className="relative flex flex-col rounded-sm overflow-hidden max-h-[75vh]"
      style={{ 
        backgroundColor: PALETTE.BOARD_DARK,
        boxShadow: '0 25px 50px -12px rgba(85, 30, 25, 0.4), 0 10px 15px -8px rgba(0, 0, 0, 0.2)'
      }}
    >
      {/* Top Files Gutter */}
      <div className="flex w-full h-5 sm:h-7 pl-5 sm:pl-7 pr-5 sm:pr-7" style={{ backgroundColor: PALETTE.BOARD_DARK }}>
        {files.map(f => (
          <div key={`top-${f}`} className="flex-1 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white/30 antialiased select-none uppercase">{f}</span>
          </div>
        ))}
      </div>

      <div className="flex h-full">
        {/* Left Ranks Gutter */}
        <div className="flex flex-col w-5 sm:w-7 h-[320px] sm:h-[400px] md:h-[500px] lg:h-[540px]" style={{ backgroundColor: PALETTE.BOARD_DARK }}>
          {ranks.map(r => (
            <div key={`left-${r}`} className="flex-1 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white/50 antialiased select-none">{r}</span>
            </div>
          ))}
        </div>

        {/* Chessboard Area */}
        <div 
          className="relative aspect-square w-[320px] sm:w-[400px] md:w-[500px] lg:w-[540px] border border-black/20 overflow-hidden select-none"
        >
          {/* 8x8 Chessboard */}
          <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
            {Array.from({ length: 64 }).map((_, i) => (
              <div
                key={i}
                style={{ backgroundColor: getSquareColor(i) }}
                className="relative flex items-center justify-center transition-colors duration-200"
              >
                {/* Highlighted Target Square */}
                {targetSquare === i && (
                  <div 
                    className="absolute inset-0 bg-white/10 border-[4px] pointer-events-none z-10 animate-pulse-slow" 
                    style={{ borderColor: 'rgba(255, 255, 255, 0.6)' }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Pieces Layer */}
          <div className="absolute inset-0 grid grid-cols-8 grid-rows-8 pointer-events-none">
            {Array.from({ length: 64 }).map((_, i) => {
              const piece = pieces.find((p) => p.square === i);
              return (
                <div key={i} className="flex items-center justify-center p-0.5">
                  {piece && piece.isVisible && (
                    <div className="w-[90%] h-[90%] flex items-center justify-center animate-in fade-in zoom-in duration-300">
                      {PIECE_ICONS[piece.color][piece.type]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Move Line Layer with Fading Arrow */}
          {lastMoveLine && (
            <svg key={`${lastMoveLine[0]}-${lastMoveLine[1]}`} className="absolute inset-0 w-full h-full pointer-events-none z-20" viewBox="0 0 100 100">
              <defs>
                <marker id="arrowhead" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
                  <polygon points="0 0, 4 2, 0 4" fill="white" opacity="0.8" />
                </marker>
              </defs>
              <line
                x1={getCoordinatesForLine(lastMoveLine[0]).x}
                y1={getCoordinatesForLine(lastMoveLine[0]).y}
                x2={getCoordinatesForLine(lastMoveLine[1]).x}
                y2={getCoordinatesForLine(lastMoveLine[1]).y}
                stroke="white"
                strokeWidth="1.2"
                strokeLinecap="round"
                markerEnd="url(#arrowhead)"
                className="animate-line-fade"
                style={{ strokeDasharray: '0.5, 2' }}
              />
            </svg>
          )}
        </div>

        {/* Right Ranks Gutter */}
        <div className="flex flex-col w-5 sm:w-7 h-[320px] sm:h-[400px] md:h-[500px] lg:h-[540px]" style={{ backgroundColor: PALETTE.BOARD_DARK }}>
          {ranks.map(r => (
            <div key={`right-${r}`} className="flex-1 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white/30 antialiased select-none">{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Files Gutter */}
      <div className="flex w-full h-5 sm:h-7 pl-5 sm:pl-7 pr-5 sm:pr-7" style={{ backgroundColor: PALETTE.BOARD_DARK }}>
        {files.map(f => (
          <div key={`bottom-${f}`} className="flex-1 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white/50 antialiased select-none uppercase">{f}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChessBoard;
