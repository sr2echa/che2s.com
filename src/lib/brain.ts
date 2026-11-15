// Main-thread client for the bot worker.
import type { Hud, ThinkInput } from './types';

type Handlers = { onHud?: (h: Hud) => void; onStatus?: (t: string) => void };

let worker: Worker | null = null;
let seq = 0;

export function think(botId: string, input: ThinkInput, h: Handlers = {}): { result: Promise<{ move: string; hud?: Hud }>; cancel(): void } {
  worker ??= new Worker(new URL('./brain.worker.ts', import.meta.url), { type: 'module' });
  const id = ++seq;
  const w = worker;
  let settle: (() => void) | undefined;
  const result = new Promise<{ move: string; hud?: Hud }>((resolve, reject) => {
    const on = (e: MessageEvent) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === 'hud') h.onHud?.(m.hud);
      else if (m.type === 'status') h.onStatus?.(m.text);
      else {
        w.removeEventListener('message', on);
        m.type === 'done' ? resolve({ move: m.move, hud: m.hud }) : reject(new Error(m.message));
      }
    };
    settle = () => w.removeEventListener('message', on);
    w.addEventListener('message', on);
    w.postMessage({ type: 'think', id, botId, input });
  });
  return {
    result,
    cancel() {
      settle?.();
      w.postMessage({ type: 'cancel' });
    },
  };
}
