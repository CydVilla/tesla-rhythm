/**
 * Core domain types for the rhythm game.
 *
 * These types are intentionally framework-agnostic: nothing here imports React
 * or touches the DOM. The goal is that all gameplay rules (scoring, hit
 * detection, timing) operate on plain data and are trivially unit-testable.
 */

/** Five-lane layout (Clone Hero / Rock Band style). */
export type Lane = 0 | 1 | 2 | 3 | 4;

export type Difficulty = "easy" | "medium" | "hard" | "expert";

/**
 * For the touchscreen MVP only "tap" is actually playable, but "hold" is
 * modelled in the data so charts and the editor can round-trip sustains later.
 */
export type NoteType = "tap" | "hold";

export interface ChartNote {
  id: string;
  /** Note time in milliseconds, relative to song start (before calibration). */
  timeMs: number;
  lane: Lane;
  /** Sustain length in ms. Undefined / 0 means a plain tap. */
  durationMs?: number;
  type?: NoteType;
}

export interface RhythmChart {
  id: string;
  title: string;
  artist?: string;
  bpm?: number;
  /**
   * Chart-authored offset in ms. Added to every note time. Distinct from the
   * user's runtime calibration offset, which is a per-player preference.
   */
  offsetMs: number;
  difficulty: Difficulty;
  notes: ChartNote[];
}

export type HitRating = "perfect" | "great" | "good" | "miss";

/** A non-miss judgement that actually awards points and advances combo. */
export type HitJudgement = Exclude<HitRating, "miss">;

export interface ScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  /** Total notes in the chart; used to compute accuracy and completion. */
  totalNotes: number;
}

/**
 * Runtime view of a note. We never mutate the source ChartNote; instead the
 * engine tracks judgement state in a parallel structure keyed by note id.
 */
export interface NoteRuntimeState {
  judged: boolean;
  rating?: HitRating;
  /** When the note was judged, in song time ms (for fading feedback out). */
  judgedAtMs?: number;
}

/** Transient feedback shown after a hit or miss, consumed by the renderer. */
export interface HitFeedback {
  id: string;
  lane: Lane;
  rating: HitRating;
  /** Song time the feedback was created, used to animate/expire it. */
  createdAtMs: number;
  /** Signed timing error in ms (negative = early, positive = late). */
  errorMs: number;
}

/** Result of attempting to hit a note in a lane at a given time. */
export type HitResult =
  | {
      kind: "hit";
      note: ChartNote;
      rating: HitJudgement;
      errorMs: number;
    }
  | {
      kind: "miss-input";
      /** Tap registered but no note was within the good window. */
    };

export type GamePhase = "idle" | "countdown" | "playing" | "paused" | "finished";
