"use client";

/**
 * Client-side telemetry capture (browser only).
 *
 * Privacy model:
 *  - Data is anonymous. `clientId` is a random id generated on this device; it
 *    is never linked to any account (there are no accounts).
 *  - Everything is stored locally first, so the dashboard works offline and the
 *    player can inspect exactly what was collected.
 *  - Sending to the server is best-effort and can be turned off from the
 *    dashboard (opt-out persisted in localStorage). Opting out only suppresses
 *    the network send; local history is still recorded so the per-device
 *    dashboard keeps working. Use "clear data" to wipe the local history.
 */

import type { PlaySessionEvent } from "./types";
import { METRICS_SCHEMA_VERSION } from "./types";

const CLIENT_ID_KEY = "slophero.metrics.clientId";
const OPTOUT_KEY = "slophero.metrics.optout";
const SESSIONS_KEY = "slophero.metrics.sessions";

/** Keep the local ring buffer bounded so storage never balloons. */
const MAX_LOCAL_SESSIONS = 500;

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function randomId(prefix: string): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `${prefix}_${uuid.replace(/-/g, "").slice(0, 24)}`;
  } catch {
    // fall through
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function getClientId(): string {
  if (!hasStorage()) return "anon";
  let id = window.localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    // Constrained to what the server's clientId validator accepts.
    id = randomId("c").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
    if (id.length < 6) id = `c_${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function isOptedOut(): boolean {
  if (!hasStorage()) return false;
  return window.localStorage.getItem(OPTOUT_KEY) === "1";
}

export function setOptedOut(value: boolean): void {
  if (!hasStorage()) return;
  if (value) window.localStorage.setItem(OPTOUT_KEY, "1");
  else window.localStorage.removeItem(OPTOUT_KEY);
}

export function getLocalSessions(): PlaySessionEvent[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PlaySessionEvent[]) : [];
  } catch {
    return [];
  }
}

export function clearLocalSessions(): void {
  if (!hasStorage()) return;
  window.localStorage.removeItem(SESSIONS_KEY);
}

function saveLocalSessions(sessions: PlaySessionEvent[]): void {
  if (!hasStorage()) return;
  const trimmed = sessions.slice(-MAX_LOCAL_SESSIONS);
  try {
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full / disabled: ignore, telemetry is non-critical.
  }
}

/** Fields the caller provides; ids/clientId/schema are filled in here. */
export type PlaySessionInput = Omit<
  PlaySessionEvent,
  "id" | "clientId" | "schemaVersion" | "finishedAt"
> & { finishedAt?: string };

/**
 * Record one finished session: always persisted locally, then sent to the
 * server unless the player has opted out. Never throws.
 */
export function recordSession(input: PlaySessionInput): PlaySessionEvent {
  const event: PlaySessionEvent = {
    ...input,
    id: randomId("evt"),
    clientId: getClientId(),
    schemaVersion: METRICS_SCHEMA_VERSION,
    finishedAt: input.finishedAt ?? new Date().toISOString(),
  };

  const sessions = getLocalSessions();
  sessions.push(event);
  saveLocalSessions(sessions);

  if (!isOptedOut()) {
    void sendToServer(event);
  }

  return event;
}

function sendToServer(event: PlaySessionEvent): void {
  try {
    const body = JSON.stringify(event);
    // sendBeacon survives navigation (e.g. player leaves the results screen).
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/metrics/session", blob);
      if (ok) return;
    }
    void fetch("/api/metrics/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Network/telemetry failures must never affect gameplay.
  }
}
