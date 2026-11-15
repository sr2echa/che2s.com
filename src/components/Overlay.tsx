import type { Hud } from '../lib/types';

type Orient = 'white' | 'black';
type Tone = 'pick' | 'alt' | 'bad' | 'line';
const xy = (sq: string, o: Orient): [number, number] => {
  const f = sq.charCodeAt(0) - 97, r = +sq[1] - 1;
  return o === 'white' ? [f + 0.5, 7.5 - r] : [7.5 - f, r + 0.5];
};

const TONE: Record<Tone, string> = { pick: '#d4f35f', alt: '#f4f2ec', bad: '#ff6b57', line: '#7cc8ff' };
const WIDTH: Record<Tone, number> = { pick: 0.15, alt: 0.085, bad: 0.12, line: 0.085 };

/** Soft thermal blobs under the pieces. */
export function Heat({ hud, orientation }: { hud?: Hud | null; orientation: Orient }) {
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

export function Marks({ hud, orientation, badge, hint }: { hud?: Hud | null; orientation: Orient; badge?: { sq: string; glyph: string; color: string }; hint?: string }) {
  const arrows = [...(hud?.arrows ?? [])];
  if (hint) arrows.push({ from: hint.slice(0, 2), to: hint.slice(2, 4), tone: 'line', label: 'best' });
  // Draw weaker arrows first so the chosen move sits on top.
  const order: Tone[] = ['alt', 'line', 'bad', 'pick'];
  arrows.sort((a, b) => order.indexOf(a.tone ?? 'alt') - order.indexOf(b.tone ?? 'alt'));
  return (
    <svg className="layer marks" viewBox="0 0 8 8" data-testid="hud-marks">
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.06" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {hud?.graph && (
        <g data-testid="hud-graph" className="graph-layer">
          {hud.graph.edges.map((e, i) => {
            const [x1, y1] = xy(e.from, orientation), [x2, y2] = xy(e.to, orientation);
            const len = Math.hypot(x2 - x1, y2 - y1) || 1;
            const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
            const bend = e.kind === 'attack' ? 0.22 : -0.16;
            const k = 0.3 / len;
            const sx = x1 + (x2 - x1) * k, sy = y1 + (y2 - y1) * k, ex = x2 - (x2 - x1) * k, ey = y2 - (y2 - y1) * k;
            const cx = (x1 + x2) / 2 + nx * bend * Math.min(len, 3), cy = (y1 + y2) / 2 + ny * bend * Math.min(len, 3);
            const c = e.kind === 'attack' ? TONE.bad : TONE.line;
            return (
              <g key={i}>
                <path d={`M${sx} ${sy} Q${cx} ${cy} ${ex} ${ey}`} fill="none" stroke={c} strokeWidth={e.kind === 'attack' ? 0.045 : 0.03} strokeLinecap="round" opacity={0.8} pathLength={1} className="draw" style={{ animationDelay: `${(i % 24) * 12}ms` }} />
                <circle cx={ex} cy={ey} r={0.045} fill={c} />
              </g>
            );
          })}
          {hud.graph.nodes.map((n) => {
            const [x, y] = xy(n.sq, orientation);
            return (
              <g key={n.sq}>
                <circle cx={x} cy={y} r={0.08 + n.w * 0.34} fill={TONE.pick} opacity={0.06 + n.w * 0.14} />
                <circle cx={x} cy={y} r={0.08 + n.w * 0.34} fill="none" stroke={TONE.pick} strokeWidth={0.02} opacity={0.2 + n.w * 0.8} />
              </g>
            );
          })}
        </g>
      )}

      {arrows.map((a, i) => {
        const tone = (a.tone ?? 'alt') as Tone;
        const [x1, y1] = xy(a.from, orientation), [x2, y2] = xy(a.to, orientation);
        const w = WIDTH[tone] * (tone === 'alt' ? 0.75 + 0.5 * (a.weight ?? 0.5) : 1);
        const head = Math.max(0.3, w * 2.6);
        const { d, tip, ux, uy } = arrowPath(x1, y1, x2, y2, 0.12 + head * 0.7);
        const hx = tip[0] + ux * head * 0.75, hy = tip[1] + uy * head * 0.75;
        const px = -uy, py = ux;
        const c = TONE[tone];
        const id = `g${i}-${tone}`;
        return (
          <g key={`${a.from}${a.to}${tone}${i}`} data-testid={`arrow-${tone}`} filter={tone === 'pick' ? 'url(#glow)' : undefined} opacity={tone === 'alt' ? 0.72 : 1}>
            <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={hx} y2={hy}>
              <stop offset="0" stopColor={c} stopOpacity={0.15} />
              <stop offset="1" stopColor={c} stopOpacity={1} />
            </linearGradient>
            <circle cx={x1} cy={y1} r={w * 0.9} fill={c} opacity={0.35} />
            <path d={d} fill="none" stroke={`url(#${id})`} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="draw" />
            <path
              className="head"
              d={`M${hx} ${hy} L${tip[0] - ux * head * 0.25 + px * head * 0.55} ${tip[1] - uy * head * 0.25 + py * head * 0.55} L${tip[0] + ux * head * 0.05} ${tip[1] + uy * head * 0.05} L${tip[0] - ux * head * 0.25 - px * head * 0.55} ${tip[1] - uy * head * 0.25 - py * head * 0.55} Z`}
              fill={c}
              stroke={c}
              strokeWidth={0.03}
              strokeLinejoin="round"
            />
            {a.label && (
              <g transform={`translate(${Math.min(7.9 - a.label.length * 0.1, Math.max(0.1, hx + px * 0.18 - a.label.length * 0.05))} ${Math.min(7.72, Math.max(0.1, hy + py * 0.18 - 0.36))})`} className="tag">
                <rect width={a.label.length * 0.1 + 0.16} height={0.26} rx={0.13} fill="rgb(10 10 11 / 0.88)" stroke={c} strokeOpacity={0.35} strokeWidth={0.012} />
                <text x={0.08} y={0.178} fontSize={0.155} fill={c} fontFamily="Geist Mono Variable, monospace" fontWeight={600} letterSpacing={-0.005}>
                  {a.label}
                </text>
              </g>
            )}
          </g>
        );
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
