# Server-Side Audio Analysis

The MVP does everything in the browser. Real audio analysis (beat tracking,
onset detection, stem separation) is heavier and is better suited to a server or
a background worker. This document sketches that boundary.

## Why move off the main thread / off the client

- DSP and ML (e.g. Demucs) are CPU/GPU heavy and would jank the UI.
- The Tesla browser is resource constrained; offloading keeps gameplay smooth.
- Models and native libraries are large; shipping them to the client is costly.

## Proposed boundary

```
Client (Next.js)                      Server (analysis service)
----------------                      -------------------------
upload audio (blob)  ── POST ───────▶ /api/analyze
                                        - decode
                                        - BPM + beat grid
                                        - onset detection
                                        - (optional) stem separation
                                        - lane assignment + cleanup
RhythmChart JSON     ◀── 200 ────────  returns RhythmChart JSON
play / edit chart
```

The contract is just `RhythmChart` (see `src/game/types.ts`). The client does
not care how the chart was produced.

## Implementation options

1. **Web Worker + WASM (no server).** Run lightweight DSP (BPM, onset) in a
   worker using a WASM build (e.g. aubio/essentia). Keeps it local-first; no
   stem separation. Good first step.
2. **Next.js Route Handler.** `app/api/analyze/route.ts` accepts the file,
   shells out to a Python worker for analysis, returns JSON. Simple to host.
3. **Dedicated microservice.** Python (librosa / madmom / Demucs) behind a queue
   for the expensive stem-separation path; the Next.js app just proxies.

## Privacy / legal

- Do not persist or redistribute user-uploaded copyrighted audio.
- Prefer ephemeral, in-memory processing; delete temp files immediately.
- Keep everything local-first where feasible (option 1) to avoid uploads.

## Caching

Hash the audio (e.g. SHA-256) and cache the resulting chart per
`(hash, difficulty)` so re-analysis is skipped.
