import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Résumé — John Weber",
  description:
    "Product, UX, design, and web leadership experience from John Weber.",
};

const experience = [
  {
    dates: "2025—NOW",
    role: "Product",
    organization: "GoodChat",
    detail:
      "Product direction and human-centered experience design focused on trust, connectedness, and thoughtful participation.",
  },
  {
    dates: "2023—NOW",
    role: "Chief Product Officer",
    organization: "Small Great Ventures",
    detail:
      "Product leadership across strategy, design, development, QA, stakeholder alignment, and delivery operations.",
  },
  {
    dates: "2023—2025",
    role: "Chief Product Officer",
    organization: "CommonAlly",
    detail:
      "Led product thinking and cross-functional delivery for mission-driven digital products.",
  },
  {
    dates: "2022—2023",
    role: "Senior Design Lead",
    organization: "ThinkNimble",
    detail:
      "Led product design while connecting client goals, project scope, design decisions, and technical delivery.",
  },
  {
    dates: "2015—2019",
    role: "Director of Products",
    organization: "Blackstone Media",
    detail:
      "Directed digital product work and multidisciplinary teams across complex client engagements.",
  },
  {
    dates: "2012—2015",
    role: "UX, UI, and front-end leadership",
    organization: "Humana · StarkNine · Rivera Group",
    detail:
      "Joined design and engineering in enterprise responsive web, UX architecture, interface design, and team enablement.",
  },
  {
    dates: "2001—2012",
    role: "Web designer and developer",
    organization: "Agency · government · education · technology",
    detail:
      "Built the visual and technical foundation that still shapes a practical, end-to-end approach to product work.",
  },
];

const capabilities = [
  "Product strategy",
  "UX and UI design",
  "Design leadership",
  "Front-end systems",
  "Client partnership",
  "Cross-functional delivery",
  "Team coaching",
  "Applied AI prototyping",
];

export default function ResumePage() {
  return (
    <main className="career-page resume-page">
      <nav className="career-page-nav" aria-label="Résumé navigation">
        <Link className="career-page-mark" href="/">JW</Link>
        <div>
          <Link href="/portfolio">Portfolio</Link>
          <a href="mailto:johnsweber@gmail.com">Contact</a>
        </div>
      </nav>

      <header className="resume-header">
        <div>
          <div className="section-label">JOHN WEBER · WASHINGTON, DC</div>
          <h1>Product thinker, designer, developer, and team leader.</h1>
        </div>
        <p>
          More than two decades across the web—from visual design and
          front-end development to UX, product strategy, client partnership,
          and organizational leadership.
        </p>
      </header>

      <section className="resume-capabilities" aria-label="Core capabilities">
        {capabilities.map((capability, index) => (
          <span key={capability}><b>{String(index + 1).padStart(2, "0")}</b>{capability}</span>
        ))}
      </section>

      <section className="resume-experience">
        <div className="resume-section-heading">
          <span>EXPERIENCE</span>
          <p>Selected history connecting creative judgment with technical delivery.</p>
        </div>
        <div className="resume-timeline">
          {experience.map((item) => (
            <article key={`${item.dates}-${item.organization}`}>
              <time>{item.dates}</time>
              <div>
                <h2>{item.role}</h2>
                <strong>{item.organization}</strong>
              </div>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="resume-feature">
        <span>SELECTED MILESTONE · HUMANA · 2011—2012</span>
        <h2>Helping an enterprise move into the responsive web.</h2>
        <p>
          During Humana&apos;s rebrand, I led responsive UX and front-end teams
          adapting desktop designs for mobile, coached six additional
          development teams in responsive practices, and helped the redesigned
          site launch on schedule.
        </p>
      </section>

      <section className="career-page-cta resume-contact">
        <div>
          <span>LET&apos;S TALK</span>
          <h2>Complex project? I like making the path clearer.</h2>
        </div>
        <div className="resume-contact-links">
          <a href="mailto:johnsweber@gmail.com">Email John <span>→</span></a>
          <a href="https://www.linkedin.com/in/johnsweber/">LinkedIn <span>↗</span></a>
        </div>
      </section>
    </main>
  );
}
