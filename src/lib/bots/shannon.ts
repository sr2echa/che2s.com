import type { BotDef, Hud } from '../types';
import type { NormalMove } from 'chessops/types';
import type { Chess } from 'chessops/chess';
import { fromFen, stdUci, makeSquare } from '../chess';
import { evaluate, genMoves, orderKey, isCapture, yieldNow } from './eval';

const MATE = 100000;

/** Classic Type-A search (Shannon, 1950): iterative-deepening negamax, alpha-beta, quiescence. */
export const shannon: BotDef = {
  id: 'shannon',
  name: 'Shannon',
  approach: 'Textbook alpha-beta over piece-square tables',
  description:
    'A 1950s idea run on a modern laptop: look at every move a few plies deep, prune what cannot matter, score leaves with material and square tables.',
  hud: 'Root move scores as a heatmap, plus the principal line',
  settings: [
    { key: 'depth', label: 'Max depth', type: 'range', min: 1, max: 7, step: 1, default: 5, unit: 'ply' },
    { key: 'time', label: 'Time budget', type: 'range', min: 200, max: 6000, step: 100, default: 1500, unit: 'ms' },
    { key: 'noise', label: 'Noise', hint: 'Random centipawns added to root moves', type: 'range', min: 0, max: 80, step: 5, default: 10, unit: 'cp' },
  ],
  async think({ fen, settings: s }) {
    const root = fromFen(fen);
    const deadline = performance.now() + (s.time as number);
    const t0 = performance.now();
    let nodes = 0;
    let rootScores = new Map<NormalMove, number>();
    let order = genMoves(root).sort((a, b) => orderKey(root, b) - orderKey(root, a));
    let pv: NormalMove[] = [];
    let reached = 0;
    let timeUp = false;

    const qs = (pos: Chess, alpha: number, beta: number, qd: number): number => {
      nodes++;
      const stand = evaluate(pos) * (pos.turn === 'white' ? 1 : -1);
      if (stand >= beta || qd === 0) return stand;
      if (stand > alpha) alpha = stand;
      const caps = genMoves(pos).filter((m) => isCapture(pos, m) || m.promotion === 'queen').sort((a, b) => orderKey(pos, b) - orderKey(pos, a));
      for (const m of caps) {
        const c = pos.clone();
        c.play(m);
        const v = -qs(c, -beta, -alpha, qd - 1);
        if (v >= beta) return v;
        if (v > alpha) alpha = v;
      }
      return alpha;
    };

    const search = (pos: Chess, depth: number, alpha: number, beta: number, ply: number, line: NormalMove[]): number => {
      if ((++nodes & 1023) === 0 && performance.now() > deadline) timeUp = true;
      if (timeUp) return 0;
      const moves = genMoves(pos);
      if (!moves.length) return pos.isCheck() ? -MATE + ply : 0;
      if (pos.halfmoves >= 100 || pos.isInsufficientMaterial()) return 0;
      if (depth === 0) return qs(pos, alpha, beta, 4);
      moves.sort((a, b) => orderKey(pos, b) - orderKey(pos, a));
      let best = -Infinity;
      for (const m of moves) {
        const c = pos.clone();
        c.play(m);
        const sub: NormalMove[] = [];
        const v = -search(c, depth - 1, -beta, -alpha, ply + 1, sub);
        if (v > best) {
          best = v;
          if (v > alpha) {
            alpha = v;
            line.splice(0, line.length, m, ...sub);
          }
        }
        if (alpha >= beta) break;
      }
      return best;
    };

    for (let d = 1; d <= (s.depth as number); d++) {
      const scores = new Map<NormalMove, number>();
      let alpha = -Infinity;
      let bestLine: NormalMove[] = [];
      for (const m of order) {
        const c = root.clone();
        c.play(m);
        const sub: NormalMove[] = [];
        // Full window at root so every move gets a comparable score for the HUD.
        const v = -search(c, d - 1, -Infinity, Infinity, 1, sub);
        if (timeUp) break;
        scores.set(m, v);
        if (v > alpha) {
          alpha = v;
          bestLine = [m, ...sub];
        }
      }
      if (timeUp) break;
      rootScores = scores;
      pv = bestLine;
      reached = d;
      order = [...order].sort((a, b) => (scores.get(b) ?? -Infinity) - (scores.get(a) ?? -Infinity));
      if (Math.abs(alpha) > MATE - 100) break;
      await yieldNow();
    }

    const noise = s.noise as number;
    const ranked = [...rootScores].map(([m, v]) => ({ m, v, r: v + (Math.random() * 2 - 1) * noise })).sort((a, b) => b.r - a.r);
    const pick = ranked[0]?.m ?? order[0];
    const knps = Math.round(nodes / Math.max(1, performance.now() - t0));
    return { move: stdUci(root, pick), hud: hud(root, ranked, pick, pv, reached, nodes, knps) };
  },
};

function hud(root: Chess, ranked: { m: NormalMove; v: number }[], pick: NormalMove, pv: NormalMove[], depth: number, nodes: number, knps: number): Hud {
  const vals = ranked.map((x) => x.v);
  const hi = Math.max(...vals), lo = Math.min(...vals);
  const heat: Record<string, number> = {};
  for (const { m, v } of ranked) {
    const sq = makeSquare(m.to);
    const n = hi === lo ? 0 : ((v - lo) / (hi - lo)) * 2 - 1;
    heat[sq] = Math.max(heat[sq] ?? -1, n);
  }
  const arrows: Hud['arrows'] = [];
  const pos = root.clone();
  for (const [i, m] of pv.slice(0, 4).entries()) {
    const u = stdUci(pos, m);
    arrows.push({ from: u.slice(0, 2), to: u.slice(2, 4), tone: i === 0 ? 'pick' : 'line', label: i ? String(i + 1) : undefined });
    pos.play(m);
  }
  if (pv[0] !== pick) {
    const u = stdUci(root, pick);
    arrows.splice(0, arrows.length, { from: u.slice(0, 2), to: u.slice(2, 4), tone: 'pick' });
  }
  const top = ranked[0]?.v ?? 0;
  return {
    heat,
    arrows,
    stats: [
      ['Depth', `${depth} ply`],
      ['Nodes', nodes.toLocaleString()],
      ['Speed', `${knps}k/s`],
      ['Eval', Math.abs(top) > MATE - 100 ? 'mate' : `${top > 0 ? '+' : ''}${(top / 100).toFixed(2)}`],
    ],
    caption: `Searched ${nodes.toLocaleString()} positions; ${ranked.length} root moves scored`,
  };
}
