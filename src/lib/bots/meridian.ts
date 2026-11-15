import type { BotDef, Hud, Settings } from '../types';
import type { NormalMove, Role } from 'chessops/types';
import type { Chess } from 'chessops/chess';
import { attacks } from 'chessops/attacks';
import { fromFen, stdUci, makeSquare, VALUE } from '../chess';
import { genMoves, orderKey, isCapture } from './eval';

/**
 * Chess played like Go. Every piece radiates influence onto the squares it controls (cheap pieces hold
 * ground more firmly), then influence spreads to neighbours like stones in Go. A square belongs to whoever
 * has more influence there. The eval rewards owning territory, especially the centre, and pressing on
 * the enemy king's zone.
 */
const FIRMNESS: Record<Role, number> = { pawn: 1, knight: 0.8, bishop: 0.7, rook: 0.6, queen: 0.5, king: 0.4 };
const CENTRE = Array.from({ length: 64 }, (_, s) => {
  const f = s & 7, r = s >> 3;
  return 1 + 0.6 * (1 - (Math.abs(f - 3.5) + Math.abs(r - 3.5)) / 7);
});

/** Influence per square: positive = White, negative = Black. */
export function influence(pos: Chess): Float64Array {
  let f = new Float64Array(64);
  for (const [sq, p] of pos.board) {
    const sign = p.color === 'white' ? 1 : -1;
    f[sq] += sign * 0.5;
    for (const t of attacks(p, sq, pos.board.occupied)) f[t] += sign * FIRMNESS[p.role];
  }
  // Two rounds of Go-style dilation: each square takes a quarter of its neighbours' influence.
  for (let round = 0; round < 2; round++) {
    const g = new Float64Array(64);
    for (let s = 0; s < 64; s++) {
      let n = 0;
      const fs = s & 7, rs = s >> 3;
      for (let df = -1; df <= 1; df++)
        for (let dr = -1; dr <= 1; dr++) {
          if (!df && !dr) continue;
          const ff = fs + df, rr = rs + dr;
          if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) n += f[rr * 8 + ff];
        }
      g[s] = f[s] + 0.25 * (n / 8);
    }
    f = g;
  }
  return f;
}

function kingPressure(pos: Chess, f: Float64Array, color: 'white' | 'black') {
  const k = pos.board.kingOf(color);
  if (k === undefined) return 0;
  const enemy = color === 'white' ? -1 : 1;
  let p = 0;
  for (const z of [k, ...attacks({ role: 'king', color }, k, pos.board.occupied)]) p += Math.max(0, enemy * f[z]);
  return p;
}

/** White-POV eval: material + territory (centre-weighted) + king-zone pressure. */
function evaluate(pos: Chess, s: Settings): number {
  const f = influence(pos);
  let v = 0;
  for (const [, p] of pos.board) v += (p.color === 'white' ? 1 : -1) * VALUE[p.role];
  let terr = 0;
  for (let i = 0; i < 64; i++) terr += Math.tanh(f[i]) * CENTRE[i];
  v += ((s.hunger as number) / 100) * 14 * terr;
  v += ((s.king as number) / 100) * 30 * (kingPressure(pos, f, 'black') - kingPressure(pos, f, 'white'));
  return v;
}

export const meridian: BotDef = {
  id: 'meridian',
  name: 'Meridian',
  approach: 'Territory control, Go style',
  description:
    'Treats chess like Go. It spreads influence from every piece, counts who owns each square, grabs space, squeezes the centre and closes in on the king zone.',
  vision: 'Influence field',
  hud: 'Who owns each square: White in lime, Black in orange',
  legend: [
    { mark: 'pick', text: 'The move it played' },
    { mark: 'field-white', text: "White's territory: squares White controls" },
    { mark: 'field-black', text: "Black's territory: squares Black controls" },
  ],
  settings: [
    { key: 'hunger', label: 'Territory hunger', hint: 'How much it values owning squares', type: 'range', min: 0, max: 100, step: 5, default: 60, unit: '%' },
    { key: 'king', label: 'King-zone pressure', hint: "How hard it leans on the enemy king's squares", type: 'range', min: 0, max: 100, step: 5, default: 50, unit: '%' },
    { key: 'depth', label: 'Look-ahead', type: 'range', min: 1, max: 3, step: 1, default: 2, unit: 'ply' },
  ],
  view: (fen) => fieldHud(fromFen(fen)),
  async think({ fen, settings: s }) {
    const root = fromFen(fen);
    const qs = (pos: Chess, a: number, b: number, d: number): number => {
      const stand = evaluate(pos, s) * (pos.turn === 'white' ? 1 : -1);
      if (stand >= b || d === 0) return stand;
      a = Math.max(a, stand);
      for (const m of genMoves(pos).filter((m) => isCapture(pos, m)).sort((x, y) => orderKey(pos, y) - orderKey(pos, x))) {
        const c = pos.clone();
        c.play(m);
        const v = -qs(c, -b, -a, d - 1);
        if (v >= b) return v;
        a = Math.max(a, v);
      }
      return a;
    };
    const negamax = (pos: Chess, d: number, a: number, b: number): number => {
      const moves = genMoves(pos);
      if (!moves.length) return pos.isCheck() ? -99999 : 0;
      if (d === 0) return qs(pos, a, b, 2);
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
    // Shuffle before the stable sort so equal moves vary between games.
    const moves = genMoves(root).sort(() => Math.random() - 0.5).sort((x, y) => orderKey(root, y) - orderKey(root, x));
    let best: NormalMove = moves[0], bestV = -Infinity;
    for (const m of moves) {
      const c = root.clone();
      c.play(m);
      const v = -negamax(c, (s.depth as number) - 1, -Infinity, -bestV);
      if (v > bestV) [best, bestV] = [m, v];
    }
    const move = stdUci(root, best);
    const after = root.clone();
    after.play(best);
    const hud = fieldHud(after);
    hud.arrows = [{ from: move.slice(0, 2), to: move.slice(2, 4), tone: 'pick' }];
    return { move, hud };
  },
};

function fieldHud(pos: Chess): Hud {
  const f = influence(pos);
  const field: Record<string, number> = {};
  let w = 0, b = 0;
  for (let i = 0; i < 64; i++) {
    const v = Math.tanh(f[i] * 0.8);
    if (Math.abs(v) > 0.12) field[makeSquare(i)] = v;
    if (v > 0.12) w++;
    else if (v < -0.12) b++;
  }
  const lead = w === b ? 'Territory is level' : `${w > b ? 'White' : 'Black'} owns ${Math.abs(w - b)} more square${Math.abs(w - b) === 1 ? '' : 's'}`;
  return {
    field,
    caption: `${lead}: White ${w}, Black ${b}.`,
    stats: [
      ['White squares', String(w)],
      ['Black squares', String(b)],
      ['Contested', String(64 - w - b)],
    ],
  };
}
