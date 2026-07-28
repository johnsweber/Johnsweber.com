"use client";

import { useState } from "react";

type ProbeResult = {
  ok?: boolean;
  configured?: boolean;
  gpu?: string;
  memory_mb?: string;
  message?: string;
  error?: string;
};

export default function Home() {
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [running, setRunning] = useState(false);

  async function runGpuProbe() {
    setRunning(true);
    setProbe(null);

    try {
      const response = await fetch("/api/gpu-status", { method: "POST" });
      const data = (await response.json()) as ProbeResult;
      setProbe(data);
    } catch {
      setProbe({ error: "The GPU gateway could not be reached." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <main>
      <nav className="nav">
        <a className="wordmark" href="#top" aria-label="John Weber home">
          JW<span>°</span>
        </a>
        <div className="nav-links">
          <a href="#work">Work</a>
          <a href="#playground">Playground</a>
          <a href="#about">About</a>
        </div>
        <span className="availability">Open to interesting problems</span>
      </nav>

      <section className="hero" id="top">
        <div className="eyebrow">
          <span className="pulse" />
          JOHN WEBER · WASHINGTON, DC
        </div>
        <h1>
          I build systems that make ideas <em>feel real.</em>
        </h1>
        <div className="hero-bottom">
          <p>
            A personal site, living portfolio, and public workshop for small
            tools, ambitious experiments, and applied AI.
          </p>
          <a className="primary-link" href="#playground">
            Enter the playground <span>↘</span>
          </a>
        </div>
        <div className="orbit" aria-hidden="true">
          <span>01</span>
          <span>BUILD</span>
          <span>TEST</span>
          <span>SHIP</span>
        </div>
      </section>

      <section className="section" id="work">
        <div className="section-label">Selected directions</div>
        <div className="project-grid">
          <article className="project project-featured">
            <div className="project-number">01 / NOW</div>
            <h2>Vibe projects, with the wiring exposed.</h2>
            <p>
              Fast prototypes that are useful, surprising, and honest about
              what is happening under the hood.
            </p>
            <div className="project-meta">
              <span>Cloudflare edge</span>
              <span>Modal GPU</span>
              <span>Open experiments</span>
            </div>
          </article>
          <article className="project">
            <div className="project-number">02 / NEXT</div>
            <h3>Video Lab</h3>
            <p>Image-guided motion studies and generative video workflows.</p>
            <span className="status">In the workshop</span>
          </article>
          <article className="project">
            <div className="project-number">03 / ALWAYS</div>
            <h3>Tiny Tools</h3>
            <p>Focused utilities that turn recurring friction into a button.</p>
            <span className="status">Growing collection</span>
          </article>
        </div>
      </section>

      <section className="playground section" id="playground">
        <div>
          <div className="section-label">Live infrastructure demo</div>
          <h2>One click from the edge to an H100.</h2>
          <p className="playground-copy">
            This request travels through the site&apos;s private gateway to a
            protected Modal function. The GPU scales down when idle.
          </p>
        </div>

        <div className="terminal-card">
          <div className="terminal-top">
            <span>GPU PULSE</span>
            <span className="terminal-state">
              <i />
              ON DEMAND
            </span>
          </div>
          <div className="terminal-body">
            <div className="route">
              <span>johnsweber.com</span>
              <b>→</b>
              <span>private gateway</span>
              <b>→</b>
              <span>Modal H100</span>
            </div>
            <button
              className="probe-button"
              type="button"
              onClick={runGpuProbe}
              disabled={running}
            >
              {running ? "Waking GPU…" : "Run GPU probe"}
            </button>
            <div className="probe-output" aria-live="polite">
              {!probe && !running && (
                <span>Idle. No GPU compute is running.</span>
              )}
              {running && <span>Cold starts can take a moment…</span>}
              {probe?.ok && (
                <>
                  <strong>{probe.gpu ?? "GPU online"}</strong>
                  <span>
                    {probe.memory_mb
                      ? `${probe.memory_mb} MB memory · Modal response verified`
                      : "Modal response verified"}
                  </span>
                </>
              )}
              {probe && !probe.ok && (
                <span>
                  {probe.message ??
                    probe.error ??
                    "The GPU probe is not connected yet."}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="about section" id="about">
        <div className="section-label">A short version</div>
        <div className="about-grid">
          <h2>Builder. Product thinker. AI tinkerer.</h2>
          <div>
            <p>
              I like turning fuzzy ideas into clear interfaces and working
              systems. This site is where finished work and unfinished
              curiosity can live side by side.
            </p>
            <a href="mailto:johnsweber@gmail.com">Start a conversation ↗</a>
          </div>
        </div>
      </section>

      <footer>
        <span>JOHNSWEBER.COM</span>
        <span>Built at the edge · GPU when needed</span>
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </main>
  );
}
