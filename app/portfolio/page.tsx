import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Portfolio — John Weber",
  description:
    "Selected product, UX, web, and applied-AI work by John Weber.",
};

const portfolioItems = [
  {
    number: "01",
    eyebrow: "ENTERPRISE WEB · HUMANA",
    title: "Making a desktop-scale rebrand work everywhere.",
    summary:
      "As responsive design emerged, I led responsive UX and front-end teams adapting Humana's desktop rebrand for mobile. The work included coaching six development teams and supporting an on-schedule launch.",
    contributions: ["Responsive UX", "Front-end leadership", "Team coaching", "Enterprise delivery"],
    tone: "blue",
  },
  {
    number: "02",
    eyebrow: "PRODUCT SYSTEMS · GOODCHAT",
    title: "Designing for trust, connection, and human-ness.",
    summary:
      "A product-design direction focused on mature, artful experiences that carry people smoothly from first contact through participation—grounded in trust, connectedness, and warmth.",
    contributions: ["Product direction", "Design principles", "Journey design", "Research synthesis"],
    tone: "orange",
  },
  {
    number: "03",
    eyebrow: "APPLIED AI · JOHNSWEBER.COM",
    title: "Turning model infrastructure into a friendly playground.",
    summary:
      "A working media experiment that joins authentication, private libraries, edge storage, local image models, and on-demand video generation behind an approachable interface.",
    contributions: ["Product design", "Full-stack prototyping", "AI workflows", "Cloud architecture"],
    tone: "violet",
    href: "/experiments/ai-video",
  },
];

export default function PortfolioPage() {
  return (
    <main className="career-page">
      <nav className="career-page-nav" aria-label="Portfolio navigation">
        <Link className="career-page-mark" href="/">JW</Link>
        <div>
          <Link href="/resume">Résumé</Link>
          <a href="mailto:johnsweber@gmail.com">Contact</a>
        </div>
      </nav>

      <header className="career-page-hero portfolio-page-hero">
        <div className="section-label">SELECTED WORK</div>
        <h1>Clarity is the throughline.</h1>
        <p>
          Across enterprise websites, product systems, and AI experiments, my
          work lives where human needs meet technical possibility.
        </p>
      </header>

      <section className="portfolio-case-grid" aria-label="Selected portfolio work">
        {portfolioItems.map((item) => (
          <article className={`portfolio-case ${item.tone}`} key={item.number}>
            <div className="portfolio-case-top">
              <span>{item.number}</span>
              <small>{item.eyebrow}</small>
            </div>
            <div className="portfolio-case-art" aria-hidden="true">
              <i /><i /><i /><i />
            </div>
            <h2>{item.title}</h2>
            <p>{item.summary}</p>
            <div className="tags">
              {item.contributions.map((contribution) => (
                <span key={contribution}>{contribution}</span>
              ))}
            </div>
            {item.href && (
              <Link className="portfolio-case-link" href={item.href}>
                Open the experiment <span>→</span>
              </Link>
            )}
          </article>
        ))}
      </section>

      <section className="career-page-cta">
        <div>
          <span>THE LONGER VIEW</span>
          <h2>See how the work connects across the career.</h2>
        </div>
        <Link href="/resume">Read the résumé <span>→</span></Link>
      </section>
    </main>
  );
}
