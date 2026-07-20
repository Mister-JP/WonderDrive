# CuriosityPedia product principles

This document captures the current product intent. It is deliberately compact: implemented behavior belongs in code and tests, while technical boundaries belong in [architecture.md](architecture.md).

## Product promise

CuriosityPedia helps someone stay with a question long enough for it to become genuinely interesting. It turns an initial question into a researched, source-backed journey, offers two meaningful ways forward after every completed turn, and preserves the resulting map for later exploration.

The experience should feel guided without being restrictive, playful without becoming careless with evidence, and visually expressive without getting in the way of reading.

## Core loop

1. Start from a question or choose an editorial discovery card.
2. Select a research personality and answer depth.
3. Read one complete, cited research turn.
4. Inspect its sources, save it, or view its place in the journey map.
5. Choose one of exactly two grounded next questions, ask for two replacements, or delegate the choice.
6. Return later through Journeys or Bookmarks and continue from any useful point.

The two-option rule is the product's defining constraint. The options must be understandable to a curious beginner, meaningfully different from each other, grounded in the visible turn, and specific enough to suggest a real next investigation.

## Experience map

### Discovery

The landing page is a dense, image-rich catalog rather than a marketing page. It should offer broad subject variety, clear source attribution, approachable questions, and an immediate path to asking something original. Editorial recommendations are permanent, reviewed records; the interface fetches one page at a time.

### Research turn

A turn is the durable unit of learning. A ready turn contains the answer, evidence, source relationships, media, provider usage, and current follow-up options. Incomplete or failed provider work must never appear as a completed answer.

Long-running research may continue in the background. The interface should make its state legible, allow safe retries where supported, and avoid replacing a previously useful page with a transient polling failure.

### Knowledge check

Knowledge checks should reinforce attention and understanding, not manufacture engagement. Questions must be answerable from the material just presented. Feedback should explain the evidence behind the result, and failure should remain recoverable.

### Journey map

The map is a navigable record of how the learner arrived at the current topic. It should preserve branches and alternate paths, reveal unanswered frontiers, and let someone resume without reconstructing their history from memory.

### Personal library

Journeys are complete explorations. Bookmarks are individual saved turns. These concepts stay separate so pinning a journey never silently changes the bookmark collection. Search, labels, hiding, snapshots, export, and removal are supporting controls rather than the primary experience.

### Preferences and usage

Language, answer density, research model, text size, and reduced motion are user-controlled. Usage limits should be visible before they become surprising, explain rolling windows honestly, and distinguish provider spending from product capacity.

## Product invariants

- Every ready answer is source-backed.
- Provider credentials, identity headers, administrative keys, and raw provider details remain server-side.
- Ownership is checked before private data is read or mutated.
- Mutating requests are idempotent where retries are expected.
- A completed turn exposes exactly two current next-question options.
- Citations may reference only normalized sources returned by the provider.
- Older ready turns remain readable as the product evolves.
- Reduced motion and keyboard access do not remove functionality.
- Guest data is clearly described as belonging to the current guest identity; signed-in data follows the authenticated identity.

## Content principles

- Prefer concrete wonder, hidden mechanisms, vivid cause and effect, and useful comparison.
- Explain unfamiliar terms before building on them.
- Use images as evidence or orientation, not decoration.
- Keep uncertainty explicit when a source or subject is unresolved.
- Favor primary sources and responsible institutions for editorial discovery material.
- Avoid vague prompts, generic stock imagery, manipulative streak mechanics, and quiz-like recall detached from the answer.

## Non-goals

CuriosityPedia is not a general-purpose chatbot, a search-results wrapper, a course-management system, or a social feed. It does not promise exhaustive coverage, automatic truth, a single canonical learning order, or a replacement for expert judgment.

## Decision test

A proposed change belongs in the product when it makes a sourced answer easier to begin, understand, trust, remember, or continue without weakening the invariants above. If it primarily adds chrome, duplicates another concept, hides uncertainty, or turns curiosity into an obligation, it should be left out.
