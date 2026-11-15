import { useEffect, useRef, useState } from 'react';
import { analyst, rateMove, type MoveReview } from './review';

const LIVE_DEPTH = 12;

/** Rates each move as it is played (depth 12), in order, in the background. Results survive takebacks. */
export function useLiveRatings(fens: string[], moves: string[], enabled: boolean): (MoveReview | undefined)[] {
  const store = useRef(new Map<string, MoveReview>());
  const [, bump] = useState(0);
  const key = (i: number) => `${fens[i]}|${moves[i]}`;

  useEffect(() => {
    if (!enabled) return;
    let dead = false;
    (async () => {
      for (let i = 0; i < moves.length && !dead; i++) {
        if (store.current.has(key(i))) continue;
        const before = await analyst.get(fens[i], LIVE_DEPTH);
        const after = await analyst.get(fens[i + 1], LIVE_DEPTH);
        if (dead) return;
        store.current.set(key(i), rateMove(fens[i], moves[i], before, after, store.current.get(key(i - 1))?.cls, i + 1));
        bump((n) => n + 1);
      }
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fens.join('\n'), enabled]);

  return enabled ? moves.map((_, i) => store.current.get(key(i))) : [];
}
