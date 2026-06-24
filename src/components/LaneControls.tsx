"use client";

/**
 * LaneControls
 *
 * The five large tap pads at the bottom of the highway. This is the primary
 * touch input surface. We use Pointer Events exclusively, which unifies
 * mouse / touch / pen into one event stream and therefore avoids the classic
 * "touch fires then a synthetic mouse event fires" double-trigger problem.
 */

import { useCallback, useState } from "react";

import { LANE_COLORS, LANES } from "@/game/constants";
import type { Lane } from "@/game/types";

import styles from "./LaneControls.module.css";

interface LaneControlsProps {
  onLanePress: (lane: Lane) => void;
  /** Optional externally-pressed lanes (e.g. from keyboard) to light up pads. */
  activeLanes?: ReadonlySet<Lane>;
  disabled?: boolean;
}

const KEY_HINTS: Record<Lane, string> = { 0: "A", 1: "S", 2: "D", 3: "F", 4: "G" };

export function LaneControls({
  onLanePress,
  activeLanes,
  disabled = false,
}: LaneControlsProps): React.JSX.Element {
  const [pressed, setPressed] = useState<Record<Lane, boolean>>({
    0: false,
    1: false,
    2: false,
    3: false,
    4: false,
  });

  const setLanePressed = useCallback((lane: Lane, value: boolean) => {
    setPressed((prev) => (prev[lane] === value ? prev : { ...prev, [lane]: value }));
  }, []);

  const handleDown = useCallback(
    (lane: Lane) => (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setLanePressed(lane, true);
      onLanePress(lane);
    },
    [disabled, onLanePress, setLanePressed],
  );

  const handleUp = useCallback(
    (lane: Lane) => () => setLanePressed(lane, false),
    [setLanePressed],
  );

  return (
    <div className={styles.row} role="group" aria-label="Lane tap pads">
      {LANES.map((lane) => {
        const isOn = pressed[lane] || (activeLanes?.has(lane) ?? false);
        return (
          <button
            key={lane}
            type="button"
            aria-label={`Lane ${lane + 1}`}
            className={`${styles.pad} ${isOn ? styles.padActive : ""}`}
            style={
              {
                "--lane-color": LANE_COLORS[lane],
              } as React.CSSProperties
            }
            onPointerDown={handleDown(lane)}
            onPointerUp={handleUp(lane)}
            onPointerCancel={handleUp(lane)}
            onPointerLeave={handleUp(lane)}
            disabled={disabled}
          >
            <span className={styles.key}>{KEY_HINTS[lane]}</span>
          </button>
        );
      })}
    </div>
  );
}
