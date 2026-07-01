#!/usr/bin/env node
/**
 * Autonomous self-improvement step.
 *
 * Pulls the insights the app already computes (single source of truth — the same
 * TypeScript that powers the dashboard), and, if the loop recommends an
 * actionable, bounded tuning change, rewrites `src/game/tuning.json` and writes a
 * human-readable report. The GitHub Actions workflow then opens a PR, CI
 * validates it, and (optionally) auto-merge lands it.
 *
 * Data source, in priority order:
 *   1. METRICS_FILE  — path to a JSON file shaped like the /api/metrics/insights
 *                      response ({ summary, report }). Handy for tests/offline.
 *   2. METRICS_ENDPOINT — base URL of a running deployment; we GET
 *                      `${METRICS_ENDPOINT}/api/metrics/insights`.
 *
 * If neither is set, the script exits 0 without changes (nothing to do).
 *
 * Zero dependencies — Node 18+ (global fetch, fs/promises).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TUNING_PATH = path.join(ROOT, "src", "game", "tuning.json");
const REPORT_PATH = path.join(ROOT, "docs", "metrics", "latest-report.md");

const BOUNDS = {
  calibrationMs: { min: -120, max: 120 },
  densityScale: { min: 0.5, max: 1.3 },
};
const DIFFICULTIES = ["easy", "medium", "hard", "expert"];

function log(msg) {
  console.log(`[self-improve] ${msg}`);
}

async function loadInsights() {
  const file = process.env.METRICS_FILE?.trim();
  if (file) {
    log(`Reading insights from file: ${file}`);
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw);
  }

  const endpoint = process.env.METRICS_ENDPOINT?.trim();
  if (endpoint) {
    const url = `${endpoint.replace(/\/$/, "")}/api/metrics/insights`;
    log(`Fetching insights from: ${url}`);
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
    return res.json();
  }

  return null;
}

/** Clamp + shape-check a recommended tuning so a bad payload can't slip in. */
function sanitizeTuning(t, current) {
  if (!t || typeof t !== "object") return null;
  const clamp = (v, { min, max }, fallback) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  const density = {};
  for (const d of DIFFICULTIES) {
    density[d] = clamp(
      t.difficultyDensityScale?.[d],
      BOUNDS.densityScale,
      current.difficultyDensityScale?.[d] ?? 1,
    );
  }

  return {
    version: Number.isFinite(Number(t.version))
      ? Number(t.version)
      : current.version + 1,
    updatedAt:
      typeof t.updatedAt === "string"
        ? t.updatedAt
        : new Date().toISOString().slice(0, 10),
    defaultCalibrationOffsetMs: Math.round(
      clamp(
        t.defaultCalibrationOffsetMs,
        BOUNDS.calibrationMs,
        current.defaultCalibrationOffsetMs ?? 0,
      ),
    ),
    difficultyDensityScale: density,
    notes: typeof t.notes === "string" ? t.notes : current.notes,
  };
}

function tuningChanged(a, b) {
  if (a.defaultCalibrationOffsetMs !== b.defaultCalibrationOffsetMs) return true;
  return DIFFICULTIES.some(
    (d) => a.difficultyDensityScale[d] !== b.difficultyDensityScale[d],
  );
}

function renderReport(summary, report, applied) {
  const lines = [];
  lines.push("# Slop Hero — self-improvement report");
  lines.push("");
  lines.push(`_Generated ${new Date().toISOString()}_`);
  lines.push("");
  lines.push(`- Sessions analyzed: **${summary?.totalSessions ?? 0}**`);
  lines.push(`- Unique players: **${summary?.uniquePlayers ?? 0}**`);
  lines.push(`- Overall accuracy: **${summary?.overallAccuracy ?? 0}%**`);
  lines.push(
    `- Median calibration offset: **${summary?.medianCalibrationOffsetMs ?? 0}ms**`,
  );
  lines.push(`- Tuning change applied: **${applied ? "yes" : "no"}**`);
  lines.push("");
  lines.push("## Recommendations");
  lines.push("");
  const recs = report?.recommendations ?? [];
  if (recs.length === 0) {
    lines.push("_None._");
  } else {
    for (const r of recs) {
      lines.push(`- **[${r.severity}] ${r.title}** — ${r.detail}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const data = await loadInsights();
  if (!data) {
    log(
      "No METRICS_FILE or METRICS_ENDPOINT configured. Nothing to analyze; exiting.",
    );
    return;
  }

  const { summary, report } = data;
  if (!report) {
    log("Response had no `report`; exiting.");
    return;
  }

  const current = JSON.parse(await readFile(TUNING_PATH, "utf8"));

  // Always refresh the report so the loop leaves a visible trail.
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });

  let applied = false;
  if (report.actionable && report.recommendedTuning) {
    const next = sanitizeTuning(report.recommendedTuning, current);
    if (next && tuningChanged(current, next)) {
      await writeFile(TUNING_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
      applied = true;
      log(
        `Applied tuning v${next.version}: calibration=${next.defaultCalibrationOffsetMs}ms, density=${JSON.stringify(next.difficultyDensityScale)}`,
      );
    } else {
      log("Recommended tuning matched current after clamping; no change.");
    }
  } else {
    log("No actionable tuning change recommended.");
  }

  await writeFile(REPORT_PATH, renderReport(summary, report, applied), "utf8");
  log(`Wrote report to ${path.relative(ROOT, REPORT_PATH)}`);

  // Signal to CI whether anything changed (used by the workflow).
  if (process.env.GITHUB_OUTPUT) {
    await writeFile(
      process.env.GITHUB_OUTPUT,
      `changed=${applied ? "true" : "false"}\n`,
      { flag: "a" },
    );
  }
}

main().catch((err) => {
  console.error("[self-improve] Failed:", err);
  process.exit(1);
});
