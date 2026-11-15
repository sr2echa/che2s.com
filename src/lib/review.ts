// Game review: per-move classification in the style of chess.com, from Stockfish evaluations.
import { Stockfish, type Line } from './stockfish';
import { makeFen } from 'chessops/fen';
import { fromFen, after, negate, winPct, sanOf, VALUE, outcomeOf, legalMoves, play, type Score } from './chess';
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
  /** White-POV scores before and after the move. */
  before: Score;
  after: Score;
  /** Plain-language reason for the rating. */
  explain: string;
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

// ---- analysis cache ---------------------------------------------------------------

export interface Analysis {
  /** Side-to-move POV; {mate: 0} = side to move is mated. */
  score: Score;
  lines: Line[];
  depth: number;
}

/** One Stockfish shared by live ratings and the full review, with a per-position cache. */
export class Analyst {
  private sf: Stockfish | null = null;
  private cache = new Map<string, Analysis>();

  async get(fen: string, depth: number): Promise<Analysis> {
    const hit = this.cache.get(fen);
    if (hit && hit.depth >= depth) return hit;
    const t = terminalScore(fen);
    let a: Analysis;
    if (t) a = { score: t, lines: [], depth: 99 };
    else {
      this.sf ??= new Stockfish();
      await this.sf.setOptions({ UCI_LimitStrength: false });
      const r = await this.sf.analyse(fen, { depth }, 2);
      a = { score: r.lines[0] ?? { cp: 0 }, lines: r.lines, depth };
    }
    this.cache.set(fen, a);
    return a;
  }
}

export const analyst = new Analyst();

// ---- classification + explanation -----------------------------------------------------

const toWhite = (fen: string, s: Score): Score => {
  const w = fen.split(' ')[1] === 'w';
  if (s.mate === 0) return { mate: 0, cp: w ? -1 : 1 };
  return w ? s : negate(s);
};

const POINTS = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 } as const;
function materialFor(fen: string, color: 'white' | 'black') {
  const pos = fromFen(fen);
  let v = 0;
  for (const [, p] of pos.board) v += (p.color === color ? 1 : -1) * POINTS[p.role];
  return v;
}
/** Mover's material change after playing `line` from `fen` (stops at an illegal move). */
function swing(fen: string, line: string[], mover: 'white' | 'black') {
  const pos = fromFen(fen);
  const start = materialFor(fen, mover);
  for (const u of line) if (!play(pos, u)) break;
  return materialFor(toFenOf(pos), mover) - start;
}
const toFenOf = (pos: ReturnType<typeof fromFen>) => makeFen(pos.toSetup());
const WORDS: Record<number, string> = { 1: 'a pawn', 2: 'two pawns', 3: 'a piece', 4: 'a piece and a pawn', 5: 'a rook', 6: 'a rook and a pawn', 8: 'a rook and a piece', 9: 'the queen' };
const words = (n: number) => WORDS[n] ?? `${n} points of material`;
const side = (c: 'white' | 'black') => (c === 'white' ? 'White' : 'Black');

function explain(fen: string, uci: string, cls: Cls, before: Analysis, afterA: Analysis): string {
  const san = sanOf(fen, uci);
  const mover = fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const enemy = mover === 'white' ? 'black' : 'white';
  const best = before.lines[0]?.pv ?? [];
  const bestSan = best[0] ? sanOf(fen, best[0]) : san;
  const fen2 = after(fen, uci);
  const reply = afterA.lines[0]?.pv ?? [];
  const replySan = reply[0] ? sanOf(fen2, reply[0]) : '';
  const lost = -swing(fen2, reply.slice(0, 4), mover);
  const bestGain = swing(fen, best.slice(0, 5), mover);
  const oppMate = afterA.score.mate !== undefined && afterA.score.mate > 0 ? afterA.score.mate : 0;
  const ownMate = before.score.mate !== undefined && before.score.mate > 0 ? before.score.mate : 0;
  const bestWhy = ownMate ? `, which forces mate in ${ownMate}` : bestGain >= 1 ? `, which wins ${words(bestGain)}` : '';
  const consequence = oppMate
    ? `it allows ${replySan}, and ${side(enemy)} mates in ${oppMate}`
    : lost >= 1 && replySan
      ? `after ${replySan} it loses ${words(lost)}`
      : replySan
        ? `${replySan} gives ${side(enemy)} the upper hand`
        : 'it throws away the advantage';

  switch (cls) {
    case 'forced':
      return `${san} is the only legal move.`;
    case 'brilliant':
      return `${san} is brilliant. It leaves material hanging on purpose, and the position still holds up.`;
    case 'great':
      return `${san} is the only good move here. Every alternative lets the advantage slip.`;
    case 'best':
      if (afterA.score.mate === 0) return `${san} is checkmate.`;
      if (ownMate) return `${san} is the best move and keeps a forced mate in ${ownMate}.`;
      return bestGain >= 1 ? `${san} is the best move. It wins ${words(bestGain)}.` : `${san} is the engine's first choice.`;
    case 'excellent':
      return `${san} is excellent, nearly as strong as ${bestSan}.`;
    case 'good':
      return `${san} is a decent move, but ${bestSan} was stronger${bestWhy}.`;
    case 'inaccuracy':
      return `${san} is an inaccuracy. ${bestSan} was more precise${bestWhy}.`;
    case 'mistake':
      return `${san} is a mistake: ${consequence}. ${bestSan} was better${bestWhy}.`;
    case 'miss':
      return `${san} misses the chance to punish the last move. ${bestSan} was available${bestWhy}.`;
    case 'blunder':
      return `${san} is a blunder: ${consequence}. Best was ${bestSan}${bestWhy}.`;
  }
}

/** Rates one move from cached analyses of the positions before and after it. */
export function rateMove(fen: string, uci: string, before: Analysis, afterA: Analysis, prev: Cls | undefined, ply: number): MoveReview {
  const wpB = wp(before.score);
  const wpA = afterA.score.mate === 0 ? 100 : wp(negate(afterA.score));
  const loss = Math.max(0, wpB - wpA);
  const best = before.lines[0]?.pv[0] ?? uci;
  const second = before.lines[1];
  let cls: Cls;
  if (legalMoves(fromFen(fen)).length === 1) cls = 'forced';
  else if (uci === best || loss < 1) {
    cls = 'best';
    if (second && wp(second) < wpB - 15 && wpA > 30) cls = 'great';
    if (isSacrifice(fen, uci) && wpA >= 45 && wpB <= 97) cls = 'brilliant';
  } else if (loss < 2) cls = isSacrifice(fen, uci) && wpA >= 50 ? 'brilliant' : 'excellent';
  else if (loss < 5) cls = 'good';
  else if (loss < 10) cls = 'inaccuracy';
  else if (loss < 20) cls = 'mistake';
  else cls = 'blunder';
  if ((prev === 'mistake' || prev === 'blunder') && loss >= 10) cls = 'miss';
  const fen2 = after(fen, uci);
  return {
    ply,
    uci,
    san: sanOf(fen, uci),
    cls,
    loss,
    before: toWhite(fen, before.score),
    after: toWhite(fen2, afterA.score),
    best,
    bestSan: sanOf(fen, best),
    explain: explain(fen, uci, cls, before, afterA),
  };
}

export async function reviewGame(startFen: string, moves: string[], depth: number, onProgress: (done: number, total: number) => void): Promise<Review> {
  const fens = [startFen];
  for (const m of moves) fens.push(after(fens[fens.length - 1], m));
  const an: Analysis[] = [];
  for (const [i, fen] of fens.entries()) {
    an.push(await analyst.get(fen, depth));
    onProgress(i + 1, fens.length);
  }
  const out: MoveReview[] = [];
  const losses = { white: [] as number[], black: [] as number[] };
  const counts: Review['counts'] = { white: {}, black: {} };
  for (let i = 0; i < moves.length; i++) {
    const r = rateMove(fens[i], moves[i], an[i], an[i + 1], out[i - 1]?.cls, i + 1);
    const mover = fens[i].split(' ')[1] === 'w' ? 'white' : 'black';
    losses[mover].push(r.loss);
    counts[mover][r.cls] = (counts[mover][r.cls] ?? 0) + 1;
    out.push(r);
  }
  const mean = (a: number[]) => (a.length ? a.map(accuracyOf).reduce((x, y) => x + y, 0) / a.length : 100);
  return { moves: out, start: toWhite(startFen, an[0].score), accuracy: { white: mean(losses.white), black: mean(losses.black) }, counts };
}
