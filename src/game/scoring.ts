/**
 * Pure scoring + hit-detection logic. No DOM, no React, no audio. Everything
 * here is a deterministic function of its inputs so it can be unit-tested.
 */

import {
  COMBO_MULTIPLIERS,
  HIT_WINDOWS,
  MISS_THRESHOLD_MS,
  SCORE_VALUES,
} from "./constants";
import { timingErrorMs } from "./timing";
import type {
  ChartNote,
  HitJudgement,
  HitRating,
  HitResult,
  Lane,
  NoteRuntimeState,
  ScoreState,
} from "./types";

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

  return { kind: "hit", note, rating, errorMs };
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
