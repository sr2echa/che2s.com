import { useEffect, useState } from 'react';
import { isCached } from '../lib/assets';
import { XIcon, CheckIcon } from '@phosphor-icons/react';
import { BOTS, botById } from '../lib/bots';
import { defaults, type Settings } from '../lib/types';
import { Field, Switch } from './Controls';

export interface Seat {
  id: string; // 'human' or a bot id
  settings: Record<string, Settings>;
  hud: boolean;
}

export const HUMAN = 'human';
export const settingsOf = (seat: Seat) => {
  const bot = botById(seat.id);
  return bot ? { ...defaults(bot.settings), ...seat.settings[seat.id] } : {};
};

export default function SeatSheet({ side, seat, onChange, onClose }: { side: 'white' | 'black'; seat: Seat; onChange(s: Seat): void; onClose(): void }) {
  const bot = botById(seat.id);
  const values = settingsOf(seat);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const roster = [{ id: HUMAN, name: 'Human', approach: 'You, at this keyboard' }, ...BOTS];
  // Bots with a one-time download show its size until it is cached.
  const [cached, setCached] = useState<Record<string, boolean>>({});
  useEffect(() => {
    for (const b of BOTS) if (b.download) isCached(b.download.key).then((c) => setCached((x) => ({ ...x, [b.id]: c })));
  }, []);
  // ponytail: roster is a flat list; group by family if it grows past ~16 bots.
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="sheet" role="dialog" aria-label={`${side} player`}>
        <header>
          <h2><span className={`chip ${side}`} />{side === 'white' ? 'White seat' : 'Black seat'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <XIcon size={18} />
          </button>
        </header>
        <div className="body">
          <div>
            <h3 className="section-title">Player</h3>
            <div className="roster">
              {roster.map((b) => (
                <button key={b.id} aria-pressed={seat.id === b.id} onClick={() => onChange({ ...seat, id: b.id })} data-testid={`pick-${b.id}`} title={b.approach}>
                  <span>
                    {b.name}
                    {'download' in b && b.download && (
                      <small className="dl" data-testid={`dl-${b.id}`}>{cached[b.id] ? 'Downloaded' : `${b.download.mb} MB`}</small>
                    )}
                  </span>
                  {seat.id === b.id && <CheckIcon size={14} weight="bold" />}
                </button>
              ))}
            </div>
          </div>

          {bot && (
            <>
              <div>
                <p className="lead">{bot.name}</p>
                <div className="approach">{bot.approach}</div>
                <p className="about">{bot.description}</p>
                {bot.download && !cached[bot.id] && (
                  <p className="about faint" data-testid="dl-note">First game downloads {bot.download.mb} MB once; after that it loads from your browser.</p>
                )}
              </div>
              <div>
                <h3 className="section-title">Settings</h3>
                {bot.settings.map((s) => (
                  <Field key={s.key} s={s} value={values[s.key]} disabled={!!(s.off && values[s.off])} onChange={(v) => onChange({ ...seat, settings: { ...seat.settings, [bot.id]: { ...values, [s.key]: v } } })} />
                ))}
                <div className="field inline">
                  <div>
                    <div>Show what it sees</div>
                    <div className="hint" style={{ marginTop: 0 }}>{bot.hud}</div>
                  </div>
                  <Switch checked={seat.hud} onChange={(hud) => onChange({ ...seat, hud })} label="Show what it sees" />
                </div>
              </div>
              <button className="reset" onClick={() => onChange({ ...seat, settings: { ...seat.settings, [bot.id]: defaults(bot.settings) } })}>
                Reset to defaults
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
