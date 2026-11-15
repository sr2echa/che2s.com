import { CLS, type Cls, type Review } from '../lib/review';
import { winPct } from '../lib/chess';

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
  sans: string[];
}

export default function ReviewPanel({ review, progress, depth, setDepth, run, canRun, ply, go }: Props) {
  const stale = review && review.moves.length !== 0;
  return (
    <div className="review" style={{ paddingTop: 16 }} data-testid="review">
      <div className="controls">
        <button className="cta small" onClick={run} disabled={!canRun || progress !== null} data-testid="run-review">
          {review ? 'Review again' : 'Review game'}
          <span className="cta-icon">&#8599;</span>
        </button>
        <div className="seg" role="group" aria-label="Review depth">
          {[
            [10, 'Fast'],
            [14, 'Deep'],
            [18, 'Thorough'],
          ].map(([d, l]) => (
            <button key={d} aria-pressed={depth === d} onClick={() => setDepth(d as number)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {progress !== null && (
        <div>
          <div className="progress"><i style={{ transform: `scaleX(${progress})` }} /></div>
          <div className="label" style={{ marginTop: 8 }}>Stockfish is checking every position · {Math.round(progress * 100)}%</div>
        </div>
      )}
      {!review && progress === null && <div className="empty">{canRun ? 'Rates every move from brilliant to blunder, with accuracy for both sides.' : 'Play some moves first.'}</div>}
      {review && stale && (
        <>
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
            <span className="label" style={{ textAlign: 'right' }}>W</span>
            <span className="label" style={{ textAlign: 'right' }}>B</span>
            {ORDER.map((c) => (
              <Row key={c} c={c} w={review.counts.white[c] ?? 0} b={review.counts.black[c] ?? 0} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ c, w, b }: { c: Cls; w: number; b: number }) {
  return (
    <>
      <span className="k">
        <span className="glyph" style={{ color: CLS[c].color, width: 18 }}>{CLS[c].glyph}</span>
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
      <rect width={W} height={H} fill="#2a2a2b" />
      <polygon points={`0,${H} ${line} ${W},${H}`} fill="#ecebe7" />
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgb(128 128 128 / 0.6)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {review.moves.map((m, i) =>
        ['blunder', 'mistake', 'miss', 'brilliant', 'great'].includes(m.cls) ? (
          <circle key={i} cx={((i + 1) / n) * W} cy={H - (pts[i + 1] / 100) * H} r={3} fill={CLS[m.cls].color} vectorEffect="non-scaling-stroke" />
        ) : null,
      )}
      <line x1={(ply / n) * W} x2={(ply / n) * W} y1={0} y2={H} stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
