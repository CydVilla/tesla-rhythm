"use client";

import Link from "next/link";
import { useMemo } from "react";

import { LANE_COLORS } from "@/game/constants";
import { chartDurationMs } from "@/game/chartUtils";
import { createDemoChart } from "@/game/demoChart";
import { getActiveSong } from "@/lib/activeSong";
import type { RhythmChart } from "@/game/types";

import styles from "./editor.module.css";

/**
 * /editor — chart viewer placeholder.
 *
 * This is intentionally NOT a full editor yet. It loads the active song (or the
 * demo chart) and lets you inspect the internal RhythmChart JSON and note list.
 * Full editing (add/move/delete notes, snapping, playback scrub) is a future
 * iteration; the read-only view here validates the data model end to end.
 */
export default function EditorPage(): React.JSX.Element {
  const chart: RhythmChart = useMemo(
    () => getActiveSong()?.chart ?? createDemoChart(),
    [],
  );

  const durationSec = useMemo(() => chartDurationMs(chart) / 1000, [chart]);
  const json = useMemo(() => JSON.stringify(chart, null, 2), [chart]);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          ‹ Home
        </Link>
        <span className="parked-notice">Parked use only</span>
      </header>

      <div className={styles.banner}>
        Preview only — full chart editing (add / move / delete notes) is planned.
      </div>

      <h1 className={styles.title}>Chart editor</h1>

      <dl className={styles.meta}>
        <Meta label="Title" value={chart.title} />
        <Meta label="Difficulty" value={chart.difficulty} />
        <Meta label="BPM" value={String(chart.bpm ?? "—")} />
        <Meta label="Offset" value={`${chart.offsetMs} ms`} />
        <Meta label="Notes" value={String(chart.notes.length)} />
        <Meta label="Length" value={`${durationSec.toFixed(1)} s`} />
      </dl>

      <section className={styles.grid}>
        <div className={styles.column}>
          <h2 className={styles.h2}>Notes</h2>
          <div className={styles.noteList}>
            {chart.notes.slice(0, 400).map((n) => (
              <div key={n.id} className={styles.noteRow}>
                <span className={styles.time}>{(n.timeMs / 1000).toFixed(2)}s</span>
                <span
                  className={styles.swatch}
                  style={{ background: LANE_COLORS[n.lane] }}
                />
                <span className={styles.laneName}>Lane {n.lane + 1}</span>
                <span className={styles.type}>{n.type ?? "tap"}</span>
              </div>
            ))}
            {chart.notes.length > 400 && (
              <div className={styles.more}>
                +{chart.notes.length - 400} more notes…
              </div>
            )}
          </div>
        </div>

        <div className={styles.column}>
          <h2 className={styles.h2}>RhythmChart JSON</h2>
          <textarea className={styles.json} readOnly value={json} spellCheck={false} />
        </div>
      </section>

      <p className={styles.demoLink}>
        <Link href="/play">Play this chart →</Link>
      </p>
    </main>
  );
}

function Meta({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className={styles.metaItem}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
