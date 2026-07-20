"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "@phosphor-icons/react";

import type { KnowledgeJourneySeed, TurnMedia } from "../../lib/contracts";

export type KnowledgeDeclarationItem = {
  index: number;
  question: string;
  imageUrl: string;
  imageAlt: string;
  imageCaption: string;
  imageSourceUrl: string;
  imageSourceLabel: string;
  known: boolean;
  knowledgeCheck?: TurnMedia["knowledgeCheck"];
};

type KnowledgeAnswer = number | "unknown";

export function KnowledgeCheckExperience({
  items,
  onBackToDeclaration,
  onKnowledgeChange,
  onDeepDive,
}: {
  items: KnowledgeDeclarationItem[];
  onBackToDeclaration: () => void;
  onKnowledgeChange: (index: number, known: boolean) => void;
  onDeepDive: (seed: KnowledgeJourneySeed) => void;
}) {
  // Freeze the run's question set. Answering "I don't know" updates the
  // parent's declaration state, but must not remove the active question while
  // this component is still rendering it.
  const [reviewItems] = useState(() => items.filter((item) => item.knowledgeCheck));
  const questions = reviewItems.filter((item) => item.known);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, KnowledgeAnswer>>(() => Object.fromEntries(
    reviewItems.filter((item) => !item.known).map((item) => [item.index, "unknown"]),
  ));
  const [complete, setComplete] = useState(questions.length === 0 && reviewItems.length > 0);

  if (!reviewItems.length) {
    return (
      <section className="knowledge-check-complete knowledge-check-unavailable" aria-labelledby="knowledge-check-unavailable-title">
        <p>Knowledge check unavailable</p>
        <h2 id="knowledge-check-unavailable-title">This encyclopedia does not contain stored verification questions.</h2>
        <span>New encyclopedia sessions generate their image-linked questions and eight answer choices during the original research request, so they open instantly here.</span>
        <div><button type="button" onClick={onBackToDeclaration}><ArrowLeft aria-hidden="true" /> Back to my answers</button></div>
      </section>
    );
  }

  if (complete) {
    const correctCount = reviewItems.filter((item) => answers[item.index] === item.knowledgeCheck?.correctOptionIndex).length;
    const unknownCount = reviewItems.filter((item) => answers[item.index] === "unknown").length;
    const incorrectCount = reviewItems.length - correctCount - unknownCount;
    return (
      <section className="knowledge-check-results" aria-labelledby="knowledge-check-complete-title">
        <header className="knowledge-check-results-header">
          <div>
            <p>Knowledge check complete</p>
            <h2 id="knowledge-check-complete-title">Pick a question.</h2>
            <span>Every card reveals the right answer. Open any one to continue this journey through that question.</span>
          </div>
          <dl aria-label="Knowledge check outcomes">
            <div><dt>{correctCount}</dt><dd>Correct</dd></div>
            <div><dt>{unknownCount}</dt><dd>Honest gaps</dd></div>
            <div><dt>{incorrectCount}</dt><dd>Not quite</dd></div>
          </dl>
        </header>

        <div className="knowledge-check-result-grid">
          {reviewItems.map((item, resultIndex) => {
            const check = item.knowledgeCheck!;
            const question = item.question;
            const answer = answers[item.index];
            const outcome = answer === "unknown"
              ? "unknown"
              : answer === check.correctOptionIndex ? "correct" : "incorrect";
            const selectedAnswer = typeof answer === "number" ? check.options[answer] : null;
            return (
              <button
                type="button"
                className={`knowledge-check-result-card ${outcome}`}
                key={`${item.index}-${check.question}`}
                onClick={() => onDeepDive({
                  question,
                  imageUrl: item.imageUrl,
                  imageAlt: item.imageAlt,
                  imageCaption: item.imageCaption,
                  imageSourceUrl: item.imageSourceUrl,
                  imageSourceLabel: item.imageSourceLabel,
                })}
                aria-label={`Explore this question in the current journey: ${question}`}
              >
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt={item.imageAlt} referrerPolicy="no-referrer" />
                  <figcaption>{String(resultIndex + 1).padStart(2, "0")}</figcaption>
                </figure>
                <div className="knowledge-check-result-copy">
                  <p className="knowledge-check-result-outcome">
                    {outcome === "correct" ? "Correct" : outcome === "unknown" ? "Right: you said “I don’t know”" : "Not quite"}
                  </p>
                  <h3>{question}</h3>
                  {outcome === "incorrect" && selectedAnswer && (
                    <div className="knowledge-check-result-answer selected-answer">
                      <span>Your answer</span><p>{selectedAnswer}</p>
                    </div>
                  )}
                  <div className="knowledge-check-result-answer correct-answer">
                    <span>Correct answer</span><p>{check.options[check.correctOptionIndex]}</p>
                  </div>
                  <p className="knowledge-check-result-explanation">{check.explanation}</p>
                  <span className="knowledge-check-result-cta">Explore “{question}” <ArrowRight aria-hidden="true" /></span>
                </div>
              </button>
            );
          })}
        </div>

        <footer className="knowledge-check-results-footer">
          {questions.length > 0 && <button type="button" onClick={() => { setQuestionIndex(0); setComplete(false); }}><ArrowLeft aria-hidden="true" /> Take the check again</button>}
          <button type="button" onClick={onBackToDeclaration}>Revise what I know</button>
        </footer>
      </section>
    );
  }

  const active = questions[questionIndex];
  const check = active.knowledgeCheck!;
  const selected = answers[active.index];
  const isLast = questionIndex === questions.length - 1;

  function chooseAnswer(optionIndex: number) {
    setAnswers((current) => ({ ...current, [active.index]: optionIndex }));
    onKnowledgeChange(active.index, true);
  }

  function chooseUnknown() {
    setAnswers((current) => ({ ...current, [active.index]: "unknown" }));
    onKnowledgeChange(active.index, false);
  }

  function finishCheck() {
    for (const item of questions) {
      const answer = answers[item.index];
      if (answer === "unknown" || answer !== item.knowledgeCheck?.correctOptionIndex) {
        onKnowledgeChange(item.index, false);
      }
    }
    setComplete(true);
  }

  return (
    <section className="knowledge-check-quiz" aria-labelledby="knowledge-check-title">
      <button
        type="button"
        className="knowledge-check-edge-arrow previous"
        onClick={() => questionIndex === 0 ? onBackToDeclaration() : setQuestionIndex((current) => current - 1)}
        aria-label={questionIndex === 0 ? "Return to the knowledge declaration" : "Previous knowledge-check question"}
      >
        <ArrowLeft aria-hidden="true" />
      </button>

      <div className="knowledge-check-question-pane">
        <header className="knowledge-check-progress">
          <p>Knowledge check</p>
          <span>{String(questionIndex + 1).padStart(2, "0")} / {String(questions.length).padStart(2, "0")}</span>
        </header>
        <div className="knowledge-check-prompt">
          <p>Choose the answer that best matches your understanding.</p>
          <h2 id="knowledge-check-title">{active.question}</h2>
          <button
            type="button"
            className="knowledge-check-unknown"
            aria-pressed={selected === "unknown"}
            onClick={chooseUnknown}
          >
            I don’t know
          </button>
        </div>
        <div className="knowledge-check-options" role="radiogroup" aria-label="Answer choices">
          {check.options.map((option, optionIndex) => (
            <button
              type="button"
              role="radio"
              aria-checked={selected === optionIndex}
              className={selected === optionIndex ? "selected" : ""}
              key={`${active.index}-${optionIndex}`}
              onClick={() => chooseAnswer(optionIndex)}
            >
              <span>{String.fromCharCode(65 + optionIndex)}</span>
              <strong>{option}</strong>
              <i aria-hidden="true">{selected === optionIndex ? <Check weight="bold" /> : null}</i>
            </button>
          ))}
        </div>
      </div>

      <figure className="knowledge-check-visual">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="knowledge-check-visual-backdrop" src={active.imageUrl} alt="" aria-hidden="true" referrerPolicy="no-referrer" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="knowledge-check-visual-artwork" src={active.imageUrl} alt={active.imageAlt} referrerPolicy="no-referrer" />
        <figcaption>
          <span>The claim you made</span>
          <strong>{active.question}</strong>
          <small>{active.imageCaption}</small>
        </figcaption>
      </figure>

      <button
        type="button"
        className="knowledge-check-edge-arrow next"
        disabled={selected === undefined}
        onClick={() => isLast ? finishCheck() : setQuestionIndex((current) => current + 1)}
        aria-label={isLast ? "Finish the knowledge check" : "Next knowledge-check question"}
      >
        <ArrowRight aria-hidden="true" />
      </button>
    </section>
  );
}
