"use client";

import { useState } from "react";
import Link from "next/link";
import { SiteNavigation } from "./site-navigation";
import { HeroLogicImage } from "./hero-logic-image";
import { useSiteTheme } from "./site-theme";

type ProbeResult = {
  ok?: boolean;
  gpu?: string;
  memory_mb?: string;
  message?: string;
  error?: string;
};

const projects = [
  {
    number: "01",
    label: "ACTIVE SYSTEM",
    title: "AI Playground",
    copy: "Small, useful experiments that make advanced models tangible, testable, and easy to understand.",
    tags: ["Applied AI", "Rapid prototypes", "Clear interfaces"],
    tone: "blue",
  },
  {
    number: "02",
    label: "IN THE LAB",
    title: "Video workflows",
    copy: "Image-guided motion studies and practical generative-video pipelines.",
    tags: ["Modal GPU", "Creative tooling"],
    tone: "orange",
    href: "/experiments/ai-video",
  },
  {
    number: "03",
    label: "ALWAYS GROWING",
    title: "Tiny tools",
    copy: "Focused utilities that turn recurring friction into one confident action.",
    tags: ["Product thinking", "Useful by design"],
    tone: "violet",
  },
];

const careerHighlights = [
  {
    marker: "20+",
    label: "YEARS ACROSS THE WEB",
    title: "Designer, developer, product leader.",
    copy: "A career shaped by seeing digital work from every side—from visual design and front-end craft to UX, product strategy, clients, and teams.",
  },
  {
    marker: "2012",
    label: "ENTERPRISE CHANGE",
    title: "Responsive before it was routine.",
    copy: "Led responsive UX and front-end teams through Humana's mobile transition, coached six development teams, and helped deliver the rebrand on schedule.",
  },
  {
    marker: "NOW",
    label: "PRODUCT LEADERSHIP",
    title: "Ideas into useful systems.",
    copy: "Bringing design judgment, technical fluency, and delivery leadership together across GoodChat, Small Great Ventures, and hands-on AI experiments.",
  },
];

function LuminousHome({
  probe,
  running,
  runGpuProbe,
}: {
  probe: ProbeResult | null;
  running: boolean;
  runGpuProbe: () => void;
}) {
  return (
    <main id="top" className="luminous-site">
      <SiteNavigation />

      <section className="lw-hero">
        <div className="lw-intro">
          <div className="lw-kicker"><span /> LUMINOUS WORKBENCH</div>
          <h1>Let&apos;s explore what we can build together.</h1>
          <p>A résumé story, a working lab, and an open invitation.</p>
          <div className="lw-intro-actions">
            <Link href="/portfolio">Selected work <span>↗</span></Link>
            <Link href="/resume">Résumé <span>↗</span></Link>
          </div>
          <nav className="lw-journey" aria-label="Homepage journey">
            <a href="#throughline"><b>01</b><span>The throughline</span></a>
            <a href="#render-lab"><b>02</b><span>Render lab</span></a>
            <a href="#open-invitation"><b>03</b><span>Open invitation</span></a>
          </nav>
          <div className="lw-circuit-seed" aria-hidden="true"><i /><i /><i /><i /></div>
        </div>

        <article className="lw-feature" id="throughline">
          <header><span>01</span><strong>THE THROUGHLINE</strong><small>CLARITY &amp; DIRECTION</small></header>
          <div className="lw-feature-image">
            <img src="/luminous-throughline.png" alt="John and his dog following a glowing technical throughline through a watercolor workshop" />
          </div>
          <blockquote>Good work starts with care.<br />Great work follows the throughline.</blockquote>
          <div className="lw-feature-links">
            <Link href="/portfolio">Portfolio <span>↗</span></Link>
            <Link href="/resume">Career history <span>↗</span></Link>
          </div>
        </article>
      </section>

      <section className="lw-story-grid section" id="work">
        <article className="lw-story" id="render-lab">
          <header><span>02</span><strong>RENDER LAB</strong><small>CRAFT &amp; EXPLORATION</small></header>
          <img src="/luminous-render-lab.png" alt="John and his dog working together at a luminous AI workbench" />
          <div className="lw-story-copy">
            <h2>Make advanced technology tangible.</h2>
            <p>Private generative media tools, real infrastructure, and experiments designed to be understood through use.</p>
            <Link href="/experiments/ai-video">Enter AI Video <span>↗</span></Link>
          </div>
        </article>

        <article className="lw-story" id="open-invitation">
          <header><span>03</span><strong>OPEN INVITATION</strong><small>CONNECTION &amp; POSSIBILITY</small></header>
          <img src="/luminous-open-invitation.png" alt="John and his dog exploring a glowing circuit seed in a blue watercolor landscape" />
          <div className="lw-story-copy">
            <h2>Start with a small spark.</h2>
            <p>Bring an ambitious idea, a hard-to-explain system, or a product that needs a clearer path forward.</p>
            <a href="mailto:johnsweber@gmail.com">Start a conversation <span>↗</span></a>
          </div>
        </article>
      </section>

      <section className="lw-career section" id="career">
        <div className="lw-section-heading">
          <span>THE PATH</span>
          <h2>Design, technology, and delivery—connected.</h2>
          <p>Two decades of turning complexity into useful products, clear interfaces, and teams that can move.</p>
        </div>
        <div className="lw-career-grid">
          {careerHighlights.map((highlight, index) => (
            <article key={highlight.marker}>
              <div className="lw-path-number"><span>0{index + 1}</span><i /></div>
              <small>{highlight.label}</small>
              <strong>{highlight.marker}</strong>
              <h3>{highlight.title}</h3>
              <p>{highlight.copy}</p>
            </article>
          ))}
        </div>
        <div className="lw-career-actions">
          <Link href="/portfolio">Explore the portfolio <span>↗</span></Link>
          <Link href="/resume">Read the résumé <span>↗</span></Link>
        </div>
      </section>

      <section className="lw-lab section" id="lab">
        <div className="lw-lab-copy">
          <span>LIVE WORKBENCH</span>
          <h2>From the edge to a GPU, without the mystery.</h2>
          <p>This protected probe makes the infrastructure visible: request, private gateway, on-demand compute, and a result you can inspect.</p>
          <div className="lw-route" aria-label="Request route">
            <span>YOU</span><b>→</b><span>EDGE</span><b>→</b><span>GPU</span>
          </div>
        </div>
        <div className="lw-probe">
          <header><span>GPU PULSE</span><span className="lw-on-demand"><i /> ON DEMAND</span></header>
          <div className="lw-probe-circuit" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          <button type="button" onClick={runGpuProbe} disabled={running}>
            {running ? "Waking GPU…" : "Run GPU probe"}
          </button>
          <div className="lw-probe-output" aria-live="polite">
            {!probe && !running && <span>Idle. No GPU compute is running.</span>}
            {running && <span>Cold starts can take a moment…</span>}
            {probe?.ok && <><strong>{probe.gpu ?? "GPU online"}</strong><span>{probe.memory_mb ? `${probe.memory_mb} MB memory · Modal response verified` : "Modal response verified"}</span></>}
            {probe && !probe.ok && <span>{probe.message ?? probe.error ?? "The GPU probe is not connected yet."}</span>}
          </div>
        </div>
      </section>

      <section className="lw-moodboard section" id="about">
        <div>
          <span>THE VISUAL SYSTEM</span>
          <h2>Watercolor warmth. Technical precision.</h2>
          <p>Luminous Workbench combines tactile paper, editorial typography, midnight blue, and ember-orange circuitry—a professional space that still feels exploratory and human.</p>
        </div>
        <img src="/luminous-workbench-moodboard.png" alt="Luminous Workbench watercolor technology mood board" />
      </section>

      <footer className="lw-footer">
        <a href="#top" aria-label="Back to top">JW</a>
        <span>A SMALL SPARK · A CLEAR PATH · SHARED WORK</span>
        <span>© {new Date().getFullYear()} JOHN WEBER</span>
      </footer>
    </main>
  );
}

export default function Home() {
  const { theme } = useSiteTheme();
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [running, setRunning] = useState(false);

  async function runGpuProbe() {
    setRunning(true);
    setProbe(null);
    try {
      const response = await fetch("/api/gpu-status", { method: "POST" });
      setProbe((await response.json()) as ProbeResult);
    } catch {
      setProbe({ error: "The GPU gateway could not be reached." });
    } finally {
      setRunning(false);
    }
  }

  if (theme === "new") {
    return <LuminousHome probe={probe} running={running} runGpuProbe={runGpuProbe} />;
  }

  return (
    <main id="top">
      <SiteNavigation />

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="signal" />
            JOHN WEBER · WASHINGTON, DC
          </div>
          <h1>I make complex technology <em>feel clear.</em></h1>
          <p>
            Product thinker, builder, and AI tinkerer turning ambitious ideas
            into friendly interfaces and working systems.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#work">
              Explore the work <span>↓</span>
            </a>
            <a className="button button-secondary" href="#lab">
              Run a live experiment
            </a>
          </div>
        </div>

        <div className="hero-lab" aria-label="A visual map of John Weber's work">
          <div className="portrait-card">
            <img src="/john-portrait.png" alt="AI-realistic portrait of John Weber" />
            <span>CURIOUS BUILDER</span>
          </div>
          <HeroLogicImage />
          <div className="dog-card">
            <img src="/dog-original.jpg" alt="John's dog sitting outside in Washington, DC" />
            <span>CHIEF WALK OFFICER</span>
          </div>
          <div className="data-card" aria-hidden="true">
            <span>IDEA</span><b>→</b><span>MODEL</span><b>→</b><span>USEFUL</span>
          </div>
          <div className="color-dots" aria-hidden="true"><i /><i /><i /><i /></div>
        </div>
      </section>

      <section className="principles" aria-label="Working principles">
        <div><span>01</span><strong>Bright</strong><p>Optimistic technology with room to breathe.</p></div>
        <div><span>02</span><strong>Intelligent</strong><p>Real technical depth, thoughtfully explained.</p></div>
        <div><span>03</span><strong>Useful</strong><p>Every experiment points toward a human need.</p></div>
      </section>

      <section className="section career" id="career">
        <div className="career-heading">
          <div>
            <div className="section-label">CAREER, IN BRIEF</div>
            <h2>The connective tissue between design, technology, and delivery.</h2>
          </div>
          <p>
            I started as a designer, learned to build what I designed, and grew
            into leading the people and processes that bring digital products
            to life.
          </p>
        </div>
        <div className="career-history">
          {careerHighlights.map((highlight) => (
            <article className="career-highlight" key={highlight.marker}>
              <div className="career-marker">
                <span>{highlight.marker}</span>
                <small>{highlight.label}</small>
              </div>
              <h3>{highlight.title}</h3>
              <p>{highlight.copy}</p>
            </article>
          ))}
        </div>
        <div className="career-actions">
          <Link className="career-link career-link-primary" href="/portfolio">
            Explore the portfolio <span>→</span>
          </Link>
          <Link className="career-link" href="/resume">
            Read the résumé <span>→</span>
          </Link>
        </div>
      </section>

      <section className="section work" id="work">
        <div className="section-heading">
          <div className="section-label">SELECTED DIRECTIONS</div>
          <h2>Ideas become clearer when you can touch them.</h2>
        </div>
        <div className="project-grid">
          {projects.map((project) => (
            <article className={`project ${project.tone}`} key={project.number}>
              <div className="project-top"><span>{project.number}</span><small>{project.label}</small></div>
              <div className="project-visual" aria-hidden="true"><i /><i /><i /><i /></div>
              <h3>{project.title}</h3>
              <p>{project.copy}</p>
              <div className="tags">
                {project.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
              {project.href && (
                <Link className="project-launch" href={project.href}>
                  Open AI Video <span>→</span>
                </Link>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="section lab" id="lab">
        <div className="lab-copy">
          <div className="section-label">LIVE INFRASTRUCTURE DEMO</div>
          <h2>One click from the edge to an H100.</h2>
          <p>
            This request travels through a private gateway to a protected Modal
            function. The GPU scales down when idle—serious infrastructure,
            made understandable.
          </p>
          <div className="route" aria-label="Request route">
            <span>YOU</span><b>→</b><span>EDGE</span><b>→</b><span>H100</span>
          </div>
        </div>

        <div className="probe-card">
          <div className="probe-top">
            <span>GPU PULSE</span>
            <span className="online"><i />ON DEMAND</span>
          </div>
          <div className="probe-visual" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
          <button className="probe-button" type="button" onClick={runGpuProbe} disabled={running}>
            {running ? "Waking GPU…" : "Run GPU probe"}
          </button>
          <div className="probe-output" aria-live="polite">
            {!probe && !running && <span>Idle. No GPU compute is running.</span>}
            {running && <span>Cold starts can take a moment…</span>}
            {probe?.ok && (
              <>
                <strong>{probe.gpu ?? "GPU online"}</strong>
                <span>{probe.memory_mb ? `${probe.memory_mb} MB memory · Modal response verified` : "Modal response verified"}</span>
              </>
            )}
            {probe && !probe.ok && <span>{probe.message ?? probe.error ?? "The GPU probe is not connected yet."}</span>}
          </div>
        </div>
      </section>

      <section className="section about" id="about">
        <div className="about-image">
          <img src="/curious-lab-moodboard.png" alt="Curious Lab visual direction for John Weber" />
        </div>
        <div className="about-copy">
          <div className="section-label">A CURIOUS PRACTICE</div>
          <h2>Professional rigor, playful energy.</h2>
          <p>
            I like turning fuzzy ideas into clear interfaces and working
            systems. This is where finished work and unfinished curiosity can
            live side by side.
          </p>
          <a href="mailto:johnsweber@gmail.com">Start a conversation <span>↗</span></a>
        </div>
      </section>

      <footer>
        <a className="wordmark" href="#top" aria-label="Back to top">JW</a>
        <span>BRIGHT IDEAS · CLEAR SYSTEMS · CURIOUS AI</span>
        <span>© {new Date().getFullYear()} JOHN WEBER</span>
      </footer>
    </main>
  );
}
