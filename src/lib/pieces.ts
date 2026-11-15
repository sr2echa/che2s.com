// Piece sets live in /public/pieces/<id>/{w,b}{K,Q,R,B,N,P}.svg. Credits in public/pieces/CREDITS.md.
export const PIECE_SETS = [
  { id: 'papercut', name: 'Papercut' },
  { id: 'spatial', name: 'Spatial' },
  { id: 'kiwen-suwi', name: 'Kiwen' },
  { id: 'chessnut', name: 'Chessnut' },
  { id: 'cburnett', name: 'Classic' },
] as const;

const CODES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];

/** CSS custom properties consumed by the `[data-pieces] piece.*` rules in global.css. */
export const pieceVars = (set: string) => Object.fromEntries(CODES.map((c) => [`--${c}`, `url(/pieces/${set}/${c}.svg)`]));
