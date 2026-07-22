# CuriosityPedia product north star

This document captures the product idea CuriosityPedia is trying to protect. Implemented behavior belongs in code and tests, while technical boundaries belong in [architecture.md](architecture.md).

## The idea

CuriosityPedia is a visual encyclopedia for people who learn by observing.

Most AI products begin with a blank chat box and answer with words. CuriosityPedia begins with curiosity and answers with a visual story: a researched explanation shaped around remarkable, useful images that already exist across the internet. It should help someone notice what they might otherwise miss, understand an unfamiliar idea without facing a wall of text, and discover the next question hiding inside what they just saw.

The product is especially valuable for visual learners and children, but it is for anyone who wants learning to feel less like consuming information and more like exploring the world.

## Product promise

Give CuriosityPedia a question and it creates a beautiful, source-backed visual encyclopedia. A typical exploration contains 8–12 carefully curated images, each with a distinct editorial purpose, a concise explanation of what to notice, and one question that opens another direction of discovery.

After looking through the encyclopedia, the learner can answer the image-inspired questions and choose any one of them to explore more deeply. That choice creates another encyclopedia and another branch in a persistent journey map. Over time, the map becomes a personal record of the rabbit holes the learner followed.

The experience should feel:

- visual before textual;
- inviting rather than intimidating;
- editorially composed rather than mechanically generated;
- playful without becoming careless with evidence; and
- self-directed without feeling like an empty chat interface.

## Core loop

1. Begin with a question or choose an image-rich discovery card.
2. Let CuriosityPedia research the subject and curate a strong visual set.
3. Move through a visual encyclopedia that explains what each image reveals and why it matters.
4. Answer one curiosity question inspired by each image.
5. Choose the question that creates the strongest desire to know more.
6. Generate a new visual encyclopedia from that question.
7. Revisit the journey map to see, retrace, and continue the resulting rabbit holes.

Every loop should leave the learner with a clearer mental model and more meaningful curiosity than they started with.

## Experience map

### Discovery

The landing page is an image-rich cabinet of curiosities, not a marketing page or a generic prompt gallery. It should expose a wide range of subjects through striking visuals and approachable questions. A visitor should be able to follow an existing spark or ask something entirely their own.

Editorial recommendations must have a real subject, trustworthy provenance, a strong visual hook, and a question a curious beginner can understand immediately.

### Visual encyclopedia

An encyclopedia is the durable unit of learning. It combines researched context, normalized sources, 8–12 factual images, visual commentary, image questions, and the relationships between them.

The sequence should feel composed as a whole. Images should play different roles—orientation, mechanism, scale, comparison, context, evidence, history, or a surprising detail—rather than repeat the same subject from slightly different angles. Written explanation should make each visual more legible, not compete with it.

Long-running research may continue in the background. The interface should make its progress understandable, preserve useful completed work, and offer safe recovery when provider work fails.

### Image questions

Every image should inspire exactly one clear question. The question should arise naturally from something visible, connect to the explanation, and point toward a real topic worth investigating. Across an encyclopedia, questions should vary in subject and direction so the learner is offered genuinely different rabbit holes.

Answering should reinforce careful observation and understanding without feeling like a school test. Options should be meaningful and plausible, feedback should explain the answer without judgment, and an incorrect choice should never block the learner from continuing.

Most importantly, a question is not the end of a lesson. It is a doorway. After answering, the learner can select that same question as the seed of a new encyclopedia.

### Journey map

The journey map is a visual record of curiosity. It shows how one question led to another, preserves branches that were not taken, and lets the learner resume from any earlier point without reconstructing the path from memory.

The map should celebrate depth and connection, not completion, streaks, scores, or time spent. There is no required order and no final node.

### Personal library

Journeys are complete explorations; bookmarks are individual saved encyclopedias. Search, labels, snapshots, export, hiding, and removal help people return to useful discoveries, but they remain supporting tools rather than the center of the experience.

### Preferences and usage

Language, explanation depth, research model, text size, and reduced motion are user-controlled. Usage limits should be visible before they become surprising, describe rolling windows honestly, and distinguish provider spending from product capacity.

## Editorial principles

- Start with the most visually revealing way to understand the subject.
- Search broadly, then curate ruthlessly; eight excellent images are better than twelve weak ones.
- Use photography, diagrams, maps, specimens, archival material, and primary-source imagery according to what best explains the idea.
- Give every image a distinct teaching purpose and a concrete detail worth noticing.
- Prefer images as evidence, explanation, or orientation—never as decoration.
- Use plain language and explain unfamiliar terms before building on them.
- Connect visible details to mechanisms, scale, history, materials, ecology, culture, or other illuminating contexts.
- Preserve uncertainty when evidence is incomplete, contested, or changing.
- Favor primary sources, responsible institutions, and clear provenance.
- Avoid generic stock imagery, near-duplicates, watermarks, invented visual details, vague prompts, and walls of text.

## Product invariants

- Every completed encyclopedia is source-backed.
- Every selected image comes from a real provider result and retains its source relationship.
- A typical completed encyclopedia contains 8–12 distinct, useful visuals.
- Every image has one canonical curiosity question reused consistently in the encyclopedia, answer flow, result, journey map, and child exploration.
- Citations reference only normalized sources returned by the provider.
- Incomplete or failed research never masquerades as a completed encyclopedia.
- Older completed encyclopedias remain readable as the product evolves.
- Ownership is checked before private data is read or changed.
- Provider credentials, identity headers, administrative keys, and raw provider details remain server-side.
- Expected retries are idempotent and do not duplicate durable work.
- Keyboard access and reduced-motion settings preserve the complete learning flow.
- Guest and signed-in data ownership is explained honestly.

## What CuriosityPedia is not

CuriosityPedia is not a general-purpose chatbot, a search-results wrapper, a social feed, a course-management system, or a gamified quiz product. It does not optimize for endless passive scrolling, compulsory progress, engagement streaks, or replacing expert judgment.

It is also not an AI image gallery. The goal is not to decorate generated prose or display attractive pictures. The goal is to use excellent, trustworthy visuals to make ideas understandable and to turn careful observation into further curiosity.

## Future direction

Today, a small number of agents perform the research and visual composition. The longer-term vision is an agentic editorial staff with distinct responsibilities for research, fact-checking, image curation, visual sequencing, question writing, accessibility, and quality control.

Better models should make the editorial judgment stronger, not make the product more complicated. CuriosityPedia should remain a focused place where anyone can explore the beautiful world we live in through images, explanations, and questions.

## Decision test

A proposed change belongs in CuriosityPedia when it helps someone begin with wonder, understand through seeing, notice an important detail, trust the evidence, or follow a meaningful new question.

If it pushes the experience toward a generic chatbot, a text-heavy article, a social feed, a conventional test, or engagement for its own sake, it moves the product away from its north star.
