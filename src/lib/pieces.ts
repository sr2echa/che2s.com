// Piece sets live in /public/pieces/<id>/{w,b}{K,Q,R,B,N,P}.svg. Credits in public/pieces/CREDITS.md.
export const PIECE_SETS = [
  { id: 'cburnett', name: 'Classic', by: 'Colin M.L. Burnett' },
  { id: 'papercut', name: 'Papercut', by: 'Nikolay Anzarov' },
  { id: 'spatial', name: 'Spatial', by: 'Maurizio Monge' },
  { id: 'kiwen-suwi', name: 'Kiwen', by: 'neverRare' },
  { id: 'chessnut', name: 'Chessnut', by: 'Alexis Luengas' },
] as const;

const CODES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];

/** CSS custom properties consumed by the `[data-pieces] piece.*` rules in global.css. */
export const pieceVars = (set: string) => Object.fromEntries(CODES.map((c) => [`--${c}`, `url(/pieces/${set}/${c}.svg)`]));
