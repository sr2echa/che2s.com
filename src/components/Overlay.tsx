import { useId, useState, type ReactNode } from 'react';
import type { Hud, Tone, Legend as LegendT, LegendMark } from '../lib/types';

type Orient = 'white' | 'black';
const xy = (sq: string, o: Orient): [number, number] => {
  const f = sq.charCodeAt(0) - 97, r = +sq[1] - 1;
  return o === 'white' ? [f + 0.5, 7.5 - r] : [7.5 - f, r + 0.5];
};

// One colour per role, so arrows from different sources never read alike.
export const TONE: Record<Tone, string> = { pick: '#d4f35f', alt: '#f4f2ec', bad: '#ff6b57', line: '#f5b94c', judge: '#7cc8ff', better: '#f4f2ec' };
const DEFEND = '#5fd3c5';
/** Territory colours: White in the accent lime, Black in orange (both warm, so they sit in the palette). */
export const FIELD = { white: '#d4f35f', black: '#ff9a52' };
const WIDTH: Record<Tone, number> = { pick: 0.15, alt: 0.085, bad: 0.12, line: 0.085, judge: 0.11, better: 0.075 };

/** Soft thermal blobs under the pieces. */
export function Heat({ hud, orientation }: { hud?: Hud | null; orientation: Orient }) {
  if (hud?.field)
    return (
      <svg className="layer field" viewBox="0 0 8 8" data-testid="hud-field">
        {Object.entries(hud.field).map(([sq, v]) => {
          const [x, y] = xy(sq, orientation);
          return <rect key={sq} x={x - 0.5} y={y - 0.5} width={1} height={1} fill={v > 0 ? FIELD.white : FIELD.black} opacity={Math.min(0.75, Math.abs(v) * 0.75)} />;
        })}
      </svg>
    );
  if (!hud?.heat) return null;
  return (
    <svg className="layer heat" viewBox="0 0 8 8" data-testid="hud-heat">
      <defs>
        {(['pos', 'neg'] as const).map((k) => (
          <radialGradient key={k} id={`heat-${k}`}>
            <stop offset="0" stopColor={k === 'pos' ? TONE.pick : TONE.bad} stopOpacity="0.95" />
            <stop offset="0.55" stopColor={k === 'pos' ? TONE.pick : TONE.bad} stopOpacity="0.35" />
            <stop offset="1" stopColor={k === 'pos' ? TONE.pick : TONE.bad} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      {Object.entries(hud.heat).map(([sq, v]) => {
        const [x, y] = xy(sq, orientation);
        const a = Math.min(1, Math.abs(v));
        return <circle key={sq} cx={x} cy={y} r={0.45 + a * 0.35} fill={`url(#heat-${v >= 0 ? 'pos' : 'neg'})`} opacity={0.25 + a * 0.6} />;
      })}
    </svg>
  );
}

/** Knight jumps bend at a right angle along the long leg; everything else is straight. */
function arrowPath(x1: number, y1: number, x2: number, y2: number, inset: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const knight = (Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1);
  const pts: [number, number][] = knight ? (Math.abs(dx) > Math.abs(dy) ? [[x1, y1], [x2, y1], [x2, y2]] : [[x1, y1], [x1, y2], [x2, y2]]) : [[x1, y1], [x2, y2]];
  const [px, py] = pts[pts.length - 2];
  const len = Math.hypot(x2 - px, y2 - py) || 1;
  const ux = (x2 - px) / len, uy = (y2 - py) / len;
  const tip: [number, number] = [x2 - ux * inset, y2 - uy * inset];
  pts[pts.length - 1] = tip;
  return { d: 'M' + pts.map((p) => p.join(' ')).join(' L'), tip, ux, uy };
}

// ---- Shared mark primitives (board overlay and legend board) ----------------------------

/** Arrow with gradient shaft, soft rounded head, optional label. `uid` keeps gradient ids unique per SVG; `size` is the board width in squares. */
export function Arrow({ x1, y1, x2, y2, tone, weight, label, uid, size = 8, hit }: { x1: number; y1: number; x2: number; y2: number; tone: Tone; weight?: number; label?: string; uid: string; size?: number; hit?: boolean }) {
  const w = WIDTH[tone] * (tone === 'alt' ? 0.75 + 0.5 * (weight ?? 0.5) : 1);
  const head = Math.max(0.26, w * 2.3); // drawn with a thick round-join stroke, so the visible head is softer and a little larger
  const { d, tip, ux, uy } = arrowPath(x1, y1, x2, y2, 0.12 + head * 0.7);
  const hx = tip[0] + ux * head * 0.75, hy = tip[1] + uy * head * 0.75;
  const px = -uy, py = ux;
  const c = TONE[tone];
  const id = `${uid}-${tone}`;
  return (
    <g data-testid={`arrow-${tone}`} filter={tone === 'pick' ? `url(#${uid}-glow)` : undefined} opacity={tone === 'alt' ? 0.72 : 1}>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={hx} y2={hy}>
        <stop offset="0" stopColor={c} stopOpacity={0.15} />
        <stop offset="1" stopColor={c} stopOpacity={1} />
      </linearGradient>
      {hit && <path d={d} fill="none" stroke="transparent" strokeWidth={0.6} strokeLinecap="round" />}
      <circle cx={x1} cy={y1} r={w * 0.9} fill={c} opacity={0.35} />
      {tone === 'better' ? (
        <path d={d} fill="none" stroke={c} strokeOpacity={0.85} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="0.02 0.17" />
      ) : (
        <path d={d} fill="none" stroke={`url(#${id})`} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="draw" />
      )}
      <path
        className="head"
        d={`M${hx} ${hy} L${tip[0] - ux * head * 0.25 + px * head * 0.55} ${tip[1] - uy * head * 0.25 + py * head * 0.55} L${tip[0] + ux * head * 0.05} ${tip[1] + uy * head * 0.05} L${tip[0] - ux * head * 0.25 - px * head * 0.55} ${tip[1] - uy * head * 0.25 - py * head * 0.55} Z`}
        fill={c}
        stroke={c}
        strokeWidth={Math.max(0.05, w * 0.7)}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {label && (
        <g transform={`translate(${Math.min(size - 0.1 - label.length * 0.1, Math.max(0.1, hx + px * 0.18 - label.length * 0.05))} ${Math.min(size - 0.28, Math.max(0.1, hy + py * 0.18 - 0.36))})`} className="tag">
          <rect width={label.length * 0.1 + 0.16} height={0.26} rx={0.13} fill="rgb(10 10 11 / 0.88)" stroke={c} strokeOpacity={0.35} strokeWidth={0.012} />
          <text x={0.08} y={0.178} fontSize={0.155} fill={c} fontFamily="Geist Mono Variable, monospace" fontWeight={600} letterSpacing={-0.005}>
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

/** Curved attack/defence edge between two square centres. */
export function Edge({ x1, y1, x2, y2, attack, delay = 0, hit }: { x1: number; y1: number; x2: number; y2: number; attack: boolean; delay?: number; hit?: boolean }) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  const bend = attack ? 0.22 : -0.16;
  const k = 0.3 / len;
  const sx = x1 + (x2 - x1) * k, sy = y1 + (y2 - y1) * k, ex = x2 - (x2 - x1) * k, ey = y2 - (y2 - y1) * k;
  const cx = (x1 + x2) / 2 + nx * bend * Math.min(len, 3), cy = (y1 + y2) / 2 + ny * bend * Math.min(len, 3);
  const c = attack ? TONE.bad : DEFEND;
  return (
    <g>
      {hit && <path d={`M${sx} ${sy} Q${cx} ${cy} ${ex} ${ey}`} fill="none" stroke="transparent" strokeWidth={0.55} />}
      <path d={`M${sx} ${sy} Q${cx} ${cy} ${ex} ${ey}`} fill="none" stroke={c} strokeWidth={attack ? 0.045 : 0.03} strokeLinecap="round" opacity={0.8} pathLength={1} className="draw" style={{ animationDelay: `${delay}ms` }} />
      <circle cx={ex} cy={ey} r={0.045} fill={c} />
    </g>
  );
}

/** Importance ring around a piece. */
export const Ring = ({ x, y, w }: { x: number; y: number; w: number }) => (
  <g>
    <circle cx={x} cy={y} r={0.08 + w * 0.34} fill={TONE.pick} opacity={0.06 + w * 0.14} />
    <circle cx={x} cy={y} r={0.08 + w * 0.34} fill="none" stroke={TONE.pick} strokeWidth={0.02} opacity={0.2 + w * 0.8} />
  </g>
);

const GlowDef = ({ uid }: { uid: string }) => (
  <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="0.06" result="b" />
    <feMerge>
      <feMergeNode in="b" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
);

export function Marks({ hud, orientation, badge, hint }: { hud?: Hud | null; orientation: Orient; badge?: { sq: string; glyph: string; color: string }; hint?: string }) {
  const uid = useId().replace(/:/g, '');
  const arrows = [...(hud?.arrows ?? [])];
  if (hint) arrows.push({ from: hint.slice(0, 2), to: hint.slice(2, 4), tone: 'judge', label: 'engine' });
  // Draw weaker arrows first so the chosen move sits on top.
  const order: Tone[] = ['better', 'alt', 'line', 'bad', 'judge', 'pick'];
  arrows.sort((a, b) => order.indexOf(a.tone ?? 'alt') - order.indexOf(b.tone ?? 'alt'));
  return (
    <svg className="layer marks" viewBox="0 0 8 8" data-testid="hud-marks">
      <defs><GlowDef uid={uid} /></defs>
      {hud?.graph && (
        <g data-testid="hud-graph" className="graph-layer">
          {hud.graph.edges.map((e, i) => {
            const [x1, y1] = xy(e.from, orientation), [x2, y2] = xy(e.to, orientation);
            return <Edge key={i} x1={x1} y1={y1} x2={x2} y2={y2} attack={e.kind === 'attack'} delay={(i % 24) * 12} />;
          })}
          {hud.graph.nodes.map((n) => {
            const [x, y] = xy(n.sq, orientation);
            return <Ring key={n.sq} x={x} y={y} w={n.w} />;
          })}
        </g>
      )}
      {arrows.map((a, i) => {
        const [x1, y1] = xy(a.from, orientation), [x2, y2] = xy(a.to, orientation);
        return <Arrow key={`${a.from}${a.to}${a.tone}${i}`} x1={x1} y1={y1} x2={x2} y2={y2} tone={(a.tone ?? 'alt') as Tone} weight={a.weight} label={a.label} uid={`${uid}${i}`} />;
      })}
      {badge && (() => {
        const [x, y] = xy(badge.sq, orientation);
        return (
          <g transform={`translate(${x + 0.33} ${y - 0.33})`} data-testid="review-badge" className="badge">
            <circle r={0.21} fill={badge.color} />
            <circle r={0.21} fill="none" stroke="rgb(10 10 11 / 0.5)" strokeWidth={0.025} />
            <text textAnchor="middle" y={0.065} fontSize={badge.glyph.length > 1 ? 0.16 : 0.2} fontWeight={800} fill="#0a0a0b" fontFamily="Geist Mono Variable, monospace">
              {badge.glyph}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

// ---- Legend board: a 6x6 sample position with one demo of each mark ------------------------

/** Marks every view can show besides the bot's own. */
export const COMMON_LEGEND: LegendT = [
  { mark: 'judge', text: "The judge's best move (turn on Show best move)" },
  { mark: 'better', text: 'A better move than the one just played' },
];

type P = [string, number, number];
/** Where each mark is demonstrated on the 6x6 sample board, and the piece it needs. */
const DEMO: Record<LegendMark, { pieces: P[]; draw(uid: string): ReactNode; at: [number, number] }> = {
  pick: { pieces: [['wN', 1, 5]], at: [2, 3], draw: (u) => <Arrow x1={1.5} y1={5.5} x2={2.5} y2={3.5} tone="pick" uid={u} size={6} hit /> },
  alt: { pieces: [['wR', 4, 5]], at: [4, 3], draw: (u) => <Arrow x1={4.5} y1={5.5} x2={4.5} y2={3.5} tone="alt" weight={0.7} uid={u} size={6} hit /> },
  bad: { pieces: [['bP', 3, 0]], at: [3, 2], draw: (u) => <Arrow x1={3.5} y1={0.5} x2={3.5} y2={2.5} tone="bad" uid={u} size={6} hit /> },
  line: { pieces: [['bB', 0, 0]], at: [2, 2], draw: (u) => <Arrow x1={0.5} y1={0.5} x2={2.5} y2={2.5} tone="line" uid={u} size={6} hit /> },
  judge: { pieces: [['wQ', 0, 4]], at: [0, 2], draw: (u) => <Arrow x1={0.5} y1={4.5} x2={0.5} y2={2.5} tone="judge" uid={u} size={6} hit /> },
  better: { pieces: [['wP', 5, 5]], at: [5, 3], draw: (u) => <Arrow x1={5.5} y1={5.5} x2={5.5} y2={3.5} tone="better" uid={u} size={6} hit /> },
  heat: { pieces: [], at: [2, 1], draw: (u) => <circle cx={2.5} cy={1.5} r={0.75} fill={`url(#${u}-hp)`} /> },
  'heat-bad': { pieces: [], at: [4, 1], draw: (u) => <circle cx={4.5} cy={1.5} r={0.75} fill={`url(#${u}-hn)`} /> },
  node: { pieces: [['wR', 4, 5]], at: [4, 5], draw: () => <Ring x={4.5} y={5.5} w={0.9} /> },
  attack: { pieces: [['wR', 4, 5], ['bN', 4, 1]], at: [4, 1], draw: () => <Edge x1={4.5} y1={5.5} x2={4.5} y2={1.5} attack hit /> },
  defend: { pieces: [['wN', 1, 5], ['wR', 4, 5]], at: [4, 5], draw: () => <Edge x1={1.5} y1={5.5} x2={4.5} y2={5.5} attack={false} hit /> },
  'field-white': { pieces: [['wP', 3, 4]], at: [3, 3], draw: () => <FieldPatch squares={[[2, 3], [3, 3], [4, 3], [2, 4], [4, 4], [3, 2]]} color={FIELD.white} /> },
  'field-black': { pieces: [['bP', 3, 1]], at: [3, 1], draw: () => <FieldPatch squares={[[2, 0], [3, 0], [4, 0], [2, 1], [4, 1], [5, 1]]} color={FIELD.black} /> },
};

const FieldPatch = ({ squares, color }: { squares: [number, number][]; color: string }) => (
  <g>{squares.map(([x, y]) => <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={color} opacity={0.6} style={{ pointerEvents: 'all' }} />)}</g>
);

/** Hover (or tap) a mark on the sample board to read what it means. */
export function LegendBoard({ items, pieces = 'cburnett', testid }: { items: LegendT; pieces?: string; testid?: string }) {
  const uid = 'lb' + useId().replace(/:/g, '');
  const [active, setActive] = useState<number | null>(null);
  const placed = new Map<string, P>();
  for (const it of items) for (const p of DEMO[it.mark].pieces) placed.set(`${p[1]},${p[2]}`, p);
  // Heat sits under the pieces, everything else above.
  const under = items.map((it, i) => [it, i] as const).filter(([it]) => it.mark.startsWith('heat') || it.mark.startsWith('field'));
  const over = items.map((it, i) => [it, i] as const).filter(([it]) => !it.mark.startsWith('heat') && !it.mark.startsWith('field'));
  const mark = ([it, i]: readonly [LegendT[number], number]) => (
    <g
      key={i}
      className={`lm ${active !== null && active !== i ? 'dim' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={it.text}
      onPointerEnter={() => setActive(i)}
      onFocus={() => setActive(i)}
      onClick={() => setActive(i)}
      data-testid={`lm-${it.mark}`}
    >
      {DEMO[it.mark].draw(`${uid}${i}`)}
    </g>
  );
  return (
    <figure className="legend-board" data-testid={testid} onPointerLeave={() => setActive(null)}>
      <svg viewBox="0 0 6 6" role="img" aria-label="Legend: sample board with each overlay mark">
        <defs>
          <GlowDef uid={uid} />
          {items.map((_, i) => <GlowDef key={i} uid={`${uid}${i}`} />)}
          {(['hp', 'hn'] as const).map((k) =>
            items.map((_, i) => (
              <radialGradient key={k + i} id={`${uid}${i}-${k}`}>
                <stop offset="0" stopColor={k === 'hp' ? TONE.pick : TONE.bad} stopOpacity="0.95" />
                <stop offset="1" stopColor={k === 'hp' ? TONE.pick : TONE.bad} stopOpacity="0" />
              </radialGradient>
            )),
          )}
        </defs>
        {Array.from({ length: 36 }, (_, k) => (
          <rect key={k} x={k % 6} y={Math.floor(k / 6)} width={1} height={1} style={{ fill: ((k % 6) + Math.floor(k / 6)) % 2 ? 'var(--sq-dark)' : 'var(--sq-light)' }} />
        ))}
        <g style={{ mixBlendMode: 'multiply' }}>{under.map(mark)}</g>
        {[...placed.values()].map(([code, x, y]) => (
          <image key={`${x},${y}`} href={`/pieces/${pieces}/${code}.svg`} x={x + 0.05} y={y + 0.05} width={0.9} height={0.9} />
        ))}
        {over.map(mark)}
      </svg>
      <figcaption>
        {active !== null ? (
          <><i className="dot" style={{ background: dotColor(items[active].mark) }} />{items[active].text}</>
        ) : (
          <span className="faint">Hover or tap a mark to see what it means</span>
        )}
      </figcaption>
    </figure>
  );
}

const dotColor = (m: LegendMark): string =>
  m === 'field-white' ? FIELD.white : m === 'field-black' ? FIELD.black : m === 'heat' || m === 'node' ? TONE.pick : m === 'heat-bad' || m === 'attack' ? TONE.bad : m === 'defend' ? DEFEND : TONE[m];
