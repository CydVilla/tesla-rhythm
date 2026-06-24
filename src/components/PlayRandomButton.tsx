"use client";

/**
 * PlayRandomButton
 *
 * Picks a random track from the catalog, stashes it as the active song, and
 * navigates to /play. Used by the landing page so "Play" always launches a
 * (possibly different) track rather than a single fixed demo.
 */

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { pickRandomTrack, trackToActiveSong } from "@/data/tracks";
import { setActiveSong } from "@/lib/activeSong";

interface PlayRandomButtonProps {
  className?: string;
  children: React.ReactNode;
}

export function PlayRandomButton({
  className,
  children,
}: PlayRandomButtonProps): React.JSX.Element {
  const router = useRouter();

  const onClick = useCallback(() => {
    const track = pickRandomTrack();
    setActiveSong(trackToActiveSong(track));
    router.push("/play");
  }, [router]);

  return (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  );
}
