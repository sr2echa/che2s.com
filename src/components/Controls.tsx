import type { Setting } from '../lib/types';

export function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return <button role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function Range({ value, min, max, step, onChange, label }: { value: number; min: number; max: number; step: number; onChange(v: number): void; label: string }) {
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ ['--p' as string]: `${((value - min) / (max - min)) * 100}%` }}
      onChange={(e) => onChange(+e.target.value)}
    />
  );
}

const fmt = (s: Setting, v: unknown) => (s.type === 'range' ? `${v}${s.unit ? ` ${s.unit}` : ''}` : '');

export function Field({ s, value, onChange }: { s: Setting; value: unknown; onChange(v: number | string | boolean): void }) {
  if (s.type === 'toggle')
    return (
      <div className="field inline">
        <div>
          <div>{s.label}</div>
          {s.hint && <div className="hint" style={{ marginTop: 0 }}>{s.hint}</div>}
        </div>
        <Switch checked={!!value} onChange={onChange} label={s.label} />
      </div>
    );
  return (
    <div className="field">
      <div className="head">
        <span>{s.label}</span>
        <span className="val">{fmt(s, value)}</span>
      </div>
      {s.hint && <div className="hint">{s.hint}</div>}
      {s.type === 'range' ? (
        <Range label={s.label} value={value as number} min={s.min} max={s.max} step={s.step} onChange={onChange} />
      ) : (
        <div className="seg" role="group" aria-label={s.label}>
          {s.options.map((o) => (
            <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
