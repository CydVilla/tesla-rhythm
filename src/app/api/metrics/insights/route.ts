/**
 * GET /api/metrics/insights
 *
 * Runs the self-improvement analysis over server-wide data and returns both the
 * human-readable recommendations and the machine-writable `recommendedTuning`.
 * The scheduled workflow (scripts/apply-tuning.mjs) fetches this endpoint to
 * decide whether to open a tuning PR.
 */

import { NextResponse } from "next/server";

import { TUNING } from "@/game/tuning";
import { aggregate } from "@/lib/metrics/aggregate";
import { deriveInsights } from "@/lib/metrics/insights";
import { readEvents } from "@/lib/metrics/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const events = await readEvents();
  const summary = aggregate(events);
  const report = deriveInsights(summary, TUNING);
  return NextResponse.json({ summary, report }, { status: 200 });
}
