// UCI wrapper around the Stockfish 19 lite WASM worker. Searches are serialized.
import type { Score } from './chess';
import { loadAsset, blobUrl, REPO_RAW, REPO_CDN, DEV_LOCAL } from './assets';

/** wdl: win/draw/loss per mille from the side to move (UCI_ShowWDL). */
export type Line = Score & { multipv: number; depth: number; pv: string[]; nps?: number; nodes?: number; wdl?: [number, number, number] };
export type Go = { depth?: number; movetime?: number; nodes?: number };

// Stockfish 19 lite is downloaded by the browser (repo on GitHub, then jsDelivr, then npm via unpkg) and kept
// in Cache Storage; our host never serves it. Keep the exact "stockfish" version in package.json in step.
export const STOCKFISH_VERSION = '19.0.1';
const FILE = 'stockfish-19-lite-single';
const BASES = [`${REPO_RAW}/stockfish`, `${REPO_CDN}/stockfish`, `https://unpkg.com/stockfish@${STOCKFISH_VERSION}/bin`, DEV_LOCAL && `${DEV_LOCAL}/stockfish`];

/**
 * The engine runs from blob URLs: browsers refuse cross-origin worker scripts, and stockfish.js reads its .wasm
 * location from the worker URL's #fragment, so both are handed over as local object URLs.
 */
async function stockfishWorker() {
  const [js, wasm] = await Promise.all([
    loadAsset(`${FILE}@${STOCKFISH_VERSION}.js`, BASES.map((b) => b && `${b}/${FILE}.js`)),
    loadAsset(`${FILE}@${STOCKFISH_VERSION}.wasm`, BASES.map((b) => b && `${b}/${FILE}.wasm`)),
  ]);
  return new Worker(`${blobUrl(js, 'text/javascript')}#${encodeURIComponent(blobUrl(wasm, 'application/wasm'))}`);
}

export class Stockfish {
  private w!: Worker;
  private subs = new Set<(l: string) => void>();
  private chain: Promise<unknown>;

  /** No url: Stockfish 19 lite (downloaded and cached as above). With a url: any same-origin UCI worker script. */
  constructor(url?: string) {
    this.chain = (async () => {
      this.attach(url ? new Worker(url) : await stockfishWorker());
      await this.until('uci', (l) => l === 'uciok');
      await this.until('isready', (l) => l === 'readyok');
    })();
  }

  private attach(w: Worker) {
    this.w = w;
    w.onmessage = (e) => this.subs.forEach((f) => f(String(e.data)));
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
    this.w?.postMessage('stop'); // may be called before the worker has been created
  }

  terminate() {
    this.w?.terminate();
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
    nodes: t.includes('nodes') ? +at('nodes') : undefined,
  };
  if (t.includes('wdl')) {
    const i = t.indexOf('wdl');
    line.wdl = [+t[i + 1], +t[i + 2], +t[i + 3]];
  }
  const kind = at('score');
  const val = +t[t.indexOf('score') + 2];
  if (kind === 'mate') line.mate = val;
  else line.cp = val;
  return line;
}
