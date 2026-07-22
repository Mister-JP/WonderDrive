"use client";

import { useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import type { JourneySummary, ResearchActivity, TurnMedia, Viewer } from "../../lib/contracts";
import { STARTER_TITLE_PREFIX } from "../../lib/starter-content-contract";
import { useI18n } from "../i18n";

export function JourneysView({
  journeys,
  activities,
  viewer,
  busy,
  onShowAnswer,
  onOpen,
  onDelete,
  onManage,
  onRetry,
  onCancel,
  onDismiss,
  onNew,
}: {
  journeys: JourneySummary[];
  activities: ResearchActivity[];
  viewer: Viewer | null;
  busy: string | null;
  onShowAnswer: (id: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onManage: (id: string, changes: { title?: string; pinned?: boolean; hidden?: boolean }) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
  onNew: () => void;
}) {
  const { t, locale } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const visibleJourneys = journeys
    .filter((journey) => !normalizedQuery || `${journey.seed} ${journey.title}`.toLocaleLowerCase(locale).includes(normalizedQuery))
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt - left.updatedAt);
  const unfinished = activities.filter((activity) => activity.status !== "ready");
  const hasActiveResearch = unfinished.some((activity) => activity.status === "researching");

  return (
    <section className="journeys-view" aria-labelledby="journeys-title">
      <header className="view-heading journeys-heading">
        <div>
          <p className="eyebrow"><span /> {t("Your journeys")}</p>
          <h1 id="journeys-title">{t("Journeys")}</h1>
          <p className="journeys-intro">{t("Each journey follows the path from your first question through every question you explored afterward.")}</p>
        </div>
        <div>
          <p
            className="journeys-count"
            aria-label={t("{count} of {limit} journeys", { count: journeys.length, limit: viewer?.journeyLimit ?? "—" })}
          >
            {t("{count} of {limit} journeys", { count: journeys.length, limit: viewer?.journeyLimit ?? "—" })}
          </p>
          <button type="button" className="compact-action" onClick={onNew}>{t("New journey")}</button>
        </div>
      </header>

      <div className="journeys-filters" aria-label={t("Journey filters")}>
        <label>
          <span>{t("Search")}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("First question or journey label")} />
        </label>
      </div>

      {unfinished.length > 0 && (
        <section className="research-activity-list" aria-labelledby="research-activity-title">
          <div className="research-activity-heading">
            <p className="eyebrow"><span /> {t(hasActiveResearch ? "In progress" : "Needs attention")}</p>
            <h2 id="research-activity-title">{t("Research activity")}</h2>
          </div>
          <div className="journeys-grid">
            {unfinished.map((activity) => {
              const stages = [
                ["researching", t("1 · Research dossier")],
                ["composing", t("2 · Compose answer")],
                ["validating", t("Check evidence")],
                ["saving", t("Save journey")],
              ] as const;
              const currentStage = Math.max(0, stages.findIndex(([phase]) => phase === activity.phase));
              return (
              <article key={activity.id} className={`journey-card research-activity-card ${activity.status}`}>
                <p className="journey-card-kicker">
                  {activity.status === "researching" ? t("Researching now") : t("Research stopped")}
                </p>
                <h2>{activity.question}</h2>
                {activity.status === "researching" ? (
                  <>
                    <ol className="research-stage-track" aria-label={t("Research stages") }>
                      {stages.map(([phase, label], position) => (
                        <li
                          key={phase}
                          className={position < currentStage ? "complete" : position === currentStage ? "active" : "waiting"}
                          aria-current={position === currentStage ? "step" : undefined}
                        >
                          <span className="research-stage-marker" aria-hidden="true">
                            {position < currentStage ? "✓" : String(position + 1).padStart(2, "0")}
                          </span>
                          <div>
                            <strong>{label.replace(/^\d+\s*·\s*/, "")}</strong>
                            {position === currentStage && (
                              <small>
                                <span className="research-activity-pulse" aria-hidden="true" />
                                {t(activity.progressMessage ?? "Step 1 of 2 · Searching sources and building the evidence dossier")}
                              </small>
                            )}
                            {position === currentStage && activity.maxAttempts > 1 && (
                              <em>{t("This stage: attempt {attempt} of {max}", { attempt: activity.attempt, max: activity.maxAttempts })}</em>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                    {activity.timeoutAt && (
                      <p className="research-timeout">
                        {t("Automatic timeout at {time}", { time: formatter.format(activity.timeoutAt) })}
                      </p>
                    )}
                    <div className="research-cancel">
                      {confirmCancel === activity.id ? (
                        <span className="research-cancel-confirm" role="group" aria-label={t("Confirm research cancellation")}>
                          <span>{t("Stop this research?")}</span>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => {
                              setConfirmCancel(null);
                              onCancel(activity.id);
                            }}
                          >{t("Stop")}</button>
                          <button type="button" onClick={() => setConfirmCancel(null)}>{t("Keep")}</button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="research-cancel-button"
                          aria-label={t("Stop research")}
                          disabled={busy !== null}
                          onClick={() => setConfirmCancel(activity.id)}
                        >{t("Stop research")} <span aria-hidden="true">×</span></button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {activity.failure ? (
                      <section className="research-provider-failure" aria-label={activity.failure.title}>
                        <p>{activity.failure.source === "openai" ? "OpenAI API" : "CuriosityPedia"}</p>
                        <h3>{activity.failure.title}</h3>
                        <span>{activity.failure.message}</span>
                        <span>{activity.failure.recommendation}</span>
                        <div>
                          {activity.failure.actionUrl && activity.failure.actionLabel && (
                            <a href={activity.failure.actionUrl} target="_blank" rel="noreferrer">{activity.failure.actionLabel} ↗</a>
                          )}
                          {activity.failure.allowKeyChange && <a href="/settings">Use another API key</a>}
                        </div>
                      </section>
                    ) : (
                      <p className="research-activity-copy">{activity.error ?? t("This research could not be completed.")}</p>
                    )}
                    <div className="research-failed-actions">
                      <button
                        type="button"
                        className="show-journey"
                        disabled={busy !== null}
                        onClick={() => onRetry(activity.id)}
                      >
                        {t("Retry research")} <span aria-hidden="true">↻</span>
                      </button>
                      {confirmDismiss === activity.id ? (
                        <span className="research-dismiss-confirm" role="group" aria-label={t("Confirm failed research removal")}>
                          <span>{t("Remove this failed research?")}</span>
                          <button type="button" disabled={busy !== null} onClick={() => {
                            setConfirmDismiss(null);
                            onDismiss(activity.id);
                          }}>{t("Remove")}</button>
                          <button type="button" onClick={() => setConfirmDismiss(null)}>{t("Keep")}</button>
                        </span>
                      ) : (
                        <button type="button" className="research-dismiss-button" disabled={busy !== null} onClick={() => setConfirmDismiss(activity.id)}>
                          {t("Remove failed research")} <span aria-hidden="true">×</span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </article>
              );
            })}
          </div>
        </section>
      )}

      {journeys.length ? (
        visibleJourneys.length ? (
          <div className="journeys-grid">
            {visibleJourneys.map((journey) => {
              const customLabel = journey.title !== generatedTitle(journey.seed) ? journey.title : null;
              const isExample = journey.title.startsWith(STARTER_TITLE_PREFIX);
              return (
                <article key={journey.id} className="journey-card">
                  <JourneyCardImage media={journey.leadMedia} question={journey.seed} />
                  <div className="journey-card-body">
                    <div className="journey-card-state">
                      {isExample && <span>{t("Sample journey")}</span>}
                      {journey.pinned && <span>{t("Pinned")}</span>}
                    </div>
                    <p className="journey-card-kicker">{t("First explored")}</p>
                    <h2>{journey.seed}</h2>
                    <p className="journey-started"><span>{t("Started")}</span> <time dateTime={new Date(journey.createdAt).toISOString()}>{formatter.format(journey.createdAt)}</time></p>
                      <div className="journey-card-actions">
                        <button
                          type="button"
                          className="show-answer"
                          disabled={busy !== null}
                          aria-label={t("Show answer: {question}", { question: journey.seed })}
                          onClick={() => onShowAnswer(journey.id)}
                        >
                          {t("Show answer")} <ArrowUpRight weight="bold" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="show-journey"
                          disabled={busy !== null}
                          aria-label={t("Show journey: {question}", { question: journey.seed })}
                          onClick={() => onOpen(journey.id)}
                        >
                          {t("Show Journey")} <ArrowUpRight weight="bold" aria-hidden="true" />
                        </button>
                      </div>

                    <details className="journey-manage">
                      <summary>{t("Manage journey")}</summary>
                      {customLabel && <p className="journey-label">{t("Label: {label}", { label: customLabel })}</p>}
                      <div className="journey-manage-actions">
                        <button type="button" onClick={() => {
                          const title = window.prompt(t("Rename journey label"), journey.title);
                          if (title?.trim()) onManage(journey.id, { title: title.trim() });
                        }}>{t("Rename label")}</button>
                        <button type="button" onClick={() => onManage(journey.id, { pinned: !journey.pinned })}>{t(journey.pinned ? "Unpin" : "Pin")}</button>
                        {confirmDelete === journey.id ? (
                          <span className="delete-confirm" role="group" aria-label={t("Confirm journey removal")}>
                            <span>{t("Remove this journey?")}</span>
                            <button type="button" disabled={busy !== null} onClick={() => onDelete(journey.id)}>{t("Delete")}</button>
                            <button type="button" onClick={() => setConfirmDelete(null)}>{t("Keep")}</button>
                          </span>
                        ) : (
                          <button type="button" className="journey-delete-button" onClick={() => setConfirmDelete(journey.id)}>{t("Remove journey")}</button>
                        )}
                      </div>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="journeys-empty"><h2>{t("No journeys match this search")}</h2><p>{t("Try a broader question or journey label.")}</p></div>
        )
      ) : (
        <div className="journeys-empty"><h2>{t("No journeys yet")}</h2><p>{t("Explore a question to begin your first journey.")}</p><button type="button" onClick={onNew}>{t("Start a journey")} →</button></div>
      )}
    </section>
  );
}

function JourneyCardImage({ media, question }: { media?: TurnMedia; question: string }) {
  const [src, setSrc] = useState(media?.thumbnailUrl ?? media?.imageUrl ?? null);

  return (
    <figure className={`journey-card-image${src ? "" : " unavailable"}`}>
      {src ? (
        <img
          src={src}
          alt={media?.alt || question}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            if (media?.imageUrl && src !== media.imageUrl) setSrc(media.imageUrl);
            else setSrc(null);
          }}
        />
      ) : (
        <span aria-hidden="true">C</span>
      )}
      {media?.caption && <figcaption>{media.caption}</figcaption>}
    </figure>
  );
}

function generatedTitle(seed: string) {
  return seed.length <= 62 ? seed : `${seed.slice(0, 59).trimEnd()}…`;
}
