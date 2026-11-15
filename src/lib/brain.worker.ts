// Runs bot `think` calls off the main thread. One Stockfish per bot id, created lazily.
import { botById } from './bots';
import { Stockfish } from './stockfish';
import type { Hud, ThinkInput } from './types';

const engines = new Map<string, Stockfish>();
let current = -1;

self.onmessage = async (e: MessageEvent<{ type: 'think'; id: number; botId: string; input: ThinkInput } | { type: 'cancel' }>) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    current = -1;
    engines.forEach((sf) => sf.stop());
    return;
  }
  const { id, botId, input } = msg;
  current = id;
  const bot = botById(botId)!;
  let last = 0;
  const post = (m: object) => self.postMessage({ id, ...m });
  try {
    const res = await bot.think(input, {
      emit(hud: Hud) {
        const now = performance.now();
        if (now - last < 90 || current !== id) return; // throttle HUD streaming
        last = now;
        post({ type: 'hud', hud });
      },
      status: (text) => post({ type: 'status', text }),
      engine() {
        if (!engines.has(botId)) engines.set(botId, new Stockfish());
        return engines.get(botId)!;
      },
      aborted: () => current !== id,
    });
    post({ type: 'done', ...res });
  } catch (err) {
    post({ type: 'error', message: (err as Error).message ?? String(err) });
  }
};
