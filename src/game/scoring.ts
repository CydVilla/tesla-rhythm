/**
 * Pure scoring + hit-detection logic. No DOM, no React, no audio. Everything
 * here is a deterministic function of its inputs so it can be unit-tested.
 */

import {
  COMBO_MULTIPLIERS,
  HIT_WINDOWS,
  HOLD_RELEASE_GRACE_MS,
  MIN_HOLD_MS,
  MISS_THRESHOLD_MS,
  SCORE_VALUES,
  SUSTAIN_POINTS_PER_MS,
} from "./constants";
import { sustainEndTimeMs, timingErrorMs } from "./timing";
import type {
  ChartNote,
  HitJudgement,
  HitRating,
  HitResult,
  HoldReleaseResult,
  Lane,
  NoteRuntimeState,
  ScoreState,
} from "./types";

/**
 * Whether a note should be played as a sustain (hold) rather than a tap. A note
 * qualifies if it carries a meaningful duration; the explicit `type: "hold"`
 * flag is honoured too, but the duration is what actually drives gameplay.
 * Durations below MIN_HOLD_MS are treated as taps.
 */
export function isHoldNote(
  note: Pick<ChartNote, "durationMs" | "type">,
): boolean {
  const duration = note.durationMs ?? 0;
  if (note.type === "tap") return false;
  return duration >= MIN_HOLD_MS;
}

export function createInitialScore(totalNotes: number): ScoreState {
  return {
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
    totalNotes,
  };
}

/**
 * Map an absolute timing error (ms) to a rating. Returns "miss" if the error
 * is outside the good window entirely.
 */
export function ratingForError(absErrorMs: number): HitRating {
  if (absErrorMs <= HIT_WINDOWS.perfect) return "perfect";
  if (absErrorMs <= HIT_WINDOWS.great) return "great";
  if (absErrorMs <= HIT_WINDOWS.good) return "good";
  return "miss";
}

/** Combo multiplier for the current combo count. */
export function comboMultiplier(combo: number): number {
  for (const [minCombo, multiplier] of COMBO_MULTIPLIERS) {
    if (combo >= minCombo) return multiplier;
  }
  return 1;
}

/**
 * Find the nearest unjudged note in `lane` whose effective time is within the
 * good window of `songTimeMs`. Returns undefined if none qualifies.
 *
 * The chart is assumed sorted by timeMs; we still scan linearly because the
 * candidate window is tiny. Callers that care about perf can pass a sliced
 * view, but correctness here does not depend on ordering.
 */
export function findHittableNote(
  notes: readonly ChartNote[],
  runtime: ReadonlyMap<string, NoteRuntimeState>,
  lane: Lane,
  songTimeMs: number,
  chartOffsetMs: number,
  calibrationOffsetMs: number,
): ChartNote | undefined {
  let best: ChartNote | undefined;
  let bestAbsError = Number.POSITIVE_INFINITY;

  for (const note of notes) {
    if (note.lane !== lane) continue;
    if (runtime.get(note.id)?.judged) continue;

    const error = timingErrorMs(note, songTimeMs, chartOffsetMs, calibrationOffsetMs);
    const absError = Math.abs(error);
    if (absError > HIT_WINDOWS.good) continue;

    if (absError < bestAbsError) {
      bestAbsError = absError;
      best = note;
    }
  }

  return best;
}

/**
 * Resolve a tap on `lane` at `songTimeMs` into a hit (with rating) or an input
 * miss. Pure: does not mutate runtime or score; the caller applies the result.
 */
export function resolveTap(
  notes: readonly ChartNote[],
  runtime: ReadonlyMap<string, NoteRuntimeState>,
  lane: Lane,
  songTimeMs: number,
  chartOffsetMs: number,
  calibrationOffsetMs: number,
): HitResult {
  const note = findHittableNote(
    notes,
    runtime,
    lane,
    songTimeMs,
    chartOffsetMs,
    calibrationOffsetMs,
  );

  if (!note) {
    return { kind: "miss-input" };
  }

  const errorMs = timingErrorMs(note, songTimeMs, chartOffsetMs, calibrationOffsetMs);
  const rating = ratingForError(Math.abs(errorMs));

  // findHittableNote already guarantees within good window, so rating is never
  // "miss" here, but we narrow defensively.
  if (rating === "miss") {
    return { kind: "miss-input" };
  }

  return { kind: "hit", note, rating, errorMs, startsHold: isHoldNote(note) };
}

/**
 * Resolve a release (finger/key up) on `lane` at `songTimeMs`. Looks for a hold
 * note currently in the "holding" phase in that lane and decides whether the
 * player let go in time.
 *
 * Pure: does not mutate runtime or score; the caller applies the result.
 */
export function resolveRelease(
  notes: readonly ChartNote[],
  runtime: ReadonlyMap<string, NoteRuntimeState>,
  lane: Lane,
  songTimeMs: number,
  chartOffsetMs: number,
  calibrationOffsetMs: number,
): HoldReleaseResult {
  for (const note of notes) {
    if (note.lane !== lane) continue;
    if (runtime.get(note.id)?.hold !== "holding") continue;

    const end = sustainEndTimeMs(note, chartOffsetMs, calibrationOffsetMs);
    if (songTimeMs >= end - HOLD_RELEASE_GRACE_MS) {
      return { kind: "completed", note };
    }
    return { kind: "dropped", note, earlyMs: end - songTimeMs };
  }
  return { kind: "none" };
}

/**
 * Ids of hold notes whose tail has fully elapsed while still being held (i.e.
 * the player kept the lane pressed through the end). These auto-complete each
 * frame so a sustain resolves even if the player never explicitly releases.
 * Pure: returns the ids to complete; the caller updates runtime/score.
 */
export function findCompletedHoldIds(
  notes: readonly ChartNote[],
  runtime: ReadonlyMap<string, NoteRuntimeState>,
  songTimeMs: number,
  chartOffsetMs: number,
  calibrationOffsetMs: number,
): string[] {
  const done: string[] = [];
  for (const note of notes) {
    if (runtime.get(note.id)?.hold !== "holding") continue;
    const end = sustainEndTimeMs(note, chartOffsetMs, calibrationOffsetMs);
    if (songTimeMs >= end - HOLD_RELEASE_GRACE_MS) {
      done.push(note.id);
    }
  }
  return done;
}

/** Sustain bonus points for holding `durationMs`, before the combo multiplier. */
export function holdBonusPoints(durationMs: number): number {
  return Math.round(Math.max(0, durationMs) * SUSTAIN_POINTS_PER_MS);
}

/** Apply a successful judgement to a score state, returning a NEW state. */
export function applyHit(score: ScoreState, rating: HitJudgement): ScoreState {
  const combo = score.combo + 1;
  const points = SCORE_VALUES[rating] * comboMultiplier(combo);
  return {
    ...score,
    score: score.score + points,
    combo,
    maxCombo: Math.max(score.maxCombo, combo),
    perfect: score.perfect + (rating === "perfect" ? 1 : 0),
    great: score.great + (rating === "great" ? 1 : 0),
    good: score.good + (rating === "good" ? 1 : 0),
  };
}

/** Apply a miss (breaks combo), returning a NEW state. */
export function applyMiss(score: ScoreState): ScoreState {
  return {
    ...score,
    combo: 0,
    miss: score.miss + 1,
  };
}

/**
 * Apply a completed sustain: award the length-scaled bonus at the current combo
 * multiplier. Combo is left untouched — the head hit already advanced it, and a
 * sustain is a single note, not a stream of hits. Returns a NEW state.
 */
export function applyHoldComplete(
  score: ScoreState,
  durationMs: number,
): ScoreState {
  const bonus = holdBonusPoints(durationMs) * comboMultiplier(score.combo);
  return {
    ...score,
    score: score.score + bonus,
  };
}

/**
 * Apply a dropped sustain: releasing early breaks the combo (Rock Band style)
 * but does not add a miss — the note's head was already judged and counted, so
 * accuracy and completion are unaffected. Returns a NEW state.
 */
export function applyHoldDrop(score: ScoreState): ScoreState {
  return {
    ...score,
    combo: 0,
  };
}

/**
 * Identify notes that have scrolled past the hit line beyond the miss
 * threshold and have not yet been judged. Pure: returns the ids to mark, the
 * caller updates runtime/score.
 */
export function findNewlyMissedNoteIds(
  notes: readonly ChartNote[],
  runtime: ReadonlyMap<string, NoteRuntimeState>,
  songTimeMs: number,
  chartOffsetMs: number,
  calibrationOffsetMs: number,
): string[] {
  const missed: string[] = [];
  for (const note of notes) {
    if (runtime.get(note.id)?.judged) continue;
    const error = timingErrorMs(note, songTimeMs, chartOffsetMs, calibrationOffsetMs);
    // error > MISS_THRESHOLD means song time is past the note's late window.
    if (error > MISS_THRESHOLD_MS) {
      missed.push(note.id);
    }
  }
  return missed;
}

/**
 * Accuracy as a 0..100 percentage. Weighted by judgement quality so a chart of
 * all "good" hits does not read as 100%. Perfect=1, great=~0.7, good=~0.4.
 */
export function accuracyPercent(score: ScoreState): number {
  const judged = score.perfect + score.great + score.good + score.miss;
  if (judged === 0) return 100;
  const weighted =
    score.perfect * 1 + score.great * 0.7 + score.good * 0.4 + score.miss * 0;
  return (weighted / judged) * 100;
}

/** Whether every note in the chart has been judged. */
export function isComplete(score: ScoreState): boolean {
  return score.perfect + score.great + score.good + score.miss >= score.totalNotes;
}
