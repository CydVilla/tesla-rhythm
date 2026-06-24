"use client";

/**
 * ScorePanel
 *
 * Low-frequency UI: reads the React score state (updated only on hits/misses,
 * not every frame). Pure presentational component.
 */

import { accuracyPercent, comboMultiplier } from "@/game/scoring";
import type { ScoreState } from "@/game/types";

import styles from "./ScorePanel.module.css";

interface ScorePanelProps {
  score: ScoreState;
}

export function ScorePanel({ score }: ScorePanelProps): React.JSX.Element {
  const accuracy = accuracyPercent(score);
  const multiplier = comboMultiplier(score.combo);

  return (
    <div className={styles.panel}>
      <div className={styles.scoreBlock}>
        <span className={styles.scoreValue}>{score.score.toLocaleString()}</span>
        <span className={styles.scoreLabel}>SCORE</span>
      </div>

      <div className={styles.comboBlock}>
        <span className={styles.comboValue}>{score.combo}</span>
        <span className={styles.comboLabel}>
          COMBO {multiplier > 1 ? <em className={styles.mult}>×{multiplier}</em> : null}
        </span>
      </div>

      <dl className={styles.stats}>
        <Stat label="Acc" value={`${accuracy.toFixed(1)}%`} />
        <Stat label="Max" value={score.maxCombo.toString()} />
        <Stat label="Perfect" value={score.perfect.toString()} tone="perfect" />
        <Stat label="Great" value={score.great.toString()} tone="great" />
        <Stat label="Good" value={score.good.toString()} tone="good" />
        <Stat label="Miss" value={score.miss.toString()} tone="miss" />
      </dl>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "perfect" | "great" | "good" | "miss";
}): React.JSX.Element {
  return (
    <div className={`${styles.stat} ${tone ? styles[tone] : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
