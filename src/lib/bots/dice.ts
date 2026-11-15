import type { BotDef } from '../types';
import { fromFen, legalMoves, play } from '../chess';

export const dice: BotDef = {
  id: 'dice',
  name: 'Dice',
  approach: 'Uniformly random legal moves',
  description: 'The baseline every engine is measured against. Optionally greedy for captures and checks.',
  vision: 'Possible moves',
  hud: 'Every legal destination, equally likely',
  legend: [{ mark: 'pick', text: 'The roll' }, { mark: 'heat', text: 'Every square it could have moved to' }],
  settings: [{ key: 'greedy', label: 'Greedy', hint: 'Prefer captures and checks when available', type: 'toggle', default: false }],
  async think({ fen, settings: s }) {
    const pos = fromFen(fen);
    const moves = legalMoves(pos);
    let pool = moves;
    if (s.greedy) {
      const sharp = moves.filter((u) => {
        const c = pos.clone();
        const san = play(c, u)!;
        return san.includes('x') || san.includes('+') || san.includes('#');
      });
      if (sharp.length) pool = sharp;
    }
    const move = pool[Math.floor(Math.random() * pool.length)];
    return {
      move,
      hud: {
        heat: Object.fromEntries(pool.map((u) => [u.slice(2, 4), 0.35])),
        arrows: [{ from: move.slice(0, 2), to: move.slice(2, 4), tone: 'pick' }],
        caption: `Rolled 1 of ${pool.length}`,
        stats: [['Options', String(pool.length)]],
      },
    };
  },
};
