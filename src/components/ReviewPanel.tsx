import { useEffect, useRef, useState } from 'react';
import { CaretLeftIcon, CaretRightIcon, PlayIcon, PauseIcon, StarIcon, ThumbsUpIcon, CheckIcon, ArrowRightIcon, XIcon } from '@phosphor-icons/react';
import type { JSX } from 'react';
import { CLS, type Cls, type MoveReview, type Review } from '../lib/review';
import { winPct, fmtScore } from '../lib/chess';

const ORDER: Cls[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder'];

interface Props {
  review: Review | null;
  progress: number | null;
  depth: number;
  setDepth(d: number): void;
  run(): void;
  canRun: boolean;
  ply: number;
  go(i: number): void;
}

/** Icon for a rating: chess.com-style marks, icons where a symbol reads better than punctuation. */
export function ClsMark({ cls, size = 22 }: { cls: Cls; size?: number }) {
  const icon = { best: <StarIcon size={size} weight="fill" />, excellent: <ThumbsUpIcon size={size} weight="fill" />, good: <CheckIcon size={size} weight="bold" />, forced: <ArrowRightIcon size={size} weight="bold" />, miss: <XIcon size={size} weight="bold" /> } as Partial<Record<Cls, JSX.Element>>;
  return icon[cls] ?? <span className="mark-text">{CLS[cls].glyph}</span>;
}

/** A rated move: medal, label, eval swing and the reason. Used live and in the review coach. */
export function Insight({ r, testid = 'insight' }: { r: MoveReview; testid?: string }) {
  const c = CLS[r.cls];
  return (
    <div className="insight" data-testid={testid} style={{ ['--c' as string]: c.color }}>
      <div className="medal" aria-hidden><ClsMark cls={r.cls} /></div>
      <div className="insight-body">
        <div className="insight-head">
          <span className="insight-label">{c.label}</span>
          <span className="mono swing">{fmtScore(r.before)} <i>→</i> {fmtScore(r.after)}</span>
        </div>
        <p title={r.explain}>{r.explain}</p>
      </div>
    </div>
  );
}

export default function ReviewPanel({ review, progress, depth, setDepth, run, canRun, ply, go }: Props) {
  const [playing, setPlaying] = useState(false);
  const n = review?.moves.length ?? 0;
  // The parent re-renders on every judge update; keep the timer independent of `go`'s identity.
  const goRef = useRef(go);
  goRef.current = go;

  // Autoplay walks the game one move at a time, like a coach narrating.
  useEffect(() => {
    if (!playing) return;
    if (ply >= n) return setPlaying(false);
    const t = setTimeout(() => goRef.current(ply + 1), 1800);
    return () => clearTimeout(t);
  }, [playing, ply, n]);

  if (!review || progress !== null)
    return (
      <div className="review" data-testid="review">
        <p className="about">Stockfish checks every position, rates each move from brilliant to blunder, explains why, and walks you through the game.</p>
        <div className="review-run">
          <button className="cta small" onClick={run} disabled={!canRun || progress !== null} data-testid="run-review">
            Review game
            <span className="cta-icon">&#8599;</span>
          </button>
          <div className="seg" role="group" aria-label="Review depth">
            {[
              [10, 'Fast'],
              [14, 'Deep'],
              [18, 'Thorough'],
            ].map(([d, l]) => (
              <button key={d} aria-pressed={depth === d} onClick={() => setDepth(d as number)}>{l}</button>
            ))}
          </div>
        </div>
        {progress !== null && (
          <div>
            <div className="progress"><i style={{ transform: `scaleX(${progress})` }} /></div>
            <div className="label" style={{ marginTop: 8 }}>Checking every position · {Math.round(progress * 100)}%</div>
          </div>
        )}
        {!canRun && <div className="empty">Play some moves first.</div>}
      </div>
    );

  const cur = ply > 0 ? review.moves[ply - 1] : undefined;
  return (
    <div className="review" data-testid="review">
      <div className="coach" data-testid="coach">
        {/* The rated move itself shows in the side column's rating slot, above. */}
        <p className="about">{cur ? `Move ${Math.ceil(ply / 2)}: ${cur.san}. Step through, or let it play.` : 'Start position. Step through to hear about every move.'}</p>
        <div className="coach-nav">
          <button className="icon-btn" aria-label="Previous move" data-tip="Previous move (←)" onClick={() => go(ply - 1)} disabled={ply === 0}><CaretLeftIcon size={17} weight="bold" /></button>
          <span className="mono">{ply} / {n}</span>
          <button className="icon-btn" aria-label="Next move" data-tip="Next move (→)" onClick={() => go(ply + 1)} disabled={ply >= n}><CaretRightIcon size={17} weight="bold" /></button>
          <button className="chip-btn" onClick={() => setPlaying(!playing)} data-tip="Step through the game automatically" disabled={ply >= n && !playing}>
            {playing ? <PauseIcon size={14} weight="fill" /> : <PlayIcon size={14} weight="fill" />}
            {playing ? 'Pause' : 'Play through'}
          </button>
        </div>
      </div>

      <div className="acc">
        {(['white', 'black'] as const).map((s) => (
          <div key={s}>
            <div className="label">{s === 'white' ? 'White' : 'Black'} accuracy</div>
            <div className="v mono" data-testid={`acc-${s}`}>{review.accuracy[s].toFixed(1)}</div>
          </div>
        ))}
      </div>
      <EvalGraph review={review} ply={ply} go={go} />
      <div className="counts">
        <span />
        <span className="label" style={{ justifyContent: 'flex-end' }}>White</span>
        <span className="label" style={{ justifyContent: 'flex-end' }}>Black</span>
        {ORDER.map((c) => (
          <Row key={c} c={c} w={review.counts.white[c] ?? 0} b={review.counts.black[c] ?? 0} />
        ))}
      </div>
      <button className="reset" onClick={run}>Run again at {depth === 10 ? 'Fast' : depth === 14 ? 'Deep' : 'Thorough'} depth</button>
    </div>
  );
}

function Row({ c, w, b }: { c: Cls; w: number; b: number }) {
  return (
    <>
      <span className="k">
        <span className="count-mark" style={{ ['--c' as string]: CLS[c].color }}><ClsMark cls={c} size={11} /></span>
        {CLS[c].label}
      </span>
      <span className="num" style={{ color: w ? CLS[c].color : 'var(--ink-3)' }}>{w}</span>
      <span className="num" style={{ color: b ? CLS[c].color : 'var(--ink-3)' }}>{b}</span>
    </>
  );
}

function EvalGraph({ review, ply, go }: { review: Review; ply: number; go(i: number): void }) {
  const pts = [review.start, ...review.moves.map((m) => m.after)].map(winPct);
  const n = pts.length - 1 || 1;
  const W = 400, H = 84;
  const line = pts.map((p, i) => `${(i / n) * W},${H - (p / 100) * H}`).join(' ');
  return (
    <div className="graph-wrap">
      <svg
        className="graph"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Evaluation graph"
        data-testid="eval-graph"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          go(Math.round(((e.clientX - r.left) / r.width) * n));
        }}
      >
        <rect width={W} height={H} fill="#1d1d20" />
        <polygon points={`0,${H} ${line} ${W},${H}`} fill="#ecebe7" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgb(128 128 128 / 0.6)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <line x1={(ply / n) * W} x2={(ply / n) * W} y1={0} y2={H} stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      {review.moves.map((m, i) =>
        ['blunder', 'mistake', 'miss', 'brilliant', 'great'].includes(m.cls) ? (
          <i key={i} className="graph-dot" style={{ left: `${((i + 1) / n) * 100}%`, top: `${100 - pts[i + 1]}%`, background: CLS[m.cls].color }} />
        ) : null,
      )}
    </div>
  );
}
