/**
 * Clone Hero import — PLACEHOLDER.
 *
 * This module defines the types and function signatures for importing existing
 * Clone Hero song folders, but the parsing is intentionally NOT implemented in
 * this MVP. See docs/cloneHeroImportPlan.md for the full plan.
 *
 * A Clone Hero song folder typically contains:
 *   - song.ini      metadata (name, artist, charter, offset, etc.)
 *   - notes.chart   the .chart text format, OR
 *   - notes.mid     a Standard MIDI File chart
 *   - audio files   (song.ogg / guitar.ogg / drums.ogg / etc.)
 *
 * The eventual job of this module is to parse those sources and convert them
 * into our internal RhythmChart JSON, mapping the 5-fret guitar track onto our
 * 5 lanes and dropping mechanics (strum/HOPO/star power) we do not yet model.
 */

import type { Difficulty, RhythmChart } from "./types";

export interface CloneHeroSongMetadata {
  name: string;
  artist?: string;
  charter?: string;
  year?: string;
  /** Audio offset in seconds as stored in song.ini. */
  offset?: number;
}

/** A single source file pulled out of an imported song folder / ZIP. */
export interface CloneHeroSourceFiles {
  songIni?: string;
  notesChart?: string;
  /** notes.mid bytes, if a MIDI chart is provided instead of .chart. */
  notesMid?: ArrayBuffer;
  /** Object URL or path to the playable audio stem. */
  audioUrl?: string;
}

export interface CloneHeroImportResult {
  metadata: CloneHeroSongMetadata;
  chart: RhythmChart;
  audioUrl?: string;
}

const NOT_IMPLEMENTED =
  "Clone Hero import is not implemented yet. See docs/cloneHeroImportPlan.md.";

/** Parse song.ini contents into metadata. TODO: implement. */
export function parseSongIni(_contents: string): CloneHeroSongMetadata {
  throw new Error(`${NOT_IMPLEMENTED} (parseSongIni)`);
}

/** Parse a notes.chart text file into a RhythmChart. TODO: implement. */
export function parseNotesChart(
  _contents: string,
  _difficulty: Difficulty,
): RhythmChart {
  throw new Error(`${NOT_IMPLEMENTED} (parseNotesChart)`);
}

/** Parse a notes.mid binary into a RhythmChart. TODO: implement. */
export function parseNotesMidi(
  _bytes: ArrayBuffer,
  _difficulty: Difficulty,
): RhythmChart {
  throw new Error(`${NOT_IMPLEMENTED} (parseNotesMidi)`);
}

/**
 * High-level entry point: given the source files from an uploaded folder/ZIP,
 * produce an import result. TODO: implement orchestration once the parsers
 * above exist.
 */
export function importCloneHeroSong(
  _files: CloneHeroSourceFiles,
  _difficulty: Difficulty,
): CloneHeroImportResult {
  throw new Error(`${NOT_IMPLEMENTED} (importCloneHeroSong)`);
}
