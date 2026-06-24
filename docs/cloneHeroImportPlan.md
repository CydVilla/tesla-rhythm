# Clone Hero Import Plan

Goal: let users import existing Clone Hero song folders/ZIPs and play them with
the touchscreen tap-only mechanics. The parsing entry points already exist as
typed stubs in `src/game/cloneHeroParser.ts`; this document is the spec for
filling them in.

## Current behavior (what happens today)

Clone Hero import is **not implemented yet**. Concretely:

- The `/upload` screen accepts **audio files only**. If you choose or drag in a
  Clone Hero file (`.chart`, `.mid`, `.ini`/`song.ini`, `.zip`, `.sng`), the UI
  detects it and shows a friendly notice pointing here — it does **not** silently
  ignore it, and it does **not** attempt to parse it.
- The parser functions in `src/game/cloneHeroParser.ts`
  (`parseSongIni`, `parseNotesChart`, `parseNotesMidi`, `importCloneHeroSong`)
  exist with correct TypeScript signatures but **throw** an explicit
  "not implemented" error, so any programmatic caller fails loudly rather than
  producing a broken chart.

So: providing a Clone Hero chart today results in a clear "not supported yet"
message, not a crash and not a playable song. The rest of this document is the
plan for making it actually work.

## A Clone Hero song folder

```
song-folder/
  song.ini        # metadata
  notes.chart     # text chart format  (OR)
  notes.mid       # Standard MIDI File chart
  song.ogg        # audio (may be split: guitar.ogg, drums.ogg, ...)
  album.png       # optional art
```

## Conversion target

Everything converts to our internal `RhythmChart` (see `src/game/types.ts`).

## Parsing tasks

### `song.ini` → `CloneHeroSongMetadata`
INI-style `key = value` lines. Relevant keys: `name`, `artist`, `charter`,
`year`, `delay`/`offset`. Map `delay`/`offset` to `RhythmChart.offsetMs`.

### `notes.chart` → `RhythmChart`
The `.chart` format is sectioned text:
- `[Song]` — resolution (ticks per beat), offset.
- `[SyncTrack]` — `B`(PM) and `TS` (time signature) events on a tick timeline.
- `[ExpertSingle]` / `[HardSingle]` / ... — note events:
  `tick = N fret length`, where fret 0–4 are the colored frets (5 = forced,
  6 = tap, 7 = open).

Steps:
1. Parse resolution + tempo map from `[SyncTrack]`.
2. Convert each note's tick → ms using the tempo map (handle tempo changes).
3. Map frets 0–4 → lanes 0–4. Drop/forced flags and open notes need a policy
   (e.g. open note → a default lane or a special marker — TBD).
4. Emit `ChartNote[]` for the selected difficulty section.

### `notes.mid` → `RhythmChart`
Parse the SMF. Guitar notes live on specific MIDI note numbers per difficulty
(e.g. Expert green = 96). Convert ticks → ms via the tempo track; map note
numbers → lanes. (A small MIDI parser or a dependency like `@tonejs/midi`.)

## Touchscreen adaptation

Because v1 is **tap-only**, when importing:
- Convert sustains to taps (or keep `durationMs` but ignore it for scoring).
- Optionally thin extremely dense Expert charts so they stay playable by finger.
- Star power / HOPO / forced-strum flags are dropped for now.

## File intake

- Accept a `.zip`; unzip in-browser (e.g. with a zip library) or on the server.
- Locate `song.ini` + a chart file + an audio file, parse, build `RhythmChart`,
  and create an object URL for the audio (same hand-off as the upload flow).

## Status

Not implemented. `cloneHeroParser.ts` currently throws explicit
"not implemented" errors so callers fail loudly rather than silently.
