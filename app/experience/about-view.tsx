const notes = [
  {
    id: "01",
    label: "The basic idea",
    title: "A place to become more curious",
    paragraphs: [
      "CuriosityPedia is an image-rich, source-backed encyclopedia for people who want to stay with a subject long enough for it to become interesting.",
      "The point is simple: help a person become more curious. You should be able to arrive without the perfect question, find something that catches your attention, understand it properly, and discover what you want to know next.",
      "This is not a productivity system for learning. It is not trying to make curiosity efficient, measurable, or professionally useful. Curiosity is already worth making space for.",
    ],
  },
  {
    id: "02",
    label: "What I want it to feel like",
    title: "Beautiful enough to invite attention. Serious enough to trust.",
    paragraphs: [
      "I want opening a subject to feel closer to opening a beautiful encyclopedia, visiting a small museum, or finding an unusually good page in a book—not opening another chatbot window.",
      "The images should not be decoration. They should help explain the idea, make it concrete, or show evidence that words alone cannot. The writing should be readable and alive without exaggerating everything into a revelation.",
      "Sources and uncertainty should remain visible. Being delighted by an idea and being careful about whether it is true should belong in the same experience.",
    ],
  },
  {
    id: "03",
    label: "The role of honesty",
    title: "“I don’t know” should be an interesting answer",
    paragraphs: [
      "A large part of becoming more curious is noticing the edge of what you know. Most products make that edge feel like failure. I want CuriosityPedia to make it useful.",
      "You should be able to say that you know something, that you do not know it yet, or that you changed your mind about how confident you were. None of those answers says anything about your intelligence or worth.",
      "The product can then help you choose one honest gap to explore. Not because a curriculum decided it was next, but because you decided that gap was interesting.",
    ],
  },
  {
    id: "04",
    label: "How a session works",
    title: "Read. Notice. Choose what pulls you next.",
    paragraphs: [
      "Start from a question, an image, or a subject that happens to catch your attention. Read a researched explanation made from text, images, and sources. Then pause long enough to notice what became clearer and what remains unknown.",
      "The next subject should grow out of that moment. CuriosityPedia may prepare useful possibilities, but it should not quietly continue researching or decide the direction for you. Moving forward always requires a visible choice.",
    ],
  },
  {
    id: "05",
    label: "Who this may be for",
    title: "People who want to know more, even when they do not know what to ask",
    paragraphs: [
      "It may be for someone wandering through ideas for pleasure, a generalist following connections across different fields, a student who wants room outside a syllabus, or a researcher collecting questions around unfinished work.",
      "The common thing is not expertise. It is the desire to stay with something a little longer—to look again, ask one more ordinary question, and let interest become understanding.",
    ],
  },
  {
    id: "06",
    label: "What it should not become",
    title: "Not a feed, a school quiz, or a generic AI wrapper",
    paragraphs: [
      "I do not want an infinite stream optimized to keep people scrolling. I do not want not-knowing to be punished, curiosity reduced to a score, or a leaderboard pretending to measure intelligence.",
      "I also do not want a chat transcript with nicer colors. The application should use AI where it helps research and compose an experience, while still feeling like a considered product with its own point of view.",
    ],
  },
];

const timeline = [
  ["Right now", "Make the core research journey genuinely good: strong questions, clear writing, useful images, visible sources, and meaningful ways forward."],
  ["What I am exploring", "An honesty-first knowledge run where saying “I know” or “I don’t know yet” helps reveal the next subject worth exploring."],
  ["What it may become", "A personal encyclopedia that remembers subjects, repeated visits, notes, questions, and the different ways a person’s understanding changed."],
];

const openQuestions = [
  "How much guidance creates momentum without taking agency away?",
  "How can the product make not-knowing feel safe without making it feel trivial?",
  "When is an image actually teaching, and when is it merely attractive?",
  "What deserves to be remembered from a learning session?",
  "How should returning to the same subject feel different the second time?",
  "How can this remain playful without turning knowledge into points?",
];

export function AboutView({ onBegin }: { onBegin: () => void }) {
  return (
    <section className="about-view about-notebook">
      <header className="about-notebook-header">
        <div>
          <p>About / Working notes / July 2026</p>
          <h1>A place to become <em>more curious.</em></h1>
        </div>
        <div className="about-notebook-intro">
          <p>These are working thoughts, not a finished company story. This page will change as the product changes and as I understand more clearly why it should exist.</p>
          <button type="button" onClick={onBegin}>Open CuriosityPedia →</button>
        </div>
      </header>

      <blockquote className="about-notebook-quote">
        Read something beautiful. Be honest about what you know. Choose what you want to understand next.
      </blockquote>

      <nav className="about-notebook-nav" aria-label="About page sections">
        <a href="#thinking">Thinking now</a>
        <a href="#evolution">Evolution</a>
        <a href="#questions">Open questions</a>
      </nav>

      <section className="about-notebook-main" id="thinking">
        <div className="about-notebook-label">
          <span>01</span>
          <h2>What I am thinking right now</h2>
          <p>Draft notes on the purpose, feeling, and boundaries of the product.</p>
        </div>
        <div className="about-note-grid">
          {notes.map((note) => (
            <article className="about-note-block" key={note.id}>
              <header><span>{note.id}</span><p>{note.label}</p></header>
              <h3>{note.title}</h3>
              {note.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </article>
          ))}
        </div>
      </section>

      <section className="about-notebook-section" id="evolution">
        <div className="about-notebook-label">
          <span>02</span>
          <h2>How I see it evolving</h2>
          <p>A direction, not a promise or release schedule.</p>
        </div>
        <div className="about-timeline-blocks">
          {timeline.map(([title, body], index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-notebook-section about-question-section" id="questions">
        <div className="about-notebook-label">
          <span>03</span>
          <h2>Questions I have not answered yet</h2>
          <p>Things worth keeping visible while I build.</p>
        </div>
        <ol className="about-open-questions">
          {openQuestions.map((question, index) => (
            <li key={question}><span>{String(index + 1).padStart(2, "0")}</span><p>{question}</p></li>
          ))}
        </ol>
      </section>

      <footer className="about-notebook-footer">
        <p>This page is intentionally unfinished.</p>
        <p>It will hold essays, decisions, disagreements, experiments, and changes of mind as CuriosityPedia grows.</p>
        <button type="button" onClick={onBegin}>Go be curious →</button>
      </footer>
    </section>
  );
}
