import type { Stockfish } from './stockfish';

/** `off`: key of a toggle that, when on, disables this setting (e.g. Elo is off at full strength). */
type Base = { key: string; label: string; hint?: string; off?: string };
export type Setting =
  | (Base & { type: 'range'; min: number; max: number; step: number; default: number; unit?: string })
  | (Base & { type: 'choice'; options: { value: string; label: string }[]; default: string })
  | (Base & { type: 'toggle'; default: boolean });

export type Settings = Record<string, number | string | boolean>;

/** Arrow roles. Bots use pick/alt/bad/line; the app adds judge (engine best) and better (rating hint). */
export type Tone = 'pick' | 'alt' | 'bad' | 'line' | 'judge' | 'better';
/** One row of a HUD legend. */
export type LegendMark = Tone | 'heat' | 'heat-bad' | 'node' | 'attack' | 'defend' | 'field-white' | 'field-black';
export type Legend = { mark: LegendMark; text: string }[];

/** What a bot "sees". Every field is optional; the overlay draws whatever is present. */
export interface Hud {
  /** Arrows; tone: 'pick' = chosen move, 'alt' = candidate, 'bad' = bait/refuted, 'line' = continuation */
  arrows?: { from: string; to: string; weight?: number; tone?: Tone; label?: string }[];
  /** Square heat, v in [-1, 1] (positive = good for the bot). */
  heat?: Record<string, number>;
  /** Square ownership by side, v in [-1, 1] (positive = White, negative = Black). */
  field?: Record<string, number>;
  /** Graph nodes (on squares) and edges. */
  graph?: { nodes: { sq: string; w: number }[]; edges: { from: string; to: string; kind: 'attack' | 'defend' }[] };
  caption?: string;
  stats?: [string, string][];
}

export interface ThinkInput {
  fen: string;
  /** UCI moves played so far, from startFen. */
  moves: string[];
  startFen: string;
  settings: Settings;
}

export interface ThinkCtx {
  emit(h: Hud): void;
  status(text: string): void;
  /** A Stockfish instance private to this bot. */
  engine(): Stockfish;
  aborted(): boolean;
}

export interface BotDef {
  id: string;
  name: string;
  /** One-line approach, e.g. "Neural net trained on human games". */
  approach: string;
  description: string;
  /** Short name for the HUD, e.g. "Trap map". */
  vision: string;
  /** What the HUD overlay visualises. */
  hud: string;
  /** Explains every mark the HUD can draw. */
  legend: Legend;
  settings: Setting[];
  think(input: ThinkInput, ctx: ThinkCtx): Promise<{ move: string; hud?: Hud }>;
  /** Optional cheap, synchronous HUD for any position (drawn live instead of the last think HUD). */
  view?(fen: string): Hud;
}

export const defaults = (s: Setting[]): Settings => Object.fromEntries(s.map((x) => [x.key, x.default]));
