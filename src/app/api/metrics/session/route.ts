/**
 * POST /api/metrics/session
 *
 * Ingests one anonymous play-session event. The body is untrusted, so it is
 * sanitized and clamped before it ever reaches the store or the aggregates.
 */

import { NextResponse } from "next/server";

import { appendEvent, sanitizeEvent } from "@/lib/metrics/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeClientId(input: unknown): string {
  if (typeof input === "string" && /^[A-Za-z0-9_-]{6,80}$/.test(input)) {
    return input;
  }
  return "anon";
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const clientId = safeClientId(
    (body as { clientId?: unknown } | null)?.clientId,
  );
  const event = sanitizeEvent(body, clientId);
  if (!event) {
    return NextResponse.json(
      { ok: false, error: "invalid event" },
      { status: 422 },
    );
  }

  const persisted = await appendEvent(event);
  return NextResponse.json({ ok: true, persisted }, { status: 202 });
}
