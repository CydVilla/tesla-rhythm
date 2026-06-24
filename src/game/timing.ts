/**
 * Pure timing helpers.
 *
 * The chart is authored in "chart time". The player hears "song time" (the
 * audio clock). The two are related by the chart's authored offset plus the
 * player's runtime calibration offset:
 *
 *   effectiveNoteTime = note.timeMs + chart.offsetMs - calibrationOffsetMs
 *
 * A POSITIVE calibration offset means "I am hitting late" -> shift judgement
 * windows so notes are judged later, i.e. subtract from the note time when
 * comparing against song time. We expose a single helper so every call site
 * applies the sign consistently.
 */

import { NOTE_TRAVEL_MS } from "./constants";
import type { ChartNote } from "./types";

/**
 * The song-time position (ms) at which a note should be judged, accounting for
 * the chart offset and the player's calibration offset.
 */
export function effectiveNoteTimeMs(
  note: Pick<ChartNote, "timeMs">,
  chartOffsetMs: number,
  calibrationOffsetMs: number,
): number {
  return note.timeMs + chartOffsetMs - calibrationOffsetMs;
}

/**
 * Signed timing error for a tap at `songTimeMs` against a note.
 * Negative = the player tapped early, positive = late.
 */
export function timingErrorMs(
  note: Pick<ChartNote, "timeMs">,
  songTimeMs: number,
  chartOffsetMs: number,
  calibrationOffsetMs: number,
): number {
  return songTimeMs - effectiveNoteTimeMs(note, chartOffsetMs, calibrationOffsetMs);
}

/**
 * Vertical progress of a note from spawn (0, top) to the hit line (1) and
 * beyond (>1). The renderer maps this to a y-coordinate. Computed purely so it
 * can be reasoned about/tested without a canvas.
 */
export function noteTravelProgress(
  note: Pick<ChartNote, "timeMs">,
  songTimeMs: number,
  chartOffsetMs: number,
  calibrationOffsetMs: number,
  travelMs: number = NOTE_TRAVEL_MS,
): number {
  const target = effectiveNoteTimeMs(note, chartOffsetMs, calibrationOffsetMs);
  const remaining = target - songTimeMs;
  return 1 - remaining / travelMs;
}

/** Clamp helper used across rendering math. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
