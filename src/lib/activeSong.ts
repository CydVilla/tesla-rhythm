/**
 * Tiny in-memory hand-off for the active song between routes (catalog / upload
 * → play).
 *
 * Why a module singleton instead of query params / storage:
 *  - The audio is a blob: object URL tied to this document; it cannot be
 *    serialized into the URL or sessionStorage.
 *  - Next.js App Router client navigation (router.push) keeps the JS module
 *    graph alive, so this value survives the route change.
 *  - On a hard reload the value is intentionally lost and /play falls back to a
 *    random built-in track (silent/demo mode).
 */

import type { RhythmChart } from "@/game/types";

export interface ActiveSong {
  chart: RhythmChart;
  /** blob: URL for uploaded audio, or undefined for demo/silent mode. */
  audioUrl?: string;
  title: string;
  /** Optional secondary line shown in the play header (artist · contributor). */
  subtitle?: string;
}

let current: ActiveSong | null = null;

export function setActiveSong(song: ActiveSong): void {
  current = song;
}

export function getActiveSong(): ActiveSong | null {
  return current;
}

export function clearActiveSong(): void {
  current = null;
}
