"use client";

import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BOOTSTRAP_CATALOG,
  DEFAULT_PREFERENCES,
  PERFORMERS,
  PRESET_LABELS,
  STARTERS,
} from "../lib/catalog";
import type {
  AdvanceJourneyRequest,
  AnswerDensity,
  ApiFailure,
  ApiSuccess,
  BootstrapCatalog,
  CompareResult,
  ImagePreference,
  JourneyDetail,
  JourneySnapshot,
  JourneySummary,
  JourneyTurn,
  Interlude,
  LiveResearchRequest,
  LiveResearchStreamEvent,
  ModelId,
  PerformerId,
  ResearchEvent,
  ResearchPreset,
  TextSize,
  UserPreferences,
  Viewer,
} from "../lib/contracts";

type View = "start" | "journey" | "map" | "library" | "compare" | "settings";

type SessionPayload = {
  journeys: JourneySummary[];
};

type BootstrapPayload = {
  catalog: BootstrapCatalog;
  preferences: UserPreferences;
};

type LiveResearchState = {
  question: string;
  message: string;
  events: ResearchEvent[];
  status: "running" | "complete" | "error";
  result: JourneyDetail | null;
  interlude: Omit<Interlude, "id"> | null;
  error: string | null;
};

const navItems: Array<{ id: View; label: string }> = [
  { id: "start", label: "New drive" },
  { id: "journey", label: "Stage" },
  { id: "map", label: "Journey map" },
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
  const [replaying, setReplaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutation, setMutation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<CompareResult | null>(null);
  const [liveResearch, setLiveResearch] = useState<LiveResearchState | null>(null);
  const [catalog, setCatalog] = useState<BootstrapCatalog>(BOOTSTRAP_CATALOG);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);

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
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // The first client effect hydrates the durable server session; updates happen after fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSession();
  }, [refreshSession]);

  const openJourney = useCallback(async (journeyId: string, targetView: View = "journey") => {
    setMutation(`open-${journeyId}`);
    setError(null);
    try {
      const payload = await api<JourneyDetail>(`/api/journeys/${journeyId}`);
      setViewer(payload.viewer);
      setActiveJourney(payload.data);
      setActiveTurnId(payload.data.currentTurnId);
      setReplaying(false);
      setView(targetView);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setMutation(null);
    }
  }, []);

  async function create(config: {
    seed: string;
    performerId: PerformerId;
    modelId: ModelId;
    researchPreset: ResearchPreset;
    answerDensity: AnswerDensity;
    imagePreference: ImagePreference;
  }) {
    setMutation("create");
    setError(null);
    try {
      if (config.modelId === "gpt-5.6-luna") {
        setView("journey");
        setLiveResearch({
          question: config.seed,
          message: "Connecting to live foreground research…",
          events: [],
          status: "running",
          result: null,
          interlude: null,
          error: null,
        });
        const complete = await streamLiveResearch(
          {
            kind: "create",
            ...config,
            modelId: "gpt-5.6-luna",
            idempotencyKey: crypto.randomUUID(),
          },
          setLiveResearch,
        );
        setViewer(complete.viewer);
        setActiveJourney(complete.data);
        setActiveTurnId(complete.data.currentTurnId);
        setJourneys((current) => upsertSummary(current, complete.data));
        setLiveResearch((current) =>
          current
            ? { ...current, status: "complete", result: complete.data, message: "Research committed" }
            : current,
        );
        setReplaying(false);
        return;
      }
      const payload = await api<JourneyDetail>("/api/journeys", {
        method: "POST",
        body: JSON.stringify({
          ...config,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setViewer(payload.viewer);
      setActiveJourney(payload.data);
      setActiveTurnId(payload.data.currentTurnId);
      setJourneys((current) => upsertSummary(current, payload.data));
      setView("journey");
      setReplaying(true);
    } catch (cause) {
      const message = messageFrom(cause);
      setError(message);
      setLiveResearch((current) =>
        current ? { ...current, status: "error", error: message, message: "Research stopped" } : null,
      );
    } finally {
      setMutation(null);
    }
  }

  async function advance(
    action: AdvanceJourneyRequest["action"],
    input: { turnId: string; optionId?: string; adventure?: number; reason?: string },
  ) {
    if (!activeJourney) return;
    setMutation(action);
    setError(null);
    try {
      if (activeJourney.modelId === "gpt-5.6-luna" && action !== "reject") {
        const fromTurn = activeJourney.turns.find((turn) => turn.id === input.turnId);
        const selected =
          action === "delegate"
            ? fromTurn?.options.find((option) => option.position === fromTurn.preferredPosition)
            : fromTurn?.options.find((option) => option.id === input.optionId);
        if (!fromTurn || !selected) throw new Error("Choose one of the two current paths.");
        setView("journey");
        setLiveResearch({
          question: selected.question,
          message: "Opening the next live research turn…",
          events: [],
          status: "running",
          result: null,
          interlude: null,
          error: null,
        });
        const complete = await streamLiveResearch(
          {
            kind: "advance",
            journeyId: activeJourney.id,
            fromTurnId: input.turnId,
            action,
            optionId: input.optionId,
            expectedVersion: activeJourney.version,
            idempotencyKey: crypto.randomUUID(),
          },
          setLiveResearch,
        );
        setViewer(complete.viewer);
        setActiveJourney(complete.data);
        setActiveTurnId(complete.data.currentTurnId);
        setJourneys((current) => upsertSummary(current, complete.data));
        setLiveResearch((current) =>
          current
            ? { ...current, status: "complete", result: complete.data, message: "Research committed" }
            : current,
        );
        setReplaying(false);
        return;
      }
      const payload = await api<JourneyDetail>(
        `/api/journeys/${activeJourney.id}/advance`,
        {
          method: "POST",
          body: JSON.stringify({
            fromTurnId: input.turnId,
            action,
            optionId: input.optionId,
            adventure: input.adventure,
            reason: input.reason,
            expectedVersion: activeJourney.version,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      setViewer(payload.viewer);
      setActiveJourney(payload.data);
      setJourneys((current) => upsertSummary(current, payload.data));
      if (action === "reject") {
        setActiveTurnId(input.turnId);
      } else {
        setActiveTurnId(payload.data.currentTurnId);
        setReplaying(true);
      }
      setView("journey");
    } catch (cause) {
      const message = messageFrom(cause);
      setError(message);
      setLiveResearch((current) =>
        current ? { ...current, status: "error", error: message, message: "Research stopped" } : null,
      );
      if (message.toLowerCase().includes("another tab")) void openJourney(activeJourney.id);
    } finally {
      setMutation(null);
    }
  }

  async function removeJourney(journeyId: string) {
    setMutation(`delete-${journeyId}`);
    setError(null);
    try {
      await api<{ id: string }>(`/api/journeys/${journeyId}`, { method: "DELETE" });
      setJourneys((current) => current.filter((journey) => journey.id !== journeyId));
      setCompareIds((current) => current.filter((id) => id !== journeyId));
      if (activeJourney?.id === journeyId) {
        setActiveJourney(null);
        setActiveTurnId(null);
        setView("library");
      }
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setMutation(null);
    }
  }

  async function manageJourney(journeyId: string, changes: { title?: string; pinned?: boolean; hidden?: boolean }) {
    setMutation(`manage-${journeyId}`);
    setError(null);
    try {
      const payload = await api<JourneyDetail>(`/api/journeys/${journeyId}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      setViewer(payload.viewer);
      setJourneys((current) => upsertSummary(current, payload.data));
      if (activeJourney?.id === journeyId) setActiveJourney(payload.data);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setMutation(null);
    }
  }

  async function snapshotJourney(journeyId: string) {
    setMutation(`snapshot-${journeyId}`);
    setError(null);
    try {
      const payload = await api<JourneySnapshot>(`/api/journeys/${journeyId}/snapshots`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setNotice(`${payload.data.label}: ${payload.data.summary}`);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setMutation(null);
    }
  }

  async function compare() {
    if (compareIds.length !== 2) return;
    setMutation("compare");
    setError(null);
    try {
      const params = new URLSearchParams({ left: compareIds[0], right: compareIds[1] });
      const payload = await api<CompareResult>(`/api/compare?${params}`);
      setComparison(payload.data);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setMutation(null);
    }
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
          {viewer?.mode === "guest" && (
            <a href="/signin-with-chatgpt?return_to=%2F">Sign in</a>
          )}
        </div>
      </header>

      <div className="phase-ribbon" role="note">
        <span>Research first</span>
        Same selected model researches and performs · inspectable sources · durable branching graph
      </div>

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
        <LiveResearchStage
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
            setMutation("preferences");
            setError(null);
            try {
              const payload = await api<UserPreferences>("/api/preferences", {
                method: "PUT",
                body: JSON.stringify(next),
              });
              setViewer(payload.viewer);
              setPreferences(payload.data);
            } catch (cause) {
              setError(messageFrom(cause));
            } finally {
              setMutation(null);
            }
          }}
        />
      ) : activeJourney && activeTurn ? (
        view === "map" ? (
          <JourneyMap
            journey={activeJourney}
            activeTurnId={activeTurn.id}
            onSelect={(turnId) => {
              setActiveTurnId(turnId);
              setReplaying(false);
            }}
            onContinue={(turnId) => {
              setActiveTurnId(turnId);
              setReplaying(false);
              setView("journey");
            }}
            onChoose={(turnId, optionId) => void advance("choose", { turnId, optionId })}
          />
        ) : replaying ? (
          <ResearchReplay turn={activeTurn} onComplete={() => setReplaying(false)} />
        ) : (
          <PerformanceStage
            journey={activeJourney}
            turn={activeTurn}
            busy={mutation}
            onChoose={(optionId) => void advance("choose", { turnId: activeTurn.id, optionId })}
            onReject={(adventure, reason) => void advance("reject", { turnId: activeTurn.id, adventure, reason })}
            onDelegate={() => void advance("delegate", { turnId: activeTurn.id })}
            onMap={() => setView("map")}
            speechRate={preferences.speechRate}
            onSnapshot={() => void snapshotJourney(activeJourney.id)}
          />
        )
      ) : (
        <EmptyStage onOpenLibrary={() => setView("library")} />
      )}

      <footer className="app-footer">
        <p><span aria-hidden="true">W/V3</span> One performer. One researched turn. Exactly two ways forward.</p>
        <div>
          <a href="https://github.com/Mister-JP/WonderDrive">Source</a>
          <a href="https://github.com/Mister-JP/WonderDrive/blob/main/docs/WonderDrive_Final_Product_and_Engineering_Blueprint_v3_Research_First.docx">Product book</a>
        </div>
      </footer>
    </main>
  );
}

function StartStage({
  onCreate,
  creating,
  journeyCount,
  catalog,
  preferences,
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
}) {
  const [seed, setSeed] = useState<string>(STARTERS.sage[0]);
  const [performerId, setPerformerId] = useState<PerformerId>("sage");
  const [modelId, setModelId] = useState<ModelId>("gpt-5.6-luna");
  const [preset, setPreset] = useState<ResearchPreset>("standard");
  const [density, setDensity] = useState<AnswerDensity>(preferences.answerDensity);
  const [imagePreference, setImagePreference] = useState<ImagePreference>(preferences.imagePreference);
  const [performerDetails, setPerformerDetails] = useState(false);
  const performer = catalog.performers.find((item) => item.id === performerId)!;
  const model = catalog.models.find((item) => item.id === modelId)!;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (seed.trim().length >= 3) {
      onCreate({
        seed,
        performerId,
        modelId,
        researchPreset: preset,
        answerDensity: density,
        imagePreference,
      });
    }
  }

  return (
    <section className="start-stage" aria-labelledby="start-title">
      <div className="start-intro">
        <p className="eyebrow"><span /> Live research performance</p>
        <h1 id="start-title">Give curiosity<br /><em>a direction.</em></h1>
        <p className="lede">
          Bring one honest question. Choose who will carry it. WonderDrive will
          research the open web, perform a sourced answer, and return exactly two
          next questions to you.
        </p>
        <div className="contract-strip" aria-label="V3 product contract">
          <span><strong>01</strong> saved to D1</span>
          <span><strong>02</strong> inspectable sources</span>
          <span><strong>03</strong> user-directed path</span>
        </div>
      </div>

      <form className="drive-console" onSubmit={submit}>
        <div className="console-heading">
          <span>New journey / {String(journeyCount + 1).padStart(2, "0")}</span>
          <span className="console-status"><i /> ready for a question</span>
        </div>

        <fieldset className="performer-fieldset">
          <legend><span>1</span> Choose a performer</legend>
          <div className="performer-grid">
            {catalog.performers.map((item) => (
              <label key={item.id} className={`performer-card ${item.id === performerId ? "selected" : ""} ${item.accent}`}>
                <input
                  type="radio"
                  name="performer"
                  value={item.id}
                  checked={item.id === performerId}
                  onChange={() => setPerformerId(item.id)}
                />
                <span className="performer-mark" aria-hidden="true">{item.mark}</span>
                <span><strong>{item.name}</strong><small>{item.role}</small></span>
                <i aria-hidden="true">↗</i>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="selected-cue">
          <span>{performer.name}’s stage note</span>
          <p>“{performer.cue}”</p>
          <button type="button" className="text-button" onClick={() => setPerformerDetails((open) => !open)}>
            {performerDetails ? "Hide performer contract" : "View performer contract"}
          </button>
          {performerDetails && (
            <div className="performer-contract">
              <p><strong>Sample opening</strong> “{performer.sampleOpening}”</p>
              <p><strong>Values</strong> {performer.values.join(" · ")}</p>
              <p><strong>Voice</strong> {performer.voiceTraits.join(" · ")}</p>
              <p><strong>Avoids</strong> {performer.avoids.join(" · ")}</p>
              <p><strong>Research posture</strong> {performer.toolPosture}</p>
              <small>{performer.version}</small>
            </div>
          )}
        </div>

        <fieldset>
          <legend><span>2</span> Set the research</legend>
          <div className="config-row">
            <div className="model-selector" aria-label="Research model">
              {catalog.models.map((item) => (
                <button
                  type="button"
                  className={`model-ticket ${modelId === item.id ? "selected" : ""}`}
                  key={item.id}
                  aria-pressed={modelId === item.id}
                  onClick={() => setModelId(item.id)}
                >
                  <span className="ticket-logo">{item.mode === "live" ? "LIVE" : "DEMO"}</span>
                  <span>
                    <strong>{item.name}{item.recommended ? " · recommended" : ""}</strong>
                    <small>{item.provider} · {item.speedBand} · {item.costBand} · {item.tools.join(", ")}</small>
                    <small>{item.disclosure}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="preset-tabs" aria-label="Research depth">
              {(Object.keys(PRESET_LABELS) as ResearchPreset[]).map((id) => (
                <button
                  type="button"
                  key={id}
                  className={preset === id ? "active" : ""}
                  aria-pressed={preset === id}
                  title={PRESET_LABELS[id].description}
                  onClick={() => setPreset(id)}
                >
                  {PRESET_LABELS[id].name}
                </button>
              ))}
            </div>
          </div>
          <div className="choice-settings">
            <label>
              <span>Answer density</span>
              <select value={density} onChange={(event) => setDensity(event.target.value as AnswerDensity)}>
                <option value="brief">Brief</option>
                <option value="balanced">Balanced</option>
                <option value="rich">Rich</option>
              </select>
            </label>
            <label>
              <span>Factual images</span>
              <select value={imagePreference} onChange={(event) => setImagePreference(event.target.value as ImagePreference)}>
                <option value="avoid">Avoid</option>
                <option value="when-useful">When useful</option>
                <option value="prefer">Prefer when supported</option>
              </select>
            </label>
          </div>
          <p className="preset-description">
            <strong>{PRESET_LABELS[preset].name}</strong> — {PRESET_LABELS[preset].description} {PRESET_LABELS[preset].sourceRange}; {PRESET_LABELS[preset].waitBand}; {PRESET_LABELS[preset].costBand}.
          </p>
        </fieldset>

        <fieldset>
          <legend><span>3</span> Bring a question</legend>
          <div className="starter-chips" aria-label="Question starters">
            {catalog.starters[performerId].map((question) => (
              <button type="button" key={question} onClick={() => setSeed(question)}>
                {question}
              </button>
            ))}
          </div>
          <label className="question-input">
            <span className="sr-only">Starting question</span>
            <textarea
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              minLength={3}
              maxLength={280}
              rows={3}
              required
              placeholder="What are you curious about?"
            />
            <small>{seed.length}/280</small>
          </label>
        </fieldset>

        <button className="launch-button" type="submit" disabled={creating || seed.trim().length < 3}>
          <span>{creating ? "Researching in the foreground…" : model.mode === "live" ? "Begin live research" : "Begin the free demo"}</span>
          <i aria-hidden="true">↘</i>
        </button>
        <p className="honesty-note">
          <span aria-hidden="true">◉</span>
          {model.mode === "live"
            ? "Live mode uses metered OpenAI tokens and web search. Keep this page open; no work continues in the background."
            : "The free demo uses reviewed fixtures and makes no provider request."}
        </p>
      </form>
    </section>
  );
}

function LiveResearchStage({
  state,
  onComplete,
  onBack,
}: {
  state: LiveResearchState;
  onComplete: () => void;
  onBack: () => void;
}) {
  const resultTurn = state.result?.turns.find(
    (turn) => turn.id === state.result?.currentTurnId,
  );
  const interlude = resultTurn?.interlude ?? state.interlude;
  return (
    <section className="research-stage" aria-labelledby="live-research-title">
      <div className="research-topline">
        <p><span className="live-dot" /> Research Trail / live foreground run</p>
        {state.status === "complete" ? (
          <button type="button" onClick={onComplete}>Open performance <span>→</span></button>
        ) : state.status === "error" ? (
          <button type="button" onClick={onBack}>Return safely <span>→</span></button>
        ) : (
          <span className="foreground-note">Keep this page open</span>
        )}
      </div>
      <div className="research-question">
        <span>{state.message}</span>
        <h1 id="live-research-title">{state.question}</h1>
      </div>
      <div className="research-layout">
        <ol className="research-feed" aria-live="polite">
          {state.events.length ? (
            state.events.map((event) => (
              <li key={event.id} className="visible">
                <span>{String(event.sequence + 1).padStart(2, "0")}</span>
                <i className={`event-icon ${event.kind}`} aria-hidden="true" />
                <div><small>{event.kind}</small><p>{event.label}</p></div>
                <strong aria-label="complete">✓</strong>
              </li>
            ))
          ) : (
            <li className="visible">
              <span>01</span>
              <i className="event-icon status" aria-hidden="true" />
              <div><small>status</small><p>Reserving one foreground run—no background job is created…</p></div>
            </li>
          )}
          {state.status === "error" && (
            <li className="research-error visible">
              <span>!</span>
              <i className="event-icon check" aria-hidden="true" />
              <div><small>not committed</small><p>{state.error}</p></div>
            </li>
          )}
        </ol>
        {interlude ? (
          <aside className="interlude-card revealed">
            <span>Curiosity interlude / sourced fact</span>
            <blockquote>“{interlude.text}”</blockquote>
            <a href={interlude.sourceUrl} target="_blank" rel="noreferrer">
              {interlude.sourceTitle} ↗
            </a>
          </aside>
        ) : (
          <aside className="interlude-card research-holding-card">
            <span>Evidence is arriving</span>
            <blockquote>Sources and one thought-provoking fact will appear here after validation.</blockquote>
            <small>WonderDrive shows activity and evidence—not private chain-of-thought.</small>
          </aside>
        )}
      </div>
      <div className="research-status-line" role="status">
        <span className={state.status} />
        {state.status === "running" ? "Research is active in this foreground request." : state.status === "complete" ? "Validated and committed." : "Stopped without committing an incomplete turn."}
      </div>
      <p className="fixture-disclosure">
        Live mode makes a metered OpenAI Responses request with web search. A turn is saved only after its source links, answer blocks, and exactly two paths pass validation.
      </p>
    </section>
  );
}

function ResearchReplay({ turn, onComplete }: { turn: JourneyTurn; onComplete: () => void }) {
  const [visible, setVisible] = useState(1);
  const total = turn.researchEvents.length;

  useEffect(() => {
    if (visible >= total) return;
    const timer = window.setTimeout(() => setVisible((value) => value + 1), 620);
    return () => window.clearTimeout(timer);
  }, [visible, total]);

  const complete = visible >= total;

  return (
    <section className="research-stage" aria-labelledby="research-title">
      <div className="research-topline">
        <p><span className="live-dot" /> Research Trail / {turn.research.mode === "live" ? "saved live activity" : "fixture replay"}</p>
        <button type="button" onClick={onComplete}>{complete ? "Open performance" : "Skip replay"} <span>→</span></button>
      </div>
      <div className="research-question">
        <span>Rehearsing question</span>
        <h1 id="research-title">{turn.question}</h1>
      </div>
      <div className="research-layout">
        <ol className="research-feed" aria-live="polite">
          {turn.researchEvents.map((event, index) => (
            <li key={event.id} className={index < visible ? "visible" : "waiting"}>
              <span>{String(event.sequence + 1).padStart(2, "0")}</span>
              <i className={`event-icon ${event.kind}`} aria-hidden="true" />
              <div><small>{event.kind}</small><p>{index < visible ? event.label : "Waiting for previous check…"}</p></div>
              {index < visible && <strong aria-label="complete">✓</strong>}
            </li>
          ))}
        </ol>
        <aside className={`interlude-card ${visible >= 3 ? "revealed" : ""}`}>
          <span>Curiosity interlude / sourced fact</span>
          <blockquote>“{turn.interlude.text}”</blockquote>
          <a href={turn.interlude.sourceUrl} target="_blank" rel="noreferrer">{turn.interlude.sourceTitle} ↗</a>
        </aside>
      </div>
      <div className="research-status-line" role="status"><span className={complete ? "complete" : "running"} />{complete ? "Replay complete." : "Replaying saved observable activity."}</div>
      <p className="fixture-disclosure">
        {turn.research.mode === "live"
          ? "This replays observable provider activity and sources saved with the turn. It never exposes private model reasoning."
          : "This is a deterministic replay of stored, reviewed material. It demonstrates the research UX without claiming a live search or exposing private model reasoning."}
      </p>
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
  onMap,
  speechRate,
  onSnapshot,
}: {
  journey: JourneyDetail;
  turn: JourneyTurn;
  busy: string | null;
  onChoose: (optionId: string) => void;
  onReject: (adventure: number, reason?: string) => void;
  onDelegate: () => void;
  onMap: () => void;
  speechRate: number;
  onSnapshot: () => void;
}) {
  const [adventure, setAdventure] = useState(50);
  const [reason, setReason] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const performer = PERFORMERS.find((item) => item.id === journey.performerId)!;
  const historical = turn.id !== journey.currentTurnId;
  const actionable = turn.options.filter((option) => option.state === "proposed").length > 0;

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
    <section className="performance-stage" aria-labelledby="performance-title">
      <header className="performance-header">
        <div>
          <p className="eyebrow"><span /> Turn {turn.depth + 1} · {performer.name}</p>
          <h1 id="performance-title">{turn.question}</h1>
        </div>
        <div className="stage-metrics">
          <span><strong>{journey.turnCount}</strong> turns</span>
          <span><strong>{journey.sourceCount}</strong> sources</span>
          <button type="button" onClick={onMap}>Open map ↗</button>
        </div>
      </header>

      {historical && (
        <div className="branch-notice" role="note">
          <span aria-hidden="true">⑂</span>
          <p><strong>You are revisiting an earlier turn.</strong> Choosing a path here creates a visible branch; your existing turns stay in the map.</p>
        </div>
      )}

      <div className="performance-grid">
        <article className="answer-panel">
          <div className="answer-byline">
            <span className={`performer-mark ${performer.accent}`}>{performer.mark}</span>
            <div><strong>{performer.name}</strong><small>{turn.research.mode === "live" ? "performed from live web research" : "performed from a reviewed fixture"}</small></div>
            <span className="ready-stamp">COMPOSED</span>
          </div>
          <div className="performance-tools">
            <button type="button" onClick={toggleSpeech}>{speaking ? "Stop reading" : "Read aloud"}</button>
            <button type="button" disabled={busy !== null} onClick={onSnapshot}>Save snapshot</button>
            <a href={`/api/journeys/${journey.id}/export`}>Export JSON</a>
          </div>
          <div className="answer-copy">
            {turn.answerBlocks.map((block, blockIndex) => (
              <p key={`${turn.id}-${blockIndex}`}>
                {block.text}{" "}
                {block.sourceIds.map((sourceId) => {
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
                })}
              </p>
            ))}
          </div>
          <p className="transition-line"><span>Where this leaves us</span>{turn.transition}</p>
          <p className="media-fallback">No factual image was attached to this turn. WonderDrive never substitutes decorative imagery for evidence.</p>

          <details className="evidence-drawer">
            <summary><span>Sources &amp; evidence</span><strong>{turn.sources.length} inspectable links</strong></summary>
            <ol>
              {turn.sources.map((source, index) => (
                <li key={source.id}>
                  <span>{index + 1}</span>
                  <div><strong>{source.title}</strong><small>{source.publisher} · {source.relation}</small></div>
                  <a href={source.url} target="_blank" rel="noreferrer">Open ↗</a>
                </li>
              ))}
            </ol>
          </details>
          <details className="evidence-drawer research-summary">
            <summary><span>Research Trail</span><strong>activity, not private reasoning</strong></summary>
            <p>{turn.researchSummary}</p>
            <ul>
              {turn.researchEvents.map((event) => <li key={event.id}>{event.label}</li>)}
            </ul>
            {turn.research.mode === "live" && (
              <dl className="usage-strip">
                <div><dt>Input</dt><dd>{turn.research.usage.inputTokens.toLocaleString()} tokens</dd></div>
                <div><dt>Output</dt><dd>{turn.research.usage.outputTokens.toLocaleString()} tokens</dd></div>
                <div><dt>Web</dt><dd>{turn.research.usage.webSearchCalls} searches</dd></div>
                <div><dt>Elapsed</dt><dd>{Math.round(turn.research.usage.latencyMs / 1000)}s</dd></div>
                <div><dt>Cost</dt><dd>${turn.research.usage.estimatedCostUsd.toFixed(4)}</dd></div>
                <div><dt>Pages</dt><dd>{turn.research.usage.pageFetches}</dd></div>
              </dl>
            )}
          </details>
          <details className="evidence-drawer">
            <summary><span>Performance metadata</span><strong>inspectable run contract</strong></summary>
            <dl className="metadata-grid">
              <div><dt>Performer</dt><dd>{turn.metadata.performerId} · {turn.metadata.performerVersion}</dd></div>
              <div><dt>Model</dt><dd>{turn.metadata.provider} · {turn.metadata.modelId}</dd></div>
              <div><dt>Snapshot</dt><dd>{turn.metadata.modelSnapshot}</dd></div>
              <div><dt>Research</dt><dd>{turn.metadata.researchPreset} · {turn.metadata.answerDensity}</dd></div>
              <div><dt>Prompt</dt><dd>{turn.metadata.promptVersion}</dd></div>
              <div><dt>Researched</dt><dd>{new Date(turn.metadata.researchedAt).toLocaleString()}</dd></div>
            </dl>
          </details>
        </article>

        <aside className="direction-panel" aria-labelledby="direction-title">
          <p className="panel-index">Audience direction / 02 paths</p>
          <h2 id="direction-title">Where should<br />curiosity go next?</h2>
          <p>Each path becomes its own researched turn. Nothing continues until you decide.</p>

          <div className="path-stack">
            {turn.options.map((option, index) => (
              <button
                type="button"
                className={`path-card path-${index + 1}`}
                key={option.id}
                disabled={!actionable || option.state !== "proposed" || busy !== null}
                onClick={() => onChoose(option.id)}
              >
                <span><i>{index === 0 ? "A" : "B"}</i>{option.angle} · {option.state}</span>
                <strong>{option.question}</strong>
                <small>{historical ? "Branch from here" : "Take this path"} <b aria-hidden="true">↘</b></small>
              </button>
            ))}
          </div>

          <button className="delegate-button" type="button" disabled={!actionable || busy !== null} onClick={onDelegate}>
            <span aria-hidden="true">✦</span>
            <span><strong>Let {performer.name.replace("The ", "")} choose</strong><small>Delegate this turn only</small></span>
            <i aria-hidden="true">→</i>
          </button>

          <div className="reject-control">
            <div><strong>Neither path?</strong><span>Free deterministic redraw</span></div>
            <label>
              <span>Grounded</span>
              <input
                type="range"
                min="0"
                max="100"
                value={adventure}
                onChange={(event) => setAdventure(Number(event.target.value))}
                aria-label="Replacement path adventure level"
              />
              <span>Adventurous</span>
            </label>
            <label className="reason-field">
              <span>Optional note</span>
              <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={280} placeholder="What should the redraw change?" />
            </label>
            <button type="button" disabled={!actionable || busy !== null} onClick={() => onReject(adventure, reason.trim() || undefined)}>
              {busy === "reject" ? "Replacing…" : "Reject both & redraw"}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
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
  const childCount = journey.turns.filter((turn) => turn.parentTurnId === activeTurn.id).length;
  return (
    <section className="map-view" aria-labelledby="map-title">
      <header className="view-heading">
        <div><p className="eyebrow"><span /> Saved journey / version {journey.version}</p><h1 id="map-title">The path is<br /><em>part of the answer.</em></h1></div>
        <div><p>{journey.title}</p><span>{journey.turnCount} turns · {journey.sourceCount} sources</span></div>
      </header>
      <div className="map-layout">
        <div className="turn-tree" role="tree" aria-label="Journey turns">
          <div className="map-legend"><span><i className="current" /> current</span><span><i className="visited" /> visited</span><span><i className="selected" /> selected</span></div>
          {journey.turns.map((turn, index) => {
            const current = turn.id === journey.currentTurnId;
            const selected = turn.id === activeTurnId;
            return (
              <button
                type="button"
                role="treeitem"
                aria-selected={selected}
                key={turn.id}
                className={`turn-node ${current ? "current" : "visited"} ${selected ? "selected" : ""}`}
                style={{ marginInlineStart: `${Math.min(turn.depth, 6) * 46}px` }}
                onClick={() => onSelect(turn.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <i aria-hidden="true" />
                <div><small>{turn.topicLabel}{current ? " · current" : ""}</small><strong>{turn.question}</strong></div>
                <b aria-hidden="true">→</b>
              </button>
            );
          })}
        </div>
        <aside className="map-inspector">
          <span>Selected turn / {activeTurn.depth + 1}</span>
          <h2>{activeTurn.question}</h2>
          <p>{activeTurn.researchSummary}</p>
          <dl><div><dt>Topic</dt><dd>{activeTurn.topicLabel}</dd></div><div><dt>Branches from here</dt><dd>{childCount}</dd></div><div><dt>Sources</dt><dd>{activeTurn.sources.length}</dd></div></dl>
          <div className="map-options" aria-label="Turn paths">
            {activeTurn.options.map((option) => (
              <button type="button" key={option.id} disabled={option.state !== "proposed"} onClick={() => onChoose(activeTurn.id, option.id)}>
                <span>{option.position === 0 ? "A" : "B"} · {option.state}</span>
                <strong>{option.question}</strong>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => onContinue(activeTurn.id)}>{activeTurn.id === journey.currentTurnId ? "Return to this turn" : "Revisit & branch"} <span>↗</span></button>
          <small>Earlier turns remain saved even when you choose a new direction.</small>
        </aside>
      </div>
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
    </section>
  );
}

function LoadingStage() {
  return <section className="loading-stage" aria-live="polite"><span className="loading-orbit" /><p>Opening your WonderDrive library…</p><small>Resolving a durable guest identity</small></section>;
}

function EmptyStage({ onOpenLibrary, label = "Open the journey library" }: { onOpenLibrary: () => void; label?: string }) {
  return <section className="empty-stage"><span aria-hidden="true">?</span><h1>No journey is on stage.</h1><p>Start a new question or return to one you have already saved.</p><button type="button" onClick={onOpenLibrary}>{label} →</button></section>;
}

async function streamLiveResearch(
  request: LiveResearchRequest,
  setState: Dispatch<SetStateAction<LiveResearchState | null>>,
) {
  const response = await fetch("/api/research", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const payload = (await response.json()) as ApiFailure;
    throw new Error(payload.error?.message ?? "Live research could not start.");
  }
  if (!response.body) throw new Error("Live research did not return a readable stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let complete: Extract<LiveResearchStreamEvent, { type: "complete" }> | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const event = JSON.parse(data) as LiveResearchStreamEvent;
        if (event.type === "started") {
          setState((current) =>
            current
              ? { ...current, question: event.question, message: event.message }
              : current,
          );
        } else if (event.type === "activity") {
          setState((current) =>
            current
              ? {
                  ...current,
                  events: current.events.some((item) => item.id === event.event.id)
                    ? current.events
                    : [...current.events, event.event],
                }
              : current,
          );
        } else if (event.type === "interlude") {
          setState((current) =>
            current ? { ...current, interlude: event.interlude } : current,
          );
        } else if (event.type === "error") {
          throw new Error(event.error.message);
        } else if (event.type === "complete") {
          complete = event;
        }
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  if (!complete) throw new Error("Live research ended before a turn was committed.");
  return complete;
}

async function api<T>(url: string, init?: RequestInit): Promise<ApiSuccess<T>> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || "error" in payload) {
    throw new Error("error" in payload ? payload.error.message : "The request failed.");
  }
  return payload;
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

function messageFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : "WonderDrive could not complete that request.";
}
