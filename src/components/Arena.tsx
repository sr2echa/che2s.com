import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chessgroundDests } from 'chessops/compat';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import type { Key } from 'chessground/types';
import {
  CaretLeftIcon, CaretRightIcon, SkipBackIcon, SkipForwardIcon, ArrowUUpLeftIcon, ArrowsClockwiseIcon, PlayIcon, PauseIcon,
  UserSwitchIcon, CopySimpleIcon, GearSixIcon, EyeIcon, EyeSlashIcon, SlidersHorizontalIcon, PlusIcon, CheckIcon, ArrowUpRightIcon,
} from '@phosphor-icons/react';
import Board from './Board';
import { Heat, Marks } from './Overlay';
import SeatSheet, { HUMAN, settingsOf, type Seat } from './SeatSheet';
import ReviewPanel, { Insight } from './ReviewPanel';
import { useLiveRatings } from '../lib/useLiveRatings';
import GameSheet, { usePrefs } from './GameSheet';
import { botById } from '../lib/bots';
import { think } from '../lib/brain';
import { useJudge } from '../lib/useJudge';
import { INITIAL_FEN, fromFen, toFen, play, stdUci, parseSquare, outcomeOf, winPct, fmtScore, isValidFen, pvSan, describeScore, captures, type Score } from '../lib/chess';
import { reviewGame, CLS, type Review, type MoveReview } from '../lib/review';
import type { Hud } from '../lib/types';
import { pieceVars } from '../lib/pieces';

type Side = 'white' | 'black';
// chessground's piece CSS targets a custom <piece> element.
const Piece = 'piece' as unknown as 'div';
const other = (s: Side): Side => (s === 'white' ? 'black' : 'white');
const seat = (id: string): Seat => ({ id: id === HUMAN || botById(id) ? id : HUMAN, settings: {}, hud: false });

function initialSeats(): Record<Side, Seat> {
  const q = new URLSearchParams(location.search);
  return { white: seat(q.get('white') ?? HUMAN), black: seat(q.get('black') ?? 'stockfish') };
}

const nameOf = (s: Seat) => botById(s.id)?.name ?? 'Human';
function summary(s: Seat) {
  const bot = botById(s.id);
  if (!bot) return 'You';
  const v = settingsOf(s);
  if (v.full) return 'Full strength';
  const r = bot.settings.find((x) => x.type === 'range');
  return r && r.type === 'range' ? `${r.label} ${v[r.key]}${r.unit ? ` ${r.unit}` : ''}` : bot.approach;
}

export default function Arena() {
  const [seats, setSeats] = useState<Record<Side, Seat>>(initialSeats);
  const [startFen, setStartFen] = useState(INITIAL_FEN);
  const [moves, setMoves] = useState<string[]>([]);
  const [view, setView] = useState(-1);
  const [orientation, setOrientation] = useState<Side>(() => (seats.white.id !== HUMAN && seats.black.id === HUMAN ? 'black' : 'white'));
  const [paused, setPaused] = useState(false);
  const [huds, setHuds] = useState<Record<number, Hud>>({});
  const [thinking, setThinking] = useState<{ side: Side; text?: string } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [sheet, setSheet] = useState<Side | null>(null);
  const [promo, setPromo] = useState<{ from: Key; to: Key } | null>(null);
  const [sync, setSync] = useState(0);
  const [prefs, setPrefs] = usePrefs();
  const [gameSheet, setGameSheet] = useState(false);
  const { judge: judgeOn, depth: judgeDepth, hint, pace } = prefs;
  const [tab, setTab] = useState<'moves' | 'review' | 'vision'>('moves');
  const [review, setReview] = useState<Review | null>(null);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [reviewDepth, setReviewDepth] = useState(14);
  const [copied, setCopied] = useState(false);
  const pieceSet = prefs.pieces;

  const game = useMemo(() => {
    const fens = [startFen];
    const sans: string[] = [];
    const pos = fromFen(startFen);
    for (const m of moves) {
      const san = play(pos, m);
      if (!san) break;
      sans.push(san);
      fens.push(toFen(pos));
    }
    return { fens, sans, turn: pos.turn as Side, outcome: outcomeOf(pos, fens) };
  }, [startFen, moves]);

  const live = moves.length;
  const ply = view < 0 || view > live ? live : view;
  const shownFen = game.fens[ply];
  const shown = useMemo(() => {
    const pos = fromFen(shownFen);
    return { pos, turn: pos.turn as Side, check: pos.isCheck(), dests: chessgroundDests(pos), outcome: outcomeOf(pos, game.fens.slice(0, ply + 1)) };
  }, [shownFen, ply, game.fens]);

  const caps = useMemo(() => captures(shownFen), [shownFen]);
  const liveRatings = useLiveRatings(game.fens, moves.slice(0, game.sans.length), prefs.live);
  const ratings: (MoveReview | undefined)[] = review?.moves ?? liveRatings;
  const bothBots = seats.white.id !== HUMAN && seats.black.id !== HUMAN;

  // One human at the table: put their pieces at the bottom. Two humans or two bots: leave the board as is.
  const humans = `${seats.white.id === HUMAN}${seats.black.id === HUMAN}`;
  useEffect(() => {
    if (humans === 'truefalse') setOrientation('white');
    else if (humans === 'falsetrue') setOrientation('black');
  }, [humans]);
  const hasBot = seats.white.id !== HUMAN || seats.black.id !== HUMAN;

  // ---- bot turns -------------------------------------------------------------
  const side = game.turn;
  const toMove = seats[side];
  const seatKey = toMove.id + JSON.stringify(settingsOf(toMove));
  useEffect(() => {
    if (game.outcome || toMove.id === HUMAN || paused || error) return;
    const bot = botById(toMove.id)!;
    const at = moves.length;
    const fen = game.fens[at];
    let dead = false;
    let handle: ReturnType<typeof think> | undefined;
    const timer = setTimeout(() => {
      setThinking({ side });
      handle = think(bot.id, { fen, moves, startFen, settings: settingsOf(toMove) }, {
        onHud: (h) => !dead && setHuds((p) => ({ ...p, [at]: h })),
        onStatus: (text) => !dead && setThinking({ side, text }),
      });
      handle.result.then(
        ({ move, hud }) => {
          if (dead) return;
          if (hud) setHuds((p) => ({ ...p, [at]: hud }));
          setThinking(null);
          if (!play(fromFen(fen), move)) return setError(`${bot.name} returned an illegal move (${move || 'none'})`);
          setMoves((ms) => (ms.length === at ? [...ms, move] : ms));
        },
        (e: Error) => {
          if (dead) return;
          setThinking(null);
          setError(`${bot.name}: ${e.message}`);
        },
      );
    }, bothBots ? pace : 150);
    return () => {
      dead = true;
      clearTimeout(timer);
      handle?.cancel();
      setThinking(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves, startFen, seatKey, side, paused, !!game.outcome, error, retry, bothBots ? pace : 0]);

  // ---- human moves -----------------------------------------------------------
  const commit = useCallback(
    (uci: string) => {
      setMoves(moves.slice(0, ply).concat(uci));
      setHuds((h) => Object.fromEntries(Object.entries(h).filter(([k]) => +k <= ply)));
      if (ply < live) setReview(null);
      setView(-1);
      setError('');
    },
    [moves, ply, live],
  );

  const onMove = useCallback(
    (from: Key, to: Key) => {
      const pos = fromFen(shownFen);
      const m = { from: parseSquare(from)!, to: parseSquare(to)! };
      if (pos.board.get(m.from)?.role === 'pawn' && (m.to >> 3 === 0 || m.to >> 3 === 7)) return setPromo({ from, to });
      commit(stdUci(pos, m));
    },
    [shownFen, commit],
  );

  const movable = !shown.outcome && seats[shown.turn].id === HUMAN && !promo ? shown.turn : undefined;

  // ---- judge -----------------------------------------------------------------
  const terminal: Score | null = shown.outcome ? (shown.outcome.winner ? { mate: 0, cp: shown.outcome.winner === 'white' ? 1 : -1 } : { cp: 0 }) : null;
  const judge = useJudge(shownFen, judgeOn, judgeDepth, terminal);
  const wp = judge ? winPct(judge.score) : 50;

  // ---- HUD selection -----------------------------------------------------------
  const { hud, hudBy } = useMemo((): { hud: Hud | null; hudBy?: Side } => {
    for (const s of [shown.turn, other(shown.turn)]) {
      const st = seats[s];
      const bot = botById(st.id);
      if (!st.hud || !bot) continue;
      if (bot.view) return { hud: bot.view(shownFen), hudBy: s };
      const h = s === shown.turn ? huds[ply] : huds[ply - 1];
      if (h) return { hud: h, hudBy: s };
    }
    return { hud: null };
  }, [seats, shown.turn, shownFen, huds, ply]);

  const rev = ply > 0 ? ratings[ply - 1] : undefined;
  const badge = rev ? { sq: rev.uci.slice(2, 4), glyph: CLS[rev.cls].glyph, color: CLS[rev.cls].color } : undefined;
  const marks: Hud | null = rev && !['best', 'brilliant', 'great', 'forced'].includes(rev.cls)
    ? { ...(hud ?? {}), arrows: [...(hud?.arrows ?? []), { from: rev.best.slice(0, 2), to: rev.best.slice(2, 4), tone: 'pick', label: 'best' }] }
    : hud;
  const hintMove = hint && judge?.fen === shownFen && judge.pv[0] && !shown.outcome ? judge.pv[0] : undefined;

  // ---- actions -------------------------------------------------------------------
  const reset = (fen = startFen, ms: string[] = []) => {
    setStartFen(fen);
    setMoves(ms);
    setHuds({});
    setView(-1);
    setReview(null);
    setError('');
    setPaused(false);
  };
  const undo = () => {
    let n = moves.length;
    if (n === 0) return;
    n--;
    // Step back to a position where a human is to move (vs-bot games undo the bot reply too).
    const turnAt = (i: number) => fromFen(game.fens[i]).turn as Side;
    if (!bothBots && seats[turnAt(n)].id !== HUMAN && n > 0) n--;
    setMoves(moves.slice(0, n));
    setHuds((h) => Object.fromEntries(Object.entries(h).filter(([k]) => +k < n)));
    setView(-1);
    setReview(null);
    setError('');
    if (bothBots) setPaused(true);
  };
  const swap = () => {
    setSeats((s) => ({ white: s.black, black: s.white }));
    setOrientation(other);
  };
  const go = (i: number) => setView(i >= live ? -1 : Math.max(0, i));

  const result = game.outcome ? (game.outcome.winner ? (game.outcome.winner === 'white' ? '1-0' : '0-1') : '½-½') : '*';
  const pgn = () => {
    const whiteFirst = startFen.split(' ')[1] === 'w';
    const full = +startFen.split(' ')[5] || 1;
    const parts = game.sans.map((san, i) => {
      const k = i + (whiteFirst ? 0 : 1);
      const n = full + Math.floor(k / 2);
      return k % 2 === 0 ? `${n}. ${san}` : i === 0 ? `${n}... ${san}` : san;
    });
    const head = [`[Event "che2s arena"]`, `[White "${nameOf(seats.white)}"]`, `[Black "${nameOf(seats.black)}"]`, `[Result "${result === '½-½' ? '1/2-1/2' : result}"]`];
    if (startFen !== INITIAL_FEN) head.push('[SetUp "1"]', `[FEN "${startFen}"]`);
    return `${head.join('\n')}\n\n${parts.join(' ')} ${result === '½-½' ? '1/2-1/2' : result}\n`;
  };
  const copyPgn = async () => {
    await navigator.clipboard?.writeText(pgn()).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  const load = (text: string): string | void => {
    const t = text.trim();
    if (isValidFen(t)) return reset(t);
    const g = parsePgn(t)[0];
    const start = g && startingPosition(g.headers);
    if (!g || !start || start.isErr) return 'Could not read that FEN or PGN.';
    const pos = start.unwrap();
    const fen = toFen(pos as never);
    const ms: string[] = [];
    for (const node of g.moves.mainline()) {
      const m = parseSan(pos, node.san);
      if (!m) break;
      const u = stdUci(pos as never, m as never);
      pos.play(m);
      ms.push(u);
    }
    reset(fen, ms);
  };

  const runReview = async () => {
    setTab('review');
    setReviewing(0);
    try {
      setReview(await reviewGame(startFen, moves, reviewDepth, (d, t) => setReviewing(d / t)));
      setView(moves.length ? 1 : -1);
    } finally {
      setReviewing(null);
    }
  };

  // ---- keyboard ------------------------------------------------------------------
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea') || sheet || gameSheet) return;
      if (e.key === 'ArrowLeft') go(ply - 1);
      else if (e.key === 'ArrowRight') go(ply + 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(live);
      else if (e.key === 'f') setOrientation(other);
      else if (e.key === ' ' && hasBot) setPaused((p) => !p);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const movesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (view < 0 && movesRef.current) movesRef.current.scrollTop = movesRef.current.scrollHeight;
  }, [live, view]);

  // ---- render ----------------------------------------------------------------------
  const seatRow = (s: Side, area: string) => {
    const st = seats[s];
    const bot = botById(st.id);
    const busy = thinking?.side === s;
    const toPlay = !game.outcome && ply === live && game.turn === s;
    const lead = s === 'white' ? caps.diff : -caps.diff;
    const inCheck = shown.check && shown.turn === s && !shown.outcome;
    return (
      <div className={`seat ${area} ${toPlay ? 'on' : ''}`} style={{ gridArea: area }} data-testid={`seat-${s}`}>
        <button className="who" onClick={() => setSheet(s)} aria-label={`Configure ${s}`} data-tip={`Choose who plays ${s}`}>
          <span className={`chip ${s}`} />
          <span className="name">
            {nameOf(st)}
            {/* Signals float off the name so they never push the row around. */}
            {inCheck ? (
              <span className="bubble check" data-testid={`check-${s}`}>Check</span>
            ) : busy ? (
              <span className="bubble typing" data-testid={`thinking-${s}`} title={thinking?.text ?? 'Thinking'}>
                <i /><i /><i />
                {thinking?.text && <em>{thinking.text.replace('Downloading network · ', '')}</em>}
              </span>
            ) : null}
          </span>
          <span className="sub mono">{summary(st)}</span>
        </button>
        <span className="caps" data-testid={`caps-${s}`} aria-label={`${s} has captured ${caps.taken[s].length} pieces`}>
          {caps.taken[s].map((r, i) => (
            <Piece key={i} className={`${r} ${other(s)} ${caps.taken[s][i - 1] === r ? 'stack' : ''}`} />
          ))}
          {lead > 0 && <b className="mono">+{lead}</b>}
        </span>
        {!bot && <span className="icon-slot" />}
        {bot && (
          <button className="icon-btn" aria-pressed={st.hud} aria-label={`${st.hud ? 'Hide' : 'Show'} what ${bot.name} sees`} data-tip={`${st.hud ? 'Hide' : 'Show'} ${bot.name}'s view: ${bot.hud.toLowerCase()}`} onClick={() => (setSeats((x) => ({ ...x, [s]: { ...st, hud: !st.hud } })), !st.hud && setTab('vision'))} data-testid={`hud-${s}`}>
            {st.hud ? <EyeIcon size={18} /> : <EyeSlashIcon size={18} />}
          </button>
        )}
        <button className="icon-btn" aria-label={`Settings for ${s}`} data-tip={`${s === 'white' ? 'White' : 'Black'} player settings`} onClick={() => setSheet(s)}>
          <SlidersHorizontalIcon size={18} />
        </button>
      </div>
    );
  };

  const status = (() => {
    if (error) return error;
    if (ply < live) return `Viewing move ${Math.ceil(ply / 2) || 'start'}. Press End to return.`;
    if (game.outcome) return judgeOn ? 'Game over.' : game.outcome.winner ? `${game.outcome.reason}. ${game.outcome.winner === 'white' ? 'White' : 'Black'} wins.` : `Draw. ${game.outcome.reason}.`;
    if (paused && hasBot) return 'Paused.';
    const who = seats[game.turn];
    return who.id === HUMAN ? `${game.turn === 'white' ? 'White' : 'Black'} to move.` : `${nameOf(who)} to move.`;
  })();

  const top = orientation === 'white' ? 'black' : 'white';
  const whiteFirst = startFen.split(' ')[1] === 'w';
  const fullStart = +startFen.split(' ')[5] || 1;
  const rows: { n: number; w?: number; b?: number }[] = [];
  game.sans.forEach((_, i) => {
    const k = i + (whiteFirst ? 0 : 1);
    if (k % 2 === 0 || i === 0) rows.push({ n: fullStart + Math.floor(k / 2) });
    rows[rows.length - 1][k % 2 === 0 ? 'w' : 'b'] = i;
  });

  const mate = judge?.score.mate;
  const files = orientation === 'white' ? 'abcdefgh' : 'hgfedcba';
  const ranks = orientation === 'white' ? '87654321' : '12345678';
  const showJudge = judgeOn && !!judge;
  const anyHud = (['white', 'black'] as const).some((x) => seats[x].hud && botById(seats[x].id));
  const deckTabs = (anyHud ? ['moves', 'review', 'vision'] : ['moves', 'review']) as ('moves' | 'review' | 'vision')[];
  const deck = deckTabs.includes(tab) ? tab : 'moves';

  return (
    <div className="arena" data-pieces style={{ ['--wp' as string]: showJudge ? wp : 50, ...pieceVars(pieceSet) }}>
      <div className="aura" aria-hidden />
      <section className="stage">
        {seatRow(top, 'top')}
        {judgeOn && prefs.evalBar && (
          <div className={`evalbar ${orientation === 'black' ? 'flip' : ''}`} aria-label={`White win probability ${Math.round(wp)}%`} data-testid="evalbar" data-wp={Math.round(wp)}>
            <div className="fill" style={{ transform: `scaleY(${wp / 100})` }} />
            <div className="bead" style={{ transform: `translateY(${(orientation === 'white' ? 100 - wp : wp) / 100 * 100}cqh)` }}>
              {judge && <span className="mono">{fmtScore(judge.score)}</span>}
            </div>
          </div>
        )}
        <div className="rail ranks" aria-hidden>
          {[...ranks].map((r) => <span key={r}>{r}</span>)}
        </div>
        <div className="board-slot">
          <Board
            key={sync}
            fen={shownFen}
            orientation={orientation}
            turn={shown.turn}
            lastMove={ply > 0 ? moves[ply - 1] : undefined}
            check={shown.check}
            movable={movable}
            dests={shown.dests}
            onMove={onMove}
            under={<Heat hud={hud} orientation={orientation} />}
            over={<Marks hud={marks} orientation={orientation} badge={badge} hint={hintMove} />}
          >
            {promo && (
              <div className="promo cg-wrap" onClick={() => (setPromo(null), setSync((x) => x + 1))}>
                <div className="row" onClick={(e) => e.stopPropagation()}>
                  {(['queen', 'knight', 'rook', 'bishop'] as const).map((r) => (
                    <button key={r} aria-label={`Promote to ${r}`} onClick={() => (commit(stdUci(fromFen(shownFen), { from: parseSquare(promo.from)!, to: parseSquare(promo.to)!, promotion: r })), setPromo(null))}>
                      <Piece className={`${r} ${shown.turn}`} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {game.outcome && ply === live && (
              <div className="verdict" data-testid="verdict">
                <div className="score">{result}</div>
                <div className="why">{game.outcome.reason}</div>
                <div className="matchup" data-testid="matchup">
                  {(['white', 'black'] as const).map((c, i) => (
                    <span key={c} className={game.outcome?.winner === c ? 'won' : ''}>
                      {i === 1 && <i>vs</i>}
                      <b>{nameOf(seats[c])}<small>{summary(seats[c])}</small></b>
                    </span>
                  ))}
                </div>
                <button className="cta" onClick={runReview} disabled={reviewing !== null}>
                  Review game
                  <span className="cta-icon"><ArrowUpRightIcon size={14} weight="bold" /></span>
                </button>
              </div>
            )}
          </Board>
        </div>
        <div className="rail files" aria-hidden>
          {[...files].map((f) => <span key={f}>{f}</span>)}
        </div>
        {seatRow(other(top), 'bottom')}
      </section>

      <aside className="side">
        {judgeOn && (
          <section className="judge" data-testid="judge">
            <div className="judge-head">
              <span>Evaluation</span>
              <span className="mono">{!judge ? 'thinking' : judge.depth ? `depth ${judge.depth}${judge.nodes ? `  ${kilo(judge.nodes)} nodes` : ''}` : 'final'}</span>
            </div>
            <div className={`big mono ${mate ? 'mate' : ''}`} data-testid="judge-eval">{judge ? fmtScore(judge.score, 2) : '0.00'}</div>
            <div className="says">{judge ? describeScore(shown.outcome && !shown.outcome.winner ? { mate: 0, cp: 0 } : judge.score) : 'Evaluating.'}</div>
            {prefs.wdl && <Wdl wdl={judge?.wdl ?? wdlFromWp(wp)} />}
            {prefs.bestLine && (
              <div className="line mono" title={judge?.pv.join(' ')}>
                {judge && judge.pv.length > 0 && <><b>Best</b> {pvSan(shownFen, judge.pv)}</>}
              </div>
            )}
          </section>
        )}

        {prefs.live && prefs.ratingCard && (
          <div className="rating-slot" data-testid="rating-slot">
            {rev && deck !== 'review' && <Insight key={`${ply}-${rev.uci}`} r={rev} />}
          </div>
        )}

        <div className="toolbar">
          <div className={`status ${error ? 'err' : ''}`} data-testid="status">
            {status}
            {error && <button className="link" onClick={() => (setError(''), setRetry((r) => r + 1))}>Retry</button>}
          </div>
          <button className="icon-btn" aria-label="Game settings" data-tip="Judge, pieces, board, pace, load a position" onClick={() => setGameSheet(true)}>
            <GearSixIcon size={18} />
          </button>
          {live > 0 && (
            <button className="cta small" onClick={() => reset()} data-testid="new-game" data-tip="Start over with the same players">
              New game
              <span className="cta-icon"><PlusIcon size={12} weight="bold" /></span>
            </button>
          )}
        </div>

        <div className="nav" aria-label="Move navigation">
          <button className="icon-btn" aria-label="First move" data-tip="Start of game (Home)" onClick={() => go(0)} disabled={ply === 0}><SkipBackIcon size={17} weight="fill" /></button>
          <button className="icon-btn" aria-label="Previous move" data-tip="Previous move (←)" onClick={() => go(ply - 1)} disabled={ply === 0}><CaretLeftIcon size={17} weight="bold" /></button>
          <span className="counter mono" data-testid="counter">{ply === 0 ? 'Start' : `Move ${Math.ceil(ply / 2)}`}<em>{ply} / {live}</em></span>
          <button className="icon-btn" aria-label="Next move" data-tip="Next move (→)" onClick={() => go(ply + 1)} disabled={ply === live}><CaretRightIcon size={17} weight="bold" /></button>
          <button className="icon-btn" aria-label="Last move" data-tip="Latest position (End)" onClick={() => go(live)} disabled={ply === live}><SkipForwardIcon size={17} weight="fill" /></button>
        </div>
        <div className="actions">
          {hasBot && (
            <button className="chip-btn" aria-label={paused ? 'Resume' : 'Pause'} data-tip={paused ? 'Let the bots continue (Space)' : 'Stop the bots after this move (Space)'} onClick={() => setPaused(!paused)} disabled={!!game.outcome} data-testid="pause">
              {paused ? <PlayIcon size={15} weight="fill" /> : <PauseIcon size={15} weight="fill" />}
              {paused ? 'Resume' : 'Pause'}
            </button>
          )}
          <button className="chip-btn" aria-label="Take back" data-tip="Undo your last move" onClick={undo} disabled={!live}><ArrowUUpLeftIcon size={15} weight="bold" />Undo</button>
          <button className="chip-btn" aria-label="Flip board" data-tip="Turn the board around (F)" onClick={() => setOrientation(other)}><ArrowsClockwiseIcon size={15} weight="bold" />Flip</button>
          <button className="chip-btn" aria-label="Swap sides" data-tip="Swap who plays White and Black" onClick={swap}><UserSwitchIcon size={15} weight="bold" />Swap</button>
          <button className="chip-btn" aria-label="Copy PGN" data-tip="Copy the game as PGN" onClick={copyPgn} disabled={!live}>{copied ? <CheckIcon size={15} weight="bold" /> : <CopySimpleIcon size={15} weight="bold" />}{copied ? 'Copied' : 'PGN'}</button>
        </div>

        <section className="deck">
          <div className={`tabs n${deckTabs.length}`} role="tablist" style={{ ['--t' as string]: Math.max(0, deckTabs.indexOf(deck)) }}>
            <i className="tab-ink" />
            {deckTabs.map((t) => (
              <button key={t} role="tab" aria-selected={deck === t} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
                {t === 'moves' ? 'Moves' : t === 'review' ? 'Review' : 'Bot view'}
              </button>
            ))}
          </div>
          <div className="deck-body">
            {deck === 'moves' && (
              <div className="moves" ref={movesRef} data-testid="moves">
                {!rows.length && <div className="empty">No moves yet. {seats[game.turn].id === HUMAN ? 'Make the first one.' : ''}</div>}
                {rows.map((r) => (
                  <MoveRow key={r.n} r={r} sans={game.sans} ply={ply} go={go} ratings={ratings} />
                ))}
              </div>
            )}
            {deck === 'review' && <ReviewPanel review={review} progress={reviewing} depth={reviewDepth} setDepth={setReviewDepth} run={runReview} canRun={live > 0} ply={ply} go={go} />}
            {deck === 'vision' && (
              <div className="eye" data-testid="eye">
                {hud ? (
                  <>
                    <span className="label"><EyeIcon size={13} /> {nameOf(seats[hudBy!])} sees</span>
                    {hud.caption && <div className="caption">{hud.caption}</div>}
                    {!!hud.stats?.length && (
                      <dl className="stats">
                        {hud.stats.slice(0, 3).map(([k, v]) => (
                          <div key={k}><dt>{k}</dt><dd title={v}>{v}</dd></div>
                        ))}
                      </dl>
                    )}
                  </>
                ) : (
                  <div className="empty">Its view appears after it thinks.</div>
                )}
              </div>
            )}
          </div>
        </section>
      </aside>

      {gameSheet && <GameSheet prefs={prefs} set={setPrefs} onLoad={load} onClose={() => setGameSheet(false)} />}
      {sheet && <SeatSheet side={sheet} seat={seats[sheet]} onClose={() => setSheet(null)} onChange={(s) => setSeats((x) => ({ ...x, [sheet]: s }))} />}
    </div>
  );
}

const kilo = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
/** Fallback when the engine sent no WDL: split win% with no draw share. */
const wdlFromWp = (wp: number): [number, number, number] => [wp * 10, 0, 1000 - wp * 10];

function Wdl({ wdl }: { wdl: [number, number, number] }) {
  const [w, d, l] = wdl.map((x) => x / 10);
  const pct = (x: number) => `${Math.round(x)}%`;
  return (
    <div className="wdl" data-testid="wdl">
      <div className="bars">
        <i className="w" style={{ flexGrow: Math.max(w, 1.5) }} />
        <i className="d" style={{ flexGrow: Math.max(d, 1.5) }} />
        <i className="l" style={{ flexGrow: Math.max(l, 1.5) }} />
      </div>
      <div className="mono labels">
        <span>White {pct(w)}</span>
        <span>Draw {pct(d)}</span>
        <span>Black {pct(l)}</span>
      </div>
    </div>
  );
}

function MoveRow({ r, sans, ply, go, ratings }: { r: { n: number; w?: number; b?: number }; sans: string[]; ply: number; go(i: number): void; ratings: (MoveReview | undefined)[] }) {
  const cell = (i?: number) =>
    i === undefined ? <span /> : (
      <button aria-current={ply === i + 1} onClick={() => go(i + 1)}>
        {sans[i]}
        {ratings[i] && <span className="glyph" style={{ color: CLS[ratings[i]!.cls].color }} title={CLS[ratings[i]!.cls].label}>{CLS[ratings[i]!.cls].glyph}</span>}
      </button>
    );
  return (
    <>
      <span className="n">{r.n}</span>
      {cell(r.w)}
      {cell(r.b)}
    </>
  );
}
