import type { BotDef, Hud } from '../types';
import { after, fmtScore, negate, sanOf, scoreNum } from '../chess';

/**
 * For each sound candidate, look at the opponent's replies twice: a 1-ply "hasty" view and a deep view.
 * A trap is a reply the hasty view ranks highly but the deep view says loses big.
 */
export const trapsky: BotDef = {
  id: 'trapsky',
  name: 'Boris Trapsky',
  approach: 'Hunts for moves whose obvious reply loses',
  description:
    'Compares what a hasty opponent would play against what actually works. Gives up a little objective value to set tempting traps.',
  hud: 'Bait replies and the punishment waiting behind them',
  legend: [{ mark: 'pick', text: 'The move it played' }, { mark: 'alt', text: 'Candidates it weighed, with their trap score' }, { mark: 'bad', text: 'The bait: the reply it hopes you play' }, { mark: 'line', text: 'The punishment that follows the bait' }],
  settings: [
    { key: 'appetite', label: 'Trap appetite', hint: 'How much it values a trap over a sound move', type: 'range', min: 0, max: 100, step: 5, default: 70, unit: '%' },
    { key: 'risk', label: 'Risk budget', hint: 'Centipawns it will concede to set a trap', type: 'range', min: 0, max: 300, step: 10, default: 80, unit: 'cp' },
    { key: 'depth', label: 'Search depth', type: 'range', min: 6, max: 14, step: 1, default: 9 },
    { key: 'candidates', label: 'Candidates', type: 'range', min: 2, max: 6, step: 1, default: 4 },
  ],
  async think({ fen, settings: s }, ctx) {
    const sf = ctx.engine();
    await sf.setOptions({ UCI_LimitStrength: false });
    const depth = s.depth as number;
    const root = await sf.analyse(fen, { depth }, s.candidates as number);
    const bestNum = scoreNum(root.lines[0]);
    const scored: { move: string; base: number; trap: number; bait?: string; punish?: string; drop?: number }[] = [];

    for (const c of root.lines) {
      if (ctx.aborted()) break;
      const base = scoreNum(c);
      if (bestNum - base > (s.risk as number) || Math.abs(base) > 90000) {
        scored.push({ move: c.pv[0], base, trap: 0 });
        continue;
      }
      const fen2 = after(fen, c.pv[0]);
      const deep = await sf.analyse(fen2, { depth: depth - 1 }, 5);
      const hasty = await sf.analyse(fen2, { depth: 1 }, 3);
      if (!deep.lines.length) {
        scored.push({ move: c.pv[0], base, trap: 0 });
        continue;
      }
      const oppBest = scoreNum(deep.lines[0]);
      let trap = 0, bait: string | undefined, punish: string | undefined, drop = 0;
      for (const [i, r] of hasty.lines.entries()) {
        const reply = r.pv[0];
        let deepScore: number, line: string[];
        const known = deep.lines.find((l) => l.pv[0] === reply);
        if (known) {
          deepScore = scoreNum(known);
          line = known.pv;
        } else {
          const third = await sf.analyse(after(fen2, reply), { depth: depth - 2 }, 1);
          if (!third.lines.length) continue;
          deepScore = scoreNum(negate(third.lines[0]));
          line = [reply, ...third.lines[0].pv];
        }
        const d = Math.min(oppBest - deepScore, 1500);
        const v = d * [1, 0.55, 0.3][i];
        if (d > 120 && v > trap) {
          trap = v;
          bait = reply;
          punish = line[1];
          drop = d;
        }
      }
      scored.push({ move: c.pv[0], base, trap, bait, punish, drop });
      ctx.emit(trapHud(fen, scored, undefined));
    }

    const value = (x: (typeof scored)[number]) => x.base + ((s.appetite as number) / 100) * Math.min(x.trap, 900) * 0.6;
    const pick = scored.reduce((a, b) => (value(b) > value(a) ? b : a));
    return { move: pick.move, hud: trapHud(fen, scored, pick.move) };
  },
};

function trapHud(fen: string, scored: { move: string; base: number; trap: number; bait?: string; punish?: string; drop?: number }[], pick?: string): Hud {
  const hud: Hud = { arrows: [], stats: [] };
  const chosen = scored.find((x) => x.move === pick) ?? [...scored].sort((a, b) => b.trap - a.trap)[0];
  for (const x of scored) {
    hud.arrows!.push({
      from: x.move.slice(0, 2),
      to: x.move.slice(2, 4),
      tone: x.move === pick ? 'pick' : 'alt',
      label: x.trap > 0 ? `trap ${Math.round(x.trap / 10) / 10}` : undefined,
    });
  }
  if (chosen?.bait) {
    const fen2 = after(fen, chosen.move);
    hud.arrows!.push({ from: chosen.bait.slice(0, 2), to: chosen.bait.slice(2, 4), tone: 'bad', label: 'bait' });
    if (chosen.punish) hud.arrows!.push({ from: chosen.punish.slice(0, 2), to: chosen.punish.slice(2, 4), tone: 'line', label: 'punish' });
    hud.caption = `If ${sanOf(fen2, chosen.bait)}? the reply ${chosen.punish ? sanOf(after(fen2, chosen.bait), chosen.punish) : ''} wins ${((chosen.drop ?? 0) / 100).toFixed(1)} pawns`;
  } else hud.caption = 'No trap worth the risk here. Playing it straight.';
  hud.stats = [
    ['Candidates', String(scored.length)],
    ['Traps found', String(scored.filter((x) => x.trap > 0).length)],
    ['Eval', fmtScore({ cp: scored[0]?.base ?? 0 })],
  ];
  return hud;
}
