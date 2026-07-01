/**
 * Pure aggregation: a list of raw play events → a rolled-up `MetricsSummary`.
 *
 * No side effects, no IO. Shared by the server summary endpoint, the dashboard
 * (for local-device data), and the offline analysis script, so the numbers are
 * computed exactly one way everywhere.
 */

import type { Difficulty } from "@/game/types";
import type {
  DifficultyStat,
  HistogramBucket,
  MetricsSummary,
  PlaySessionEvent,
  RecentSession,
  TrackStat,
} from "./types";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];

/** Accuracy histogram edges (upper bounds, inclusive from the previous edge). */
const ACCURACY_BUCKETS: ReadonlyArray<readonly [string, number, number]> = [
  ["0–50%", 0, 50],
  ["50–70%", 50, 70],
  ["70–85%", 70, 85],
  ["85–95%", 85, 95],
  ["95–100%", 95, 100.0001],
];

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/** Fraction of notes missed for one session, 0..1. */
export function missRate(e: PlaySessionEvent): number {
  if (e.totalNotes <= 0) return 0;
  return e.miss / e.totalNotes;
}

function emptySummary(): MetricsSummary {
  return {
    generatedAt: new Date().toISOString(),
    totalSessions: 0,
    uniquePlayers: 0,
    totalNotesHit: 0,
    overallAccuracy: 0,
    completionRate: 0,
    medianCalibrationOffsetMs: 0,
    accuracyBuckets: ACCURACY_BUCKETS.map(([label]) => ({ label, count: 0 })),
    byDifficulty: [],
    topTracks: [],
    recentSessions: [],
  };
}

function difficultyStats(events: PlaySessionEvent[]): DifficultyStat[] {
  const out: DifficultyStat[] = [];
  for (const difficulty of DIFFICULTIES) {
    const group = events.filter((e) => e.difficulty === difficulty);
    if (group.length === 0) continue;
    out.push({
      difficulty,
      plays: group.length,
      avgAccuracy: round(mean(group.map((e) => e.accuracy)), 1),
      avgMissRate: round(mean(group.map(missRate)), 4),
      completionRate: round(
        group.filter((e) => e.completed).length / group.length,
        4,
      ),
    });
  }
  return out;
}

function trackStats(events: PlaySessionEvent[]): TrackStat[] {
  const byId = new Map<string, PlaySessionEvent[]>();
  for (const e of events) {
    const list = byId.get(e.chartId) ?? [];
    list.push(e);
    byId.set(e.chartId, list);
  }

  const stats: TrackStat[] = [];
  for (const [chartId, group] of byId) {
    const first = group[0]!;
    stats.push({
      chartId,
      title: first.title,
      difficulty: first.difficulty,
      plays: group.length,
      avgAccuracy: round(mean(group.map((e) => e.accuracy)), 1),
      avgMissRate: round(mean(group.map(missRate)), 4),
      avgScore: Math.round(mean(group.map((e) => e.score))),
      bestScore: Math.max(...group.map((e) => e.score)),
    });
  }

  // Most-played first, then by best score.
  return stats.sort((a, b) => b.plays - a.plays || b.bestScore - a.bestScore);
}

function accuracyHistogram(events: PlaySessionEvent[]): HistogramBucket[] {
  return ACCURACY_BUCKETS.map(([label, lo, hi]) => ({
    label,
    count: events.filter((e) => e.accuracy >= lo && e.accuracy < hi).length,
  }));
}

function recent(events: PlaySessionEvent[], limit = 12): RecentSession[] {
  return [...events]
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .slice(0, limit)
    .map((e) => ({
      title: e.title,
      difficulty: e.difficulty,
      accuracy: round(e.accuracy, 1),
      score: e.score,
      finishedAt: e.finishedAt,
    }));
}

export function aggregate(events: PlaySessionEvent[]): MetricsSummary {
  if (events.length === 0) return emptySummary();

  const players = new Set(events.map((e) => e.clientId));
  const totalNotesHit = events.reduce(
    (sum, e) => sum + e.perfect + e.great + e.good,
    0,
  );

  return {
    generatedAt: new Date().toISOString(),
    totalSessions: events.length,
    uniquePlayers: players.size,
    totalNotesHit,
    overallAccuracy: round(mean(events.map((e) => e.accuracy)), 1),
    completionRate: round(
      events.filter((e) => e.completed).length / events.length,
      4,
    ),
    medianCalibrationOffsetMs: Math.round(
      median(events.map((e) => e.calibrationOffsetMs)),
    ),
    accuracyBuckets: accuracyHistogram(events),
    byDifficulty: difficultyStats(events),
    topTracks: trackStats(events),
    recentSessions: recent(events),
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
