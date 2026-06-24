/**
 * Dedicated Web Worker that runs the (CPU-heavy) audio analysis off the main
 * thread so the UI stays responsive while charting a song.
 *
 * Protocol:
 *   main → worker: AnalyzeRequest (mono PCM is transferred, not copied)
 *   worker → main: { type: "progress", value } | { type: "done", chart }
 *                  | { type: "error", message }
 */

import { analyzePcmToChart } from "../game/audioAnalysis";
import type { Difficulty, RhythmChart } from "../game/types";

export interface AnalyzeRequest {
  samples: Float32Array;
  sampleRate: number;
  difficulty: Difficulty;
  durationSeconds: number;
  bpmHint?: number;
  title?: string;
  artist?: string;
}

export type AnalyzeResponse =
  | { type: "progress"; value: number }
  | { type: "done"; chart: RhythmChart }
  | { type: "error"; message: string };

// Minimal typed view of the worker global scope (avoids needing the WebWorker
// TS lib, which conflicts with the DOM lib used elsewhere).
interface WorkerScope {
  postMessage(message: AnalyzeResponse, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (ev: MessageEvent<AnalyzeRequest>) => void): void;
}

const ctx = self as unknown as WorkerScope;

ctx.addEventListener("message", (event) => {
  const req = event.data;
  try {
    const chart = analyzePcmToChart(req.samples, req.sampleRate, {
      difficulty: req.difficulty,
      durationSeconds: req.durationSeconds,
      bpmHint: req.bpmHint,
      title: req.title,
      artist: req.artist,
      onProgress: (value) => ctx.postMessage({ type: "progress", value }),
    });
    ctx.postMessage({ type: "done", chart });
  } catch (err) {
    ctx.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : "Audio analysis failed.",
    });
  }
});
