import type { BotDef, Hud, Settings } from '../types';
import type { NormalMove } from 'chessops/types';
import type { Chess } from 'chessops/chess';
import { attacks } from 'chessops/attacks';
import { fromFen, stdUci, makeSquare, VALUE } from '../chess';
import { genMoves, orderKey } from './eval';

/**
 * The board as a directed graph: every piece points at the squares it attacks.
 * Square importance comes from PageRank over that graph; the eval rewards controlling important squares,
 * defending your own pieces (harmony) and hitting valuable ones (pressure).
 */
export interface Graph {
  ctrl: { white: Int8Array; black: Int8Array };
  edges: { from: number; to: number; kind: 'attack' | 'defend' }[];
  rank: Float64Array;
}

export function graphOf(pos: Chess): Graph {
  const ctrl = { white: new Int8Array(64), black: new Int8Array(64) };
  const edges: Graph['edges'] = [];
  const out: number[][] = Array.from({ length: 64 }, () => []);
  for (const [sq, p] of pos.board) {
    for (const t of attacks(p, sq, pos.board.occupied)) {
      ctrl[p.color][t]++;
      out[sq].push(t);
      const q = pos.board.get(t);
      if (q) edges.push({ from: sq, to: t, kind: q.color === p.color ? 'defend' : 'attack' });
    }
  }
  // PageRank, 16 power iterations, damping 0.85. Dangling mass spreads uniformly.
  let rank = new Float64Array(64).fill(1 / 64);
  for (let it = 0; it < 16; it++) {
    const next = new Float64Array(64);
    let dangling = 0;
    for (let s = 0; s < 64; s++) {
      if (!out[s].length) dangling += rank[s];
      else for (const t of out[s]) next[t] += rank[s] / out[s].length;
    }
    for (let s = 0; s < 64; s++) next[s] = 0.15 / 64 + 0.85 * (next[s] + dangling / 64);
    rank = next;
  }
  return { ctrl, edges, rank };
}

/** White-POV eval from the graph alone (plus material). */
function evalGraph(pos: Chess, w: Settings): number {
  const g = graphOf(pos);
  let s = 0;
  for (const [, p] of pos.board) s += (p.color === 'white' ? 1 : -1) * VALUE[p.role];
  // Space: control of squares, weighted by their PageRank importance.
  for (let sq = 0; sq < 64; sq++) s += (g.ctrl.white[sq] - g.ctrl.black[sq]) * g.rank[sq] * 64 * 6 * (w.space as number);
  for (const e of g.edges) {
    const a = pos.board.get(e.from)!, t = pos.board.get(e.to)!;
    const sign = a.color === 'white' ? 1 : -1;
    if (e.kind === 'defend') s += sign * 4 * (w.harmony as number);
    else s += sign * Math.min(3, (VALUE[t.role] || 300) / Math.max(VALUE[a.role], 100)) * 6 * (w.pressure as number);
  }
  // Hanging pieces: the side to move can take them; the other side gets a smaller nudge.
  for (const [sq, p] of pos.board) {
    if (p.role === 'king') continue;
    const enemy = p.color === 'white' ? 'black' : 'white';
    if (!g.ctrl[enemy][sq]) continue;
    const loose = !g.ctrl[p.color][sq] || cheapestAttacker(pos, sq, enemy) < VALUE[p.role];
    if (loose) s -= (p.color === 'white' ? 1 : -1) * VALUE[p.role] * (p.color === pos.turn ? 0.15 : 0.6);
  }
  // King ring under enemy control.
  for (const color of ['white', 'black'] as const) {
    const k = pos.board.kingOf(color);
    if (k === undefined) continue;
    const enemy = color === 'white' ? 'black' : 'white';
    let heat = g.ctrl[enemy][k] * 3;
    for (const r of attacks({ role: 'king', color }, k, pos.board.occupied)) heat += g.ctrl[enemy][r];
    s -= (color === 'white' ? 1 : -1) * heat * 9;
  }
  return s;
}

function cheapestAttacker(pos: Chess, sq: number, color: 'white' | 'black') {
  let min = Infinity;
  for (const from of pos.board[color]) {
    const p = pos.board.get(from)!;
    if (attacks(p, from, pos.board.occupied).has(sq)) min = Math.min(min, VALUE[p.role] || 1000);
  }
  return min;
}

export const crystal: BotDef = {
  id: 'crystal',
  name: 'Crystal',
  approach: 'Reads the board as a graph of attacks and defences',
  description:
    'Pieces are nodes, attacks and defences are edges. Runs PageRank to find the squares that matter, then plays for control of that network.',
  hud: 'The live attack/defence graph; node size is PageRank importance',
  legend: [{ mark: 'pick', text: 'The move it played' }, { mark: 'node', text: 'Rings: how central each piece is (PageRank)' }, { mark: 'attack', text: 'A piece attacking an enemy piece' }, { mark: 'defend', text: 'A piece defending a friendly piece' }, { mark: 'heat', text: 'Squares the side to move controls' }, { mark: 'heat-bad', text: 'Squares the opponent controls' }],
  settings: [
    { key: 'depth', label: 'Look-ahead', type: 'range', min: 1, max: 4, step: 1, default: 3, unit: 'ply' },
    { key: 'space', label: 'Space', hint: 'Weight on controlling important squares', type: 'range', min: 0, max: 2, step: 0.1, default: 1 },
    { key: 'harmony', label: 'Harmony', hint: 'Weight on pieces protecting each other', type: 'range', min: 0, max: 2, step: 0.1, default: 1 },
    { key: 'pressure', label: 'Pressure', hint: 'Weight on attacking valuable targets', type: 'range', min: 0, max: 2, step: 0.1, default: 1 },
  ],
  view: (fen) => graphHud(fen),
  async think({ fen, settings: s }) {
    const root = fromFen(fen);
    const negamax = (pos: Chess, d: number, a: number, b: number): number => {
      const moves = genMoves(pos);
      if (!moves.length) return pos.isCheck() ? -99999 : 0;
      if (d === 0) return evalGraph(pos, s) * (pos.turn === 'white' ? 1 : -1);
      moves.sort((x, y) => orderKey(pos, y) - orderKey(pos, x));
      let best = -Infinity;
      for (const m of moves) {
        const c = pos.clone();
        c.play(m);
        best = Math.max(best, -negamax(c, d - 1, -b, -a));
        a = Math.max(a, best);
        if (a >= b) break;
      }
      return best;
    };
    let best: NormalMove | undefined, bestV = -Infinity;
    // Shuffle before the (stable) sort so equal moves vary between games; no noise on scores, which are bounds.
    const rootMoves = genMoves(root).sort(() => Math.random() - 0.5).sort((x, y) => orderKey(root, y) - orderKey(root, x));
    for (const m of rootMoves) {
      const c = root.clone();
      c.play(m);
      const v = -negamax(c, (s.depth as number) - 1, -Infinity, -bestV);
      if (v > bestV) [best, bestV] = [m, v];
    }
    const move = stdUci(root, best!);
    const hud = graphHud(fen);
    hud.arrows = [{ from: move.slice(0, 2), to: move.slice(2, 4), tone: 'pick' }];
    return { move, hud };
  },
};

export function graphHud(fen: string): Hud {
  const pos = fromFen(fen);
  const g = graphOf(pos);
  const occ = [...pos.board.occupied];
  const max = Math.max(...occ.map((sq) => g.rank[sq]));
  const heat: Record<string, number> = {};
  for (let sq = 0; sq < 64; sq++) {
    const d = g.ctrl[pos.turn][sq] - g.ctrl[pos.turn === 'white' ? 'black' : 'white'][sq];
    if (d) heat[makeSquare(sq)] = Math.max(-1, Math.min(1, d / 3)) * 0.5;
  }
  const atk = g.edges.filter((e) => e.kind === 'attack').length;
  return {
    heat,
    graph: {
      nodes: occ.map((sq) => ({ sq: makeSquare(sq), w: g.rank[sq] / max })),
      edges: g.edges.map((e) => ({ from: makeSquare(e.from), to: makeSquare(e.to), kind: e.kind })),
    },
    stats: [
      ['Nodes', String(occ.length)],
      ['Attack edges', String(atk)],
      ['Defence edges', String(g.edges.length - atk)],
    ],
  };
}
