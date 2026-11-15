import { useEffect, useState } from 'react';
import { XIcon, ArrowUpRightIcon, CheckIcon } from '@phosphor-icons/react';
import { Range, Switch } from './Controls';
import { PIECE_SETS, BOARD_THEMES } from '../lib/pieces';

export interface Prefs {
  judge: boolean;
  depth: number;
  hint: boolean;
  live: boolean;
  pace: number;
  pieces: string;
  board: string;
  evalBar: boolean;
  wdl: boolean;
  bestLine: boolean;
  ratingCard: boolean;
}
/** A few pieces on the board-theme previews (4x4, index = row * 4 + col). */
const PREVIEW_PIECES: Record<number, string> = { 1: 'bN', 2: 'bK', 9: 'wB', 14: 'wQ' };

/** v2: v1 saved every pref, freezing old defaults (e.g. Papercut pieces) into storage. */
const PREFS_KEY = 'che2s.prefs.v2';

export const DEFAULT_PREFS: Prefs = { judge: true, depth: 18, hint: false, live: true, pace: 500, pieces: 'cburnett', board: 'steel', evalBar: true, wdl: true, bestLine: true, ratingCard: true };

/** Prefs survive reloads; unknown or corrupt storage falls back to defaults. */
export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    try {
      return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
    } catch {
      return DEFAULT_PREFS;
    }
  });
  // Store only what differs from the defaults, so changing a default later reaches everyone who never touched it.
  useEffect(() => {
    const diff = Object.fromEntries(Object.entries(prefs).filter(([k, v]) => DEFAULT_PREFS[k as keyof Prefs] !== v));
    localStorage.setItem(PREFS_KEY, JSON.stringify(diff));
  }, [prefs]);
  return [prefs, (p: Partial<Prefs>) => setPrefs((x) => ({ ...x, ...p }))] as const;
}

interface Props {
  prefs: Prefs;
  set(p: Partial<Prefs>): void;
  onLoad(text: string): string | void;
  onClose(): void;
}

export default function GameSheet({ prefs, set, onLoad, onClose }: Props) {
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="sheet" role="dialog" aria-label="Game settings">
        <header>
          <h2>Game settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close" data-tip="Close (Esc)">
            <XIcon size={18} />
          </button>
        </header>
        <div className="body">
          <section>
            <p className="lead">Appearance</p>
            <h3 className="section-title">Pieces</h3>
            <div className="options" role="radiogroup" aria-label="Piece set">
              {PIECE_SETS.map((p) => (
                <button key={p.id} role="radio" aria-checked={prefs.pieces === p.id} onClick={() => set({ pieces: p.id })} data-testid={`set-${p.id}`}>
                  <span className="preview strip">
                    {['wK', 'bQ', 'wR', 'bB', 'wN', 'bP'].map((c, i) => (
                      <i key={c} className={i % 2 ? 'dk' : 'lt'}><img src={`/pieces/${p.id}/${c}.svg`} alt="" /></i>
                    ))}
                  </span>
                  <span className="meta"><b>{p.name}</b><small>{p.by}</small></span>
                  {prefs.pieces === p.id && <CheckIcon size={16} weight="bold" className="tick" />}
                </button>
              ))}
            </div>
            <h3 className="section-title" style={{ marginTop: 22 }}>Board</h3>
            <div className="cards" role="radiogroup" aria-label="Board colours">
              {BOARD_THEMES.map((t) => (
                <button key={t.id} role="radio" aria-checked={prefs.board === t.id} onClick={() => set({ board: t.id })} data-testid={`board-${t.id}`}>
                  <span className="preview mini-board" style={{ ['--l' as string]: t.light, ['--d' as string]: t.dark }}>
                    {Array.from({ length: 16 }, (_, i) => (
                      <i key={i} className={((i & 3) + (i >> 2)) % 2 ? 'dk' : 'lt'}>
                        {PREVIEW_PIECES[i] && <img src={`/pieces/${prefs.pieces}/${PREVIEW_PIECES[i]}.svg`} alt="" />}
                      </i>
                    ))}
                  </span>
                  <span className="card-name">
                    {t.name}
                    {prefs.board === t.id && <CheckIcon size={13} weight="bold" className="tick" />}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="lead">Judge</p>
            <p className="about">Stockfish 19 at full strength scores every position, independent of the players.</p>
            <div className="field inline">
              <div>Evaluate positions</div>
              <Switch checked={prefs.judge} onChange={(judge) => set({ judge })} label="Judge" />
            </div>
            <div className={`field ${prefs.judge ? '' : 'disabled'}`}>
              <div className="head"><span>Depth</span><span className="val">{prefs.depth === 22 ? 'Max' : prefs.depth}</span></div>
              <div className="seg" role="group" aria-label="Judge depth">
                {[12, 16, 18, 22].map((d) => (
                  <button key={d} aria-pressed={prefs.depth === d} onClick={() => set({ depth: d })}>{d === 22 ? 'Max' : `d${d}`}</button>
                ))}
              </div>
            </div>
            <div className={`field inline ${prefs.judge ? '' : 'disabled'}`}>
              <div>
                <div>Show best move</div>
                <div className="hint">A blue arrow for the engine's choice</div>
              </div>
              <Switch checked={prefs.hint} onChange={(hint) => set({ hint })} label="Show best move" />
            </div>
            <div className="field inline">
              <div>
                <div>Rate moves live</div>
                <div className="hint">Brilliant to blunder, as each move is played</div>
              </div>
              <Switch checked={prefs.live} onChange={(live) => set({ live })} label="Rate moves live" />
            </div>
            <h3 className="section-title" style={{ marginTop: 18 }}>Show in the judge</h3>
            {(
              [
                ['evalBar', 'Eval bar', 'The light column beside the board'],
                ['wdl', 'Win / draw / loss', 'Three bars under the score'],
                ['bestLine', 'Best line', "The engine's expected continuation"],
                ['ratingCard', 'Move rating card', 'Rating and reason for the last move'],
              ] as const
            ).map(([k, label, hint]) => (
              <div key={k} className={`field inline ${prefs.judge || k === 'ratingCard' ? '' : 'disabled'}`}>
                <div>
                  <div>{label}</div>
                  <div className="hint">{hint}</div>
                </div>
                <Switch checked={prefs[k]} onChange={(v) => set({ [k]: v })} label={label} />
              </div>
            ))}
          </section>

          <section>
            <p className="lead">Bots</p>
            <div className="field">
              <div className="head"><span>Pace between moves</span><span className="val">{prefs.pace} ms</span></div>
              <div className="hint">When two bots play each other</div>
              <Range label="Pace" min={0} max={2000} step={100} value={prefs.pace} onChange={(pace) => set({ pace })} />
            </div>
          </section>

          <section>
            <p className="lead">Position</p>
            <p className="about">Start from any FEN, or replay a PGN to analyse or review it.</p>
            <textarea className="paste" aria-label="FEN or PGN" placeholder="Paste a FEN or PGN" value={paste} onChange={(e) => (setPaste(e.target.value), setErr(''))} />
            {err && <div className="status err">{err}</div>}
            <button
              className="cta small"
              style={{ marginTop: 12 }}
              disabled={!paste.trim()}
              onClick={() => {
                const e = onLoad(paste);
                if (e) setErr(e);
                else onClose();
              }}
            >
              Load
              <span className="cta-icon"><ArrowUpRightIcon size={12} weight="bold" /></span>
            </button>
          </section>
        </div>
      </aside>
    </>
  );
}
