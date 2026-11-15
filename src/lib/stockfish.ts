// UCI wrapper around the Stockfish 19 lite WASM worker. Searches are serialized.
import type { Score } from './chess';

export type Line = Score & { multipv: number; depth: number; pv: string[]; nps?: number };
export type Go = { depth?: number; movetime?: number; nodes?: number };

export const ENGINE_URL = '/engine/stockfish-19-lite-single.js';

export class Stockfish {
  private w: Worker;
  private subs = new Set<(l: string) => void>();
  private chain: Promise<unknown>;

  constructor(url = ENGINE_URL) {
    this.w = new Worker(url);
    this.w.onmessage = (e) => this.subs.forEach((f) => f(String(e.data)));
    this.chain = this.until('uci', (l) => l === 'uciok').then(() => this.until('isready', (l) => l === 'readyok'));
  }

  private until(cmd: string, done: (l: string) => boolean, onLine?: (l: string) => void) {
    return new Promise<void>((res) => {
      const f = (l: string) => {
        onLine?.(l);
        if (done(l)) {
          this.subs.delete(f);
          res();
        }
      };
      this.subs.add(f);
      this.w.postMessage(cmd);
    });
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const p = this.chain.then(job);
    this.chain = p.catch(() => {});
    return p;
  }

  setOptions(opts: Record<string, string | number | boolean>) {
    return this.enqueue(async () => {
      for (const [k, v] of Object.entries(opts)) this.w.postMessage(`setoption name ${k} value ${v}`);
      await this.until('isready', (l) => l === 'readyok');
    });
  }

  /** Scores are from the side to move. Lines sorted best-first. */
  analyse(fen: string, go: Go, multipv = 1, onInfo?: (lines: Line[]) => void) {
    return this.enqueue(async () => {
      const lines: Line[] = [];
      let best = '';
      this.w.postMessage(`setoption name MultiPV value ${multipv}`);
      this.w.postMessage(`position fen ${fen}`);
      const goCmd = 'go' + Object.entries(go).map(([k, v]) => ` ${k} ${v}`).join('');
      await this.until(
        goCmd,
        (l) => {
          if (!l.startsWith('bestmove')) return false;
          best = l.split(' ')[1];
          return true;
        },
        (l) => {
          const line = parseInfo(l);
          if (!line) return;
          lines[line.multipv - 1] = line;
          onInfo?.(lines.filter(Boolean));
        },
      );
      return { bestmove: best === '(none)' ? '' : best, lines: lines.filter(Boolean) };
    });
  }

  stop() {
    this.w.postMessage('stop');
  }

  terminate() {
    this.w.terminate();
  }
}

function parseInfo(l: string): Line | null {
  if (!l.startsWith('info ') || !l.includes(' pv ') || l.includes('bound')) return null;
  const t = l.split(' ');
  const at = (k: string) => t[t.indexOf(k) + 1];
  const line: Line = {
    multipv: t.includes('multipv') ? +at('multipv') : 1,
    depth: +at('depth'),
    pv: t.slice(t.indexOf('pv') + 1),
    nps: t.includes('nps') ? +at('nps') : undefined,
  };
  const kind = at('score');
  const val = +t[t.indexOf('score') + 2];
  if (kind === 'mate') line.mate = val;
  else line.cp = val;
  return line;
}
