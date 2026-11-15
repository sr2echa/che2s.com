// Headless checks for the pure-JS bots (no browser): legal moves, mate-in-one, promotion, time.
import { test, expect } from '@playwright/test';
import { shannon } from '../src/lib/bots/shannon';
import { monte } from '../src/lib/bots/monte';
import { crystal } from '../src/lib/bots/crystal';
import { dice } from '../src/lib/bots/dice';
import { meridian } from '../src/lib/bots/meridian';
import { fromFen, legalMoves, INITIAL_FEN } from '../src/lib/chess';
import { defaults, type ThinkCtx } from '../src/lib/types';

const ctx = { emit() {}, status() {}, engine: () => { throw new Error('no engine'); }, aborted: () => false } as unknown as ThinkCtx;
const MATE_IN_ONE = [
  ['r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 'h5f7'],
  ['6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1d8'],
];

for (const bot of [shannon, monte, crystal, meridian, dice]) {
  test(`${bot.id} returns legal moves`, async () => {
    for (const fen of [INITIAL_FEN, 'r3k2r/pppq1ppp/2n1bn2/3pp3/3PP3/2N1BN2/PPPQ1PPP/R3K2R w KQkq - 0 1', '8/P7/8/8/8/8/6k1/4K3 w - - 0 1', '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1']) {
      const { move } = await bot.think({ fen, moves: [], startFen: fen, settings: defaults(bot.settings) }, ctx);
      expect(legalMoves(fromFen(fen)), `${bot.id} @ ${fen}`).toContain(move);
    }
  });
}

for (const bot of [shannon, crystal, meridian]) {
  test(`${bot.id} finds mate in one`, async () => {
    for (const [fen, mate] of MATE_IN_ONE) {
      const { move } = await bot.think({ fen, moves: [], startFen: fen, settings: defaults(bot.settings) }, ctx);
      expect(move).toBe(mate);
    }
  });
}

test('castling is emitted in standard UCI', () => {
  const moves = legalMoves(fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1'));
  expect(moves).toEqual(expect.arrayContaining(['e1g1', 'e1c1']));
  expect(moves).not.toContain('e1h1');
});
