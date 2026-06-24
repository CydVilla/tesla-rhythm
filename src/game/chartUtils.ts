/**
 * Chart helpers: id generation, sorting, validation, and runtime-state
 * construction. Pure and side-effect free.
 */

import { LANE_COUNT } from "./constants";
import type {
  ChartNote,
  Lane,
  NoteRuntimeState,
  RhythmChart,
} from "./types";

let idCounter = 0;

/**
 * Deterministic-ish unique id for notes. Not cryptographic; just needs to be
 * unique within a chart. Prefix lets us tell generated notes apart in logs.
 */
export function makeNoteId(prefix = "n"): string {
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36)}`;
}

/** Type guard for a valid lane index. */
export function isLane(value: number): value is Lane {
  return Number.isInteger(value) && value >= 0 && value < LANE_COUNT;
}

/** Return notes sorted ascending by time (stable for equal times by lane). */
export function sortNotes(notes: readonly ChartNote[]): ChartNote[] {
  return [...notes].sort((a, b) => a.timeMs - b.timeMs || a.lane - b.lane);
}

/**
 * Build the initial per-note runtime map (all unjudged). Kept separate from the
 * chart so the immutable chart can be reused across attempts.
 */
export function createRuntimeState(
  chart: RhythmChart,
): Map<string, NoteRuntimeState> {
  const map = new Map<string, NoteRuntimeState>();
  for (const note of chart.notes) {
    map.set(note.id, { judged: false });
  }
  return map;
}

/** Total chart duration in ms (last note end), useful for progress bars. */
export function chartDurationMs(chart: RhythmChart): number {
  let max = 0;
  for (const note of chart.notes) {
    const end = note.timeMs + (note.durationMs ?? 0);
    if (end > max) max = end;
  }
  return max;
}

/**
 * Validate a parsed chart enough to fail loudly on obviously-broken data
 * (e.g. imported JSON). Returns the chart for fluent use or throws.
 */
export function assertValidChart(chart: RhythmChart): RhythmChart {
  if (!chart.id) throw new Error("Chart is missing an id.");
  if (!Array.isArray(chart.notes)) throw new Error("Chart.notes must be an array.");
  for (const note of chart.notes) {
    if (!isLane(note.lane)) {
      throw new Error(`Note ${note.id} has invalid lane ${note.lane}.`);
    }
    if (!Number.isFinite(note.timeMs) || note.timeMs < 0) {
      throw new Error(`Note ${note.id} has invalid timeMs ${note.timeMs}.`);
    }
  }
  return chart;
}

/** Beats -> milliseconds at a given BPM. */
export function beatsToMs(beats: number, bpm: number): number {
  return (beats / bpm) * 60_000;
}

/** Milliseconds -> beats at a given BPM. */
export function msToBeats(ms: number, bpm: number): number {
  return (ms / 60_000) * bpm;
}
