"use client";

/**
 * GameCanvas
 *
 * Imperative Canvas 2D renderer for the note highway. It owns the single
 * requestAnimationFrame loop for the game. Each frame it:
 *   1. reads the song time from the audio clock (a ref-backed getter),
 *   2. calls `onFrame` so the game hook can process misses/end-of-song,
 *   3. draws the highway from the chart + per-note runtime refs.
 *
 * Crucially it reads all high-frequency state from refs and NEVER calls
 * setState, so the animation loop produces zero React re-renders.
 */

import { useEffect, useRef } from "react";

import {
  FEEDBACK_DURATION_MS,
  LANE_COLORS,
  LANE_COUNT,
  LANE_FLASH_MS,
  LANE_GLOW_COLORS,
  LANES,
} from "@/game/constants";
import { clamp, noteTravelProgress } from "@/game/timing";
import type {
  GamePhase,
  HitFeedback,
  Lane,
  NoteRuntimeState,
  RhythmChart,
} from "@/game/types";

interface GameCanvasProps {
  chart: RhythmChart;
  phase: GamePhase;
  getTimeMs: () => number;
  getCalibrationOffsetMs: () => number;
  runtimeRef: React.RefObject<Map<string, NoteRuntimeState>>;
  feedbackRef: React.RefObject<HitFeedback[]>;
  laneFlashRef: React.RefObject<Record<Lane, number>>;
  onFrame: (songTimeMs: number) => void;
}

const HIT_LINE_RATIO = 0.82; // hit line position from top (0..1)
const RATING_LABEL: Record<HitFeedback["rating"], string> = {
  perfect: "PERFECT",
  great: "GREAT",
  good: "GOOD",
  miss: "MISS",
};
const RATING_COLOR: Record<HitFeedback["rating"], string> = {
  perfect: "#fde047",
  great: "#4ade80",
  good: "#60a5fa",
  miss: "#f87171",
};

export function GameCanvas({
  chart,
  phase,
  getTimeMs,
  getCalibrationOffsetMs,
  runtimeRef,
  feedbackRef,
  laneFlashRef,
  onFrame,
}: GameCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Mirror frequently-changing props into refs so the rAF loop, which is set up
  // once, always sees the latest values without re-subscribing.
  const propsRef = useRef({
    chart,
    phase,
    getTimeMs,
    getCalibrationOffsetMs,
    onFrame,
  });
  propsRef.current = { chart, phase, getTimeMs, getCalibrationOffsetMs, onFrame };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let cssWidth = 0;
    let cssHeight = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      cssWidth = rect.width;
      cssHeight = rect.height;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = () => {
      const {
        chart: c,
        getTimeMs: getT,
        getCalibrationOffsetMs: getCal,
        onFrame: frame,
      } = propsRef.current;

      const t = getT();
      frame(t);

      const cal = getCal();
      const w = cssWidth;
      const h = cssHeight;
      const laneW = w / LANE_COUNT;
      const hitLineY = h * HIT_LINE_RATIO;

      ctx.clearRect(0, 0, w, h);
      drawLanes(ctx, w, h, laneW, hitLineY, laneFlashRef.current, t);
      drawNotes(ctx, c, t, cal, laneW, hitLineY, runtimeRef.current);
      drawHitLine(ctx, w, laneW, hitLineY);
      drawFeedback(ctx, feedbackRef.current, laneW, hitLineY, t);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [runtimeRef, feedbackRef, laneFlashRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
      aria-label="Note highway"
    />
  );
}

function drawLanes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  laneW: number,
  hitLineY: number,
  laneFlash: Record<Lane, number> | null,
  t: number,
): void {
  for (const lane of LANES) {
    const x = lane * laneW;
    // Alternating subtle lane backgrounds for depth.
    ctx.fillStyle = lane % 2 === 0 ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.05)";
    ctx.fillRect(x, 0, laneW, h);

    // Lane separator.
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();

    // Active-press glow rising from the hit line.
    const flashAt = laneFlash?.[lane] ?? -Infinity;
    const flashAge = t - flashAt;
    if (flashAge >= 0 && flashAge < LANE_FLASH_MS) {
      const alpha = 1 - flashAge / LANE_FLASH_MS;
      const grad = ctx.createLinearGradient(0, hitLineY, 0, hitLineY - h * 0.4);
      const color = LANE_GLOW_COLORS[lane];
      grad.addColorStop(0, hexWithAlpha(color, 0.55 * alpha));
      grad.addColorStop(1, hexWithAlpha(color, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(x, hitLineY - h * 0.4, laneW, h * 0.4);
    }
  }
}

function drawNotes(
  ctx: CanvasRenderingContext2D,
  chart: RhythmChart,
  t: number,
  cal: number,
  laneW: number,
  hitLineY: number,
  runtime: Map<string, NoteRuntimeState> | null,
): void {
  const noteW = laneW * 0.66;
  const noteH = Math.min(26, laneW * 0.34);

  for (const note of chart.notes) {
    if (runtime?.get(note.id)?.judged) continue;

    const progress = noteTravelProgress(note, t, chart.offsetMs, cal);
    // Only draw notes that are on-screen (above the top a touch, below hit line).
    if (progress < -0.08 || progress > 1.12) continue;

    const y = progress * hitLineY;
    const cx = note.lane * laneW + laneW / 2;
    const color = LANE_COLORS[note.lane];

    // Approaching notes brighten as they near the hit line.
    const nearness = clamp(progress, 0, 1);
    drawNoteShape(ctx, cx, y, noteW, noteH, color, 0.55 + 0.45 * nearness);
  }
}

function drawNoteShape(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  color: string,
  alpha: number,
): void {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const r = h / 2;

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 16 * alpha;
  ctx.fillStyle = hexWithAlpha(color, alpha);
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();

  // Glossy top highlight.
  ctx.shadowBlur = 0;
  ctx.fillStyle = hexWithAlpha("#ffffff", 0.25 * alpha);
  roundRect(ctx, x + w * 0.12, y + h * 0.18, w * 0.76, h * 0.28, h * 0.18);
  ctx.fill();
  ctx.restore();
}

function drawHitLine(
  ctx: CanvasRenderingContext2D,
  w: number,
  laneW: number,
  hitLineY: number,
): void {
  // Horizontal hit line.
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, hitLineY);
  ctx.lineTo(w, hitLineY);
  ctx.stroke();

  // Per-lane target rings.
  for (const lane of LANES) {
    const cx = lane * laneW + laneW / 2;
    const color = LANE_COLORS[lane];
    const r = Math.min(22, laneW * 0.3);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx, hitLineY, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFeedback(
  ctx: CanvasRenderingContext2D,
  feedback: HitFeedback[] | null,
  laneW: number,
  hitLineY: number,
  t: number,
): void {
  if (!feedback) return;
  for (const f of feedback) {
    const age = t - f.createdAtMs;
    if (age < 0 || age > FEEDBACK_DURATION_MS) continue;
    const k = age / FEEDBACK_DURATION_MS;
    const alpha = 1 - k;
    const rise = 42 * k;
    const cx = f.lane * laneW + laneW / 2;
    const cy = hitLineY - 40 - rise;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = RATING_COLOR[f.rating];
    ctx.font = `700 ${Math.min(20, laneW * 0.18)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(RATING_LABEL[f.rating], cx, cy);
    ctx.restore();
  }
}

/* ----------------------------- canvas helpers ----------------------------- */

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Apply an alpha to a #rrggbb hex color. */
function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(clamp(alpha, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}
