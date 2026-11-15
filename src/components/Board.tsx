import { useEffect, useRef, type ReactNode } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';

interface Props {
  fen: string;
  orientation: 'white' | 'black';
  turn: 'white' | 'black';
  lastMove?: string;
  check: boolean;
  /** Side allowed to move, if any. */
  movable?: 'white' | 'black';
  dests: Map<Key, Key[]>;
  onMove(from: Key, to: Key): void;
  under?: ReactNode;
  over?: ReactNode;
  children?: ReactNode;
}

export default function Board({ fen, orientation, turn, lastMove, check, movable, dests, onMove, under, over, children }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  useEffect(() => {
    api.current = Chessground(el.current!, {
      animation: { enabled: true, duration: 240 },
      highlight: { lastMove: true, check: true },
      coordinates: false,
      draggable: { showGhost: true },
      drawable: { enabled: true, visible: true },
      movable: { free: false, showDests: true, events: { after: (o, d) => moveRef.current(o, d) } },
      premovable: { enabled: false },
    });
    // Chessground caches square geometry; re-measure whenever the board's box changes size.
    const ro = new ResizeObserver(() => api.current?.redrawAll());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      api.current?.destroy();
    };
  }, []);

  useEffect(() => {
    api.current?.set({
      fen: fen.split(' ')[0],
      orientation,
      turnColor: turn,
      check: check ? turn : false,
      lastMove: lastMove ? ([lastMove.slice(0, 2), lastMove.slice(2, 4)] as Key[]) : undefined,
      movable: { color: movable, dests: movable ? dests : new Map() },
    });
  }, [fen, orientation, turn, check, lastMove, movable, dests]);

  return (
    <div className="board" data-testid="board">
      <div className="layer under">{under}</div>
      <div ref={el} className="cg-wrap" />
      <div className="layer top">{over}</div>
      {children}
    </div>
  );
}
