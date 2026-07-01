/**
 * Pure "brain" of the self-improvement loop.
 *
 * Given an aggregated `MetricsSummary` and the current `Tuning`, derive:
 *  - human-readable recommendations for the dashboard, and
 *  - a new, bounded `Tuning` object the loop can safely commit.
 *
 * Every adjustment is a small, clamped nudge — the loop can only drift the game
 * toward what players actually do, never make a large uncontrolled change.
 */

import type { Difficulty } from "@/game/types";
import { TUNING_BOUNDS, clamp, type Tuning } from "@/game/tuning";
import type { MetricsSummary, Recommendation } from "./types";

/** Minimum sessions before we trust an aggregate enough to act on it. */
export const MIN_SESSIONS_GLOBAL = 20;
export const MIN_SESSIONS_PER_DIFFICULTY = 10;

/** A difficulty this hard to keep up with should get sparser charts. */
const MISS_RATE_TOO_HARD = 0.35;
/** This easy + accurate means we can add a little density. */
const MISS_RATE_TOO_EASY = 0.08;
const ACCURACY_TOO_EASY = 95;

/** Only re-sync the default when players consistently offset by at least this. */
const CALIBRATION_DEADZONE_MS = 12;

/** Step sizes for bounded nudges. */
const DENSITY_STEP_DOWN = 0.1;
const DENSITY_STEP_UP = 0.05;

export interface InsightsReport {
  generatedAt: string;
  basedOnSessions: number;
  /** True when there were enough sessions to actually tune anything. */
  actionable: boolean;
  recommendations: Recommendation[];
  currentTuning: Tuning;
  recommendedTuning: Tuning;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function deriveInsights(
  summary: MetricsSummary,
  current: Tuning,
): InsightsReport {
  const recommendations: Recommendation[] = [];
  const nextDensity: Record<Difficulty, number> = {
    ...current.difficultyDensityScale,
  };
  let nextCalibration = current.defaultCalibrationOffsetMs;

  const enoughGlobal = summary.totalSessions >= MIN_SESSIONS_GLOBAL;

  if (!enoughGlobal) {
    recommendations.push({
      id: "need-more-data",
      severity: "info",
      title: "Collecting data",
      detail: `Only ${summary.totalSessions} session(s) recorded. Need at least ${MIN_SESSIONS_GLOBAL} before auto-tuning kicks in.`,
    });
  }

  // 1) Re-sync the default calibration toward the median players dial in.
  if (enoughGlobal) {
    const medianOffset = summary.medianCalibrationOffsetMs;
    if (Math.abs(medianOffset - current.defaultCalibrationOffsetMs) >= CALIBRATION_DEADZONE_MS) {
      // Move halfway toward the observed median (damped) so one noisy batch
      // can't yank the default around.
      const target = current.defaultCalibrationOffsetMs + (medianOffset - current.defaultCalibrationOffsetMs) / 2;
      nextCalibration = clamp(
        Math.round(target),
        TUNING_BOUNDS.calibrationMs.min,
        TUNING_BOUNDS.calibrationMs.max,
      );
      recommendations.push({
        id: "calibration-resync",
        severity: "suggestion",
        title: "Adjust default calibration",
        detail: `Players dial in a median offset of ${medianOffset}ms. Nudging the default from ${current.defaultCalibrationOffsetMs}ms to ${nextCalibration}ms so most players don't have to touch calibration.`,
      });
    }
  }

  // 2) Per-difficulty density tuning from miss rates.
  for (const stat of summary.byDifficulty) {
    if (stat.plays < MIN_SESSIONS_PER_DIFFICULTY) continue;
    const cur = current.difficultyDensityScale[stat.difficulty] ?? 1;
    const missPct = Math.round(stat.avgMissRate * 100);

    if (stat.avgMissRate > MISS_RATE_TOO_HARD) {
      const next = clamp(
        round2(cur - DENSITY_STEP_DOWN),
        TUNING_BOUNDS.densityScale.min,
        TUNING_BOUNDS.densityScale.max,
      );
      if (next !== cur) {
        nextDensity[stat.difficulty] = next;
        recommendations.push({
          id: `density-down-${stat.difficulty}`,
          severity: "warning",
          title: `Ease up "${stat.difficulty}" charts`,
          detail: `${missPct}% average miss rate over ${stat.plays} plays. Lowering note density (${cur} → ${next}).`,
        });
      }
    } else if (
      stat.avgMissRate < MISS_RATE_TOO_EASY &&
      stat.avgAccuracy > ACCURACY_TOO_EASY
    ) {
      const next = clamp(
        round2(cur + DENSITY_STEP_UP),
        TUNING_BOUNDS.densityScale.min,
        TUNING_BOUNDS.densityScale.max,
      );
      if (next !== cur) {
        nextDensity[stat.difficulty] = next;
        recommendations.push({
          id: `density-up-${stat.difficulty}`,
          severity: "suggestion",
          title: `Add challenge to "${stat.difficulty}" charts`,
          detail: `Only ${missPct}% misses at ${stat.avgAccuracy}% accuracy over ${stat.plays} plays — players want more. Raising note density (${cur} → ${next}).`,
        });
      }
    }
  }

  // 3) Non-actionable track callouts (surfaced, never auto-applied).
  for (const track of summary.topTracks) {
    if (track.plays >= 3 && track.avgMissRate > 0.5) {
      recommendations.push({
        id: `track-recharter-${track.chartId}`,
        severity: "warning",
        title: `"${track.title}" may need re-charting`,
        detail: `${Math.round(track.avgMissRate * 100)}% average miss rate over ${track.plays} plays suggests the notes don't line up with the music.`,
      });
    }
  }

  const changed =
    nextCalibration !== current.defaultCalibrationOffsetMs ||
    (Object.keys(nextDensity) as Difficulty[]).some(
      (d) => nextDensity[d] !== current.difficultyDensityScale[d],
    );

  if (enoughGlobal && !changed) {
    recommendations.push({
      id: "all-good",
      severity: "info",
      title: "No tuning changes needed",
      detail: "Current tuning is within healthy ranges for the collected data.",
    });
  }

  const recommendedTuning: Tuning = changed
    ? {
        version: current.version + 1,
        updatedAt: new Date().toISOString().slice(0, 10),
        defaultCalibrationOffsetMs: nextCalibration,
        difficultyDensityScale: nextDensity,
        notes: `Auto-tuned from ${summary.totalSessions} sessions on ${new Date()
          .toISOString()
          .slice(0, 10)}.`,
      }
    : current;

  return {
    generatedAt: new Date().toISOString(),
    basedOnSessions: summary.totalSessions,
    actionable: enoughGlobal && changed,
    recommendations,
    currentTuning: current,
    recommendedTuning,
  };
}
