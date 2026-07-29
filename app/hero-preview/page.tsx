import type { Metadata } from "next";
import { LogicPlayground } from "./logic-playground";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Logic Playground Preview — John Weber",
  description: "A private working preview of an interactive portfolio visual.",
  robots: { index: false, follow: false },
};

export default function HeroPreviewPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.back} aria-label="Return to johnsweber.com">
          <span aria-hidden="true">←</span>
          johnsweber.com
        </a>
        <span className={styles.status}>
          <i aria-hidden="true" />
          interaction study 01
        </span>
      </header>

      <section className={styles.intro}>
        <p>Hands-on logic, without the dashboard.</p>
        <h1>
          Move it.
          <br />
          <em>See what connects.</em>
        </h1>
      </section>

      <LogicPlayground />

      <footer className={styles.footer}>
        <span>Drag to influence</span>
        <span>Tap to reroute</span>
        <span>Tilt to add depth</span>
      </footer>
    </main>
  );
}
