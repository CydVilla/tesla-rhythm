# Metrics & the autonomous self-improvement loop

Slop Hero collects **anonymous, gameplay-only** telemetry and feeds it into a
closed loop that continuously and autonomously tunes the game toward what real
players do. This document explains the whole pipeline: what's collected, where it
goes, how it's turned into decisions, and how those decisions ship safely.

```
 play a song ──▶ record session ──▶ /api/metrics/session ──▶ JSONL store
      ▲                │ (localStorage too)                        │
      │                ▼                                           ▼
      │          /dashboard  ◀──── aggregate() ◀──── /api/metrics/summary
      │                                                            │
      │                                                            ▼
      └──── ship (PR + CI) ◀── tuning.json ◀── insights ◀── /api/metrics/insights
                                   (bounded)      engine
```

## 1. What is collected

One event per finished play-through (`PlaySessionEvent` in
`src/lib/metrics/types.ts`):

- Chart identity: `chartId`, `title`, `artist`, `difficulty`, `source`, `bpm`.
- Result: `score`, `maxCombo`, `accuracy`, per-rating counts, `totalNotes`,
  `completed`.
- Sync: the `calibrationOffsetMs` the player had dialed in.
- Timing: `durationMs`, `finishedAt`.
- `clientId`: a **random** id generated on the device (localStorage). There are
  no accounts and nothing links this to a person.

### Privacy

- Everything is stored **locally first** (localStorage) so the dashboard works
  offline and players can inspect exactly what's kept.
- Sending to the shared server store is best-effort and **opt-out** from the
  dashboard. "Clear this device's data" wipes local history.
- Incoming events are **sanitized and clamped** server-side
  (`sanitizeEvent` in `src/lib/metrics/store.ts`) so untrusted POST bodies can't
  poison the aggregates.

## 2. Where it goes

`src/lib/metrics/store.ts` appends events to a JSON Lines file (default
`.data/metrics.jsonl`, override with `METRICS_FILE`). This keeps the project's
"local-first, no database" ethos and works with zero setup. On a read-only/
serverless filesystem, writes fail softly and the dashboard falls back to
per-device data. Swap the two IO functions for a KV/DB later without touching the
aggregation or API layers.

API routes (all Node runtime, `force-dynamic`):

- `POST /api/metrics/session` — ingest one sanitized event.
- `GET  /api/metrics/summary` — `aggregate()` over all events.
- `GET  /api/metrics/insights` — `aggregate()` + `deriveInsights()`.

## 3. The dashboard (`/dashboard`)

Two lenses over the same data:

- **All players** — server-wide aggregates.
- **This device** — computed locally, so it's useful even with no backend.

It renders KPIs, an accuracy histogram, per-difficulty miss rates, a per-track
table, the self-improvement engine's recommendations, and the exact bounded
tuning it would commit. Privacy controls (opt-out / clear) live at the bottom.

## 4. The decision engine

`src/lib/metrics/insights.ts` (`deriveInsights`) is a pure function:
`summary + current tuning → recommendations + a new, bounded tuning`. It only
acts once there's enough data (`MIN_SESSIONS_GLOBAL`,
`MIN_SESSIONS_PER_DIFFICULTY`) and only ever makes **small, clamped nudges**:

- **Default calibration** drifts halfway toward the median offset players dial
  in (damped, clamped to ±120ms). Over time the out-of-the-box sync matches real
  hardware/latency.
- **Per-difficulty note density** drops when a tier's miss rate is too high
  (> 35%) and rises (bounded) when players find it too easy (< 8% miss and
  > 95% accuracy). Clamped to `[0.5, 1.3]`.
- **Track callouts** flag charts with very high miss rates as needing a
  re-chart. Informational only — never auto-applied.

The only machine-writable surface is `src/game/tuning.json` (typed +
range-guarded in `src/game/tuning.ts`). The loop can nudge a handful of numbers;
it can never rewrite game logic.

## 5. How changes ship (autonomously, but safely)

`scripts/apply-tuning.mjs` (zero-dependency Node) pulls the insights the app
already computes — the same TypeScript that powers the dashboard, so there's a
single source of truth — and, if a change is recommended, rewrites
`tuning.json` and `docs/metrics/latest-report.md`.

`.github/workflows/self-improve.yml` runs it weekly (and on demand). If anything
changed, it opens a PR via `peter-evans/create-pull-request`. The existing **CI**
workflow (`Typecheck & build`) gates that PR exactly like a Dependabot update, so
a bad tune can't land unreviewed.

### Enabling it

1. Deploy the app somewhere `/api/metrics/insights` is reachable.
2. Add a repo variable/secret `METRICS_ENDPOINT` = that base URL. (Or set
   `METRICS_FILE` to a committed fixtures path for a dry run.)
3. Optional: add a `SELF_IMPROVE_TOKEN` PAT secret so the opened PR triggers CI
   (PRs opened with the default `GITHUB_TOKEN` don't trigger other workflows).

Run it locally against fixtures:

```bash
METRICS_FILE=docs/metrics/sample-insights.json npm run analyze:metrics
```

## 6. Extending it

- Add metrics: extend `PlaySessionEvent`, bump `METRICS_SCHEMA_VERSION`, and
  emit from `recordSession` where the game finishes (`GameScreen`).
- Add new aggregates in `aggregate.ts`; they show up wherever summaries render.
- Add new tuning levers: add a field to `tuning.json` + `Tuning`, wire it into
  gameplay, and teach `deriveInsights` to nudge it (with bounds in
  `TUNING_BOUNDS`).
