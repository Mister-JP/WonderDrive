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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  BookmarkSimple,
  CaretRight,
  MagicWand,
  PencilSimple,
  X,
} from "@phosphor-icons/react";
import {
  BOOTSTRAP_CATALOG,
  DEFAULT_PREFERENCES,
  PERFORMERS,
  PROMPT_VERSION,
  REAL_WORLD_DISCOVERY_STARTERS,
  STARTERS,
} from "../lib/catalog";
import { CURIOSITY_QUOTES } from "../lib/curiosity-quotes";
import type {
  AdvanceJourneyRequest,
  AnswerDensity,
  BootstrapCatalog,
  ApiFailure,
  ImagePreference,
  JourneyDetail,
  JourneySnapshot,
  JourneySummary,
  JourneyTurn,
  ModelId,
  PersonalizedStarter,
  PerformerId,
  ResearchPreset,
  UsageSummary,
  UserPreferences,
  Viewer,
  LiveResearchRequest,
} from "../lib/contracts";
import { localeDirection } from "../lib/i18n";
import {
  fetchCivitaiImages,
  getGalleryConfig,
  type CivitaiImage,
} from "../lib/civitai-gallery";
import {
  api,
  diagnosticIdFrom,
  errorCodeFrom,
  type LiveResearchState,
  messageFrom,
  starterRecommendationsUrl,
  streamLiveResearch,
} from "./client-api";
import { EmptyStage } from "./experience/empty-stage";
import { BookmarksView } from "./experience/bookmarks-view";
import { JourneyMap } from "./experience/journey-map";
import { Library } from "./experience/library-view";
import { SettingsView } from "./experience/settings-view";
import { UsageView } from "./experience/usage-view";
import { I18nProvider, translate, useI18n } from "./i18n";
import {
  journeyMapPath,
  journeyStagePath,
  parseCuriosityPediaRoute,
  staticRoutePath,
  type CuriosityPediaRoute,
} from "./routes";

type View = "start" | "journey" | "map" | "library" | "bookmarks" | "usage" | "settings";

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
  history?: "push" | "replace" | "none";
};

const navItems: Array<{ id: View; label: string }> = [
  { id: "start", label: "New drive" },
  { id: "library", label: "Library" },
  { id: "bookmarks", label: "Bookmarks" },
  { id: "usage", label: "Usage" },
  { id: "settings", label: "Settings" },
];

function viewFromRoute(route: CuriosityPediaRoute | null): View {
  if (!route) return "start";
  if (route.name === "journey") return route.surface === "map" ? "map" : "journey";
  return route.name;
}

const LANDING_HEADLINES = [
  "Ask a question. Open a world.",
  "Follow your wonder.",
  "Start curious. Go anywhere.",
  "One question can lead anywhere.",
  "Find out what happens next.",
  "Turn ‘why?’ into ‘wow!’",
  "Small question. Big adventure.",
  "Wonder. Learn. Keep going.",
  "See what your question can become.",
  "Pick a question. Start exploring.",
  "Discover something new today.",
  "Every answer opens another door.",
  "Go where your curiosity takes you.",
  "Ask anything. See where it leads.",
] as const;

export function CuriosityPediaExperience() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = useMemo(
    () => parseCuriosityPediaRoute(pathname, searchParams),
    [pathname, searchParams],
  );
  const [view, setView] = useState<View>(() => viewFromRoute(route));
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [journeys, setJourneys] = useState<JourneySummary[]>([]);
  const [activeJourney, setActiveJourney] = useState<JourneyDetail | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutation, setMutation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ApiFailure["error"]["code"] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bookmarkedTurns, setBookmarkedTurns] = useState<Record<string, number>>({});
  const [liveResearch, setLiveResearch] = useState<LiveResearchState | null>(null);
  const [catalog, setCatalog] = useState<BootstrapCatalog>(BOOTSTRAP_CATALOG);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [nextModelId, setNextModelId] = useState<ModelId | null>(null);
  const [nextPerformerId, setNextPerformerId] = useState<PerformerId | null>(null);
  const [personalizedStarters, setPersonalizedStarters] = useState<PersonalizedStarter[]>(
    BOOTSTRAP_CATALOG.discoveryStarters,
  );
  const activeJourneyRef = useRef(activeJourney);
  const viewerRef = useRef(viewer);
  const liveResearchRef = useRef(liveResearch);
  const liveResearchAbortRef = useRef<AbortController | null>(null);
  const pendingResearchRef = useRef<LiveResearchRequest | null>(null);
  const takeoverRequestIdRef = useRef<string | null>(null);
  activeJourneyRef.current = activeJourney;
  viewerRef.current = viewer;
  liveResearchRef.current = liveResearch;
  const returnTo = encodeURIComponent(`${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`);
  const t = (key: string, values?: Record<string, string | number>) => translate(preferences.interfaceLocale, key, values);

  useEffect(() => {
    document.documentElement.dataset.textSize = preferences.textSize;
    return () => {
      delete document.documentElement.dataset.textSize;
    };
  }, [preferences.textSize]);

  const refreshSession = useCallback(async () => {
    setError(null);
    setErrorCode(null);
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
      setErrorCode(errorCodeFrom(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUsage = useCallback(async () => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const payload = await api<UsageSummary>("/api/usage");
      setViewer(payload.viewer);
      setUsage(payload.data);
    } catch (cause) {
      setUsageError(messageFrom(cause));
    } finally {
      setUsageLoading(false);
    }
  }, []);

  const runMutation = useCallback(async <T,>(
    key: string,
    work: () => Promise<T>,
    onError?: (message: string) => void,
  ): Promise<T | undefined> => {
    setMutation(key);
    setError(null);
    setErrorCode(null);
    try {
      return await work();
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return undefined;
      const message = messageFrom(cause);
      setError(message);
      setErrorCode(errorCodeFrom(cause));
      takeoverRequestIdRef.current = diagnosticIdFrom(cause);
      onError?.(message);
    } finally {
      setMutation(null);
    }
  }, []);

  /** Keeps every client projection of the selected journey in one atomic React update path. */
  const presentJourney = useCallback((
    detail: JourneyDetail,
    nextViewer: Viewer,
    {
      turnId = detail.currentTurnId,
      view = "journey",
      syncLibrary = true,
      history = "push",
    }: JourneyViewOptions = {},
  ) => {
    setViewer(nextViewer);
    setActiveJourney(detail);
    setNextModelId(detail.modelId);
    setNextPerformerId(detail.performerId);
    setActiveTurnId(turnId);
    setView(view);
    if (syncLibrary) setJourneys((current) => upsertSummary(current, detail));
    if (history !== "none") {
      const href = view === "map"
        ? journeyMapPath(detail.id, turnId)
        : journeyStagePath(detail.id, turnId);
      router[history](href);
    }
  }, [router]);

  useEffect(() => {
    // The first client effect hydrates the durable server session; updates happen after fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("curiositypedia:bookmarked-turns");
      // Bookmarks are device-local external state and hydrate after the server render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setBookmarkedTurns(JSON.parse(saved) as Record<string, number>);
    } catch {
      // A private browsing policy may block local storage; the current session still works.
    }
  }, []);

  useEffect(() => {
    if (!route) return;
    if (liveResearchRef.current?.status === "running") {
      liveResearchAbortRef.current?.abort();
      liveResearchAbortRef.current = null;
      setLiveResearch(null);
    }
    if (route.name !== "journey") {
      // URL changes, including browser Back/Forward, own durable navigation state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView(viewFromRoute(route));
      return;
    }

    let cancelled = false;
    const surfaceView: View = route.surface === "map" ? "map" : "journey";
    const showJourney = (detail: JourneyDetail, nextViewer: Viewer) => {
      if (cancelled) return;
      const requestedTurn = detail.turns.some((turn) => turn.id === route.turnId)
        ? route.turnId
        : detail.currentTurnId;
      presentJourney(detail, nextViewer, {
        turnId: requestedTurn,
        view: surfaceView,
        syncLibrary: false,
        history: "none",
      });
      const canonical = route.surface === "map"
        ? journeyMapPath(detail.id, requestedTurn)
        : journeyStagePath(detail.id, requestedTurn);
      const current = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;
      if (canonical !== current) router.replace(canonical);
    };

    const currentJourney = activeJourneyRef.current;
    const currentViewer = viewerRef.current;
    if (currentJourney?.id === route.journeyId && currentViewer) {
      showJourney(currentJourney, currentViewer);
      return () => { cancelled = true; };
    }

    void runMutation(`open-${route.journeyId}`, async () => {
      const payload = await api<JourneyDetail>(`/api/journeys/${route.journeyId}`);
      showJourney(payload.data, payload.viewer);
    });
    return () => { cancelled = true; };
  }, [pathname, presentJourney, route, router, runMutation, searchParams]);

  useEffect(() => {
    if (view !== "usage") return;
    // The route transition intentionally refreshes server-owned rolling counters.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshUsage();
  }, [refreshUsage, view]);

  const openJourney = useCallback((journeyId: string, targetView: View = "journey") => {
    const href = targetView === "map" ? journeyMapPath(journeyId) : journeyStagePath(journeyId);
    router.push(href);
  }, [router]);

  async function create(config: {
    seed: string;
    performerId: PerformerId;
    modelId: ModelId;
    researchPreset: ResearchPreset;
    answerDensity: AnswerDensity;
    imagePreference: ImagePreference;
    outputLocale: UserPreferences["defaultOutputLocale"];
  }) {
    if (viewer && journeys.length >= viewer.journeyLimit) {
      setErrorCode("JOURNEY_LIMIT");
      setError(t("Your saved-journey library is full ({count}/{limit}). Delete one journey to make room.", {
        count: journeys.length,
        limit: viewer.journeyLimit,
      }));
      navigate("library");
      return;
    }
    await runMutation("create", async () => {
      setView("journey");
      const abortController = new AbortController();
      liveResearchAbortRef.current = abortController;
      setLiveResearch({
        question: config.seed,
        performerId: config.performerId,
        message: t("Connecting to live foreground research…"),
        events: [],
        status: "running",
        result: null,
        error: null,
        errorCode: null,
        diagnosticId: null,
        retryAttempt: 0,
        maxRetries: 0,
      });
      const request: LiveResearchRequest = { kind: "create", ...config, idempotencyKey: crypto.randomUUID() };
      pendingResearchRef.current = request;
      const complete = await streamLiveResearch(
        request,
        setLiveResearch,
        abortController.signal,
      );
      liveResearchAbortRef.current = null;
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
        const abortController = new AbortController();
        liveResearchAbortRef.current = abortController;
        setLiveResearch({
          question: selected.question,
          performerId: activeJourney.performerId,
          message: t("Opening the next live research turn…"),
          events: [],
          status: "running",
          result: null,
          error: null,
          errorCode: null,
          diagnosticId: null,
          retryAttempt: 0,
          maxRetries: 0,
        });
        const request: LiveResearchRequest = {
            kind: "advance",
            journeyId: activeJourney.id,
            fromTurnId: input.turnId,
            action,
            modelId,
            optionId: input.optionId,
            expectedVersion: activeJourney.version,
            idempotencyKey: crypto.randomUUID(),
          };
        pendingResearchRef.current = request;
        const complete = await streamLiveResearch(
          request,
          setLiveResearch,
          abortController.signal,
        );
        liveResearchAbortRef.current = null;
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

  async function retryActiveQuestion() {
    if (!activeJourney || !activeTurn) return;
    await create({
      seed: activeTurn.question,
      performerId: nextPerformerId ?? activeJourney.performerId,
      modelId: nextModelId ?? activeJourney.modelId,
      researchPreset: "standard",
      answerDensity: preferences.answerDensity,
      imagePreference: preferences.imagePreference,
      outputLocale: preferences.defaultOutputLocale,
    });
  }

  async function takeOverResearch() {
    const pending = pendingResearchRef.current;
    if (!pending) return;
    await runMutation("take-over-research", async () => {
      setError(null);
      setErrorCode(null);
      const abortController = new AbortController();
      liveResearchAbortRef.current = abortController;
      const request: LiveResearchRequest = {
        ...pending,
        idempotencyKey: crypto.randomUUID(),
        takeoverExisting: true,
        takeoverRequestId: takeoverRequestIdRef.current ?? undefined,
      };
      pendingResearchRef.current = request;
      setLiveResearch((current) => current && {
        ...current,
        message: t("Taking over research in this tab…"),
        events: [],
        status: "running",
        result: null,
        error: null,
        errorCode: null,
        diagnosticId: null,
        retryAttempt: 0,
        maxRetries: 0,
      });
      const complete = await streamLiveResearch(request, setLiveResearch, abortController.signal);
      liveResearchAbortRef.current = null;
      presentJourney(complete.data, complete.viewer);
      setLiveResearch((current) => current
        ? { ...current, status: "complete", result: complete.data, message: t("Research committed") }
        : current);
    }, (message) => {
      setLiveResearch((current) => current
        ? { ...current, status: "error", error: message, message: t("Research stopped") }
        : null);
    });
  }

  async function removeJourney(journeyId: string) {
    await runMutation(`delete-${journeyId}`, async () => {
      await api<{ id: string }>(`/api/journeys/${journeyId}`, { method: "DELETE" });
      setJourneys((current) => current.filter((journey) => journey.id !== journeyId));
      setBookmarkedTurns((current) => {
        const next = Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${journeyId}::`)));
        persistTurnBookmarks(next);
        return next;
      });
      if (activeJourney?.id === journeyId) {
        setActiveJourney(null);
        setActiveTurnId(null);
        navigate("library");
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

  const activeTurn = useMemo(
    () => activeJourney?.turns.find((turn) => turn.id === activeTurnId) ?? null,
    [activeJourney, activeTurnId],
  );
  const retryConfigChanged = Boolean(
    activeJourney && (
      (nextModelId ?? activeJourney.modelId) !== activeJourney.modelId
      || (nextPerformerId ?? activeJourney.performerId) !== activeJourney.performerId
    ),
  );

  function toggleTurnBookmark(journeyId: string, turnId: string) {
    const key = `${journeyId}::${turnId}`;
    setBookmarkedTurns((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = Date.now();
      persistTurnBookmarks(next);
      return next;
    });
  }

  function navigate(next: View) {
    if ((next === "journey" || next === "map") && !activeJourney) {
      const fallback = journeys.length ? "library" : "start";
      setView(fallback);
      router.push(staticRoutePath(fallback));
      return;
    }
    liveResearchAbortRef.current?.abort();
    liveResearchAbortRef.current = null;
    setView(next);
    setLiveResearch(null);
    const href = next === "journey"
      ? journeyStagePath(activeJourney!.id, activeTurnId ?? activeJourney!.currentTurnId)
      : next === "map"
        ? journeyMapPath(activeJourney!.id, activeTurnId ?? activeJourney!.currentTurnId)
        : staticRoutePath(next);
    router.push(href);
  }

  return (
    <I18nProvider locale={preferences.interfaceLocale}>
    <main className={`app-shell ${preferences.reduceMotion ? "reduce-motion" : ""} ${view === "journey" && activeJourney && activeTurn ? "journey-stage-active" : ""}`}>
      <header className="app-header">
        <button className="wordmark" type="button" onClick={() => navigate("start")}>
          <span className="wordmark-mark" aria-hidden="true">C</span>
          <span>
            CuriosityPedia
          </span>
        </button>

        <nav className="app-nav" aria-label={t("CuriosityPedia views")}>
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
            <a className="identity-action" href={`/signin-with-chatgpt?return_to=${returnTo}`}>{t("Sign in")}</a>
          ) : viewer?.mode === "chatgpt" ? (
            <a className="identity-action" href={`/signout-with-chatgpt?return_to=${returnTo}`}>{t("Sign out")}</a>
          ) : null}
        </div>
      </header>

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
          <div className="error-banner-actions">
            {errorCode === "JOURNEY_LIMIT" ? (
              <button type="button" onClick={() => { setError(null); navigate("library"); }}>{t("Manage saved journeys")}</button>
            ) : errorCode === "LIVE_RESEARCH_LIMIT" || errorCode === "BUDGET_EXCEEDED" ? (
              <button type="button" onClick={() => { setError(null); navigate("usage"); }}>{t("View usage")}</button>
            ) : errorCode === "ALREADY_IN_PROGRESS" ? (
              <button type="button" onClick={() => void takeOverResearch()}>{t("Use this tab")}</button>
            ) : (
              <button type="button" onClick={() => { setError(null); void refreshSession(); }}>{t("Reconnect")}</button>
            )}
          </div>
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
          errorCode={liveResearch.errorCode ?? errorCode}
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
            if ((liveResearch.errorCode ?? errorCode) === "JOURNEY_LIMIT") navigate("library");
            else if (["LIVE_RESEARCH_LIMIT", "BUDGET_EXCEEDED"].includes(liveResearch.errorCode ?? errorCode ?? "")) navigate("usage");
            else navigate(activeJourney ? "journey" : "start");
          }}
          onTakeOver={errorCode === "ALREADY_IN_PROGRESS" ? () => void takeOverResearch() : undefined}
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
          onNew={() => navigate("start")}
        />
      ) : view === "bookmarks" ? (
        <BookmarksView
          journeys={journeys}
          bookmarks={bookmarkedTurns}
          onOpen={(journeyId, turnId) => router.push(journeyStagePath(journeyId, turnId))}
          onToggle={toggleTurnBookmark}
          onPin={(journeyId, pinned) => void manageJourney(journeyId, { pinned })}
          onNew={() => navigate("start")}
        />
      ) : view === "usage" ? (
        <UsageView
          usage={usage}
          viewer={viewer}
          loading={usageLoading}
          error={usageError}
          onRefresh={() => void refreshUsage()}
          onOpenLibrary={() => navigate("library")}
        />
      ) : view === "settings" ? (
        <SettingsView
          viewer={viewer}
          savedJourneyCount={journeys.length}
          preferences={preferences}
          catalog={catalog}
          busy={mutation === "preferences"}
          onPreviewTextSize={(textSize) => setPreferences((current) => ({ ...current, textSize }))}
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
            <div className="journey-run-controls">
              <label className="journey-model-switcher">
                <span>{t("Model")}</span>
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
              <label className="journey-model-switcher journey-performer-switcher">
                <span>{t("Performer")}</span>
                <select
                  aria-label={t("Performer")}
                  disabled={mutation !== null}
                  value={nextPerformerId ?? activeJourney.performerId}
                  onChange={(event) => setNextPerformerId(event.target.value as PerformerId)}
                >
                  {catalog.performers.map((performer) => (
                    <option key={performer.id} value={performer.id}>{performer.name}</option>
                  ))}
                </select>
              </label>
              {retryConfigChanged && (
                <button
                  className="retry-question"
                  type="button"
                  disabled={mutation !== null}
                  onClick={() => void retryActiveQuestion()}
                >
                  Retry this question
                </button>
              )}
            </div>
            <div className="journey-view-controls">
              <button type="button" className={view === "journey" ? "active" : ""} aria-current={view === "journey" ? "page" : undefined} onClick={() => navigate("journey")}>{t("Stage")}</button>
              <button type="button" className={view === "map" ? "active" : ""} aria-current={view === "map" ? "page" : undefined} onClick={() => navigate("map")}>{t("Journey map")}</button>
            </div>
          </nav>
          {view === "map" ? (
            <JourneyMap
              journey={activeJourney}
              activeTurnId={activeTurn.id}
              onSelect={(turnId) => {
                setActiveTurnId(turnId);
                router.replace(journeyMapPath(activeJourney.id, turnId), { scroll: false });
              }}
              onContinue={(turnId) => {
                setActiveTurnId(turnId);
                setView("journey");
                router.push(journeyStagePath(activeJourney.id, turnId));
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
              onSnapshot={() => void snapshotJourney(activeJourney.id)}
              bookmarked={Boolean(bookmarkedTurns[`${activeJourney.id}::${activeTurn.id}`])}
              onBookmark={() => toggleTurnBookmark(activeJourney.id, activeTurn.id)}
            />
          )}
        </div>
      ) : (
        <EmptyStage onOpenLibrary={() => navigate("library")} />
      )}

      {view !== "start" && (
        <footer className="app-footer">
          <p><span aria-hidden="true">W/V3</span> {t("One performer. One researched turn. Exactly two ways forward.")}</p>
          <div>
            <a href="https://github.com/Mister-JP/CuriosityPedia">{t("Source")}</a>
            <a href="https://github.com/Mister-JP/CuriosityPedia/blob/main/docs/curiosity-learning-north-star.md">{t("Product book")}</a>
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
  const { locale, t } = useI18n();
  const [seed, setSeed] = useState("");
  const [performerId, setPerformerId] = useState<PerformerId>("sage");
  const [modelId, setModelId] = useState<ModelId>(preferences.defaultModelId);
  const performerIdRef = useRef<PerformerId>("sage");
  const starterCache = useRef(new Map<PerformerId, PersonalizedStarter[]>([["sage", starters]]));
  const [visibleStarters, setVisibleStarters] = useState<PersonalizedStarter[]>(
    () => recommendationsForPerformer("sage", starters),
  );
  const [startersLoading, setStartersLoading] = useState(false);
  const performer = catalog.performers.find((item) => item.id === performerId)!;
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
  const landingHeadline = useLandingHeadline(
    locale === "en" ? LANDING_HEADLINES : [t("Explore a question")],
    preferences.reduceMotion,
  );

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

    setVisibleStarters(recommendationsForPerformer(
      nextId,
      nextId === "atlas" ? REAL_WORLD_DISCOVERY_STARTERS.map((item) => ({ ...item })) : starters,
    ));
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
        <div className="landing-search-pane">
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
          <div className="landing-main-stack">
          <div className="landing-compose-main">
            <h1 id="start-title" key={landingHeadline}>{landingHeadline}</h1>
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
                <button className="question-submit" type="submit" disabled={creating || seed.trim().length < 3}>
                  <span>{t(creating ? "Researching…" : "Begin wonder")}</span>
                  <i aria-hidden="true">→</i>
                </button>
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
                      <option value={item.id} key={item.id}>{item.name}</option>
                    ))}
                  </select>
                </span>
              </label>
            </div>

          </div>
            <CuriosityStickerWall />
          </div>
        </div>
        <CivitaiArtWindow reduceMotion={preferences.reduceMotion} />
      </form>
    </section>
  );
}

function useLandingHeadline(headlines: readonly string[], reduceMotion: boolean) {
  const [headlineIndex, setHeadlineIndex] = useState(0);

  useEffect(() => {
    if (headlines.length < 2) return;

    const randomIndex = () => Math.floor(Math.random() * headlines.length);
    // Randomize after hydration so server and client markup stay identical.
    const randomizeTimeout = window.setTimeout(() => setHeadlineIndex(randomIndex()), 0);

    if (reduceMotion) return () => window.clearTimeout(randomizeTimeout);

    const interval = window.setInterval(() => {
      setHeadlineIndex((current) => {
        const offset = 1 + Math.floor(Math.random() * (headlines.length - 1));
        return (current + offset) % headlines.length;
      });
    }, 7000);

    return () => {
      window.clearTimeout(randomizeTimeout);
      window.clearInterval(interval);
    };
  }, [headlines, reduceMotion]);

  return headlines[headlineIndex] ?? headlines[0] ?? "Explore a question";
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
  errorCode,
  onComplete,
  onBack,
  onTakeOver,
}: {
  state: LiveResearchState;
  errorCode: ApiFailure["error"]["code"] | null;
  onComplete: () => void;
  onBack: () => void;
  onTakeOver?: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (state.status !== "complete") return;
    const timer = window.setTimeout(onComplete, 650);
    return () => window.clearTimeout(timer);
  }, [onComplete, state.status]);

  const performer = PERFORMERS.find((item) => item.id === state.performerId) ?? PERFORMERS[0];
  const capacityError = errorCode === "JOURNEY_LIMIT";
  const usageError = errorCode === "LIVE_RESEARCH_LIMIT" || errorCode === "BUDGET_EXCEEDED";
  const stoppedLabel = capacityError ? t("Library full") : usageError ? t("Usage limit reached") : t("Research stopped");

  return (
    <section className="performance-stage buffering-stage" aria-labelledby="buffering-title" aria-busy={state.status === "running"}>
      <header className="performance-header buffering-header">
        <div>
          <p className="eyebrow"><span /> {t("Next turn")} · {performer.name}</p>
          <h1 id="buffering-title">{state.question}</h1>
        </div>
        <div className={`buffering-status ${state.status}`} role="status" aria-live="polite">
          <span className="buffering-dot" aria-hidden="true" />
          <strong>{state.status === "complete" ? t("Answer ready") : state.status === "error" ? stoppedLabel : state.retryAttempt > 0 ? t("Retrying {attempt} of {max}", { attempt: state.retryAttempt, max: state.maxRetries }) : t("Buffering answer")}</strong>
          <small>{state.status === "running" ? state.message : state.status === "complete" ? t("Placing the answer into this card") : capacityError || usageError ? t("No research was started") : t("Nothing incomplete was saved")}</small>
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
              <strong>{capacityError ? t("Your saved-journey library is full") : usageError ? t("Your rolling usage limit is reached") : t("This turn was not committed")}</strong>
              <p>{state.error}</p>
              {state.diagnosticId && <code>Diagnostic {formatDiagnosticId(state.diagnosticId)}</code>}
            </div>
            <div className="buffering-error-actions">
              {onTakeOver && <button type="button" onClick={onTakeOver}>{t("Use this tab")} →</button>}
              <button type="button" className={onTakeOver ? "secondary" : undefined} onClick={onBack}>{capacityError ? t("Manage saved journeys") : usageError ? t("View usage") : t("Return safely")} →</button>
            </div>
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
  onSnapshot,
  bookmarked,
  onBookmark,
}: {
  journey: JourneyDetail;
  turn: JourneyTurn;
  busy: string | null;
  onChoose: (optionId: string) => void;
  onReject: (adventure: number, reason?: string) => void;
  onDelegate: () => void;
  onSnapshot: () => void;
  bookmarked: boolean;
  onBookmark: () => void;
}) {
  const { t, locale } = useI18n();
  const [adventure, setAdventure] = useState(50);
  const [reason, setReason] = useState("");
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);
  const [redrawOpen, setRedrawOpen] = useState(false);
  const [redrawNoteOpen, setRedrawNoteOpen] = useState(false);
  const deepDiveTriggerRef = useRef<HTMLButtonElement>(null);
  const deepDiveCloseRef = useRef<HTMLButtonElement>(null);
  const performer = PERFORMERS.find((item) => item.id === journey.performerId)!;
  const historical = turn.id !== journey.currentTurnId;
  const actionable = turn.options.filter((option) => option.state === "proposed").length > 0;
  const visibleAnswerBlockCount = performer.id === "atlas" || turn.metadata.answerDensity === "rich" ? 2 : 1;
  const topicRepeatsQuestion = turn.topicLabel.localeCompare(
    turn.question,
    turn.metadata.outputLocale,
    { sensitivity: "base", ignorePunctuation: true },
  ) === 0;
  const atlasRelevanceGuaranteed = performer.id === "atlas" && turn.metadata.promptVersion === PROMPT_VERSION;

  function closeRedraw() {
    setRedrawOpen(false);
    setRedrawNoteOpen(false);
  }

  function submitRedraw() {
    if (!actionable || busy !== null) return;
    onReject(adventure, reason.trim() || undefined);
  }

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

  return (
    <section className="performance-stage article-journey-stage" aria-labelledby="performance-title" lang={turn.metadata.outputLocale} dir={localeDirection(turn.metadata.outputLocale)}>
      <header className="performance-header article-journey-header">
        <div>
          <p className="eyebrow"><span /> {t("Turn {number}", { number: turn.depth + 1 })} · {performer.name}</p>
          <h1 id="performance-title">{turn.question}</h1>
        </div>
        <div className="stage-metrics">
          <span>{t("{count} sources", { count: journey.sourceCount })}</span>
        </div>
      </header>

      {historical && (
        <div className="branch-notice" role="note">
          <span aria-hidden="true">⑂</span>
          <p><strong>{t("You are revisiting an earlier turn.")}</strong> {t("Choosing a path here creates a visible branch; your existing turns stay in the map.")}</p>
        </div>
      )}

      <div className={`journey-answer-layout ${turn.media.length ? "has-media" : "without-media"}`}>
        <div className="journey-answer-reading-pane">
      <article className={`contained-answer-card ${turn.media.length ? "has-media" : "without-media"}`}>
        <div className="contained-answer-topline">
          <div className="answer-byline compact-byline">
            <span className={`performer-mark ${performer.accent}`}>{performer.mark}</span>
            <div><strong>{performer.name}</strong><small>{t("performed from live web research")}</small></div>
          </div>
          <div className="contained-answer-tools">
            <button
              type="button"
              className={`turn-bookmark-action ${bookmarked ? "saved" : ""}`}
              aria-pressed={bookmarked}
              onClick={onBookmark}
            >
              <BookmarkSimple weight={bookmarked ? "fill" : "regular"} aria-hidden="true" />
              {bookmarked ? "Saved" : "Save question"}
            </button>
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
            <div className="contained-answer-prose">
              {turn.answerBlocks.slice(0, visibleAnswerBlockCount).map((block, blockIndex) => (
                <div className="visible-answer-block" key={`${turn.id}-answer-${blockIndex}`}>
                  {atlasRelevanceGuaranteed && blockIndex === 1 && <span className="real-world-relevance-label">{t("Real-world relevance")}</span>}
                  <p>{block.text} {citations(block.sourceIds)}</p>
                </div>
              ))}
            </div>
            <div className="answer-tags" aria-label={t("Answer characteristics")}>
              {!topicRepeatsQuestion && <span>{turn.topicLabel}</span>}
              <span>{t("{count} checked sources", { count: turn.sources.length })}</span>
              <span>{t("live research")}</span>
            </div>
            <button ref={deepDiveTriggerRef} className="evidence-research-row" type="button" onClick={() => setDeepDiveOpen(true)}>
              <span><strong>{t("Evidence & research details")}</strong></span>
              <span className="deep-dive-cta">{t("Deeper dive")} ↗</span>
            </button>
          </div>

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
        <div className="journey-secondary-wrap">
          <p>{t("Other ways to continue")}</p>
          <div className="journey-secondary-actions" role="group" aria-label={t("Other ways to continue")}>
            {!redrawOpen ? (
              <>
                <button type="button" disabled={!actionable || busy !== null} onClick={onDelegate}>
                  <MagicWand aria-hidden="true" />
                  <span><strong>{t("Pick a path for me")}</strong><small>{t("CuriosityPedia chooses one")}</small></span>
                </button>
                <button type="button" aria-expanded="false" aria-controls="redraw-inline-controls" onClick={() => setRedrawOpen(true)}>
                  <ArrowsClockwise aria-hidden="true" />
                  <span><strong>{t("Try two different questions")}</strong><small>{t("Change both choices")}</small></span>
                  <CaretRight aria-hidden="true" />
                </button>
              </>
            ) : (
              <div className={`redraw-inline redraw-inline-wide ${redrawNoteOpen ? "note-open" : ""}`} id="redraw-inline-controls" aria-label={t("Replacement question direction")}>
                {redrawNoteOpen ? (
                  <>
                    <PencilSimple className="redraw-inline-icon" aria-hidden="true" />
                    <label className="redraw-inline-note">
                      <span className="sr-only">{t("Optional note")}</span>
                      <input
                        autoFocus
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") submitRedraw();
                          if (event.key === "Escape") setRedrawNoteOpen(false);
                        }}
                        maxLength={240}
                        placeholder={t("What should change about the next two questions?")}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <ArrowsClockwise className="redraw-inline-icon" aria-hidden="true" />
                    <div className="redraw-inline-modes" role="group" aria-label={t("Replacement question direction")}>
                      <small>{t("Change both choices")}</small>
                      <button type="button" className={adventure === 20 ? "active" : ""} aria-pressed={adventure === 20} onClick={() => setAdventure(20)}>{t("Practical")}</button>
                      <button type="button" className={adventure === 78 ? "active" : ""} aria-pressed={adventure === 78} onClick={() => setAdventure(78)}>{t("Surprising")}</button>
                      <button type="button" className={adventure === 50 ? "active" : ""} aria-pressed={adventure === 50} onClick={() => setAdventure(50)}>{t("Different direction")}</button>
                    </div>
                    <button className="redraw-inline-note-trigger" type="button" onClick={() => setRedrawNoteOpen(true)}>
                      <PencilSimple aria-hidden="true" />
                      <span>{t("Optional note")}</span>
                    </button>
                  </>
                )}
                <button className="redraw-inline-close" type="button" aria-label={t("Dismiss")} onClick={closeRedraw}><X aria-hidden="true" /></button>
                <button className="redraw-inline-submit" type="button" aria-label={t(busy === "reject" ? "Replacing…" : "Generate two new questions")} disabled={!actionable || busy !== null} onClick={submitRedraw}><ArrowRight aria-hidden="true" /></button>
              </div>
            )}
          </div>
        </div>
      </section>
        </div>

        <aside className="journey-visual-column" aria-label={t("Visual evidence")}>
          {turn.media.length
            ? <AnswerVisual media={turn.media} />
            : <MissingVisualEvidence topicLabel={turn.topicLabel} />}
        </aside>
      </div>

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
                <AnswerVisual media={turn.media} compact />
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

function persistTurnBookmarks(bookmarks: Record<string, number>) {
  try {
    window.localStorage.setItem("curiositypedia:bookmarked-turns", JSON.stringify(bookmarks));
  } catch {
    // The in-memory state remains useful when storage is unavailable.
  }
}

function MissingVisualEvidence({ topicLabel }: { topicLabel: string }) {
  return (
    <section className="missing-visual-evidence" role="status">
      <span>Visual evidence required</span>
      <div aria-hidden="true"><i /><i /><i /></div>
      <h2>{topicLabel}</h2>
      <p>This older saved turn has no sourced real-world image. New CuriosityPedia turns now retry research instead of completing without one.</p>
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
  const { t } = useI18n();
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const visible = media
    .filter((item) => !failedUrls.includes(item.imageUrl))
    .slice(0, compact ? 4 : 8);

  if (!visible.length) return null;
  const activeIndex = Math.min(selectedIndex, visible.length - 1);
  const selected = visible[activeIndex];
  const visualCommentary = selected.commentary?.trim() || [
    selected.whyIncluded,
    ...(selected.whatToNotice ?? []),
    selected.learning,
  ].filter(Boolean).join(" ") || selected.caption;
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
              className="answer-gallery-backdrop"
              key={`${selected.imageUrl}-backdrop`}
              src={selected.imageUrl}
              alt=""
              aria-hidden="true"
              loading="eager"
              referrerPolicy="no-referrer"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="answer-gallery-artwork"
              key={selected.imageUrl}
              src={selected.imageUrl}
              alt={selected.alt}
              loading="eager"
              referrerPolicy="no-referrer"
              onError={(event) => {
                if (selected.thumbnailUrl && selected.thumbnailUrl !== selected.imageUrl && event.currentTarget.dataset.fallbackAttempted !== "true") {
                  event.currentTarget.dataset.fallbackAttempted = "true";
                  event.currentTarget.src = selected.thumbnailUrl;
                  return;
                }
                setFailedUrls((current) => current.includes(selected.imageUrl) ? current : [...current, selected.imageUrl]);
              }}
            />
          </a>
          {visible.length > 1 && (
            <div className="answer-gallery-arrows" aria-label={t("Browse visual evidence")}>
              <button type="button" onClick={() => selectImage(activeIndex - 1)} aria-label={t("Previous image")}>
                <ArrowLeft aria-hidden="true" weight="bold" />
              </button>
              <div className="answer-gallery-playback">
                <span aria-live="polite">{String(activeIndex + 1).padStart(2, "0")} / {String(visible.length).padStart(2, "0")}</span>
              </div>
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
        <p className="answer-gallery-commentary">{visualCommentary}</p>
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
              onError={(event) => {
                if (item.thumbnailUrl && item.thumbnailUrl !== item.imageUrl && event.currentTarget.dataset.fallbackAttempted !== "true") {
                  event.currentTarget.dataset.fallbackAttempted = "true";
                  event.currentTarget.src = item.imageUrl;
                  return;
                }
                setFailedUrls((current) => current.includes(item.imageUrl) ? current : [...current, item.imageUrl]);
              }}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

function CuriosityStickerWall() {
  const quotesPerView = 3;
  const [firstQuoteIndex, setFirstQuoteIndex] = useState(0);
  const hasSelectedQuotes = useRef(false);

  useEffect(() => {
    if (hasSelectedQuotes.current) return;
    hasSelectedQuotes.current = true;

    const groupCount = Math.ceil(CURIOSITY_QUOTES.length / quotesPerView);
    const lastGroup = Number(window.sessionStorage.getItem("curiositypedia-last-quote-group"));
    let nextGroup = Math.floor(Math.random() * groupCount);
    if (groupCount > 1 && Number.isInteger(lastGroup) && nextGroup === lastGroup) {
      nextGroup = (nextGroup + 1) % groupCount;
    }

    window.sessionStorage.setItem("curiositypedia-last-quote-group", String(nextGroup));
    setFirstQuoteIndex(nextGroup * quotesPerView);
  }, []);

  const visibleQuotes = Array.from({ length: quotesPerView }, (_, offset) => (
    CURIOSITY_QUOTES[(firstQuoteIndex + offset) % CURIOSITY_QUOTES.length]
  ));

  return (
    <section className="curiosity-sticker-wall" aria-label="Quotes about curiosity and learning">
      <div className="curiosity-sticker-field">
        {visibleQuotes.map((quote) => (
          <a
            className={`quote-wall-sticker ${quote.tone}${quote.text.length < 36 ? " short" : quote.text.length > 90 ? " long" : ""}`}
            href={quote.sourceUrl}
            key={quote.id}
            target="_blank"
            rel="noreferrer"
            aria-label={`${quote.text} — ${quote.attribution}. Read ${quote.sourceLabel}`}
          >
            <q>{quote.text}</q>
            <span>— {quote.attribution}</span>
            {quote.context && <small>{quote.context}</small>}
            <i aria-hidden="true">↗</i>
          </a>
        ))}
      </div>
    </section>
  );
}

function CivitaiArtWindow({ reduceMotion }: { reduceMotion: boolean }) {
  const [config] = useState(getGalleryConfig);
  const [images, setImages] = useState<CivitaiImage[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(reduceMotion);

  useEffect(() => {
    if (!config.enabled) return;
    const controller = new AbortController();
    void fetchCivitaiImages(config, controller.signal)
      .then((items) => setImages(items))
      .catch(() => setImages([]));
    return () => controller.abort();
  }, [config]);

  useEffect(() => {
    if (paused || images.length < 2) return;
    const interval = window.setInterval(
      () => setActiveIndex((current) => (current + 1) % images.length),
      config.intervalMs,
    );
    return () => window.clearInterval(interval);
  }, [config.intervalMs, images.length, paused]);

  const image = config.enabled && images.length ? images[activeIndex % images.length] : undefined;
  const artistName = image?.username?.trim() || "Civitai community";
  const showPrevious = () => setActiveIndex((current) => (current - 1 + images.length) % images.length);
  const showNext = () => setActiveIndex((current) => (current + 1) % images.length);
  return (
    <aside className="civitai-art-window" aria-label="Rotating community artwork">
      {image ? (
        <a className="civitai-art-link" href={`https://civitai.com/images/${image.id}`} target="_blank" rel="noreferrer" title="View artwork on Civitai">
          {/* The remote CDN is intentionally used directly, matching Civitai's public API guidance. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={`${image.id}-backdrop`} className="civitai-art-backdrop" src={image.url} alt="" aria-hidden="true" width={image.width} height={image.height} loading="eager" referrerPolicy="no-referrer" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={`${image.id}-artwork`} className="civitai-art-image" src={image.url} alt="" width={image.width} height={image.height} loading="eager" referrerPolicy="no-referrer" onError={() => setImages((current) => current.filter((item) => item.id !== image.id))} />
        </a>
      ) : <div className="curiosity-canvas" aria-hidden="true" />}
      <div className="civitai-art-scrim" aria-hidden="true" />
      {image && (
        <a className="civitai-artist-credit" href={`https://civitai.com/user/${encodeURIComponent(artistName)}`} target="_blank" rel="noreferrer">
          <span>Artwork by</span><strong>{artistName}</strong><small>Meet the artist on Civitai ↗</small>
        </a>
      )}
      {images.length > 1 && (
        <div className="civitai-art-controls" aria-label="Artwork controls">
          <button type="button" onClick={showPrevious} aria-label="Previous artwork">←</button>
          <button type="button" className="art-play-control" onClick={() => setPaused((current) => !current)} aria-label={paused ? "Play artwork rotation" : "Pause artwork rotation"}>
            <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>{paused ? "Play" : "Pause"}
          </button>
          <button type="button" onClick={showNext} aria-label="Next artwork">→</button>
        </div>
      )}
      {image && <span className="civitai-art-count" aria-hidden="true">{String(activeIndex + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}</span>}
    </aside>
  );
}

function LoadingStage() {
  const { t } = useI18n();
  return <section className="loading-stage" aria-live="polite"><span className="loading-orbit" /><p>{t("Opening your CuriosityPedia library…")}</p><small>{t("Resolving a durable guest identity")}</small></section>;
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
