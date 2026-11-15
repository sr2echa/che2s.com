import { useEffect, useState } from 'react';
import { Stockfish, type Line } from './stockfish';
import { negate, type Score } from './chess';

export interface Judgement {
  /** White-POV score. */
  score: Score;
  depth: number;
  pv: string[];
  fen: string;
  nodes?: number;
  /** White-POV win/draw/loss, per mille. */
  wdl?: [number, number, number];
}

let sf: Stockfish | null = null;
let token = 0;

/** Live Stockfish evaluation of `fen` at full strength, refined as depth grows. */
export function useJudge(fen: string, enabled: boolean, depth: number, terminal: Score | null): Judgement | null {
  const [j, setJ] = useState<Judgement | null>(null);
  useEffect(() => {
    const me = ++token; // invalidates any search still reporting for an older position
    if (!enabled) return setJ(null);
    if (terminal) {
      const wdl: [number, number, number] = terminal.mate === 0 ? ((terminal.cp ?? 0) > 0 ? [1000, 0, 0] : [0, 0, 1000]) : [0, 1000, 0];
      return setJ({ score: terminal, depth: 0, pv: [], fen, wdl });
    }
    sf ??= new Stockfish();
    const white = fen.split(' ')[1] === 'w';
    const apply = (lines: Line[]) => {
      const l = lines[0];
      if (me !== token || !l) return;
      const wdl = l.wdl && (white ? l.wdl : ([l.wdl[2], l.wdl[1], l.wdl[0]] as [number, number, number]));
      setJ({ score: white ? l : negate(l), depth: l.depth, pv: l.pv, fen, nodes: l.nodes, wdl });
    };
    sf.stop();
    // Debounced so scrubbing through moves never queues a backlog of full-depth searches.
    const t = setTimeout(() => {
      sf!.setOptions({ UCI_LimitStrength: false, UCI_ShowWDL: true });
      sf!.analyse(fen, { depth }, 1, apply).then((r) => apply(r.lines));
    }, 120);
    return () => {
      clearTimeout(t);
      sf?.stop();
    };
  }, [fen, enabled, depth, terminal?.cp, terminal?.mate]);
  // Stale judgement is kept until the new one arrives so the bar glides instead of snapping to 50%.
  return j;
}
