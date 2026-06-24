import Link from "next/link";

import { PlayRandomButton } from "@/components/PlayRandomButton";
import styles from "./page.module.css";

export default function LandingPage(): React.JSX.Element {
  return (
    <main className={styles.main}>
      <div className={styles.glow} aria-hidden />

      <header className={styles.top}>
        <span className={styles.brand}>TESLA RHYTHM</span>
      </header>

      <section className={styles.hero}>
        <h1 className={styles.title}>
          Tap the highway.
          <br />
          <span className={styles.titleAccent}>Park &amp; play.</span>
        </h1>
        <p className={styles.subtitle}>
          A Clone&nbsp;Hero–style rhythm game built for a big touchscreen. Upload
          a track, get an instant playable chart, and tap five large lanes in
          time with the music — no guitar controller required.
        </p>

        <div className={styles.actions}>
          <PlayRandomButton className={`${styles.btn} ${styles.btnPrimary}`}>
            Play random track
          </PlayRandomButton>
          <Link href="/catalog" className={`${styles.btn} ${styles.btnSecondary}`}>
            Browse catalog
          </Link>
          <Link href="/upload" className={`${styles.btn} ${styles.btnSecondary}`}>
            Upload song
          </Link>
        </div>

        <nav className={styles.subnav}>
          <Link href="/editor" className={styles.subnavLink}>
            Chart editor (preview)
          </Link>
        </nav>
      </section>

      <ul className={styles.features}>
        <li>
          <strong>Tap-only</strong>
          <span>Five big lanes, no fret-and-strum. Designed for fingers, not picks.</span>
        </li>
        <li>
          <strong>Web Audio timing</strong>
          <span>Notes are judged against the precise audio clock with calibration.</span>
        </li>
        <li>
          <strong>Instant charts</strong>
          <span>Auto-analyze your audio for onset-timed notes, or use a quick BPM grid.</span>
        </li>
      </ul>

    </main>
  );
}
