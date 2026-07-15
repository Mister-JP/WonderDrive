"use client";

import {
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import {
  BOOTSTRAP_CATALOG,
  DEFAULT_PREFERENCES,
  PERFORMERS,
  STARTERS,
} from "../lib/catalog";
import type {
  AdvanceJourneyRequest,
  AnswerDensity,
  BootstrapCatalog,
  CompareResult,
  DiagnosticsReport,
  ImagePreference,
  JourneyDetail,
  JourneySnapshot,
  JourneySummary,
  JourneyTurn,
  ModelId,
  PersonalizedStarter,
  PerformerId,
  ResearchPreset,
  TextSize,
  UserPreferences,
  Viewer,
} from "../lib/contracts";
import { SUPPORTED_LOCALES, localeDirection } from "../lib/i18n";
import {
  api,
  type LiveResearchState,
  messageFrom,
  starterRecommendationsUrl,
  streamLiveResearch,
} from "./client-api";
import { I18nProvider, translate, useI18n } from "./i18n";

type View = "start" | "journey" | "map" | "library" | "compare" | "settings";

type SessionPayload = {
  journeys: JourneySummary[];
};

type BootstrapPayload = {
  catalog: BootstrapCatalog;
  preferences: UserPreferences;
};

type StarterPayload = { starters: PersonalizedStarter[] };
type JourneyViewOptions = {
  turnId?: string;
  view?: View;
  syncLibrary?: boolean;
};

const navItems: Array<{ id: View; label: string }> = [
  { id: "start", label: "New drive" },
  { id: "library", label: "Library" },
  { id: "compare", label: "Compare" },
  { id: "settings", label: "Settings" },
];

export function WonderDriveExperience() {
  const [view, setView] = useState<View>("start");
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [activeJourney, setActiveJourney] = useState<JourneyDetail | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutation, setMutation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<CompareResult | null>(null);
  const [liveResearch, setLiveResearch] = useState<LiveResearchState | null>(null);
  const [catalog, setCatalog] = useState<BootstrapCatalog>(BOOTSTRAP_CATALOG);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [nextModelId, setNextModelId] = useState<ModelId | null>(null);
  const [personalizedStarters, setPersonalizedStarters] = useState<PersonalizedStarter[]>(
    BOOTSTRAP_CATALOG.discoveryStarters,
  );
  const t = (key: string, values?: Record<string, string | number>) => translate(preferences.interfaceLocale, key, values);

  const refreshSession = useCallback(async () => {
    setError(null);
    try {
      const [session, bootstrap] = await Promise.all([
        api<SessionPayload>("/api/session"),
        api<BootstrapPayload>("/api/bootstrap"),
      ]);
      setViewer(session.viewer);
      setJourneys(session.data.journeys);
      setCatalog(bootstrap.data.catalog);
      setPreferences(bootstrap.data.preferences);
      void api<StarterPayload>(starterRecommendationsUrl("sage"))
        .then((payload) => setPersonalizedStarters(payload.data.starters))
        .catch(() => setPersonalizedStarters(bootstrap.data.catalog.discoveryStarters));
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  const runMutation = useCallback(async <T,>(
    key: string,
    work: () => Promise<T>,
    onError?: (message: string) => void,
  ): Promise<T | undefined> => {
    setMutation(key);
    setError(null);
    try {
      return await work();
    } catch (cause) {
      const message = messageFrom(cause);
      setError(message);
      onError?.(message);
    } finally {
      setMutation(null);
    }
  }, []);

  /** Keeps every client projection of the selected journey in one atomic React update path. */
  const presentJourney = useCallback((
    detail: JourneyDetail,
    nextViewer: Viewer,
    { turnId = detail.currentTurnId, view = "journey", syncLibrary = true }: JourneyViewOptions = {},
  ) => {
    setViewer(nextViewer);
    setActiveJourney(detail);
    setNextModelId(detail.modelId);
    setActiveTurnId(turnId);
    setView(view);
    if (syncLibrary) setJourneys((current) => upsertSummary(current, detail));
  }, []);

  useEffect(() => {
    // The first client effect hydrates the durable server session; updates happen after fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSession();
  }, [refreshSession]);

  const openJourney = useCallback(async (journeyId: string, targetView: View = "journey") => {
    await runMutation(`open-${journeyId}`, async () => {
      const payload = await api<JourneyDetail>(`/api/journeys/${journeyId}`);
      presentJourney(payload.data, payload.viewer, { view: targetView, syncLibrary: false });
    });
  }, [presentJourney, runMutation]);

  async function create(config: {
    seed: string;
    performerId: PerformerId;
    modelId: ModelId;
    researchPreset: ResearchPreset;
    answerDensity: AnswerDensity;
    imagePreference: ImagePreference;
    outputLocale: UserPreferences["defaultOutputLocale"];
  }) {
    await runMutation("create", async () => {
      setView("journey");
      setLiveResearch({
        question: config.seed,
        performerId: config.performerId,
        message: t("Connecting to live foreground research…"),
        events: [],
        status: "running",
        result: null,
        error: null,
        diagnosticId: null,
        retryAttempt: 0,
        maxRetries: 0,
      });
      const complete = await streamLiveResearch(
        { kind: "create", ...config, idempotencyKey: crypto.randomUUID() },
        setLiveResearch,
      );
      presentJourney(complete.data, complete.viewer);
      setLiveResearch((current) =>
        current
          ? { ...current, status: "complete", result: complete.data, message: t("Research committed") }
          : current,
      );
    }, (message) => {
      setLiveResearch((current) =>
        current ? { ...current, status: "error", error: message, message: t("Research stopped") } : null,
      );
    });
  }

  async function advance(
    action: AdvanceJourneyRequest["action"],
    input: { turnId: string; optionId?: string; adventure?: number; reason?: string },
  ) {
    if (!activeJourney) return;
    const modelId = nextModelId ?? activeJourney.modelId;
    await runMutation(action, async () => {
      if (action !== "reject") {
        const fromTurn = activeJourney.turns.find((turn) => turn.id === input.turnId);
        const selected =
          action === "delegate"
            ? fromTurn?.options.find((option) => option.position === fromTurn.preferredPosition)
            : fromTurn?.options.find((option) => option.id === input.optionId);
        if (!fromTurn || !selected) throw new Error(t("Choose one of the two current paths."));
        setView("journey");
        setLiveResearch({
          question: selected.question,
          performerId: activeJourney.performerId,
          message: t("Opening the next live research turn…"),
          events: [],
          status: "running",
          result: null,
          error: null,
          diagnosticId: null,
          retryAttempt: 0,
          maxRetries: 0,
        });
        const complete = await streamLiveResearch(
          {
            kind: "advance",
            journeyId: activeJourney.id,
            fromTurnId: input.turnId,
            action,
            modelId,
            optionId: input.optionId,
            expectedVersion: activeJourney.version,
            idempotencyKey: crypto.randomUUID(),
          },
          setLiveResearch,
        );
        presentJourney(complete.data, complete.viewer);
        setLiveResearch((current) =>
          current
            ? { ...current, status: "complete", result: complete.data, message: t("Research committed") }
            : current,
        );
        return;
      }
      const payload = await api<JourneyDetail>(
        `/api/journeys/${activeJourney.id}/advance`,
        {
          method: "POST",
          body: JSON.stringify({
            fromTurnId: input.turnId,
            action,
            modelId,
            optionId: input.optionId,
            adventure: input.adventure,
            reason: input.reason,
            expectedVersion: activeJourney.version,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      presentJourney(payload.data, payload.viewer, {
        turnId: action === "reject" ? input.turnId : payload.data.currentTurnId,
      });
    }, (message) => {
      setLiveResearch((current) =>
          current ? { ...current, status: "error", error: message, message: t("Research stopped") } : null,
      );
      if (message.toLowerCase().includes("another tab")) void openJourney(activeJourney.id);
    });
  }

  async function removeJourney(journeyId: string) {
    await runMutation(`delete-${journeyId}`, async () => {
      await api<{ id: string }>(`/api/journeys/${journeyId}`, { method: "DELETE" });
      setJourneys((current) => current.filter((journey) => journey.id !== journeyId));
      setCompareIds((current) => current.filter((id) => id !== journeyId));
      if (activeJourney?.id === journeyId) {
        setActiveJourney(null);
        setActiveTurnId(null);
        setView("library");
      }
    });
  }

  async function manageJourney(journeyId: string, changes: { title?: string; pinned?: boolean; hidden?: boolean }) {
    await runMutation(`manage-${journeyId}`, async () => {
      const payload = await api<JourneyDetail>(`/api/journeys/${journeyId}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      setViewer(payload.viewer);
      setJourneys((current) => upsertSummary(current, payload.data));
      if (activeJourney?.id === journeyId) setActiveJourney(payload.data);
    });
  }

  async function snapshotJourney(journeyId: string) {
    await runMutation(`snapshot-${journeyId}`, async () => {
      const payload = await api<JourneySnapshot>(`/api/journeys/${journeyId}/snapshots`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setNotice(`${payload.data.label}: ${payload.data.summary}`);
    });
  }

  async function compare() {
    if (compareIds.length !== 2) return;
    await runMutation("compare", async () => {
      const params = new URLSearchParams({ left: compareIds[0], right: compareIds[1] });
      const payload = await api<CompareResult>(`/api/compare?${params}`);
      setComparison(payload.data);
    });
  }

  const activeTurn = useMemo(
    () => activeJourney?.turns.find((turn) => turn.id === activeTurnId) ?? null,
    [activeJourney, activeTurnId],
  );

  function navigate(next: View) {
    if ((next === "journey" || next === "map") && !activeJourney) {
      setView(journeys.length ? "library" : "start");
      return;
    }
    setView(next);
    setLiveResearch(null);
    if (next === "compare") setComparison(null);
  }

  return (
    <I18nProvider locale={preferences.interfaceLocale}>
    <main className={`app-shell text-${preferences.textSize} ${preferences.reduceMotion ? "reduce-motion" : ""}`}>
      <header className="app-header">
        <button className="wordmark" type="button" onClick={() => navigate("start")}>
          <span className="wordmark-mark" aria-hidden="true">W</span>
          <span>
            WonderDrive
            <small>{t("curiosity, performed")}</small>
          </span>
        </button>

        <nav className="app-nav" aria-label={t("WonderDrive views")}>
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={view === item.id ? "active" : ""}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              {t(item.label)}
            </button>
          ))}
        </nav>

        <div className="identity-control">
          <span className={`identity-dot ${viewer?.mode ?? "loading"}`} aria-hidden="true" />
          {viewer?.mode === "chatgpt" ? (
            <span><strong>{viewer.displayName}</strong><small>{t("ChatGPT account")}</small></span>
          ) : (
            <span><strong>{viewer?.displayName ?? t("Opening library…")}</strong><small>{viewer ? t("{count}/{limit} saved", { count: journeys.length, limit: viewer.journeyLimit }) : t("durable session")}</small></span>
          )}
          {viewer?.mode === "guest" ? (
            <a className="identity-action" href="/signin-with-chatgpt?return_to=%2F">{t("Sign in")}</a>
          ) : viewer?.mode === "chatgpt" ? (
            <a className="identity-action" href="/signout-with-chatgpt?return_to=%2F">{t("Sign out")}</a>
          ) : null}
        </div>
      </header>

      {view !== "start" && (
        <div className="phase-ribbon" role="note">
          <span>{t("Research first")}</span>
          {t("Same selected model researches and performs · inspectable sources · durable branching graph")}
        </div>
      )}

      {viewer?.mode === "chatgpt" && viewer.hasGuestUpgrade && (
        <div className="upgrade-banner" role="status">
          <span>{t("Your guest library is still separate.")}</span>
          <button type="button" onClick={() => void upgradeGuestLibrary(setViewer, refreshSession, setError)}>
            {t("Move guest journeys into this account")}
          </button>
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => { setError(null); void refreshSession(); }}>{t("Reconnect")}</button>
        </div>
      )}
      {notice && (
        <div className="notice-banner" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>{t("Dismiss")}</button>
        </div>
      )}

      {loading ? (
        <LoadingStage />
      ) : liveResearch ? (
        <JourneyBufferingStage
          state={liveResearch}
          onComplete={() => {
            if (liveResearch.result) {
              setActiveJourney(liveResearch.result);
              setActiveTurnId(liveResearch.result.currentTurnId);
            }
            setLiveResearch(null);
            setView("journey");
          }}
          onBack={() => {
            setLiveResearch(null);
            setView(activeJourney ? "journey" : "start");
          }}
        />
      ) : view === "start" ? (
        <StartStage
          onCreate={create}
          creating={mutation === "create"}
          journeyCount={journeys.length}
          catalog={catalog}
          preferences={preferences}
          starters={personalizedStarters}
        />
      ) : view === "library" ? (
        <Library
          journeys={journeys}
          viewer={viewer}
          busy={mutation}
          onOpen={(id) => void openJourney(id)}
          onDelete={(id) => void removeJourney(id)}
          onManage={(id, changes) => void manageJourney(id, changes)}
          onSnapshot={(id) => void snapshotJourney(id)}
          onNew={() => setView("start")}
        />
      ) : view === "compare" ? (
        <CompareView
          journeys={journeys}
          selected={compareIds}
          comparison={comparison}
          busy={mutation === "compare"}
          onToggle={(id) => {
            setComparison(null);
            setCompareIds((current) =>
              current.includes(id)
                ? current.filter((value) => value !== id)
                : [...current.slice(-1), id],
            );
          }}
          onCompare={() => void compare()}
          onNew={() => setView("start")}
        />
      ) : view === "settings" ? (
        <SettingsView
          viewer={viewer}
          preferences={preferences}
          busy={mutation === "preferences"}
          onSave={async (next) => {
            await runMutation("preferences", async () => {
              const payload = await api<UserPreferences>("/api/preferences", {
                method: "PUT",
                body: JSON.stringify(next),
              });
              setViewer(payload.viewer);
              setPreferences(payload.data);
              if (payload.data.defaultOutputLocale !== preferences.defaultOutputLocale) {
                void api<StarterPayload>(starterRecommendationsUrl("sage", true))
                  .then((startersPayload) => setPersonalizedStarters(startersPayload.data.starters));
              }
            });
          }}
        />
      ) : activeJourney && activeTurn ? (
        <div className="active-journey-shell">
          <nav className="journey-view-switcher" aria-label={t("Current journey views")}>
            <span>{activeJourney.title}</span>
            <label className="journey-model-switcher">
              <span>{t("Next turn model")}</span>
              <select
                aria-label={t("Model for the next research turn")}
                disabled={mutation !== null}
                value={nextModelId ?? activeJourney.modelId}
                onChange={(event) => setNextModelId(event.target.value as ModelId)}
              >
                {catalog.models.map((model) => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </select>
            </label>
            <div>
              <button type="button" className={view === "journey" ? "active" : ""} aria-current={view === "journey" ? "page" : undefined} onClick={() => setView("journey")}>{t("Stage")}</button>
              <button type="button" className={view === "map" ? "active" : ""} aria-current={view === "map" ? "page" : undefined} onClick={() => setView("map")}>{t("Journey map")}</button>
            </div>
          </nav>
          {view === "map" ? (
            <JourneyMap
              journey={activeJourney}
              activeTurnId={activeTurn.id}
              onSelect={(turnId) => {
                setActiveTurnId(turnId);
              }}
              onContinue={(turnId) => {
                setActiveTurnId(turnId);
                setView("journey");
              }}
              onChoose={(turnId, optionId) => void advance("choose", { turnId, optionId })}
            />
          ) : (
            <PerformanceStage
              journey={activeJourney}
              turn={activeTurn}
              busy={mutation}
              onChoose={(optionId) => void advance("choose", { turnId: activeTurn.id, optionId })}
              onReject={(adventure, reason) => void advance("reject", { turnId: activeTurn.id, adventure, reason })}
              onDelegate={() => void advance("delegate", { turnId: activeTurn.id })}
              speechRate={preferences.speechRate}
              onSnapshot={() => void snapshotJourney(activeJourney.id)}
            />
          )}
        </div>
      ) : (
        <EmptyStage onOpenLibrary={() => setView("library")} />
      )}

      {view !== "start" && (
        <footer className="app-footer">
          <p><span aria-hidden="true">W/V3</span> {t("One performer. One researched turn. Exactly two ways forward.")}</p>
          <div>
            <a href="https://github.com/Mister-JP/WonderDrive">{t("Source")}</a>
            <a href="https://github.com/Mister-JP/WonderDrive/blob/main/docs/WonderDrive_Final_Product_and_Engineering_Blueprint_v3_Research_First.docx">{t("Product book")}</a>
          </div>
        </footer>
      )}
    </main>
    </I18nProvider>
  );
}

function StartStage({
  onCreate,
  creating,
  journeyCount,
  catalog,
  preferences,
  starters,
}: {
  onCreate: (config: {
    seed: string;
    performerId: PerformerId;
    modelId: ModelId;
    researchPreset: ResearchPreset;
    answerDensity: AnswerDensity;
    imagePreference: ImagePreference;
    outputLocale: UserPreferences["defaultOutputLocale"];
  }) => void;
  creating: boolean;
  journeyCount: number;
  catalog: BootstrapCatalog;
  preferences: UserPreferences;
  starters: PersonalizedStarter[];
}) {
  const { t } = useI18n();
  const [seed, setSeed] = useState("");
  const [performerId, setPerformerId] = useState<PerformerId>("sage");
  const [modelId, setModelId] = useState<ModelId>("gpt-5.6-luna");
  const performerIdRef = useRef<PerformerId>("sage");
  const starterCache = useRef(new Map<PerformerId, PersonalizedStarter[]>([["sage", starters]]));
  const [visibleStarters, setVisibleStarters] = useState<PersonalizedStarter[]>(
    () => recommendationsForPerformer("sage", starters),
  );
  const [startersLoading, setStartersLoading] = useState(false);
  const performer = catalog.performers.find((item) => item.id === performerId)!;
  const model = catalog.models.find((item) => item.id === modelId)!;
  const placeholderQuestions = useMemo(
    () => visibleStarters.slice(0, 8).map((starter) => starter.question),
    [visibleStarters],
  );
  const animatedPlaceholder = useQuestionPlaceholder(
    placeholderQuestions,
    seed.length === 0 && !preferences.reduceMotion,
  );
  const normalizedSeed = seed.trim().toLowerCase();
  const autocompleteMatch = normalizedSeed.length >= 3
    ? visibleStarters.find((starter) => {
        const question = starter.question.toLowerCase();
        return question.startsWith(normalizedSeed) && question !== normalizedSeed;
      })
    : undefined;
  const exactMatch = normalizedSeed
    ? visibleStarters.find((starter) => starter.question.toLowerCase() === normalizedSeed)
    : undefined;

  useEffect(() => {
    starterCache.current.set("sage", starters);
    if (performerId === "sage") {
      // The parent hydrates history-aware suggestions after the rest of the session shell.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisibleStarters(recommendationsForPerformer("sage", starters));
    }
  }, [performerId, starters]);

  async function choosePerformer(nextId: PerformerId) {
    performerIdRef.current = nextId;
    setPerformerId(nextId);
    const cached = starterCache.current.get(nextId);
    if (cached) {
      setStartersLoading(false);
      setVisibleStarters(recommendationsForPerformer(nextId, cached));
      return;
    }

    setVisibleStarters(recommendationsForPerformer(nextId, starters));
    setStartersLoading(true);
    try {
      const payload = await api<StarterPayload>(starterRecommendationsUrl(nextId));
      starterCache.current.set(nextId, payload.data.starters);
      if (performerIdRef.current === nextId) {
        setVisibleStarters(recommendationsForPerformer(nextId, payload.data.starters));
      }
    } catch {
      // The performer-specific catalog questions are already visible as a safe fallback.
    } finally {
      if (performerIdRef.current === nextId) setStartersLoading(false);
    }
  }

  async function refreshStarterQuestions() {
    setStartersLoading(true);
    try {
      const payload = await api<StarterPayload>(
        starterRecommendationsUrl(performerId, true),
      );
      starterCache.current.set(performerId, payload.data.starters);
      setVisibleStarters(recommendationsForPerformer(performerId, payload.data.starters));
    } catch {
      // Keep the current set visible if fresh discovery is temporarily unavailable.
    } finally {
      setStartersLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (seed.trim().length >= 3) {
      onCreate({
        seed,
        performerId,
        modelId,
        researchPreset: "standard",
        answerDensity: preferences.answerDensity,
        imagePreference: preferences.imagePreference,
        outputLocale: preferences.defaultOutputLocale,
      });
    }
  }

  function completeQuestion(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Tab" && autocompleteMatch) {
      event.preventDefault();
      setSeed(autocompleteMatch.question);
    }
  }

  return (
    <section className="start-stage-simple" aria-labelledby="start-title">
      <form className="start-console-simple" onSubmit={submit}>
        <div className="recommendation-heading">
          <div>
            <strong>{visibleStarters.length} {t("rabbit holes")}</strong>
            <span>{startersLoading ? t("Scanning what’s unfolding now…") : t("Current signals + {performer} + {context}", { performer: performer.name, context: t(journeyCount ? "your history" : "wild-card domains") })}</span>
          </div>
          <button type="button" className="refresh-starters" disabled={startersLoading} onClick={() => void refreshStarterQuestions()}>
            <span aria-hidden="true">↻</span>{t(startersLoading ? "Hunting…" : "Find new questions")}
          </button>
        </div>
        <div className="starter-marquee starter-marquee-simple" aria-label={t("Questions suggested for {performer}", { performer: performer.name })}>
          <div className="starter-marquee-window">
            <div className="starter-marquee-track">
              {[0, 1].map((copy) => (
                <div className="starter-marquee-set" key={copy} aria-hidden={copy === 1}>
                  {visibleStarters.map((starter, index) => (
                    <button
                      type="button"
                      key={`${copy}-${starter.question}-${index}`}
                      onClick={() => setSeed(starter.question)}
                      tabIndex={copy === 1 ? -1 : undefined}
                    >
                      <span>{starter.topic}</span>
                      {starter.question}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <h1 id="start-title">{t("What are you curious about?")}</h1>
        <div className="question-field-shell">
          <label className="question-input question-input-simple">
            <span className="sr-only">{t("Starting question")}</span>
            <textarea
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              onKeyDown={completeQuestion}
              minLength={3}
              maxLength={280}
              rows={2}
              required
              aria-controls="question-autocomplete"
              placeholder={preferences.reduceMotion ? placeholderQuestions[0] ?? t("Ask anything…") : animatedPlaceholder}
            />
            <small>{seed.length}/280</small>
          </label>
          <div className="question-autocomplete" id="question-autocomplete" aria-live="polite">
            {autocompleteMatch ? (
              <button type="button" onClick={() => setSeed(autocompleteMatch.question)}>
                <span>{t("Tab to complete")}</span>{autocompleteMatch.question}
              </button>
            ) : exactMatch ? (
              <span><strong>{t("Recommended match")}</strong>{exactMatch.topic}</span>
            ) : (
              <span className="question-autocomplete-idle">{t("Start typing for recommendation matches")}</span>
            )}
          </div>
        </div>

        <div className="start-selectors">
          <label>
            <span>{t("Performer")}</span>
            <span className="start-select-wrap">
              <span className="performer-mark" aria-hidden="true">{performer.mark}</span>
              <select value={performerId} onChange={(event) => void choosePerformer(event.target.value as PerformerId)}>
                {catalog.performers.map((item) => (
                  <option value={item.id} key={item.id}>{item.name} — {t(item.role)}</option>
                ))}
              </select>
            </span>
          </label>
          <label>
            <span>{t("Model")}</span>
            <span className="start-select-wrap model-select-wrap">
              <select value={modelId} onChange={(event) => setModelId(event.target.value as ModelId)}>
                {catalog.models.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name} — {item.speedBand} · ${item.inputUsdPerMillion}/$${item.outputUsdPerMillion}
                  </option>
                ))}
              </select>
            </span>
          </label>
        </div>

        <div className={`performer-layer ${performer.accent}`}>
          <span>{t("{performer} will carry this question", { performer: performer.name })}</span>
          <p>{t(performer.cue)}</p>
          <small>{performer.voiceTraits.map((trait) => t(trait)).join(" · ")}</small>
        </div>

        <button className="launch-button launch-button-simple" type="submit" disabled={creating || seed.trim().length < 3}>
          <span>{t(creating ? "Researching in the foreground…" : "Begin the wonder")}</span>
          <i aria-hidden="true">→</i>
        </button>
        <p className="honesty-note">
          <span aria-hidden="true">◉</span>
          {t(model.disclosure)} {t("Input/output prices shown per 1M tokens; search is metered separately.")}
        </p>
      </form>
    </section>
  );
}

function recommendationsForPerformer(
  performerId: PerformerId,
  personalized: PersonalizedStarter[],
) {
  const performerQuestions = STARTERS[performerId].map((question) => ({
    question,
    topic: `${PERFORMERS.find((item) => item.id === performerId)?.name ?? "Performer"} pick`,
  }));
  const combined = [...personalized, ...performerQuestions];
  return combined.filter(
    (item, index) => combined.findIndex((candidate) => candidate.question.toLowerCase() === item.question.toLowerCase()) === index,
  ).slice(0, 24);
}

function useQuestionPlaceholder(questions: string[], active: boolean) {
  const [placeholder, setPlaceholder] = useState("");

  useEffect(() => {
    if (!active || questions.length === 0) return;
    let cancelled = false;
    let questionIndex = 0;
    let characterIndex = 0;
    let deleting = false;
    let timer = 0;

    function tick() {
      if (cancelled) return;
      const question = questions[questionIndex] ?? "";
      characterIndex += deleting ? -1 : 1;
      setPlaceholder(question.slice(0, Math.max(0, characterIndex)));

      let delay = deleting ? 24 : 48;
      if (!deleting && characterIndex >= question.length) {
        deleting = true;
        delay = 1_450;
      } else if (deleting && characterIndex <= 0) {
        deleting = false;
        questionIndex = (questionIndex + 1) % questions.length;
        delay = 320;
      }
      timer = window.setTimeout(tick, delay);
    }

    timer = window.setTimeout(tick, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, questions]);

  return placeholder;
}

function JourneyBufferingStage({
  state,
  onComplete,
  onBack,
}: {
  state: LiveResearchState;
  onComplete: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (state.status !== "complete") return;
    const timer = window.setTimeout(onComplete, 650);
    return () => window.clearTimeout(timer);
  }, [onComplete, state.status]);

  const performer = PERFORMERS.find((item) => item.id === state.performerId) ?? PERFORMERS[0];

  return (
    <section className="performance-stage buffering-stage" aria-labelledby="buffering-title" aria-busy={state.status === "running"}>
      <header className="performance-header buffering-header">
        <div>
          <p className="eyebrow"><span /> {t("Next turn")} · {performer.name}</p>
          <h1 id="buffering-title">{state.question}</h1>
        </div>
        <div className={`buffering-status ${state.status}`} role="status" aria-live="polite">
          <span className="buffering-dot" aria-hidden="true" />
          <strong>{state.status === "complete" ? t("Answer ready") : state.status === "error" ? t("Research stopped") : state.retryAttempt > 0 ? t("Retrying {attempt} of {max}", { attempt: state.retryAttempt, max: state.maxRetries }) : t("Buffering answer")}</strong>
          <small>{state.status === "running" ? state.message : state.status === "complete" ? t("Placing the answer into this card") : t("Nothing incomplete was saved")}</small>
        </div>
      </header>

      <article className="buffering-answer-card">
        <div className="buffering-byline">
          <span className={`performer-mark ${performer.accent}`}>{performer.mark}</span>
          <div><strong>{performer.name}</strong><small>{t("researching in this foreground turn")}</small></div>
          <span className="buffering-ellipsis" aria-hidden="true"><i /><i /><i /></span>
        </div>

        {state.status === "error" ? (
          <div className="buffering-error" role="alert">
            <span aria-hidden="true">!</span>
            <div>
              <strong>{t("This turn was not committed")}</strong>
              <p>{state.error}</p>
              {state.diagnosticId && <code>Diagnostic {formatDiagnosticId(state.diagnosticId)}</code>}
            </div>
            <button type="button" onClick={onBack}>{t("Return safely")} →</button>
          </div>
        ) : (
          <>
            <div className="buffering-content-grid" aria-hidden="true">
              <div className="buffering-copy">
                <span className="skeleton-line title" />
                <span className="skeleton-line long" />
                <span className="skeleton-line medium" />
                <span className="skeleton-line short" />
                <div className="skeleton-tags"><i /><i /><i /></div>
              </div>
              <div className="skeleton-media"><i /><span /><span /></div>
            </div>
            <div className="buffering-evidence" aria-hidden="true"><span /><i /></div>
          </>
        )}
      </article>

      <section className="buffering-directions" aria-hidden="true">
        <p>{t("Choose the next direction")}</p>
        <h2>{t("Where should curiosity go next?")}</h2>
        <div><span /><span /></div>
        <small>{t("Two paths will appear here when the answer is ready.")}</small>
      </section>
    </section>
  );
}

function PerformanceStage({
  journey,
  turn,
  busy,
  onChoose,
  onReject,
  onDelegate,
  speechRate,
  onSnapshot,
}: {
  journey: JourneyDetail;
  turn: JourneyTurn;
  busy: string | null;
  onChoose: (optionId: string) => void;
  onReject: (adventure: number, reason?: string) => void;
  onDelegate: () => void;
  speechRate: number;
  onSnapshot: () => void;
}) {
  const { t, locale } = useI18n();
  const [adventure, setAdventure] = useState(50);
  const [reason, setReason] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);
  const [redrawOpen, setRedrawOpen] = useState(false);
  const deepDiveTriggerRef = useRef<HTMLButtonElement>(null);
  const deepDiveCloseRef = useRef<HTMLButtonElement>(null);
  const performer = PERFORMERS.find((item) => item.id === journey.performerId)!;
  const historical = turn.id !== journey.currentTurnId;
  const actionable = turn.options.filter((option) => option.state === "proposed").length > 0;

  useEffect(() => {
    if (!deepDiveOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = deepDiveTriggerRef.current;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setDeepDiveOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    window.requestAnimationFrame(() => deepDiveCloseRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      trigger?.focus();
    };
  }, [deepDiveOpen]);

  function citations(sourceIds: string[]) {
    return sourceIds.map((sourceId) => {
      const sourceIndex = turn.sources.findIndex((source) => source.id === sourceId);
      return sourceIndex >= 0 ? (
        <a
          className="citation"
          key={sourceId}
          href={turn.sources[sourceIndex].url}
          target="_blank"
          rel="noreferrer"
          aria-label={`${t("Source")} ${sourceIndex + 1}: ${turn.sources[sourceIndex].title}`}
        >
          {sourceIndex + 1}
        </a>
      ) : null;
    });
  }

  function toggleSpeech() {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(`${turn.question}. ${turn.answer}. ${turn.transition}`);
    utterance.rate = speechRate;
    utterance.lang = turn.metadata.outputLocale;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === turn.metadata.outputLocale.toLowerCase())
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(turn.metadata.outputLocale.split("-")[0].toLowerCase()))
      ?? null;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  return (
    <section className="performance-stage article-journey-stage" aria-labelledby="performance-title" lang={turn.metadata.outputLocale} dir={localeDirection(turn.metadata.outputLocale)}>
      <header className="performance-header article-journey-header">
        <div>
          <p className="eyebrow"><span /> {t("Turn {number}", { number: turn.depth + 1 })} · {performer.name}</p>
          <h1 id="performance-title">{turn.question}</h1>
        </div>
        <div className="stage-metrics">
          <span>{t("{count} turns", { count: journey.turnCount })}</span>
          <span>{t("{count} sources", { count: journey.sourceCount })}</span>
        </div>
      </header>

      {historical && (
        <div className="branch-notice" role="note">
          <span aria-hidden="true">⑂</span>
          <p><strong>{t("You are revisiting an earlier turn.")}</strong> {t("Choosing a path here creates a visible branch; your existing turns stay in the map.")}</p>
        </div>
      )}

      <article className={`contained-answer-card ${turn.media.length ? "has-media" : "without-media"}`}>
        <div className="contained-answer-topline">
          <div className="answer-byline compact-byline">
            <span className={`performer-mark ${performer.accent}`}>{performer.mark}</span>
            <div><strong>{performer.name}</strong><small>{t("performed from live web research")}</small></div>
            <span className="ready-stamp">{t("COMPOSED")}</span>
          </div>
          <div className="contained-answer-tools">
            <button type="button" onClick={toggleSpeech}>{t(speaking ? "Stop reading" : "Read aloud")}</button>
            <details className="answer-overflow">
              <summary aria-label={t("Save and export options")}>•••</summary>
              <div>
                <button type="button" disabled={busy !== null} onClick={onSnapshot}>{t("Save snapshot")}</button>
                <a href={`/api/journeys/${journey.id}/export`}>{t("Export JSON")}</a>
              </div>
            </details>
          </div>
        </div>

        <div className="contained-answer-content">
          <div className="contained-answer-summary">
            <p className="card-kicker">{t("The answer")}</p>
            <h2>{turn.topicLabel}</h2>
            <div className="contained-answer-prose">
              {turn.answerBlocks.slice(0, 1).map((block, blockIndex) => (
                <p key={`${turn.id}-answer-${blockIndex}`}>{block.text} {citations(block.sourceIds)}</p>
              ))}
            </div>
            <div className="answer-tags" aria-label={t("Answer characteristics")}>
              <span>{turn.topicLabel}</span>
              <span>{t("{count} checked sources", { count: turn.sources.length })}</span>
              <span>{t("live research")}</span>
            </div>
            <button ref={deepDiveTriggerRef} className="evidence-research-row" type="button" onClick={() => setDeepDiveOpen(true)}>
              <span><strong>{t("Evidence & research details")}</strong></span>
              <span className="deep-dive-cta">{t("Deeper dive")} ↗</span>
            </button>
          </div>

          <AnswerVisual media={turn.media} outputLocale={turn.metadata.outputLocale} />
        </div>
      </article>

      <section className="journey-directions" aria-labelledby="direction-title">
        <p className="panel-index">{t("Choose the next direction")}</p>
        <h2 id="direction-title">{t("Where should curiosity go next?")}</h2>
        <div className="journey-path-grid">
          {turn.options.map((option, index) => (
            <button
              type="button"
              className={`journey-path-card journey-path-${index + 1}`}
              key={option.id}
              disabled={!actionable || option.state !== "proposed" || busy !== null}
              onClick={() => onChoose(option.id)}
            >
              <span>{index === 0 ? "←" : "→"} {option.angle}</span>
              <strong>{option.question}</strong>
              <i aria-hidden="true">{index === 0 ? "←" : "→"}</i>
            </button>
          ))}
        </div>
        <div className="journey-secondary-actions">
          <button type="button" disabled={!actionable || busy !== null} onClick={onDelegate}>✦ {t("Let {performer} choose", { performer: performer.name.replace("The ", "") })}</button>
          <button type="button" aria-expanded={redrawOpen} onClick={() => setRedrawOpen((open) => !open)}>{t("Neither question works")} {redrawOpen ? "⌃" : "⌄"}</button>
        </div>
        {redrawOpen && (
          <div className="redraw-panel">
            <div className="redraw-modes" aria-label={t("Replacement question direction")}>
              <button type="button" className={adventure === 20 ? "active" : ""} onClick={() => setAdventure(20)}>{t("Practical")}</button>
              <button type="button" className={adventure === 78 ? "active" : ""} onClick={() => setAdventure(78)}>{t("Surprising")}</button>
              <button type="button" className={adventure === 50 ? "active" : ""} onClick={() => setAdventure(50)}>{t("Different direction")}</button>
            </div>
            <label className="redraw-note"><span>{t("Optional note")}</span><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={280} placeholder={t("What should change about the next two questions?")} /></label>
            <button className="redraw-submit" type="button" disabled={!actionable || busy !== null} onClick={() => onReject(adventure, reason.trim() || undefined)}>{t(busy === "reject" ? "Replacing…" : "Generate two new questions")}</button>
          </div>
        )}
      </section>

      {deepDiveOpen && (
        <div className="deep-dive-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeepDiveOpen(false); }}>
          <section className="deep-dive-dialog" role="dialog" aria-modal="true" aria-labelledby="deep-dive-title">
            <header>
              <div><p>{t("Deeper dive")} · {t("Turn {number}", { number: turn.depth + 1 })}</p><h2 id="deep-dive-title">{turn.question}</h2></div>
              <button ref={deepDiveCloseRef} type="button" onClick={() => setDeepDiveOpen(false)} aria-label={t("Close deeper dive")}>×</button>
            </header>
            <div className="deep-dive-layout has-media">
              <div className="deep-dive-answer">
                {turn.answerBlocks.map((block, blockIndex) => <p key={`${turn.id}-deep-${blockIndex}`}>{block.text} {citations(block.sourceIds)}</p>)}
              </div>
              <aside className="deep-dive-evidence">
                <AnswerVisual media={turn.media} outputLocale={turn.metadata.outputLocale} compact />
                <h3>{t("Sources")}</h3>
                <ol>{turn.sources.map((source, index) => <li key={source.id}><span>{index + 1}</span><div dir="auto"><strong>{source.title}</strong><small>{source.publisher} · {source.relation}</small></div><a href={source.url} target="_blank" rel="noreferrer">{t("Open")} ↗</a></li>)}</ol>
              </aside>
            </div>
            <div className="deep-dive-research">
              <div><span>{t("Research summary")}</span><p>{turn.researchSummary}</p></div>
              <dl>
                <div><dt>{t("Model")}</dt><dd>{turn.metadata.provider} · {turn.metadata.modelId}</dd></div>
                <div><dt>{t("Research")}</dt><dd>{turn.metadata.researchPreset} · {turn.metadata.answerDensity}</dd></div>
                <div><dt>{t("Prompt")}</dt><dd>{turn.metadata.promptVersion}</dd></div>
                <div><dt>{t("Researched")}</dt><dd>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(turn.metadata.researchedAt)}</dd></div>
              </dl>
            </div>
            <footer><button type="button" onClick={() => setDeepDiveOpen(false)}>{t("Close and continue")}</button></footer>
          </section>
        </div>
      )}
    </section>
  );
}

function AnswerVisual({
  media,
  outputLocale,
  compact = false,
}: {
  media: JourneyTurn["media"];
  outputLocale: JourneyTurn["metadata"]["outputLocale"];
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const visible = media
    .filter((item) => !failedUrls.includes(item.imageUrl) && hasBalancedVisualNotes(item, outputLocale))
    .slice(0, compact ? 4 : 8);
  if (!visible.length) return null;
  const activeIndex = Math.min(selectedIndex, visible.length - 1);
  const selected = visible[activeIndex];
  const noticeItems = selected.whatToNotice?.length ? selected.whatToNotice : [selected.caption];
  const roleLabel = (selected.role ?? "context").replace("-", " ");

  function selectImage(nextIndex: number) {
    setSelectedIndex((nextIndex + visible.length) % visible.length);
  }

  function selectFromKeyboard(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? visible.length - 1
        : event.key === "ArrowLeft"
          ? (index - 1 + visible.length) % visible.length
          : (index + 1) % visible.length;
    setSelectedIndex(nextIndex);
    window.requestAnimationFrame(() => thumbnailRefs.current[nextIndex]?.focus());
  }

  return (
    <section className={`answer-gallery ${compact ? "compact-visual" : ""}`} aria-label={t("Visual evidence")}>
      <figure className="answer-gallery-selected">
        <div className="answer-gallery-image-stage">
          <a href={selected.sourcePageUrl} target="_blank" rel="noreferrer" aria-label={`${selected.title ?? selected.caption}. ${t("Open")} ${t("Source")}.`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.imageUrl}
              alt={selected.alt}
              loading="eager"
              referrerPolicy="no-referrer"
              onError={() => setFailedUrls((current) => current.includes(selected.imageUrl) ? current : [...current, selected.imageUrl])}
            />
          </a>
          {visible.length > 1 && (
            <div className="answer-gallery-arrows" aria-label={t("Browse visual evidence")}>
              <button type="button" onClick={() => selectImage(activeIndex - 1)} aria-label={t("Previous image")}>
                <ArrowLeft aria-hidden="true" weight="bold" />
              </button>
              <span aria-live="polite">{activeIndex + 1} / {visible.length}</span>
              <button type="button" onClick={() => selectImage(activeIndex + 1)} aria-label={t("Next image")}>
                <ArrowRight aria-hidden="true" weight="bold" />
              </button>
            </div>
          )}
        </div>
        <figcaption><span>{selected.title ?? selected.caption}</span><a href={selected.sourcePageUrl} target="_blank" rel="noreferrer">{t("Source")} ↗</a></figcaption>
      </figure>

      <aside className="answer-gallery-notes" aria-live="polite">
        <span className="answer-gallery-role">{roleLabel}</span>
        <h3>{selected.title ?? selected.caption}</h3>
        <div><strong>{t("Why it is here")}</strong><p>{selected.whyIncluded ?? selected.caption}</p></div>
        <div><strong>{t("What to notice")}</strong><ul>{noticeItems.map((item, index) => <li key={`${selected.imageUrl}-notice-${index}`}>{item}</li>)}</ul></div>
        <div><strong>{t("What it helps explain")}</strong><p>{selected.learning ?? selected.caption}</p></div>
      </aside>

      <div className="answer-gallery-strip" aria-label={t("Select an image")}>
        {visible.map((item, index) => (
          <button
            ref={(node) => { thumbnailRefs.current[index] = node; }}
            type="button"
            className={index === activeIndex ? "selected" : ""}
            key={`${item.imageUrl}-${index}`}
            aria-label={t("Show {title}", { title: item.title ?? item.caption })}
            aria-pressed={index === activeIndex}
            onClick={() => setSelectedIndex(index)}
            onKeyDown={(event) => selectFromKeyboard(index, event)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbnailUrl || item.imageUrl}
              alt=""
              loading={index === 0 ? "eager" : "lazy"}
              referrerPolicy="no-referrer"
              onError={() => setFailedUrls((current) => current.includes(item.imageUrl) ? current : [...current, item.imageUrl])}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

function hasBalancedVisualNotes(item: JourneyTurn["media"][number], locale: JourneyTurn["metadata"]["outputLocale"]) {
  const wordCount = (value: string) => [...new Intl.Segmenter(locale, { granularity: "word" }).segment(value)].filter((segment) => segment.isWordLike).length;
  const whyCount = wordCount(item.whyIncluded ?? "");
  const learningCount = wordCount(item.learning ?? "");
  const proseMinimum = 18;
  const proseMaximum = 26;
  const noticeMinimum = 9;
  const noticeMaximum = 15;
  return whyCount >= proseMinimum
    && whyCount <= proseMaximum
    && learningCount >= proseMinimum
    && learningCount <= proseMaximum
    && item.whatToNotice?.length === 2
    && item.whatToNotice.every((notice) => {
      const count = wordCount(notice);
      return count >= noticeMinimum && count <= noticeMaximum;
    });
}

function JourneyMap({
  journey,
  activeTurnId,
  onSelect,
  onContinue,
  onChoose,
}: {
  journey: JourneyDetail;
  activeTurnId: string;
  onSelect: (id: string) => void;
  onContinue: (id: string) => void;
  onChoose: (turnId: string, optionId: string) => void;
}) {
  const { t } = useI18n();
  const activeTurn = journey.turns.find((turn) => turn.id === activeTurnId) ?? journey.turns[0];
  const turnNumber = (turnId: string) => journey.turns.findIndex((turn) => turn.id === turnId) + 1;
  const activePath = useMemo(() => {
    const turnsById = new Map(journey.turns.map((turn) => [turn.id, turn]));
    const path: JourneyTurn[] = [];
    let cursor = turnsById.get(journey.currentTurnId);
    while (cursor) {
      path.push(cursor);
      cursor = cursor.parentTurnId ? turnsById.get(cursor.parentTurnId) : undefined;
    }
    return path.reverse();
  }, [journey.currentTurnId, journey.turns]);
  const activePathIds = new Set(activePath.map((turn) => turn.id));
  const branchTurns = journey.turns.filter((turn) => !activePathIds.has(turn.id));
  const otherOpenPaths = journey.turns.flatMap((turn) =>
    turn.id === activeTurn.id
      ? []
      : turn.options
          .filter((option) => option.state === "proposed")
          .map((option) => ({ option, turn })),
  );
  const selectedIsOffPath = !activePathIds.has(activeTurn.id);

  return (
    <section className="map-view" aria-labelledby="map-title">
      <header className="map-header">
        <div>
          <p className="eyebrow"><span /> {t("Your journey")}</p>
          <h1 id="map-title">{journey.title}</h1>
          <p>{t("Follow the path you took, revisit a turn, or open a question you left behind.")}</p>
        </div>
        <dl aria-label={t("Journey overview")}>
          <div><dt>{t("Current")}</dt><dd>{activePath.length} / {journey.turnCount}</dd></div>
          <div><dt>{t("Open paths")}</dt><dd>{journey.openBranchCount}</dd></div>
          <div><dt>{t("Sources")}</dt><dd>{journey.sourceCount}</dd></div>
        </dl>
      </header>

      <section className="active-path" aria-labelledby="active-path-title">
        <div className="map-section-heading">
          <div><span>{t("Active path")}</span><h2 id="active-path-title">{t("How you got here")}</h2></div>
          <p>{t("Choose any turn to see its two directions.")}</p>
        </div>
        <ol className="active-path-list">
          {activePath.map((turn) => {
            const current = turn.id === journey.currentTurnId;
            const selected = turn.id === activeTurn.id;
            return (
              <li key={turn.id} className={selected ? "selected" : ""}>
                <button
                  type="button"
                  className="path-turn"
                  aria-pressed={selected}
                  aria-current={current ? "step" : undefined}
                  onClick={() => onSelect(turn.id)}
                >
                  <span className="path-turn-number">{turnNumber(turn.id)}</span>
                  <span className="path-turn-copy">
                    <small>{turn.topicLabel}</small>
                    <strong>{turn.question}</strong>
                  </span>
                  <span className={`path-turn-status ${current ? "current" : "explored"}`}>
                    {t(current ? "You are here" : "Explored")}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {selectedIsOffPath && (
        <div className="off-path-notice" role="status">
          <span>{t("Earlier branch")}</span>
          <p>{t("This turn is outside your current path. Exploring an open question here creates a new visible branch.")}</p>
        </div>
      )}

      <section className="selected-turn-paths" aria-labelledby="selected-paths-title">
        <div className="selected-turn-heading">
          <div>
            <span>{t("Turn {number}", { number: turnNumber(activeTurn.id) })}</span>
            <h2 id="selected-paths-title">{t("Where could this turn go?")}</h2>
          </div>
        </div>
        <div className="selected-path-grid">
          {activeTurn.options.map((option) => {
            const open = option.state === "proposed";
            return open ? (
              <button
                type="button"
                className="selected-path-card open"
                key={option.id}
                onClick={() => onChoose(activeTurn.id, option.id)}
              >
                <span>{t("Option")} {option.position === 0 ? "A" : "B"} · {t("Open")}</span>
                <strong>{option.question}</strong>
                <small>{t("Explore this question")}</small>
              </button>
            ) : (
              <div className={`selected-path-card ${option.state}`} key={option.id}>
                <span>{t("Option")} {option.position === 0 ? "A" : "B"} · {t(option.state === "chosen" ? "path taken" : option.state)}</span>
                <strong>{option.question}</strong>
                <small>{t(option.state === "chosen" ? "This answer continues in the map above." : "This direction is no longer active.")}</small>
              </div>
            );
          })}
        </div>
        <button type="button" className="open-turn-answer" onClick={() => onContinue(activeTurn.id)}>
          {t(activeTurn.id === journey.currentTurnId ? "Open full answer" : "Revisit this answer")}
        </button>
      </section>

      {(otherOpenPaths.length > 0 || branchTurns.length > 0) && (
        <details className="other-paths">
          <summary>
            <span>{t("Other paths")}</span>
            <strong>{t("{count} open questions", { count: otherOpenPaths.length })}{branchTurns.length ? ` · ${t("{count} earlier branches", { count: branchTurns.length })}` : ""}</strong>
          </summary>
          <div className="other-path-groups">
            {branchTurns.map((turn) => (
              <button type="button" className="other-branch-turn" key={turn.id} onClick={() => onSelect(turn.id)}>
                <span>{t("Earlier branch")} · {t("Turn {number}", { number: turnNumber(turn.id) })}</span>
                <strong>{turn.question}</strong>
              </button>
            ))}
            {otherOpenPaths.map(({ option, turn }) => (
              <button type="button" className="other-open-path" key={option.id} onClick={() => onChoose(turn.id, option.id)}>
                <span>{t("Open")} · {t("Turn {number}", { number: turnNumber(turn.id) })} · {turn.topicLabel}</span>
                <strong>{option.question}</strong>
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function Library({
  journeys,
  viewer,
  busy,
  onOpen,
  onDelete,
  onManage,
  onSnapshot,
  onNew,
}: {
  journeys: JourneySummary[];
  viewer: Viewer | null;
  busy: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onManage: (id: string, changes: { title?: string; pinned?: boolean; hidden?: boolean }) => void;
  onSnapshot: (id: string) => void;
  onNew: () => void;
}) {
  const { t } = useI18n();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [performerFilter, setPerformerFilter] = useState<PerformerId | "all">("all");
  const [showHidden, setShowHidden] = useState(false);
  const visibleJourneys = journeys
    .filter((journey) => showHidden || !journey.hidden)
    .filter((journey) => performerFilter === "all" || journey.performerId === performerFilter)
    .filter((journey) => `${journey.title} ${journey.seed} ${journey.topicLabels.join(" ")}`.toLowerCase().includes(query.toLowerCase()))
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt - left.updatedAt);
  return (
    <section className="library-view" aria-labelledby="library-title">
      <header className="view-heading">
        <div><p className="eyebrow"><span /> {t("Durable library / D1")}</p><h1 id="library-title">{t("Questions worth returning to.")}</h1></div>
        <div><p>{t("{count} of {limit} journeys saved", { count: journeys.length, limit: viewer?.journeyLimit ?? "—" })}</p><button type="button" className="compact-action" onClick={onNew}>{t("New drive +")}</button></div>
      </header>
      <div className="library-filters" aria-label={t("Library filters")}>
        <label><span>{t("Search")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Title, question, or topic")} /></label>
        <label><span>{t("Performer")}</span><select value={performerFilter} onChange={(event) => setPerformerFilter(event.target.value as PerformerId | "all")}><option value="all">{t("All performers")}</option>{PERFORMERS.map((performer) => <option value={performer.id} key={performer.id}>{performer.name}</option>)}</select></label>
        <label className="check-setting"><input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} /><span>{t("Show hidden")}</span></label>
      </div>
      {journeys.length ? (
        <div className="library-grid">
          {visibleJourneys.map((journey, index) => {
            const performer = PERFORMERS.find((item) => item.id === journey.performerId)!;
            return (
              <article key={journey.id} className="library-card">
                <div className="library-card-top"><span>{journey.pinned ? t("PINNED") : String(index + 1).padStart(2, "0")}</span><i className={performer.accent}>{performer.mark}</i></div>
                <p>{journey.topicLabels.join(" · ") || t("unclassified journey")}</p>
                <h2>{journey.title}</h2>
                <dl><div><dt>{t("Turns")}</dt><dd>{journey.turnCount}</dd></div><div><dt>{t("Sources")}</dt><dd>{journey.sourceCount}</dd></div><div><dt>{t("Open")}</dt><dd>{journey.openBranchCount}</dd></div></dl>
                <div className="library-actions">
                  <button type="button" disabled={busy !== null} onClick={() => onOpen(journey.id)}>{t("Resume")} <span>↗</span></button>
                  {confirmDelete === journey.id ? (
                    <span className="delete-confirm"><button type="button" disabled={busy !== null} onClick={() => onDelete(journey.id)}>{t("Delete")}</button><button type="button" onClick={() => setConfirmDelete(null)}>{t("Keep")}</button></span>
                  ) : (
                    <button type="button" className="text-button" onClick={() => setConfirmDelete(journey.id)}>{t("Remove")}</button>
                  )}
                </div>
                <div className="library-manage">
                  <button type="button" onClick={() => { const title = window.prompt(t("Rename this journey"), journey.title); if (title) onManage(journey.id, { title }); }}>{t("Rename")}</button>
                  <button type="button" onClick={() => onManage(journey.id, { pinned: !journey.pinned })}>{t(journey.pinned ? "Unpin" : "Pin")}</button>
                  <button type="button" onClick={() => onManage(journey.id, { hidden: !journey.hidden })}>{t(journey.hidden ? "Unhide" : "Hide")}</button>
                  <button type="button" onClick={() => onSnapshot(journey.id)}>{t("Snapshot")}</button>
                  <a href={`/api/journeys/${journey.id}/export`}>{t("Export")}</a>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyStage onOpenLibrary={onNew} label={t("Start the first saved journey")} />
      )}
    </section>
  );
}

function CompareView({
  journeys,
  selected,
  comparison,
  busy,
  onToggle,
  onCompare,
  onNew,
}: {
  journeys: JourneySummary[];
  selected: string[];
  comparison: CompareResult | null;
  busy: boolean;
  onToggle: (id: string) => void;
  onCompare: () => void;
  onNew: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="compare-view" aria-labelledby="compare-title">
      <header className="view-heading">
        <div><p className="eyebrow"><span /> {t("Manual comparison / no provider call")}</p><h1 id="compare-title">{t("Two journeys. One closer look.")}</h1></div>
        <div><p>{t("Select two saved journeys. WonderDrive compares their committed paths, topics, and performers.")}</p></div>
      </header>
      {journeys.length >= 2 ? (
        <>
          <div className="compare-picker">
            {journeys.map((journey, index) => {
              const chosen = selected.includes(journey.id);
              return (
                <button type="button" key={journey.id} className={chosen ? "selected" : ""} aria-pressed={chosen} onClick={() => onToggle(journey.id)}>
                  <span>{String(index + 1).padStart(2, "0")}</span><strong>{journey.title}</strong><small>{t("{count} turns", { count: journey.turnCount })} · {journey.topicLabels.join(", ")}</small><i>{chosen ? "✓" : "+"}</i>
                </button>
              );
            })}
          </div>
          <button className="compare-action" type="button" disabled={selected.length !== 2 || busy} onClick={onCompare}>{t(busy ? "Reading the paths…" : "Compare selected journeys")} <span>↘</span></button>
          {comparison && <ComparisonReport result={comparison} />}
        </>
      ) : (
        <div className="compare-empty"><p>{t("Comparison begins after two journeys exist.")}</p><button type="button" onClick={onNew}>{t("Start another drive")} →</button></div>
      )}
    </section>
  );
}

function ComparisonReport({ result }: { result: CompareResult }) {
  const { t, locale } = useI18n();
  return (
    <section className="comparison-report" aria-labelledby="report-title">
      <div className="report-title"><span>{t("Comparison ready")}</span><h2 id="report-title">{t("The useful difference")}</h2></div>
      <div className="compare-columns">
        {[result.left, result.right].map((journey, index) => (
          <article key={journey.id}>
            <span>{t("Path")} {index === 0 ? "A" : "B"}</span><h3>{journey.title}</h3>
            <p>{journey.performerName} · {journey.modelName} · {journey.researchPreset}</p>
            <p>{t("{count} turns", { count: journey.turnCount })} · {t("{count} source appearances", { count: journey.sourceCount })} · {t("{count} open branches", { count: journey.openBranchCount })} · ${journey.totalEstimatedCostUsd.toFixed(4)}</p>
            <p>{t("{count} decisions", { count: journey.actionCount })} ({t("{count} redraws", { count: journey.rejectedCount })}, {t("{count} delegated", { count: journey.delegatedCount })})</p>
            <ol>{journey.timeline.map((turn) => <li key={turn.turnId}><strong>{turn.question}</strong><small>{turn.topicLabel} · {new Intl.DateTimeFormat(locale).format(turn.researchedAt)}</small></li>)}</ol>
            <div>{journey.topicLabels.map((topic) => <small key={topic}>{topic}</small>)}</div>
          </article>
        ))}
      </div>
      <div className="observations"><span>{t("What the saved data shows")}</span><ul>{result.observations.map((observation, index) => <li key={`${observation.key}-${index}`}>{t(observation.key, observation.values)}</li>)}</ul></div>
      {!!result.confounders.length && <div className="confounders"><span>{t("Comparison cautions")}</span><ul>{result.confounders.map((item, index) => <li key={`${item.key}-${index}`}>{t(item.key, item.values)}</li>)}</ul></div>}
    </section>
  );
}

function SettingsView({
  viewer,
  preferences,
  busy,
  onSave,
}: {
  viewer: Viewer | null;
  preferences: UserPreferences;
  busy: boolean;
  onSave: (next: UserPreferences) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState(preferences);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsReport | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);

  const refreshDiagnostics = useCallback(async () => {
    if (viewer?.mode !== "chatgpt") return;
    setDiagnosticsLoading(true);
    setDiagnosticsError(null);
    try {
      const payload = await api<DiagnosticsReport>("/api/diagnostics");
      setDiagnostics(payload.data);
    } catch (cause) {
      setDiagnosticsError(messageFrom(cause));
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [viewer?.mode]);

  useEffect(() => {
    if (viewer?.mode !== "chatgpt") return;
    let cancelled = false;
    void api<DiagnosticsReport>("/api/diagnostics")
      .then((payload) => {
        if (!cancelled) setDiagnostics(payload.data);
      })
      .catch((cause) => {
        if (!cancelled) setDiagnosticsError(messageFrom(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [viewer?.mode]);

  return (
    <section className="settings-view" aria-labelledby="settings-title">
      <header className="view-heading">
        <div><p className="eyebrow"><span /> {t("Audience controls")}</p><h1 id="settings-title">{t("Make the stage comfortable.")}</h1></div>
        <div><p>{t(viewer?.mode === "chatgpt" ? "Synced to your ChatGPT identity" : "Saved to this guest session")}</p><span>{t("These preferences change presentation and future turns, never evidence.")}</span></div>
      </header>
      <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}>
        <label className="language-setting"><span>{t("Experience language")}</span><select value={draft.interfaceLocale} onChange={(event) => { const interfaceLocale = event.target.value as UserPreferences["interfaceLocale"]; const next = { ...draft, interfaceLocale, defaultOutputLocale: interfaceLocale }; setDraft(next); void onSave(next); }}>{SUPPORTED_LOCALES.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select><small>{t("Changes the whole interface and future learning output.")}</small></label>
        <label><span>{t("Default answer density")}</span><select value={draft.answerDensity} onChange={(event) => setDraft({ ...draft, answerDensity: event.target.value as AnswerDensity })}><option value="brief">{t("Brief")}</option><option value="balanced">{t("Balanced")}</option><option value="rich">{t("Rich")}</option></select><small>{t("Separate from how deeply WonderDrive researches.")}</small></label>
        <label><span>{t("Text size")}</span><select value={draft.textSize} onChange={(event) => setDraft({ ...draft, textSize: event.target.value as TextSize })}><option value="s">{t("Small")}</option><option value="m">{t("Medium")}</option><option value="l">{t("Large")}</option><option value="xl">{t("Extra large")}</option></select></label>
        <label><span>{t("Factual images")}</span><select value={draft.imagePreference} onChange={(event) => setDraft({ ...draft, imagePreference: event.target.value as ImagePreference })}><option value="avoid">{t("Avoid")}</option><option value="when-useful">{t("When useful")}</option><option value="prefer">{t("Prefer when supported")}</option></select><small>{t("Decorative imagery is never substituted for factual media.")}</small></label>
        <label><span>{t("Read-aloud speed: {rate}×", { rate: draft.speechRate.toFixed(1) })}</span><input type="range" min="0.6" max="1.6" step="0.1" value={draft.speechRate} onChange={(event) => setDraft({ ...draft, speechRate: Number(event.target.value) })} /></label>
        <label className="check-setting"><input type="checkbox" checked={draft.reduceMotion} onChange={(event) => setDraft({ ...draft, reduceMotion: event.target.checked })} /><span>{t("Reduce interface motion")}</span></label>
        <button className="launch-button" type="submit" disabled={busy}>{t(busy ? "Saving…" : "Save preferences")}<i aria-hidden="true">↘</i></button>
      </form>
      <section className="diagnostics-console" aria-labelledby="diagnostics-title">
        <header>
          <div>
            <p className="eyebrow"><span /> {t("Private diagnostics")}</p>
            <h2 id="diagnostics-title">{t("What failed, where, and when.")}</h2>
          </div>
          {viewer?.mode === "chatgpt" && (
            <button type="button" disabled={diagnosticsLoading} onClick={() => void refreshDiagnostics()}>
              {t(diagnosticsLoading ? "Checking…" : "Refresh incidents")}
            </button>
          )}
        </header>
        {viewer?.mode !== "chatgpt" ? (
          <p className="diagnostics-empty">{t("Sign in with ChatGPT to keep private, identity-scoped diagnostic history.")}</p>
        ) : diagnosticsError ? (
          <p className="diagnostics-empty" role="alert">{diagnosticsError}</p>
        ) : !diagnostics ? (
          <p className="diagnostics-empty">{t("Loading privacy-safe request health…")}</p>
        ) : (
          <>
            <div className="diagnostics-summary">
              <div><strong>{diagnostics.summary.requests24h}</strong><span>{t("requests · 24h")}</span></div>
              <div><strong>{diagnostics.summary.failures24h}</strong><span>{t("failures · 24h")}</span></div>
              <div><strong>{Math.round(diagnostics.summary.failureRate24h * 100)}%</strong><span>{t("failure rate")}</span></div>
              <div><strong>{diagnostics.retentionDays}d</strong><span>{t("retention")}</span></div>
            </div>
            {!!diagnostics.repeatedFailures.length && (
              <div className="diagnostics-alert" role="status">
                <strong>{t("Repeated failure detected")}</strong>
                {diagnostics.repeatedFailures.map((item) => (
                  <span key={item.errorCode}>{t("{code} happened {count} times in ten minutes.", { code: item.errorCode, count: item.count })}</span>
                ))}
              </div>
            )}
            <div className="incident-list">
              {diagnostics.incidents.length ? diagnostics.incidents.map((incident) => (
                <details key={incident.diagnosticId} className="incident-row">
                  <summary>
                    <code>{formatDiagnosticId(incident.diagnosticId)}</code>
                    <strong>{incident.errorCode}</strong>
                    <span>{incident.modelId}</span>
                    <time dateTime={new Date(incident.createdAt).toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(incident.createdAt)}</time>
                  </summary>
                  <dl>
                    <div><dt>{t("Stage")}</dt><dd>{incident.stage}</dd></div>
                    <div><dt>{t("Last provider event")}</dt><dd>{incident.lastProviderEventType}</dd></div>
                    <div><dt>{t("Parsed events")}</dt><dd>{incident.providerEventCount}</dd></div>
                    <div><dt>{t("Malformed events")}</dt><dd>{incident.malformedEventCount}</dd></div>
                    <div><dt>{t("Output deltas")}</dt><dd>{incident.outputDeltaCount}</dd></div>
                    <div><dt>{t("Provider done marker")}</dt><dd>{t(incident.sawProviderDone ? "seen" : "not seen")}</dd></div>
                    <div><dt>{t("Latency")}</dt><dd>{incident.latencyMs ? `${(incident.latencyMs / 1000).toFixed(1)}s` : t("unrecorded")}</dd></div>
                    <div><dt>{t("HTTP status")}</dt><dd>{incident.httpStatus ?? t("unrecorded")}</dd></div>
                    <div><dt>{t("OpenAI request")}</dt><dd>{incident.providerRequestId ?? t("unrecorded")}</dd></div>
                    <div><dt>{t("Preset")}</dt><dd>{incident.researchPreset}</dd></div>
                  </dl>
                  <p>{incident.errorMessage}</p>
                </details>
              )) : <p className="diagnostics-empty">{t("No failed research requests in the retained window.")}</p>}
            </div>
            <p className="diagnostics-privacy">{t("Prompts, answers, API keys, cookies, and source contents are never included.")}</p>
          </>
        )}
      </section>
    </section>
  );
}

function LoadingStage() {
  const { t } = useI18n();
  return <section className="loading-stage" aria-live="polite"><span className="loading-orbit" /><p>{t("Opening your WonderDrive library…")}</p><small>{t("Resolving a durable guest identity")}</small></section>;
}

function EmptyStage({ onOpenLibrary, label = "Open the journey library" }: { onOpenLibrary: () => void; label?: string }) {
  const { t } = useI18n();
  return <section className="empty-stage"><span aria-hidden="true">?</span><h1>{t("No journey is on stage.")}</h1><p>{t("Start a new question or return to one you have already saved.")}</p><button type="button" onClick={onOpenLibrary}>{t(label)} →</button></section>;
}

function upsertSummary(current: JourneySummary[], detail: JourneyDetail): JourneySummary[] {
  const summary: JourneySummary = {
    id: detail.id,
    title: detail.title,
    seed: detail.seed,
    performerId: detail.performerId,
    modelId: detail.modelId,
    researchPreset: detail.researchPreset,
    answerDensity: detail.answerDensity,
    imagePreference: detail.imagePreference,
    outputLocale: detail.outputLocale,
    currentTurnId: detail.currentTurnId,
    turnCount: detail.turnCount,
    sourceCount: detail.sourceCount,
    openBranchCount: detail.openBranchCount,
    version: detail.version,
    pinned: detail.pinned,
    hidden: detail.hidden,
    updatedAt: detail.updatedAt,
    topicLabels: detail.topicLabels,
  };
  return [summary, ...current.filter((journey) => journey.id !== summary.id)];
}

function formatDiagnosticId(value: string) {
  return `WD-${value.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

async function upgradeGuestLibrary(
  setViewer: Dispatch<SetStateAction<Viewer | null>>,
  refresh: () => Promise<void>,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  setError(null);
  try {
    const payload = await api<{ transferred: number }>("/api/session/upgrade", {
      method: "POST",
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
    });
    setViewer(payload.viewer);
    await refresh();
  } catch (cause) {
    setError(messageFrom(cause));
  }
}
