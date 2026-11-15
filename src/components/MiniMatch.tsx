import { useEffect, useMemo, useState } from 'react';
import Board from './Board';
import { Heat, Marks } from './Overlay';
import { think } from '../lib/brain';
import { botById } from '../lib/bots';
import { defaults, type Hud } from '../lib/types';
import { pieceVars } from '../lib/pieces';
import { INITIAL_FEN, fromFen, toFen, play, outcomeOf } from '../lib/chess';

// A live exhibition for the Bots page: two in-browser bots playing forever, with their overlays on.
const CAST = { white: { id: 'shannon', over: { time: 500, noise: 25 } }, black: { id: 'monte', over: { sims: 2500 } } } as const;

export default function MiniMatch() {
  const [fen, setFen] = useState(INITIAL_FEN);
  const [last, setLast] = useState<string>();
  const [hud, setHud] = useState<Hud | null>(null);
  const noDests = useMemo(() => new Map(), []);

  useEffect(() => {
    let dead = false;
    let cancel = () => {};
    (async () => {
      let pos = fromFen(INITIAL_FEN);
      let moves: string[] = [];
      while (!dead) {
        const side = pos.turn;
        const bot = botById(CAST[side].id)!;
        const job = think(bot.id, { fen: toFen(pos), moves, startFen: INITIAL_FEN, settings: { ...defaults(bot.settings), ...CAST[side].over } });
        cancel = job.cancel;
        const { move, hud } = await job.result;
        if (dead) return;
        play(pos, move);
        moves = [...moves, move];
        setFen(toFen(pos));
        setLast(move);
        setHud(hud ?? null);
        await new Promise((r) => setTimeout(r, 1100));
        if (outcomeOf(pos, []) || moves.length > 90) {
          await new Promise((r) => setTimeout(r, 2000));
          pos = fromFen(INITIAL_FEN);
          moves = [];
          setFen(INITIAL_FEN);
          setLast(undefined);
          setHud(null);
        }
      }
    })().catch(() => {});
    return () => {
      dead = true;
      cancel();
    };
  }, []);

  const pos = fromFen(fen);
  return (
    <figure className="mini" data-pieces style={pieceVars('cburnett')}>
      <Board fen={fen} orientation="white" turn={pos.turn} lastMove={last} check={pos.isCheck()} dests={noDests} onMove={() => {}} under={<Heat hud={hud} orientation="white" />} over={<Marks hud={hud ? { arrows: hud.arrows } : null} orientation="white" />} />
      <figcaption>
        <span>Shannon <em>vs</em> Monte</span>
        <span className="mono faint">Live, in your browser</span>
      </figcaption>
    </figure>
  );
}
