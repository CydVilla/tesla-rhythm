"use client";

/**
 * UploadPanel
 *
 * Handles user audio upload entirely in the browser (no server):
 *   - reads file metadata,
 *   - probes duration via a hidden <audio> element,
 *   - lets the user pick difficulty + BPM and credit a contributor,
 *   - generates a placeholder chart with the deterministic automapper.
 *
 * If a non-audio file is provided (notably a Clone Hero chart/folder), we do NOT
 * silently ignore it — we show an explanatory notice, because Clone Hero import
 * is planned but not implemented yet (see docs/cloneHeroImportPlan.md).
 *
 * It does not render the game; it hands the finished result back via onReady so
 * the page can decide what to do (add to catalog, navigate, etc.).
 */

import { useCallback, useRef, useState } from "react";

import { generateAutoChart } from "@/game/autoMapper";
import type { Difficulty, RhythmChart } from "@/game/types";

import styles from "./UploadPanel.module.css";

export interface UploadResult {
  audioUrl: string;
  chart: RhythmChart;
  fileName: string;
  contributor: string;
}

interface UploadPanelProps {
  onReady: (result: UploadResult) => void;
}

interface FileMeta {
  name: string;
  size: number;
  type: string;
  durationSeconds: number | null;
}

type UnsupportedKind = "clone-hero" | "other";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];

/** Extensions that signal an attempted Clone Hero import. */
const CLONE_HERO_EXT = [".chart", ".mid", ".midi", ".ini", ".zip", ".sng"];

function isCloneHeroFile(name: string): boolean {
  const lower = name.toLowerCase();
  return CLONE_HERO_EXT.some((ext) => lower.endsWith(ext)) || lower === "song.ini";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function UploadPanel({ onReady }: UploadPanelProps): React.JSX.Element {
  const [meta, setMeta] = useState<FileMeta | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [bpm, setBpm] = useState(120);
  const [contributor, setContributor] = useState("");
  const [unsupported, setUnsupported] = useState<UnsupportedKind | null>(null);
  const previousUrlRef = useRef<string | null>(null);

  const handleFile = useCallback((file: File) => {
    // Reject non-audio files gracefully (Clone Hero charts etc.).
    if (!file.type.startsWith("audio")) {
      setUnsupported(isCloneHeroFile(file.name) ? "clone-hero" : "other");
      return;
    }
    setUnsupported(null);

    if (previousUrlRef.current) {
      URL.revokeObjectURL(previousUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    previousUrlRef.current = url;
    setAudioUrl(url);
    setMeta({
      name: file.name,
      size: file.size,
      type: file.type || "unknown",
      durationSeconds: null,
    });

    const probe = document.createElement("audio");
    probe.preload = "metadata";
    probe.src = url;
    probe.addEventListener("loadedmetadata", () => {
      const dur = Number.isFinite(probe.duration) ? probe.duration : null;
      setMeta((m) => (m ? { ...m, durationSeconds: dur } : m));
    });
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const canGenerate = audioUrl !== null && meta !== null;

  const handleGenerate = useCallback(() => {
    if (!audioUrl || !meta) return;
    const durationSeconds = meta.durationSeconds ?? 120;
    const chart = generateAutoChart({
      durationSeconds,
      difficulty,
      bpm,
      title: meta.name.replace(/\.[^.]+$/, ""),
      artist: "Your upload",
    });
    onReady({
      audioUrl,
      chart,
      fileName: meta.name,
      contributor: contributor.trim() || "You",
    });
  }, [audioUrl, meta, difficulty, bpm, contributor, onReady]);

  return (
    <div className={styles.panel}>
      <label
        className={styles.dropzone}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept="audio/*"
          className={styles.hiddenInput}
          onChange={onInputChange}
        />
        <span className={styles.dropTitle}>Tap to choose an audio file</span>
        <span className={styles.dropHint}>or drag &amp; drop · mp3, wav, ogg, m4a</span>
      </label>

      {unsupported === "clone-hero" && (
        <div className={styles.notice}>
          <strong>Clone Hero import isn&apos;t supported yet.</strong> That looks
          like a chart/folder file (<code>.chart</code>, <code>.mid</code>,
          <code> song.ini</code>, <code>.zip</code>). Importing Clone Hero songs is
          on the roadmap — see <code>docs/cloneHeroImportPlan.md</code>. For now,
          please upload just the audio file.
        </div>
      )}
      {unsupported === "other" && (
        <div className={styles.notice}>
          That doesn&apos;t look like an audio file. Please choose an audio track
          (mp3, wav, ogg, m4a…).
        </div>
      )}

      {meta && (
        <dl className={styles.meta}>
          <Row label="File" value={meta.name} />
          <Row label="Size" value={formatBytes(meta.size)} />
          <Row label="Type" value={meta.type} />
          <Row label="Duration" value={formatDuration(meta.durationSeconds)} />
        </dl>
      )}

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Difficulty</span>
        <div className={styles.difficulties}>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              className={`${styles.diffBtn} ${difficulty === d ? styles.diffActive : ""}`}
              onClick={() => setDifficulty(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>BPM</span>
          <input
            type="number"
            className={styles.bpmInput}
            min={40}
            max={300}
            value={bpm}
            onChange={(e) =>
              setBpm(Math.max(40, Math.min(300, Number(e.target.value) || 120)))
            }
          />
        </div>

        <div className={`${styles.field} ${styles.grow}`}>
          <span className={styles.fieldLabel}>Your name (for the catalog)</span>
          <input
            type="text"
            className={styles.textInput}
            placeholder="You"
            maxLength={40}
            value={contributor}
            onChange={(e) => setContributor(e.target.value)}
          />
        </div>
      </div>

      <button
        type="button"
        className={styles.generate}
        disabled={!canGenerate}
        onClick={handleGenerate}
      >
        Generate chart &amp; play
      </button>

      <p className={styles.note}>
        Charts are generated by a placeholder automapper on a BPM grid. Real audio
        analysis (onset detection, beat tracking) is planned — see the docs.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd title={value}>{value}</dd>
    </div>
  );
}
