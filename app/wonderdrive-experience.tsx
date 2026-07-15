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
import {
  api,
  type LiveResearchState,
  messageFrom,
  starterRecommendationsUrl,
  streamLiveResearch,
} from "./client-api";

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
  }) {
    await runMutation("create", async () => {
      setView("journey");
      setLiveResearch({
        question: config.seed,
        performerId: config.performerId,
        message: "Connecting to live foreground research…",
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
          ? { ...current, status: "complete", result: complete.data, message: "Research committed" }
          : current,
      );
    }, (message) => {
      setLiveResearch((current) =>
        current ? { ...current, status: "error", error: message, message: "Research stopped" } : null,
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
        if (!fromTurn || !selected) throw new Error("Choose one of the two current paths.");
        setView("journey");
        setLiveResearch({
          question: selected.question,
          performerId: activeJourney.performerId,
          message: "Opening the next live research turn…",
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
            ? { ...current, status: "complete", result: complete.data, message: "Research committed" }
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
        current ? { ...current, status: "error", error: message, message: "Research stopped" } : null,
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
    <main className={`app-shell text-${preferences.textSize} ${preferences.reduceMotion ? "reduce-motion" : ""}`}>
      <header className="app-header">
        <button className="wordmark" type="button" onClick={() => navigate("start")}>
          <span className="wordmark-mark" aria-hidden="true">W</span>
          <span>
            WonderDrive
            <small>curiosity, performed</small>
          </span>
        </button>

        <nav className="app-nav" aria-label="WonderDrive views">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={view === item.id ? "active" : ""}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="identity-control">
          <span className={`identity-dot ${viewer?.mode ?? "loading"}`} aria-hidden="true" />
          {viewer?.mode === "chatgpt" ? (
            <span><strong>{viewer.displayName}</strong><small>ChatGPT account</small></span>
          ) : (
            <span><strong>{viewer?.displayName ?? "Opening library…"}</strong><small>{viewer ? `${journeys.length}/${viewer.journeyLimit} saved` : "durable session"}</small></span>
          )}
          {viewer?.mode === "guest" ? (
            <a className="identity-action" href="/signin-with-chatgpt?return_to=%2F">Sign in</a>
          ) : viewer?.mode === "chatgpt" ? (
            <a className="identity-action" href="/signout-with-chatgpt?return_to=%2F">Sign out</a>
          ) : null}
        </div>
      </header>

      {view !== "start" && (
        <div className="phase-ribbon" role="note">
          <span>Research first</span>
          Same selected model researches and performs · inspectable sources · durable branching graph
        </div>
      )}

      {viewer?.mode === "chatgpt" && viewer.hasGuestUpgrade && (
        <div className="upgrade-banner" role="status">
          <span>Your guest library is still separate.</span>
          <button type="button" onClick={() => void upgradeGuestLibrary(setViewer, refreshSession, setError)}>
            Move guest journeys into this account
          </button>
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => { setError(null); void refreshSession(); }}>Reconnect</button>
        </div>
      )}
      {notice && (
        <div className="notice-banner" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>Dismiss</button>
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
            });
          }}
        />
      ) : activeJourney && activeTurn ? (
        <div className="active-journey-shell">
          <nav className="journey-view-switcher" aria-label="Current journey views">
            <span>{activeJourney.title}</span>
            <label className="journey-model-switcher">
              <span>Next turn model</span>
              <select
                aria-label="Model for the next research turn"
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
              <button type="button" className={view === "journey" ? "active" : ""} aria-current={view === "journey" ? "page" : undefined} onClick={() => setView("journey")}>Stage</button>
              <button type="button" className={view === "map" ? "active" : ""} aria-current={view === "map" ? "page" : undefined} onClick={() => setView("map")}>Journey map</button>
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
          <p><span aria-hidden="true">W/V3</span> One performer. One researched turn. Exactly two ways forward.</p>
          <div>
            <a href="https://github.com/Mister-JP/WonderDrive">Source</a>
            <a href="https://github.com/Mister-JP/WonderDrive/blob/main/docs/WonderDrive_Final_Product_and_Engineering_Blueprint_v3_Research_First.docx">Product book</a>
          </div>
        </footer>
      )}
    </main>
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
  }) => void;
  creating: boolean;
  journeyCount: number;
  catalog: BootstrapCatalog;
  preferences: UserPreferences;
  starters: PersonalizedStarter[];
}) {
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
            <strong>{visibleStarters.length} rabbit holes</strong>
            <span>{startersLoading ? `Scanning what’s unfolding now…` : `Current signals + ${performer.name} + ${journeyCount ? "your history" : "wild-card domains"}`}</span>
          </div>
          <button type="button" className="refresh-starters" disabled={startersLoading} onClick={() => void refreshStarterQuestions()}>
            <span aria-hidden="true">↻</span>{startersLoading ? "Hunting…" : "Find new questions"}
          </button>
        </div>
        <div className="starter-marquee starter-marquee-simple" aria-label={`Questions suggested for ${performer.name}`}>
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

        <h1 id="start-title">What are you curious about?</h1>
        <div className="question-field-shell">
          <label className="question-input question-input-simple">
            <span className="sr-only">Starting question</span>
            <textarea
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              onKeyDown={completeQuestion}
              minLength={3}
              maxLength={280}
              rows={2}
              required
              aria-controls="question-autocomplete"
              placeholder={preferences.reduceMotion ? placeholderQuestions[0] ?? "Ask anything…" : animatedPlaceholder}
            />
            <small>{seed.length}/280</small>
          </label>
          <div className="question-autocomplete" id="question-autocomplete" aria-live="polite">
            {autocompleteMatch ? (
              <button type="button" onClick={() => setSeed(autocompleteMatch.question)}>
                <span>Tab to complete</span>{autocompleteMatch.question}
              </button>
            ) : exactMatch ? (
              <span><strong>Recommended match</strong>{exactMatch.topic}</span>
            ) : (
              <span className="question-autocomplete-idle">Start typing for recommendation matches</span>
            )}
          </div>
        </div>

        <div className="start-selectors">
          <label>
            <span>Performer</span>
            <span className="start-select-wrap">
              <span className="performer-mark" aria-hidden="true">{performer.mark}</span>
              <select value={performerId} onChange={(event) => void choosePerformer(event.target.value as PerformerId)}>
                {catalog.performers.map((item) => (
                  <option value={item.id} key={item.id}>{item.name} — {item.role}</option>
                ))}
              </select>
            </span>
          </label>
          <label>
            <span>Model</span>
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
          <span>{performer.name} will carry this question</span>
          <p>{performer.cue}</p>
          <small>{performer.voiceTraits.join(" · ")}</small>
        </div>

        <button className="launch-button launch-button-simple" type="submit" disabled={creating || seed.trim().length < 3}>
          <span>{creating ? "Researching in the foreground…" : "Begin the wonder"}</span>
          <i aria-hidden="true">→</i>
        </button>
        <p className="honesty-note">
          <span aria-hidden="true">◉</span>
          {model.disclosure} Input/output prices shown per 1M tokens; search is metered separately.
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
          <p className="eyebrow"><span /> Next turn · {performer.name}</p>
          <h1 id="buffering-title">{state.question}</h1>
        </div>
        <div className={`buffering-status ${state.status}`} role="status" aria-live="polite">
          <span className="buffering-dot" aria-hidden="true" />
          <strong>{state.status === "complete" ? "Answer ready" : state.status === "error" ? "Research stopped" : state.retryAttempt > 0 ? `Retrying ${state.retryAttempt} of ${state.maxRetries}` : "Buffering answer"}</strong>
          <small>{state.status === "running" ? state.message : state.status === "complete" ? "Placing the answer into this card" : "Nothing incomplete was saved"}</small>
        </div>
      </header>

      <article className="buffering-answer-card">
        <div className="buffering-byline">
          <span className={`performer-mark ${performer.accent}`}>{performer.mark}</span>
          <div><strong>{performer.name}</strong><small>researching in this foreground turn</small></div>
          <span className="buffering-ellipsis" aria-hidden="true"><i /><i /><i /></span>
        </div>

        {state.status === "error" ? (
          <div className="buffering-error" role="alert">
            <span aria-hidden="true">!</span>
            <div>
              <strong>This turn was not committed</strong>
              <p>{state.error}</p>
              {state.diagnosticId && <code>Diagnostic {formatDiagnosticId(state.diagnosticId)}</code>}
            </div>
            <button type="button" onClick={onBack}>Return safely →</button>
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
        <p>Choose the next direction</p>
        <h2>Where should curiosity go next?</h2>
        <div><span /><span /></div>
        <small>Two paths will appear here when the answer is ready.</small>
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
          aria-label={`Source ${sourceIndex + 1}: ${turn.sources[sourceIndex].title}`}
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
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  return (
    <section className="performance-stage article-journey-stage" aria-labelledby="performance-title">
      <header className="performance-header article-journey-header">
        <div>
          <p className="eyebrow"><span /> Turn {turn.depth + 1} · {performer.name}</p>
          <h1 id="performance-title">{turn.question}</h1>
        </div>
        <div className="stage-metrics">
          <span><strong>{journey.turnCount}</strong> turns</span>
          <span><strong>{journey.sourceCount}</strong> sources</span>
        </div>
      </header>

      {historical && (
        <div className="branch-notice" role="note">
          <span aria-hidden="true">⑂</span>
          <p><strong>You are revisiting an earlier turn.</strong> Choosing a path here creates a visible branch; your existing turns stay in the map.</p>
        </div>
      )}

      <article className={`contained-answer-card ${turn.media.length ? "has-media" : "without-media"}`}>
        <div className="contained-answer-topline">
          <div className="answer-byline compact-byline">
            <span className={`performer-mark ${performer.accent}`}>{performer.mark}</span>
            <div><strong>{performer.name}</strong><small>performed from live web research</small></div>
            <span className="ready-stamp">COMPOSED</span>
          </div>
          <div className="contained-answer-tools">
            <button type="button" onClick={toggleSpeech}>{speaking ? "Stop reading" : "Read aloud"}</button>
            <details className="answer-overflow">
              <summary aria-label="Save and export options">•••</summary>
              <div>
                <button type="button" disabled={busy !== null} onClick={onSnapshot}>Save snapshot</button>
                <a href={`/api/journeys/${journey.id}/export`}>Export JSON</a>
              </div>
            </details>
          </div>
        </div>

        <div className="contained-answer-content">
          <div className="contained-answer-summary">
            <p className="card-kicker">The answer</p>
            <h2>{turn.topicLabel}</h2>
            <div className="contained-answer-prose">
              {turn.answerBlocks.slice(0, 1).map((block, blockIndex) => (
                <p key={`${turn.id}-answer-${blockIndex}`}>{block.text} {citations(block.sourceIds)}</p>
              ))}
            </div>
            <div className="answer-tags" aria-label="Answer characteristics">
              <span>{turn.topicLabel}</span>
              <span>{turn.sources.length} checked sources</span>
              <span>live research</span>
            </div>
            <button ref={deepDiveTriggerRef} className="evidence-research-row" type="button" onClick={() => setDeepDiveOpen(true)}>
              <span><strong>Evidence &amp; research details</strong></span>
              <span className="deep-dive-cta">Deeper dive ↗</span>
            </button>
          </div>

          <AnswerVisual media={turn.media} />
        </div>
      </article>

      <section className="journey-directions" aria-labelledby="direction-title">
        <p className="panel-index">Choose the next direction</p>
        <h2 id="direction-title">Where should curiosity go next?</h2>
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
          <button type="button" disabled={!actionable || busy !== null} onClick={onDelegate}>✦ Let {performer.name.replace("The ", "")} choose</button>
          <button type="button" aria-expanded={redrawOpen} onClick={() => setRedrawOpen((open) => !open)}>Neither question works {redrawOpen ? "⌃" : "⌄"}</button>
        </div>
        {redrawOpen && (
          <div className="redraw-panel">
            <div className="redraw-modes" aria-label="Replacement question direction">
              <button type="button" className={adventure === 20 ? "active" : ""} onClick={() => setAdventure(20)}>Practical</button>
              <button type="button" className={adventure === 78 ? "active" : ""} onClick={() => setAdventure(78)}>Surprising</button>
              <button type="button" className={adventure === 50 ? "active" : ""} onClick={() => setAdventure(50)}>Different direction</button>
            </div>
            <label className="redraw-note"><span>Optional note</span><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={280} placeholder="What should change about the next two questions?" /></label>
            <button className="redraw-submit" type="button" disabled={!actionable || busy !== null} onClick={() => onReject(adventure, reason.trim() || undefined)}>{busy === "reject" ? "Replacing…" : "Generate two new questions"}</button>
          </div>
        )}
      </section>

      {deepDiveOpen && (
        <div className="deep-dive-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeepDiveOpen(false); }}>
          <section className="deep-dive-dialog" role="dialog" aria-modal="true" aria-labelledby="deep-dive-title">
            <header>
              <div><p>Deeper dive · Turn {turn.depth + 1}</p><h2 id="deep-dive-title">{turn.question}</h2></div>
              <button ref={deepDiveCloseRef} type="button" onClick={() => setDeepDiveOpen(false)} aria-label="Close deeper dive">×</button>
            </header>
            <div className="deep-dive-layout has-media">
              <div className="deep-dive-answer">
                {turn.answerBlocks.map((block, blockIndex) => <p key={`${turn.id}-deep-${blockIndex}`}>{block.text} {citations(block.sourceIds)}</p>)}
              </div>
              <aside className="deep-dive-evidence">
                <AnswerVisual media={turn.media} compact />
                <h3>Sources</h3>
                <ol>{turn.sources.map((source, index) => <li key={source.id}><span>{index + 1}</span><div><strong>{source.title}</strong><small>{source.publisher} · {source.relation}</small></div><a href={source.url} target="_blank" rel="noreferrer">Open ↗</a></li>)}</ol>
              </aside>
            </div>
            <div className="deep-dive-research">
              <div><span>Research summary</span><p>{turn.researchSummary}</p></div>
              <dl>
                <div><dt>Model</dt><dd>{turn.metadata.provider} · {turn.metadata.modelId}</dd></div>
                <div><dt>Research</dt><dd>{turn.metadata.researchPreset} · {turn.metadata.answerDensity}</dd></div>
                <div><dt>Prompt</dt><dd>{turn.metadata.promptVersion}</dd></div>
                <div><dt>Researched</dt><dd>{new Date(turn.metadata.researchedAt).toLocaleString()}</dd></div>
              </dl>
            </div>
            <footer><button type="button" onClick={() => setDeepDiveOpen(false)}>Close and continue</button></footer>
          </section>
        </div>
      )}
    </section>
  );
}

function AnswerVisual({
  media,
  compact = false,
}: {
  media: JourneyTurn["media"];
  compact?: boolean;
}) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const visible = media
    .filter((item) => !failedUrls.includes(item.imageUrl) && hasBalancedVisualNotes(item))
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
    <section className={`answer-gallery ${compact ? "compact-visual" : ""}`} aria-label="Visual evidence">
      <figure className="answer-gallery-selected">
        <div className="answer-gallery-image-stage">
          <a href={selected.sourcePageUrl} target="_blank" rel="noreferrer" aria-label={`${selected.title ?? selected.caption}. Open source.`}>
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
            <div className="answer-gallery-arrows" aria-label="Browse visual evidence">
              <button type="button" onClick={() => selectImage(activeIndex - 1)} aria-label="Previous image">
                <ArrowLeft aria-hidden="true" weight="bold" />
              </button>
              <span aria-live="polite">{activeIndex + 1} / {visible.length}</span>
              <button type="button" onClick={() => selectImage(activeIndex + 1)} aria-label="Next image">
                <ArrowRight aria-hidden="true" weight="bold" />
              </button>
            </div>
          )}
        </div>
        <figcaption><span>{selected.title ?? selected.caption}</span><a href={selected.sourcePageUrl} target="_blank" rel="noreferrer">Source ↗</a></figcaption>
      </figure>

      <aside className="answer-gallery-notes" aria-live="polite">
        <span className="answer-gallery-role">{roleLabel}</span>
        <h3>{selected.title ?? selected.caption}</h3>
        <div><strong>Why it is here</strong><p>{selected.whyIncluded ?? selected.caption}</p></div>
        <div><strong>What to notice</strong><ul>{noticeItems.map((item, index) => <li key={`${selected.imageUrl}-notice-${index}`}>{item}</li>)}</ul></div>
        <div><strong>What it helps explain</strong><p>{selected.learning ?? selected.caption}</p></div>
      </aside>

      <div className="answer-gallery-strip" aria-label="Select an image">
        {visible.map((item, index) => (
          <button
            ref={(node) => { thumbnailRefs.current[index] = node; }}
            type="button"
            className={index === activeIndex ? "selected" : ""}
            key={`${item.imageUrl}-${index}`}
            aria-label={`Show ${item.title ?? item.caption}`}
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

function hasBalancedVisualNotes(item: JourneyTurn["media"][number]) {
  const wordCount = (value: string) => value.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
  const whyCount = wordCount(item.whyIncluded ?? "");
  const learningCount = wordCount(item.learning ?? "");
  return whyCount >= 18
    && whyCount <= 26
    && learningCount >= 18
    && learningCount <= 26
    && item.whatToNotice?.length === 2
    && item.whatToNotice.every((notice) => {
      const count = wordCount(notice);
      return count >= 9 && count <= 15;
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
          <p className="eyebrow"><span /> Your journey</p>
          <h1 id="map-title">{journey.title}</h1>
          <p>Follow the path you took, revisit a turn, or open a question you left behind.</p>
        </div>
        <dl aria-label="Journey overview">
          <div><dt>Current</dt><dd>{activePath.length} of {journey.turnCount}</dd></div>
          <div><dt>Open paths</dt><dd>{journey.openBranchCount}</dd></div>
          <div><dt>Sources</dt><dd>{journey.sourceCount}</dd></div>
        </dl>
      </header>

      <section className="active-path" aria-labelledby="active-path-title">
        <div className="map-section-heading">
          <div><span>Active path</span><h2 id="active-path-title">How you got here</h2></div>
          <p>Choose any turn to see its two directions.</p>
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
                    {current ? "You are here" : "Explored"}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {selectedIsOffPath && (
        <div className="off-path-notice" role="status">
          <span>Earlier branch</span>
          <p>This turn is outside your current path. Exploring an open question here creates a new visible branch.</p>
        </div>
      )}

      <section className="selected-turn-paths" aria-labelledby="selected-paths-title">
        <div className="selected-turn-heading">
          <div>
            <span>Turn {turnNumber(activeTurn.id)} selected</span>
            <h2 id="selected-paths-title">Where could this turn go?</h2>
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
                <span>Option {option.position === 0 ? "A" : "B"} · open</span>
                <strong>{option.question}</strong>
                <small>Explore this question</small>
              </button>
            ) : (
              <div className={`selected-path-card ${option.state}`} key={option.id}>
                <span>Option {option.position === 0 ? "A" : "B"} · {option.state === "chosen" ? "path taken" : option.state}</span>
                <strong>{option.question}</strong>
                <small>{option.state === "chosen" ? "This answer continues in the map above." : "This direction is no longer active."}</small>
              </div>
            );
          })}
        </div>
        <button type="button" className="open-turn-answer" onClick={() => onContinue(activeTurn.id)}>
          {activeTurn.id === journey.currentTurnId ? "Open full answer" : "Revisit this answer"}
        </button>
      </section>

      {(otherOpenPaths.length > 0 || branchTurns.length > 0) && (
        <details className="other-paths">
          <summary>
            <span>Other paths</span>
            <strong>{otherOpenPaths.length} open question{otherOpenPaths.length === 1 ? "" : "s"}{branchTurns.length ? ` · ${branchTurns.length} earlier branch${branchTurns.length === 1 ? "" : "es"}` : ""}</strong>
          </summary>
          <div className="other-path-groups">
            {branchTurns.map((turn) => (
              <button type="button" className="other-branch-turn" key={turn.id} onClick={() => onSelect(turn.id)}>
                <span>Earlier branch · turn {turnNumber(turn.id)}</span>
                <strong>{turn.question}</strong>
              </button>
            ))}
            {otherOpenPaths.map(({ option, turn }) => (
              <button type="button" className="other-open-path" key={option.id} onClick={() => onChoose(turn.id, option.id)}>
                <span>Open from turn {turnNumber(turn.id)} · {turn.topicLabel}</span>
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
        <div><p className="eyebrow"><span /> Durable library / D1</p><h1 id="library-title">Questions worth<br /><em>returning to.</em></h1></div>
        <div><p>{journeys.length} of {viewer?.journeyLimit ?? "—"} journeys saved</p><button type="button" className="compact-action" onClick={onNew}>New drive +</button></div>
      </header>
      <div className="library-filters" aria-label="Library filters">
        <label><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, question, or topic" /></label>
        <label><span>Performer</span><select value={performerFilter} onChange={(event) => setPerformerFilter(event.target.value as PerformerId | "all")}><option value="all">All performers</option>{PERFORMERS.map((performer) => <option value={performer.id} key={performer.id}>{performer.name}</option>)}</select></label>
        <label className="check-setting"><input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} /><span>Show hidden</span></label>
      </div>
      {journeys.length ? (
        <div className="library-grid">
          {visibleJourneys.map((journey, index) => {
            const performer = PERFORMERS.find((item) => item.id === journey.performerId)!;
            return (
              <article key={journey.id} className="library-card">
                <div className="library-card-top"><span>{journey.pinned ? "PINNED" : String(index + 1).padStart(2, "0")}</span><i className={performer.accent}>{performer.mark}</i></div>
                <p>{journey.topicLabels.join(" · ") || "unclassified journey"}</p>
                <h2>{journey.title}</h2>
                <dl><div><dt>Turns</dt><dd>{journey.turnCount}</dd></div><div><dt>Sources</dt><dd>{journey.sourceCount}</dd></div><div><dt>Open</dt><dd>{journey.openBranchCount}</dd></div></dl>
                <div className="library-actions">
                  <button type="button" disabled={busy !== null} onClick={() => onOpen(journey.id)}>Resume <span>↗</span></button>
                  {confirmDelete === journey.id ? (
                    <span className="delete-confirm"><button type="button" disabled={busy !== null} onClick={() => onDelete(journey.id)}>Delete</button><button type="button" onClick={() => setConfirmDelete(null)}>Keep</button></span>
                  ) : (
                    <button type="button" className="text-button" onClick={() => setConfirmDelete(journey.id)}>Remove</button>
                  )}
                </div>
                <div className="library-manage">
                  <button type="button" onClick={() => { const title = window.prompt("Rename this journey", journey.title); if (title) onManage(journey.id, { title }); }}>Rename</button>
                  <button type="button" onClick={() => onManage(journey.id, { pinned: !journey.pinned })}>{journey.pinned ? "Unpin" : "Pin"}</button>
                  <button type="button" onClick={() => onManage(journey.id, { hidden: !journey.hidden })}>{journey.hidden ? "Unhide" : "Hide"}</button>
                  <button type="button" onClick={() => onSnapshot(journey.id)}>Snapshot</button>
                  <a href={`/api/journeys/${journey.id}/export`}>Export</a>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyStage onOpenLibrary={onNew} label="Start the first saved journey" />
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
  return (
    <section className="compare-view" aria-labelledby="compare-title">
      <header className="view-heading">
        <div><p className="eyebrow"><span /> Manual comparison / no provider call</p><h1 id="compare-title">Two journeys.<br /><em>One closer look.</em></h1></div>
        <div><p>Select two saved journeys. WonderDrive compares their committed paths, topics, and performers.</p></div>
      </header>
      {journeys.length >= 2 ? (
        <>
          <div className="compare-picker">
            {journeys.map((journey, index) => {
              const chosen = selected.includes(journey.id);
              return (
                <button type="button" key={journey.id} className={chosen ? "selected" : ""} aria-pressed={chosen} onClick={() => onToggle(journey.id)}>
                  <span>{String(index + 1).padStart(2, "0")}</span><strong>{journey.title}</strong><small>{journey.turnCount} turns · {journey.topicLabels.join(", ")}</small><i>{chosen ? "✓" : "+"}</i>
                </button>
              );
            })}
          </div>
          <button className="compare-action" type="button" disabled={selected.length !== 2 || busy} onClick={onCompare}>{busy ? "Reading the paths…" : "Compare selected journeys"} <span>↘</span></button>
          {comparison && <ComparisonReport result={comparison} />}
        </>
      ) : (
        <div className="compare-empty"><p>Comparison begins after two journeys exist.</p><button type="button" onClick={onNew}>Start another drive →</button></div>
      )}
    </section>
  );
}

function ComparisonReport({ result }: { result: CompareResult }) {
  return (
    <section className="comparison-report" aria-labelledby="report-title">
      <div className="report-title"><span>Comparison ready</span><h2 id="report-title">The useful difference</h2></div>
      <div className="compare-columns">
        {[result.left, result.right].map((journey, index) => (
          <article key={journey.id}>
            <span>Path {index === 0 ? "A" : "B"}</span><h3>{journey.title}</h3>
            <p>{journey.performerName} · {journey.modelName} · {journey.researchPreset}</p>
            <p>{journey.turnCount} turns · {journey.sourceCount} source appearances · {journey.openBranchCount} open branches · ${journey.totalEstimatedCostUsd.toFixed(4)}</p>
            <p>{journey.actionCount} decisions ({journey.rejectedCount} redraws, {journey.delegatedCount} delegated)</p>
            <ol>{journey.timeline.map((turn) => <li key={turn.turnId}><strong>{turn.question}</strong><small>{turn.topicLabel} · {new Date(turn.researchedAt).toLocaleDateString()}</small></li>)}</ol>
            <div>{journey.topicLabels.map((topic) => <small key={topic}>{topic}</small>)}</div>
          </article>
        ))}
      </div>
      <div className="observations"><span>What the saved data shows</span><ul>{result.observations.map((observation) => <li key={observation}>{observation}</li>)}</ul></div>
      {!!result.confounders.length && <div className="confounders"><span>Comparison cautions</span><ul>{result.confounders.map((item) => <li key={item}>{item}</li>)}</ul></div>}
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
        <div><p className="eyebrow"><span /> Audience controls</p><h1 id="settings-title">Make the stage<br /><em>comfortable.</em></h1></div>
        <div><p>{viewer?.mode === "chatgpt" ? "Synced to your ChatGPT identity" : "Saved to this guest session"}</p><span>These preferences change presentation and future turns, never evidence.</span></div>
      </header>
      <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}>
        <label><span>Default answer density</span><select value={draft.answerDensity} onChange={(event) => setDraft({ ...draft, answerDensity: event.target.value as AnswerDensity })}><option value="brief">Brief</option><option value="balanced">Balanced</option><option value="rich">Rich</option></select><small>Separate from how deeply WonderDrive researches.</small></label>
        <label><span>Text size</span><select value={draft.textSize} onChange={(event) => setDraft({ ...draft, textSize: event.target.value as TextSize })}><option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option><option value="xl">Extra large</option></select></label>
        <label><span>Factual images</span><select value={draft.imagePreference} onChange={(event) => setDraft({ ...draft, imagePreference: event.target.value as ImagePreference })}><option value="avoid">Avoid</option><option value="when-useful">When useful</option><option value="prefer">Prefer when supported</option></select><small>Decorative imagery is never substituted for factual media.</small></label>
        <label><span>Read-aloud speed: {draft.speechRate.toFixed(1)}×</span><input type="range" min="0.6" max="1.6" step="0.1" value={draft.speechRate} onChange={(event) => setDraft({ ...draft, speechRate: Number(event.target.value) })} /></label>
        <label className="check-setting"><input type="checkbox" checked={draft.reduceMotion} onChange={(event) => setDraft({ ...draft, reduceMotion: event.target.checked })} /><span>Reduce interface motion</span></label>
        <button className="launch-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save preferences"}<i aria-hidden="true">↘</i></button>
      </form>
      <section className="diagnostics-console" aria-labelledby="diagnostics-title">
        <header>
          <div>
            <p className="eyebrow"><span /> Private diagnostics</p>
            <h2 id="diagnostics-title">What failed, where, and when.</h2>
          </div>
          {viewer?.mode === "chatgpt" && (
            <button type="button" disabled={diagnosticsLoading} onClick={() => void refreshDiagnostics()}>
              {diagnosticsLoading ? "Checking…" : "Refresh incidents"}
            </button>
          )}
        </header>
        {viewer?.mode !== "chatgpt" ? (
          <p className="diagnostics-empty">Sign in with ChatGPT to keep private, identity-scoped diagnostic history.</p>
        ) : diagnosticsError ? (
          <p className="diagnostics-empty" role="alert">{diagnosticsError}</p>
        ) : !diagnostics ? (
          <p className="diagnostics-empty">Loading privacy-safe request health…</p>
        ) : (
          <>
            <div className="diagnostics-summary">
              <div><strong>{diagnostics.summary.requests24h}</strong><span>requests · 24h</span></div>
              <div><strong>{diagnostics.summary.failures24h}</strong><span>failures · 24h</span></div>
              <div><strong>{Math.round(diagnostics.summary.failureRate24h * 100)}%</strong><span>failure rate</span></div>
              <div><strong>{diagnostics.retentionDays}d</strong><span>retention</span></div>
            </div>
            {!!diagnostics.repeatedFailures.length && (
              <div className="diagnostics-alert" role="status">
                <strong>Repeated failure detected</strong>
                {diagnostics.repeatedFailures.map((item) => (
                  <span key={item.errorCode}>{item.errorCode} happened {item.count} times in ten minutes.</span>
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
                    <time dateTime={new Date(incident.createdAt).toISOString()}>{new Date(incident.createdAt).toLocaleString()}</time>
                  </summary>
                  <dl>
                    <div><dt>Stage</dt><dd>{incident.stage}</dd></div>
                    <div><dt>Last provider event</dt><dd>{incident.lastProviderEventType}</dd></div>
                    <div><dt>Parsed events</dt><dd>{incident.providerEventCount}</dd></div>
                    <div><dt>Malformed events</dt><dd>{incident.malformedEventCount}</dd></div>
                    <div><dt>Output deltas</dt><dd>{incident.outputDeltaCount}</dd></div>
                    <div><dt>Provider done marker</dt><dd>{incident.sawProviderDone ? "seen" : "not seen"}</dd></div>
                    <div><dt>Latency</dt><dd>{incident.latencyMs ? `${(incident.latencyMs / 1000).toFixed(1)}s` : "unrecorded"}</dd></div>
                    <div><dt>HTTP status</dt><dd>{incident.httpStatus ?? "unrecorded"}</dd></div>
                    <div><dt>OpenAI request</dt><dd>{incident.providerRequestId ?? "unrecorded"}</dd></div>
                    <div><dt>Preset</dt><dd>{incident.researchPreset}</dd></div>
                  </dl>
                  <p>{incident.errorMessage}</p>
                </details>
              )) : <p className="diagnostics-empty">No failed research requests in the retained window.</p>}
            </div>
            <p className="diagnostics-privacy">Prompts, answers, API keys, cookies, and source contents are never included.</p>
          </>
        )}
      </section>
    </section>
  );
}

function LoadingStage() {
  return <section className="loading-stage" aria-live="polite"><span className="loading-orbit" /><p>Opening your WonderDrive library…</p><small>Resolving a durable guest identity</small></section>;
}

function EmptyStage({ onOpenLibrary, label = "Open the journey library" }: { onOpenLibrary: () => void; label?: string }) {
  return <section className="empty-stage"><span aria-hidden="true">?</span><h1>No journey is on stage.</h1><p>Start a new question or return to one you have already saved.</p><button type="button" onClick={onOpenLibrary}>{label} →</button></section>;
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
