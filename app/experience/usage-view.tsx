"use client";

import type { UsageSummary, Viewer } from "../../lib/contracts";
import { useI18n } from "../i18n";

export function UsageView({
  usage,
  viewer,
  loading,
  error,
  onRefresh,
  onOpenJourneys,
}: {
  usage: UsageSummary | null;
  viewer: Viewer | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenJourneys: () => void;
}) {
  const { t, locale } = useI18n();
  const time = (value: number) => new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
  const researchPercent = usage?.liveResearch.limit
    ? Math.min(100, Math.round((usage.liveResearch.used / usage.liveResearch.limit) * 100))
    : 0;
  const journeyPercent = usage?.library.limit
    ? Math.min(100, Math.round((usage.library.used / usage.library.limit) * 100))
    : 0;

  return (
    <section className="usage-view" aria-labelledby="usage-title">
      <header className="usage-heading">
        <p className="eyebrow"><span /> {t("Usage")}</p>
        <h1 id="usage-title">{t("Your research availability")}</h1>
        <p>{usage ? t("{count} research runs ready", { count: usage.liveResearch.remaining }) : t("Reading your usage…")}</p>
      </header>

      {error ? (
        <div className="usage-load-error" role="alert"><p>{error}</p><button type="button" onClick={onRefresh}>{t("Try again")}</button></div>
      ) : loading && !usage ? (
        <div className="usage-loading" role="status">{t("Reading your rolling limits…")}</div>
      ) : usage ? (
        <div className="usage-layout">
          <article className={`usage-primary${usage.liveResearch.remaining === 0 ? " quota-reached" : ""}`}>
            <header>
              <div><span>{t("Live research")}</span><h2>Available now</h2></div>
              <strong>{usage.liveResearch.remaining}<small>runs</small></strong>
            </header>
            <div className="usage-meter">
              <div><span>Used: <b>{usage.liveResearch.used}</b></span><span>Limit: <b>{usage.liveResearch.limit}</b></span></div>
              <progress value={usage.liveResearch.used} max={usage.liveResearch.limit || 1} aria-label={t("Live research used in the last 24 hours")} />
              <p>{researchPercent}% used · {usage.liveResearch.remaining} remaining</p>
            </div>
            <div className="usage-reset">
              <span>{usage.liveResearch.remaining === 0 ? "Action required" : "Next reset"}</span>
              <p>{usage.liveResearch.nextSlotAt
                ? t("Next slot returns {time}.", { time: time(usage.liveResearch.nextSlotAt) })
                : t("You have not reached the rolling run limit.")}</p>
            </div>
            {!!usage.liveResearch.releasesAt.length && (
              <details className="usage-release-list">
                <summary>{t("Upcoming slot returns")} ({usage.liveResearch.releasesAt.length})</summary>
                <ol>
                  {usage.liveResearch.releasesAt.slice(0, 5).map((releaseAt, index) => (
                    <li key={`${releaseAt}-${index}`}><b>+1</b><time dateTime={new Date(releaseAt).toISOString()}>{time(releaseAt)}</time></li>
                  ))}
                </ol>
              </details>
            )}
          </article>

          <div className="usage-secondary-column">
            <article className="usage-secondary journey-capacity">
              <header><div><span>{t("Saved journeys")}</span><h2>{t("Journey capacity")}</h2></div><strong>{usage.library.remaining}<small>places left</small></strong></header>
              <div className="usage-meter light"><div><span>Used: <b>{usage.library.used}</b></span><span>Limit: <b>{usage.library.limit}</b></span></div><progress value={usage.library.used} max={usage.library.limit || 1} aria-label={t("Saved journey capacity used")} /><p>{journeyPercent}% used · Does not reset</p></div>
              {usage.library.remaining === 0 && <p>Delete a journey to free a place.</p>}
              <button type="button" onClick={onOpenJourneys}>{t("Manage saved journeys")}</button>
            </article>

            <details className="usage-spend">
              <summary><span>Provider spend</span><strong>${usage.spend.accountedUsd.toFixed(3)} / ${usage.spend.limitUsd.toFixed(2)}</strong></summary>
              <progress value={usage.spend.accountedUsd} max={usage.spend.limitUsd || 1} aria-label={t("Provider spend and active holds in the last 24 hours")} />
              <p>${usage.spend.usedUsd.toFixed(3)} settled · ${usage.spend.heldUsd.toFixed(3)} held</p>
              <p>{usage.spend.nextReleaseAt ? t("Spend begins leaving the window {time}.", { time: time(usage.spend.nextReleaseAt) }) : t("No metered provider spend or active holds in the current window.")}</p>
            </details>

            <aside className="usage-account">
              <div className="usage-account-avatar" aria-hidden="true">{viewer?.displayName?.charAt(0).toUpperCase() || "W"}</div>
              <div><span>{viewer?.mode === "guest" ? t("Guest session") : t("Account usage")}</span><strong>{viewer?.displayName || "CuriosityPedia user"}</strong><p>{viewer?.mode === "guest" ? "Limits and saved journeys belong to this browser session." : t("These limits follow your signed-in ChatGPT identity across devices.")}</p></div>
              {viewer?.mode === "guest" && <a href="/signin-with-chatgpt?return_to=%2F">{t("Sign in")} →</a>}
            </aside>
          </div>

          <details className="usage-window-note"><summary>{t("How rolling limits work")}</summary><p>{t("There is no midnight reset. Each run and each dollar leaves the window 24 hours after it was recorded.")}</p>{viewer?.mode === "guest" && usage.guestSessionExpiresAt && <p>{t("This browser session is scheduled to remain available until {time}.", { time: time(usage.guestSessionExpiresAt) })}</p>}</details>
        </div>
      ) : null}
    </section>
  );
}
