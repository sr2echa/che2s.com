import type { BotDef, Hud } from '../types';
import type { Line } from '../stockfish';
import { fmtScore, sanOf, pvSan } from '../chess';

export function linesHud(fen: string, lines: Line[], pick?: string): Hud {
  const top = lines[0];
  // With an Elo cap Stockfish may play a move outside its own top lines; always draw the move it picked.
  const extra = pick && !lines.some((l) => l.pv[0] === pick) ? [{ from: pick.slice(0, 2), to: pick.slice(2, 4), tone: 'pick' as const, label: 'played' }] : [];
  return {
    arrows: [...extra, ...lines.map((l, i) => ({
      from: l.pv[0].slice(0, 2),
      to: l.pv[0].slice(2, 4),
      weight: 1 - i / Math.max(lines.length, 2),
      tone: l.pv[0] === (pick ?? top?.pv[0]) ? ('pick' as const) : ('alt' as const),
      label: fmtScore(l),
    }))],
    stats: top
      ? [
          ['Depth', String(top.depth)],
          ['Eval', fmtScore(top)],
          ['Line', pvSan(fen, top.pv, 4)],
        ]
      : [],
    caption: top ? `Main line starts ${sanOf(fen, top.pv[0])}` : undefined,
  };
}

export const stockfish: BotDef = {
  id: 'stockfish',
  name: 'Stockfish',
  approach: 'Alpha-beta search with an NNUE evaluator',
  description:
    'The strongest open-source engine, compiled to WebAssembly. Cap it with an Elo limit for a human-like opponent, or unleash it.',
  hud: 'Candidate lines with evaluations',
  settings: [
    { key: 'full', label: 'Full strength', hint: 'Ignore the Elo cap', type: 'toggle', default: false },
    { key: 'elo', label: 'Elo', hint: 'Stockfish limits itself to play near this rating', off: 'full', type: 'range', min: 1320, max: 3190, step: 10, default: 1800 },
    { key: 'movetime', label: 'Think time', type: 'range', min: 100, max: 5000, step: 100, default: 800, unit: 'ms' },
    { key: 'lines', label: 'Lines shown', hint: 'Candidate moves visible in the HUD', type: 'range', min: 1, max: 5, step: 1, default: 3 },
  ],
  async think({ fen, settings: s }, ctx) {
    const sf = ctx.engine();
    await sf.setOptions({ UCI_LimitStrength: !s.full, UCI_Elo: s.elo as number });
    const { bestmove, lines } = await sf.analyse(fen, { movetime: s.movetime as number }, s.lines as number, (l) =>
      ctx.emit(linesHud(fen, l)),
    );
    return { move: bestmove, hud: linesHud(fen, lines, bestmove) };
  },
};
