import type { BotDef, Hud } from '../types';
import type { NormalMove } from 'chessops/types';
import type { Chess } from 'chessops/chess';
import { fromFen, stdUci } from '../chess';
import { makeSan } from 'chessops/san';
import { evaluate, genMoves, isCapture, yieldNow } from './eval';

interface Node {
  move?: NormalMove;
  parent?: Node;
  children?: Node[];
  untried?: NormalMove[];
  n: number;
  /** Total reward from the perspective of the player who made `move`. */
  w: number;
}

/** UCT Monte-Carlo tree search with short, capture-biased playouts. */
export const monte: BotDef = {
  id: 'monte',
  name: 'Monte',
  approach: 'Monte-Carlo tree search with random playouts',
  description:
    'No chess knowledge beyond material. Plays thousands of quick random games from here and backs the moves that keep winning them.',
  vision: 'Visit map',
  hud: 'Where the simulations went: visit counts per move',
  legend: [{ mark: 'pick', text: 'The most-simulated move, which it plays' }, { mark: 'alt', text: 'Other popular branches, share of simulations' }, { mark: 'heat', text: 'Where the simulations went' }],
  settings: [
    { key: 'sims', label: 'Simulations', type: 'range', min: 500, max: 30000, step: 500, default: 6000 },
    { key: 'c', label: 'Curiosity', hint: 'UCT exploration constant', type: 'range', min: 0.3, max: 2.5, step: 0.1, default: 1.2 },
    { key: 'playout', label: 'Playout length', type: 'range', min: 2, max: 40, step: 1, default: 10, unit: 'ply' },
  ],
  async think({ fen, settings: s }, ctx) {
    const rootPos = fromFen(fen);
    const root: Node = { n: 0, w: 0, untried: genMoves(rootPos) };
    const sims = s.sims as number, C = s.c as number, L = s.playout as number;
    const me = rootPos.turn;

    for (let i = 1; i <= sims; i++) {
      let node = root;
      const pos = rootPos.clone();
      // Select
      while (!node.untried?.length && node.children?.length) {
        const ln = Math.log(node.n);
        node = node.children.reduce((a, b) => (ucb(b, ln, C) > ucb(a, ln, C) ? b : a));
        pos.play(node.move!);
      }
      // Expand
      if (node.untried?.length) {
        const m = node.untried.splice(Math.floor(Math.random() * node.untried.length), 1)[0];
        pos.play(m);
        const child: Node = { move: m, parent: node, n: 0, w: 0, untried: genMoves(pos) };
        (node.children ??= []).push(child);
        node = child;
      }
      // A node's mover is the opposite of the side to move at that node. (Read before rollout mutates pos.)
      let moverWhite = pos.turn === 'black';
      // Simulate: reward for White in [0, 1]
      const r = rollout(pos, L);
      for (let n: Node | undefined = node; n; n = n.parent) {
        n.n++;
        n.w += moverWhite ? r : 1 - r;
        moverWhite = !moverWhite;
      }
      if (i % 150 === 0) {
        ctx.emit(hud(rootPos, root, i, me));
        await yieldNow();
        if (ctx.aborted()) break;
      }
    }
    const best = root.children!.reduce((a, b) => (b.n > a.n ? b : a));
    return { move: stdUci(rootPos, best.move!), hud: hud(rootPos, root, sims, me) };
  },
};

const ucb = (c: Node, ln: number, C: number) => (c.n ? c.w / c.n + C * Math.sqrt(ln / c.n) : Infinity);

function rollout(pos: Chess, plies: number): number {
  for (let i = 0; i < plies; i++) {
    const moves = genMoves(pos);
    if (!moves.length) return pos.isCheck() ? (pos.turn === 'white' ? 0 : 1) : 0.5;
    const caps = moves.filter((m) => isCapture(pos, m));
    const pool = caps.length && Math.random() < 0.5 ? caps : moves;
    pos.play(pool[Math.floor(Math.random() * pool.length)]);
  }
  return 1 / (1 + Math.exp(-evaluate(pos) / 400));
}

function hud(pos: Chess, root: Node, sims: number, me: 'white' | 'black'): Hud {
  const kids = [...(root.children ?? [])].sort((a, b) => b.n - a.n);
  const max = kids[0]?.n || 1;
  const heat: Record<string, number> = {};
  for (const k of kids) {
    const sq = stdUci(pos, k.move!).slice(2, 4);
    heat[sq] = Math.max(heat[sq] ?? 0, Math.sqrt(k.n / max));
  }
  const top = kids[0];
  const winRate = top ? top.w / top.n : 0.5;
  return {
    heat,
    arrows: kids.slice(0, 3).map((k, i) => {
      const u = stdUci(pos, k.move!);
      return { from: u.slice(0, 2), to: u.slice(2, 4), tone: i ? 'alt' : 'pick', weight: k.n / max, label: `${Math.round((k.n / sims) * 100)}%` };
    }),
    stats: [
      ['Simulations', sims.toLocaleString()],
      ['Win rate', `${Math.round(winRate * 100)}%`],
      ['Branches', String(kids.length)],
    ],
    caption: top ? `${Math.round((top.n / sims) * 100)}% of simulations went through ${makeSan(pos, top.move!)} (${me === 'white' ? 'White' : 'Black'} wins ${Math.round(winRate * 100)}%)` : undefined,
  };
}
