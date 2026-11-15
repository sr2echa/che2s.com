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

export const BOARD_THEMES = [
  { id: 'steel', name: 'Steel', light: '#e2e4e6', dark: '#9ba3ab' },
  { id: 'graphite', name: 'Graphite', light: '#c9ccd1', dark: '#6d737c' },
  { id: 'sage', name: 'Sage', light: '#e4e9dc', dark: '#8ea488' },
  { id: 'ice', name: 'Ice', light: '#e7eef6', dark: '#90a9c4' },
  { id: 'sand', name: 'Sand', light: '#ede4d3', dark: '#b6a284' },
] as const;

export const boardVars = (id: string): Record<string, string> => {
  const t = BOARD_THEMES.find((x) => x.id === id) ?? BOARD_THEMES[0];
  return { '--sq-light': t.light, '--sq-dark': t.dark };
};
