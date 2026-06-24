"use client";

import { useMemo } from "react";

import { GameScreen } from "@/components/GameScreen";
import { pickRandomTrack, trackToActiveSong } from "@/data/tracks";
import { getActiveSong } from "@/lib/activeSong";

/**
 * /play renders the active song handed off from the catalog or /upload. If
 * there is none (e.g. a direct visit or a hard reload), it falls back to a
 * random built-in track in silent/demo mode so the page is always playable.
 */
export default function PlayPage(): React.JSX.Element {
  const session = useMemo(() => {
    return getActiveSong() ?? trackToActiveSong(pickRandomTrack());
  }, []);

  return (
    <GameScreen
      chart={session.chart}
      audioUrl={session.audioUrl}
      title={session.title}
      subtitle={session.subtitle}
    />
  );
}
