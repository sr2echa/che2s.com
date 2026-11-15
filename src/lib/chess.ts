// Thin helpers over chessops. All moves cross module boundaries as standard UCI strings (castling = e1g1).
import { Chess, castlingSide } from 'chessops/chess';
import { parseFen, makeFen, INITIAL_FEN } from 'chessops/fen';
import { parseUci, makeSquare, parseSquare } from 'chessops/util';
import { makeSan } from 'chessops/san';
import type { Move, NormalMove, Role, Square } from 'chessops/types';

export { INITIAL_FEN, makeSquare, parseSquare };
export type { Role, Square };

export const VALUE: Record<Role, number> = { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 0 };
const PROMO: Role[] = ['queen', 'knight', 'rook', 'bishop'];
const ROLE_CHAR: Record<Role, string> = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };

export const fromFen = (fen: string): Chess => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
export const toFen = (pos: Chess): string => makeFen(pos.toSetup());
export const isValidFen = (fen: string) => parseFen(fen).isOk && Chess.fromSetup(parseFen(fen).unwrap()).isOk;

export function stdUci(pos: Chess, m: NormalMove): string {
  let to = m.to;
  if (castlingSide(pos, m)) to = castlingSide(pos, m) === 'h' ? m.from + 2 : m.from - 2;
  return makeSquare(m.from) + makeSquare(to) + (m.promotion ? ROLE_CHAR[m.promotion] : '');
}

/** Every legal move as standard UCI. */
export function legalMoves(pos: Chess): string[] {
  const out = new Set<string>();
  for (const [from, dests] of pos.allDests()) {
    const piece = pos.board.get(from)!;
    for (const to of dests) {
      const rank = to >> 3;
      if (piece.role === 'pawn' && (rank === 0 || rank === 7)) {
        for (const r of PROMO) out.add(stdUci(pos, { from, to, promotion: r }));
      } else out.add(stdUci(pos, { from, to }));
    }
  }
  return [...out];
}

export const uciMove = (uci: string) => parseUci(uci) as NormalMove;

/** Plays a UCI move in place. Returns SAN, or null if illegal. */
export function play(pos: Chess, uci: string): string | null {
  const m = parseUci(uci) as Move | undefined;
  if (!m || !pos.isLegal(m)) return null;
  const san = makeSan(pos, m);
  pos.play(m);
  return san;
}

export const after = (fen: string, uci: string) => {
  const p = fromFen(fen);
  play(p, uci);
  return toFen(p);
};

export const sanOf = (fen: string, uci: string) => {
  const m = parseUci(uci);
  return m ? makeSan(fromFen(fen), m) : uci;
};

/** White-POV win probability (0-100) from a white-POV score. Lichess curve. */
/** SAN for the first `n` moves of a UCI line. */
export function pvSan(fen: string, pv: string[], n = 7) {
  const pos = fromFen(fen);
  const out: string[] = [];
  for (const u of pv.slice(0, n)) {
    const san = play(pos, u);
    if (!san) break;
    out.push(san);
  }
  return out.join(' ');
}

export function winPct(score: Score): number {
  // {mate: 0} = delivered mate; cp carries the sign of the winner (White POV).
  if (score.mate !== undefined) return score.mate > 0 ? 100 : score.mate < 0 ? 0 : 50 + Math.sign(score.cp ?? 0) * 50;
  const cp = Math.max(-1000, Math.min(1000, score.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export type Score = { cp?: number; mate?: number };

export const fmtScore = (s: Score, digits = 1) =>
  s.mate !== undefined ? (s.mate === 0 ? '#' : `${s.mate > 0 ? '' : '-'}M${Math.abs(s.mate)}`) : `${(s.cp ?? 0) > 0 ? '+' : ''}${((s.cp ?? 0) / 100).toFixed(digits)}`;

/** Plain-language read of a White-POV score. */
export function describeScore(s: Score): string {
  if (s.mate === 0) return (s.cp ?? 0) === 0 ? 'Drawn.' : `Checkmate. ${(s.cp ?? 0) > 0 ? 'White' : 'Black'} wins.`;
  if (s.mate) return `${s.mate > 0 ? 'White' : 'Black'} has mate in ${Math.abs(s.mate)}.`;
  const cp = s.cp ?? 0, side = cp > 0 ? 'White' : 'Black', a = Math.abs(cp);
  if (a < 25) return 'The position is equal.';
  if (a < 75) return `${side} is slightly better.`;
  if (a < 175) return `${side} is better.`;
  if (a < 400) return `${side} is clearly better.`;
  return `${side} is winning.`;
}

/** Collapse a score to a sortable number (mate dominates). */
export const scoreNum = (s: Score) => (s.mate !== undefined ? Math.sign(s.mate || -1) * (100000 - Math.abs(s.mate) * 100) : s.cp ?? 0);

export const negate = (s: Score): Score => (s.mate !== undefined ? { mate: -s.mate } : { cp: -(s.cp ?? 0) });

export function material(pos: Chess, color: 'white' | 'black') {
  let v = 0;
  for (const sq of pos.board[color]) v += VALUE[pos.board.getRole(sq)!];
  return v;
}

export type Outcome = { winner?: 'white' | 'black'; reason: string } | null;

export function outcomeOf(pos: Chess, fens: string[]): Outcome {
  if (pos.isCheckmate()) return { winner: pos.turn === 'white' ? 'black' : 'white', reason: 'Checkmate' };
  if (pos.isStalemate()) return { reason: 'Stalemate' };
  if (pos.isInsufficientMaterial()) return { reason: 'Insufficient material' };
  if (pos.halfmoves >= 100) return { reason: 'Fifty-move rule' };
  const key = (f: string) => f.split(' ').slice(0, 4).join(' ');
  const cur = key(toFen(pos));
  if (fens.filter((f) => key(f) === cur).length >= 3) return { reason: 'Threefold repetition' };
  return null;
}

const START_COUNT: Record<Role, number> = { pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1, king: 1 };
const POINTS: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
const CAP_ORDER: Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];

/** Pieces each side has taken (vs a full set) and White's material lead in points. */
export function captures(fen: string) {
  const pos = fromFen(fen);
  const taken = { white: [] as Role[], black: [] as Role[] };
  let diff = 0;
  for (const role of CAP_ORDER) {
    const w = pos.board.pieces('white', role).size(), b = pos.board.pieces('black', role).size();
    diff += (w - b) * POINTS[role];
    for (let i = b; i < START_COUNT[role]; i++) taken.white.push(role);
    for (let i = w; i < START_COUNT[role]; i++) taken.black.push(role);
  }
  return { taken, diff };
}
