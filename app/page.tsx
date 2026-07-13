import { SeedComposer } from "./seed-composer";

const experienceSteps = [
  ["01", "Choose a performer", "Pick the model and the light personality that will carry the journey."],
  ["02", "Watch the homework", "See honest research activity, useful sources, and sourced Curiosity Interludes."],
  ["03", "Receive a performance", "Get a composed answer with evidence—not a raw search dump."],
  ["04", "Choose between two", "Take one earned path, reject both, or let the performer choose once."],
] as const;

const principles = [
  ["One performer", "The model you choose does the research and the explaining. No invisible committee."],
  ["Real homework", "Current or uncertain questions trigger bounded web research before the answer appears."],
  ["Honest evidence", "Sources support claims, while the Research Trail shows activity without exposing private reasoning."],
  ["Your next move", "Every ready turn ends with exactly two worthwhile questions and waits for you."],
] as const;

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="WonderDrive home">
          <span className="wordmark-mark" aria-hidden="true">W</span>
          <span>WonderDrive</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#experience">Experience</a>
          <a href="#phase-zero">Phase 0</a>
          <a href="https://github.com/Mister-JP/WonderDrive">GitHub</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Phase 0 · public foundation</p>
          <h1>
            Follow one question
            <em>until it becomes somewhere else.</em>
          </h1>
          <p className="hero-lede">
            WonderDrive is an audience-directed curiosity performance. Choose a
            model, watch it research, hear the story it finds, then decide which
            of exactly two questions deserves the next turn.
          </p>
          <div className="hero-links">
            <a className="primary-link" href="#seed-stage">Bring a question <span aria-hidden="true">↘</span></a>
            <a className="text-link" href="#experience">See how a journey moves</a>
          </div>
        </div>

        <div className="hero-stage" aria-label="WonderDrive turn preview">
          <div className="orbit orbit-one" aria-hidden="true" />
          <div className="orbit orbit-two" aria-hidden="true" />
          <article className="question-card question-card-one">
            <span>unasked direction</span>
            <p>Can a city have a memory?</p>
          </article>
          <article className="question-card question-card-two">
            <span>chosen direction</span>
            <p>Why do maps leave things out?</p>
          </article>
          <div className="stage-core">
            <p className="stage-label">A research performance</p>
            <p className="stage-question">What does a building sound like?</p>
            <div className="stage-status">
              <span className="pulse" aria-hidden="true" />
              tracing a source through the city
            </div>
          </div>
        </div>
      </section>

      <section className="seed-section" id="seed-stage" aria-labelledby="seed-title">
        <div>
          <p className="section-kicker">Start with a live thought</p>
          <h2 id="seed-title">What has been following you around?</h2>
          <p>
            Try the product shell now. Phase 0 holds the seed and proves the
            interaction; live model research arrives after the platform gates pass.
          </p>
        </div>
        <SeedComposer />
      </section>

      <section className="experience" id="experience" aria-labelledby="experience-title">
        <div className="section-heading">
          <p className="section-kicker">The complete loop</p>
          <h2 id="experience-title">Curiosity with stage direction.</h2>
          <p>
            WonderDrive is not a chat transcript and not an endless autonomous
            agent. It performs one researched turn, commits it, and stops.
          </p>
        </div>
        <ol className="experience-grid">
          {experienceSteps.map(([number, title, description]) => (
            <li key={number}>
              <span className="step-number">{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="principles" aria-labelledby="principles-title">
        <div className="principles-intro">
          <p className="section-kicker">The contract</p>
          <h2 id="principles-title">A little magic. No sleight of hand.</h2>
        </div>
        <div className="principle-list">
          {principles.map(([title, description], index) => (
            <article key={title}>
              <span aria-hidden="true">0{index + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="phase-zero" id="phase-zero" aria-labelledby="phase-title">
        <div className="phase-zero-copy">
          <p className="section-kicker">Now building</p>
          <h2 id="phase-title">Phase 0 is the runway, not the trick.</h2>
          <p>
            This first public version establishes the real Sites runtime, a
            clean repository, server routes, D1 schema, identity seam, CI, and
            an interface worth growing. It does not pretend the research engine
            is connected before it is.
          </p>
          <a className="primary-link dark" href="https://github.com/Mister-JP/WonderDrive/blob/main/docs/phase-0.md">
            Read the acceptance gates <span aria-hidden="true">→</span>
          </a>
        </div>
        <ul className="phase-checklist">
          <li><span>Public shell</span><strong>Ready</strong></li>
          <li><span>Repository &amp; CI</span><strong>Ready</strong></li>
          <li><span>D1 data contract</span><strong>Scaffolded</strong></li>
          <li><span>ChatGPT identity seam</span><strong>Scaffolded</strong></li>
          <li><span>Live research adapter</span><strong>Phase 2</strong></li>
        </ul>
      </section>

      <footer>
        <div>
          <span className="footer-mark" aria-hidden="true">W</span>
          <p>One public URL. One selected performer. Two worthwhile ways forward.</p>
        </div>
        <p>WonderDrive · Build Week 2026 · Phase 0</p>
      </footer>
    </main>
  );
}
