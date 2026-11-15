import type { BotDef, Hud, ThinkCtx } from '../types';
import type { InferenceSession } from 'onnxruntime-web';
import { fromFen, legalMoves, sanOf } from '../chess';
import vocab from './data/all_moves_maia3.json';

// Maia-3 (CSSLab, University of Toronto): a transformer trained on human games, conditioned on both players' ratings.
// Weights: AGPL-3.0, fetched on first use and cached in Cache Storage.
export const MAIA_URL =
  import.meta.env?.PUBLIC_MAIA_URL ?? 'https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/main/public/maia3/maia3_simplified.onnx';
/** Optional self-hosted copy (`npm run fetch:maia`); used first when present. */
const LOCAL_URL = '/models/maia3_simplified.onnx';
const MAIA_BYTES = 45_683_686;
const PIECES = 'PNBRQKpnbrqk';
const ROLE = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' } as const;
const index = vocab as Record<string, number>;

let session: Promise<{ ort: typeof import('onnxruntime-web'); s: InferenceSession }> | null = null;

async function load(ctx: ThinkCtx) {
  const ort = await import('onnxruntime-web/wasm');
  // Only the .wasm is external; the JS glue ships inside the onnxruntime-web bundle.
  ort.env.wasm.wasmPaths = { wasm: '/ort/ort-wasm-simd-threaded.wasm' };
  ort.env.wasm.numThreads = 1;
  const cache = typeof caches !== 'undefined' ? await caches.open('che2s-models') : null;
  let res = await cache?.match(MAIA_URL);
  let bytes: ArrayBuffer;
  if (res) bytes = await res.arrayBuffer();
  else {
    res = await fetch(LOCAL_URL).catch(() => undefined);
    if (!res?.ok || res.headers.get('content-type')?.includes('text/html')) res = await fetch(MAIA_URL);
    if (!res.ok || !res.body) throw new Error(`Maia download failed (${res.status})`);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let got = 0, shown = -1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      const pct = Math.floor((got / MAIA_BYTES) * 100);
      if (pct !== shown) ctx.status(`Downloading network · ${(shown = pct)}%`);
    }
    const all = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) all.set(c, (o += c.length) - c.length);
    bytes = all.buffer;
    await cache?.put(MAIA_URL, new Response(all.slice()));
  }
  ctx.status('Starting network');
  return { ort: ort as unknown as typeof import('onnxruntime-web'), s: await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] }) };
}

const mirrorSq = (sq: string) => sq[0] + (9 - +sq[1]);
const mirrorUci = (u: string) => mirrorSq(u.slice(0, 2)) + mirrorSq(u.slice(2, 4)) + u.slice(4);

export async function maiaPolicy(fen: string, eloSelf: number, eloOppo: number, ctx: ThinkCtx) {
  session ??= load(ctx).catch((e) => {
    session = null;
    throw e;
  });
  const { ort, s } = await session;
  const pos = fromFen(fen);
  const black = pos.turn === 'black';
  // Side to move is always encoded as White: mirror ranks and swap colours when Black moves.
  const tokens = new Float32Array(64 * 12);
  for (const [sq, p] of pos.board) {
    const white = (p.color === 'white') !== black;
    const target = black ? sq ^ 56 : sq;
    tokens[target * 12 + PIECES.indexOf(white ? ROLE[p.role] : ROLE[p.role].toLowerCase())] = 1;
  }
  const out = await s.run({
    tokens: new ort.Tensor('float32', tokens, [1, 64, 12]),
    elo_self: new ort.Tensor('float32', Float32Array.from([eloSelf]), [1]),
    elo_oppo: new ort.Tensor('float32', Float32Array.from([eloOppo]), [1]),
  });
  const logits = out.logits_move.data as Float32Array;
  const wdl = out.logits_value.data as Float32Array;
  const moves = legalMoves(pos).filter((u) => index[black ? mirrorUci(u) : u] !== undefined);
  const l = moves.map((u) => logits[index[black ? mirrorUci(u) : u]]);
  const max = Math.max(...l);
  const e = l.map((x) => Math.exp(x - max));
  const sum = e.reduce((a, b) => a + b, 0);
  const policy = moves.map((u, i) => ({ u, p: e[i] / sum })).sort((a, b) => b.p - a.p);
  const m = Math.max(wdl[0], wdl[1], wdl[2]);
  const [L, D, W] = [wdl[0], wdl[1], wdl[2]].map((x) => Math.exp(x - m));
  return { policy, win: (W + 0.5 * D) / (L + D + W) };
}

export const maia: BotDef = {
  id: 'maia',
  name: 'Maia',
  approach: 'Neural net that predicts the human move',
  description:
    'Maia-3 from the University of Toronto, trained on millions of online games. It does not search for the best move; it predicts what a player of a given rating would actually play.',
  hud: 'Probability that a human at this rating plays each move',
  settings: [
    { key: 'elo', label: 'Rating', hint: 'The player Maia imitates', type: 'range', min: 600, max: 2600, step: 50, default: 1500 },
    { key: 'oppo', label: 'Opponent rating', hint: 'Who Maia believes it is facing', type: 'range', min: 600, max: 2600, step: 50, default: 1500 },
    { key: 'variety', label: 'Variety', hint: '0 plays the most likely move. 100 samples like a real player.', type: 'range', min: 0, max: 100, step: 5, default: 0, unit: '%' },
  ],
  async think({ fen, settings: s }, ctx) {
    const { policy, win } = await maiaPolicy(fen, s.elo as number, s.oppo as number, ctx);
    const t = (s.variety as number) / 100;
    let pick = policy[0];
    if (t > 0) {
      const w = policy.map((x) => Math.pow(x.p, 1 / t));
      let r = Math.random() * w.reduce((a, b) => a + b, 0);
      pick = policy.find((_, i) => (r -= w[i]) <= 0) ?? policy[0];
    }
    const heat: Record<string, number> = {};
    for (const { u, p } of policy) heat[u.slice(2, 4)] = Math.min(1, (heat[u.slice(2, 4)] ?? 0) + Math.sqrt(p));
    const hud: Hud = {
      heat,
      arrows: policy.slice(0, 4).map((x) => ({
        from: x.u.slice(0, 2),
        to: x.u.slice(2, 4),
        weight: x.p / policy[0].p,
        tone: x.u === pick.u ? 'pick' : 'alt',
        label: `${Math.round(x.p * 100)}%`,
      })),
      caption: `At ${s.elo}, ${Math.round(policy[0].p * 100)}% of players choose ${sanOf(fen, policy[0].u)} here`,
      stats: [
        ['Top move', `${sanOf(fen, policy[0].u)} ${Math.round(policy[0].p * 100)}%`],
        ['Win chance', `${Math.round(win * 100)}%`],
        ['Moves considered', String(policy.length)],
      ],
    };
    return { move: pick.u, hud };
  },
};
