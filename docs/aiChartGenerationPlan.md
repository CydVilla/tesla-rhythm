# AI Chart Generation Plan

This document describes the *intended* real chart-generation pipeline that will
eventually replace the placeholder automapper in `src/game/autoMapper.ts`.

The placeholder generates notes on a fixed BPM grid. It is deterministic and
playable but musically naive. The goal below is to produce charts that actually
follow the music.

## Output contract (stable)

Whatever the backend does, it must emit the existing internal format so the
client never changes:

```ts
RhythmChart // see src/game/types.ts
```

Keeping this contract stable means we can swap the generator (client grid →
server ML) without touching gameplay, scoring, or rendering.

## Pipeline

```
audio file
  -> duration / metadata extraction
  -> BPM estimation
  -> beat grid generation
  -> onset detection
  -> optional stem separation
  -> lane assignment
  -> difficulty scaling
  -> playability cleanup
  -> RhythmChart JSON
```

### 1. Duration / metadata extraction
Decode the file, read sample rate, channel count, and exact duration. (Today the
client does this with an `<audio>` element + Web Audio `decodeAudioData`.)

### 2. BPM estimation
Estimate tempo from an onset-strength envelope + autocorrelation / tempogram.
Allow a manual override (the upload UI already collects a BPM). Detect and
handle tempo drift later; assume constant tempo first.

### 3. Beat grid generation
From BPM + downbeat phase, generate a quantization grid (1/4, 1/8, 1/16). Notes
will snap to this grid for a tight, readable feel.

### 4. Onset detection
Compute onsets via spectral flux / superflux. These are the candidate note
times. Snap each onset to the nearest grid slot and de-duplicate.

### 5. Optional stem separation
Use a source separator (e.g. Demucs / Spleeter) to split drums / bass / vocals /
other. This enables mapping different instruments to different lanes and far more
musical charts (kick → one lane, snare → another, etc.).

### 6. Lane assignment
Map onsets to the 5 lanes. Strategies, in increasing sophistication:
- pitch/frequency band → lane (low freq = left, high = right)
- per-stem → lane group
- melodic contour → stepwise lane motion (avoid random jumps)

### 7. Difficulty scaling
Thin or thicken the note set per difficulty by filtering on onset strength,
grid resolution, and chord frequency — mirroring the placeholder's density
profiles but driven by real signal.

### 8. Playability cleanup
Critical for a *touchscreen*: remove physically awkward patterns (rapid same-lane
repeats, too-dense bursts, more than 2 simultaneous notes), enforce a minimum
spacing, and cap notes-per-second per difficulty.

### 9. Emit `RhythmChart` JSON
Assemble metadata + cleaned notes and return.

## Where this runs

See `serverSideAudioAnalysis.md`. Short version: heavy DSP/ML belongs on a
server (or a WASM/Web Worker for lighter analysis). The client should remain a
thin consumer of `RhythmChart` JSON.

## Incremental path

1. Client-side BPM + onset detection in a Web Worker (no ML) → already a big
   upgrade over the grid.
2. Server endpoint `POST /api/analyze` returning `RhythmChart`.
3. Add stem separation behind the same endpoint.
4. Train/tune lane-assignment heuristics; add per-difficulty cleanup passes.
