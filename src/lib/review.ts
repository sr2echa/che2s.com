// Game review: per-move classification in the style of chess.com, from Stockfish evaluations.
import { Stockfish, type Line } from './stockfish';
import { fromFen, after, negate, winPct, sanOf, VALUE, outcomeOf, legalMoves, type Score } from './chess';
import { attacks } from 'chessops/attacks';
import { parseSquare } from 'chessops/util';

export type Cls = 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'miss' | 'blunder' | 'forced';

export const CLS: Record<Cls, { label: string; glyph: string; color: string }> = {
  brilliant: { label: 'Brilliant', glyph: '!!', color: '#2fc6b3' },
  great: { label: 'Great', glyph: '!', color: '#6a9cf0' },
  best: { label: 'Best', glyph: '★', color: '#93c94b' },
  excellent: { label: 'Excellent', glyph: '✓', color: '#93c94b' },
  good: { label: 'Good', glyph: '✓', color: '#8fa585' },
  forced: { label: 'Forced', glyph: '→', color: '#8f8f8a' },
  inaccuracy: { label: 'Inaccuracy', glyph: '?!', color: '#e9c24b' },
  mistake: { label: 'Mistake', glyph: '?', color: '#f0913a' },
  miss: { label: 'Miss', glyph: '×', color: '#ef6a5a' },
  blunder: { label: 'Blunder', glyph: '??', color: '#e8473b' },
};

export interface MoveReview {
  ply: number;
  uci: string;
  san: string;
  cls: Cls;
  /** Win-% lost by the mover. */
  loss: number;
  /** White-POV score after the move. */
  after: Score;
  best: string;
  bestSan: string;
}

export interface Review {
  moves: MoveReview[];
  /** White-POV score of the start position. */
  start: Score;
  accuracy: { white: number; black: number };
  counts: { white: Partial<Record<Cls, number>>; black: Partial<Record<Cls, number>> };
}

/** Side-to-move score for a position, handling terminal positions. */
function terminalScore(fen: string): Score | null {
  const pos = fromFen(fen);
  if (pos.isCheckmate()) return { mate: 0 }; // side to move is mated
  if (!legalMoves(pos).length || outcomeOf(pos, [])) return { cp: 0 };
  return null;
}

const accuracyOf = (loss: number) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));

/** Mover-POV win% where {mate: 0} means the mover was mated. */
const wp = (s: Score) => (s.mate === 0 ? 0 : winPct(s));

function isSacrifice(fenBefore: string, uci: string) {
  const before = fromFen(fenBefore);
  const from = parseSquare(uci.slice(0, 2))!, to = parseSquare(uci.slice(2, 4))!;
  const moved = before.board.get(from)!;
  if (moved.role === 'pawn' || moved.role === 'king') return false;
  const captured = before.board.get(to);
  const pos = fromFen(after(fenBefore, uci));
  const enemy = moved.color === 'white' ? 'black' : 'white';
  let cheapest = Infinity, defended = false;
  for (const [sq, p] of pos.board) {
    if (!attacks(p, sq, pos.board.occupied).has(to)) continue;
    if (p.color === enemy) cheapest = Math.min(cheapest, VALUE[p.role] || 1000);
    else defended = true;
  }
  if (cheapest === Infinity) return false;
  const gain = captured && captured.color === enemy ? VALUE[captured.role] : 0;
  return (!defended || cheapest < VALUE[moved.role]) && gain + 50 < VALUE[moved.role];
}

export async function reviewGame(startFen: string, moves: string[], depth: number, onProgress: (done: number, total: number) => void): Promise<Review> {
  const fens = [startFen];
  for (const m of moves) fens.push(after(fens[fens.length - 1], m));
  const sf = new Stockfish();
  const lines: Line[][] = [];
  const scores: Score[] = [];
  try {
    for (const [i, fen] of fens.entries()) {
      const t = terminalScore(fen);
      if (t) {
        lines.push([]);
        scores.push(t);
      } else {
        const r = await sf.analyse(fen, { depth }, 2);
        lines.push(r.lines);
        scores.push(r.lines[0] ?? { cp: 0 });
      }
      onProgress(i + 1, fens.length);
    }
  } finally {
    sf.terminate();
  }

  const whiteScore = (i: number): Score => {
    const w = fens[i].split(' ')[1] === 'w';
    if (scores[i].mate === 0) return { mate: 0, cp: w ? -1 : 1 };
    return w ? scores[i] : negate(scores[i]);
  };
  const out: MoveReview[] = [];
  const losses = { white: [] as number[], black: [] as number[] };
  const counts: Review['counts'] = { white: {}, black: {} };

  for (let i = 0; i < moves.length; i++) {
    const fen = fens[i];
    const mover = fen.split(' ')[1] === 'w' ? 'white' : 'black';
    const before = scores[i];
    const afterS = negate(scores[i + 1]);
    const wpB = wp(before), wpA = scores[i + 1].mate === 0 ? 100 : wp(afterS);
    const loss = Math.max(0, wpB - wpA);
    const best = lines[i][0]?.pv[0] ?? moves[i];
    const second = lines[i][1];
    let cls: Cls;
    if (legalMoves(fromFen(fen)).length === 1) cls = 'forced';
    else if (moves[i] === best || loss < 1) {
      cls = 'best';
      if (second && wp(second) < wpB - 15 && wpA > 30) cls = 'great';
      if (isSacrifice(fen, moves[i]) && wpA >= 45 && wpB <= 97) cls = 'brilliant';
    } else if (loss < 2) cls = isSacrifice(fen, moves[i]) && wpA >= 50 ? 'brilliant' : 'excellent';
    else if (loss < 5) cls = 'good';
    else if (loss < 10) cls = 'inaccuracy';
    else if (loss < 20) cls = 'mistake';
    else cls = 'blunder';
    const prev = out[i - 1]?.cls;
    if ((prev === 'mistake' || prev === 'blunder') && loss >= 10) cls = 'miss';

    losses[mover].push(loss);
    counts[mover][cls] = (counts[mover][cls] ?? 0) + 1;
    out.push({ ply: i + 1, uci: moves[i], san: sanOf(fen, moves[i]), cls, loss, after: whiteScore(i + 1), best, bestSan: sanOf(fen, best) });
  }
  const mean = (a: number[]) => (a.length ? a.map(accuracyOf).reduce((x, y) => x + y, 0) / a.length : 100);
  return { moves: out, start: whiteScore(0), accuracy: { white: mean(losses.white), black: mean(losses.black) }, counts };
}
