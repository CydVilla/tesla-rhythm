/**
 * GET /api/metrics/summary
 *
 * Returns the server-wide rolled-up metrics used by the dashboard's
 * "All players" view.
 */

import { NextResponse } from "next/server";

import { aggregate } from "@/lib/metrics/aggregate";
import { readEvents } from "@/lib/metrics/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const events = await readEvents();
  const summary = aggregate(events);
  return NextResponse.json(
    { hasData: events.length > 0, summary },
    { status: 200 },
  );
}
