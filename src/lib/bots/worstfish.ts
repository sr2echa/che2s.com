import type { BotDef, Hud } from '../types';
import type { Line } from '../stockfish';
import { fromFen, legalMoves, scoreNum, fmtScore, sanOf } from '../chess';

export const worstfish: BotDef = {
  id: 'worstfish',
  name: 'WorstFish',
  approach: 'Stockfish, inverted',
  description:
    'Asks Stockfish to rank every legal move, then plays from the bottom of the list. A perfect engine aimed at the wrong target.',
  hud: 'Every move scored, from worst (red) to best',
  settings: [
    { key: 'malice', label: 'Malice', hint: '100 always plays the single worst move', type: 'range', min: 0, max: 100, step: 5, default: 100, unit: '%' },
    { key: 'depth', label: 'Search depth', type: 'range', min: 4, max: 14, step: 1, default: 8 },
  ],
  async think({ fen, settings: s }, ctx) {
    const n = legalMoves(fromFen(fen)).length;
    const sf = ctx.engine();
    await sf.setOptions({ UCI_LimitStrength: false });
    const { lines } = await sf.analyse(fen, { depth: s.depth as number }, Math.min(n, 256));
    const sorted = [...lines].sort((a, b) => scoreNum(a) - scoreNum(b)); // worst first
    const pool = Math.max(1, Math.round((1 - (s.malice as number) / 100) * (sorted.length - 1) * 0.5) + 1);
    const pick = sorted[Math.floor(Math.random() * pool)];
    return { move: pick.pv[0], hud: hud(fen, sorted, pick) };
  },
};

function hud(fen: string, worstFirst: Line[], pick: Line): Hud {
  const best = worstFirst[worstFirst.length - 1];
  const nums = worstFirst.map(scoreNum);
  const lo = nums[0], hi = nums[nums.length - 1];
  const heat: Record<string, number> = {};
  // Heat = goodness of the best move landing on each square, mapped to [-1, 1]. Worse = redder.
  worstFirst.forEach((l, i) => {
    const sq = l.pv[0].slice(2, 4);
    const v = hi === lo ? 0 : ((nums[i] - lo) / (hi - lo)) * 2 - 1;
    heat[sq] = Math.max(heat[sq] ?? -1, v);
  });
  return {
    heat,
    arrows: [
      { from: best.pv[0].slice(0, 2), to: best.pv[0].slice(2, 4), tone: 'alt', label: `avoided ${fmtScore(best)}` },
      { from: pick.pv[0].slice(0, 2), to: pick.pv[0].slice(2, 4), tone: 'bad', label: fmtScore(pick) },
    ],
    caption: `Skipped ${sanOf(fen, best.pv[0])} (${fmtScore(best)}) for ${sanOf(fen, pick.pv[0])} (${fmtScore(pick)})`,
    stats: [
      ['Moves ranked', String(worstFirst.length)],
      ['Best', fmtScore(best)],
      ['Chosen', fmtScore(pick)],
    ],
  };
}
