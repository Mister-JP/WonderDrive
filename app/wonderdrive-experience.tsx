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
  CaretDown,
  CaretRight,
  CornersOut,
  Crosshair,
  ListBullets,
  MagnifyingGlass,
  MagicWand,
  Minus,
  Path,
  PencilSimple,
  Plus,
  TreeStructure,
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
  TextSize,
  UsageSummary,
  UserPreferences,
  Viewer,
  LiveResearchRequest,
} from "../lib/contracts";
import { SUPPORTED_LOCALES, localeDirection } from "../lib/i18n";
import {
  collectCivitaiTags,
  fetchCivitaiImages,
  getGalleryConfig,
  saveGalleryDevOverride,
  type CivitaiGalleryConfig,
  type CivitaiImage,
} from "../lib/civitai-gallery";
import {
  api,
  errorCodeFrom,
  type LiveResearchState,
  messageFrom,
  starterRecommendationsUrl,
  streamLiveResearch,
} from "./client-api";
import { I18nProvider, translate, useI18n } from "./i18n";
import {
  journeyMapPath,
  journeyStagePath,
  parseWonderDriveRoute,
  staticRoutePath,
  type WonderDriveRoute,
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

function viewFromRoute(route: WonderDriveRoute | null): View {
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

export function WonderDriveExperience() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = useMemo(
    () => parseWonderDriveRoute(pathname, searchParams),
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
      const saved = window.localStorage.getItem("wonderdrive:bookmarked-turns");
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
                  <span><strong>{t("Pick a path for me")}</strong><small>{t("WonderDrive chooses one")}</small></span>
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
    window.localStorage.setItem("wonderdrive:bookmarked-turns", JSON.stringify(bookmarks));
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
      <p>This older saved turn has no sourced real-world image. New WonderDrive turns now retry research instead of completing without one.</p>
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

type GraphDensity = "overview" | "topics" | "detail";
type GraphViewMode = "graph" | "outline";

type JourneyGraphNode = {
  id: string;
  parentId: string | null;
  kind: "turn" | "open" | "cluster";
  turn: JourneyTurn;
  option: JourneyTurn["options"][number] | null;
  branchPosition: 0 | 1;
  children: JourneyGraphNode[];
  turnCount: number;
  openCount: number;
};

type PositionedGraphNode = {
  node: JourneyGraphNode;
  x: number;
  y: number;
  width: number;
  height: number;
};

type GraphLayout = {
  nodes: PositionedGraphNode[];
  width: number;
  height: number;
  mobile: boolean;
};

function buildJourneyGraph(journey: JourneyDetail): JourneyGraphNode {
  const turnById = new Map(journey.turns.map((turn) => [turn.id, turn]));
  const childTurns = new Map<string, JourneyTurn[]>();
  for (const turn of journey.turns) {
    if (!turn.parentTurnId) continue;
    childTurns.set(turn.parentTurnId, [...(childTurns.get(turn.parentTurnId) ?? []), turn]);
  }
  const resultByOption = new Map(
    journey.actions
      .filter((action) => action.optionId && action.resultTurnId)
      .map((action) => [`${action.turnId}:${action.optionId}`, action.resultTurnId as string]),
  );
  const rootTurn = journey.turns.find((turn) => !turn.parentTurnId) ?? journey.turns[0];

  const buildTurn = (turn: JourneyTurn, parentId: string | null, branchPosition: 0 | 1): JourneyGraphNode => {
    const directChildren = childTurns.get(turn.id) ?? [];
    const usedChildren = new Set<string>();
    const children: JourneyGraphNode[] = [];

    for (const option of [...turn.options].sort((left, right) => left.position - right.position)) {
      const resultId = resultByOption.get(`${turn.id}:${option.id}`);
      const resultTurn = resultId ? turnById.get(resultId) : undefined;
      if (resultTurn && resultTurn.parentTurnId === turn.id) {
        usedChildren.add(resultTurn.id);
        children.push(buildTurn(resultTurn, turn.id, option.position));
      } else if (option.state === "proposed") {
        children.push({
          id: `open:${turn.id}:${option.id}`,
          parentId: turn.id,
          kind: "open",
          turn,
          option,
          branchPosition: option.position,
          children: [],
          turnCount: 0,
          openCount: 1,
        });
      }
    }

    for (const child of directChildren.filter((candidate) => !usedChildren.has(candidate.id))) {
      children.push(buildTurn(child, turn.id, children.length ? 1 : 0));
    }

    return {
      id: turn.id,
      parentId,
      kind: "turn",
      turn,
      option: null,
      branchPosition,
      children,
      turnCount: 1 + children.reduce((total, child) => total + child.turnCount, 0),
      openCount: children.reduce((total, child) => total + child.openCount, 0),
    };
  };

  return buildTurn(rootTurn, null, 0);
}

function findGraphNode(root: JourneyGraphNode, id: string): JourneyGraphNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const match = findGraphNode(child, id);
    if (match) return match;
  }
  return null;
}

function findGraphPath(root: JourneyGraphNode, id: string): JourneyGraphNode[] | null {
  if (root.id === id) return [root];
  for (const child of root.children) {
    const path = findGraphPath(child, id);
    if (path) return [root, ...path];
  }
  return null;
}

function visibleJourneyGraph(
  root: JourneyGraphNode,
  routeIds: Set<string>,
  density: GraphDensity,
  mobile: boolean,
  expanded: Set<string>,
): JourneyGraphNode {
  const children = root.children.map((child) => {
    const foldThreshold = mobile ? 1 : density === "overview" ? 2 : density === "topics" ? 5 : Number.POSITIVE_INFINITY;
    const shouldFold = child.kind === "turn"
      && !routeIds.has(child.id)
      && child.children.length > 0
      && child.turnCount > foldThreshold
      && !expanded.has(child.id);
    if (shouldFold) {
      return {
        ...child,
        id: `cluster:${child.id}`,
        kind: "cluster" as const,
        children: [],
      };
    }
    return visibleJourneyGraph(child, routeIds, density, mobile, expanded);
  });
  return { ...root, children };
}

function desktopGraphLayout(root: JourneyGraphNode, density: GraphDensity): GraphLayout {
  const dimensions = density === "overview"
    ? { width: 132, height: 58, column: 182, row: 82 }
    : density === "topics"
      ? { width: 190, height: 88, column: 244, row: 112 }
      : { width: 230, height: 124, column: 294, row: 150 };
  const nodes: PositionedGraphNode[] = [];
  let nextLeaf = 0;

  const place = (node: JourneyGraphNode, depth: number): number => {
    const childYs = node.children.map((child) => place(child, depth + 1));
    const y = childYs.length
      ? childYs.reduce((sum, value) => sum + value, 0) / childYs.length
      : 42 + nextLeaf++ * dimensions.row;
    const height = node.kind === "open" ? Math.max(54, dimensions.height - 10) : dimensions.height;
    nodes.push({ node, x: 44 + depth * dimensions.column, y, width: dimensions.width, height });
    return y;
  };

  place(root, 0);
  const maxRight = Math.max(...nodes.map((item) => item.x + item.width));
  const maxBottom = Math.max(...nodes.map((item) => item.y + item.height));
  return { nodes, width: Math.max(860, maxRight + 90), height: Math.max(560, maxBottom + 80), mobile: false };
}

function mobileGraphLayout(root: JourneyGraphNode, routeIds: Set<string>, density: GraphDensity): GraphLayout {
  const canvasWidth = 356;
  const nodeWidth = density === "overview" ? 132 : 154;
  const nodeHeight = density === "detail" ? 112 : density === "topics" ? 82 : 58;
  const rowGap = density === "detail" ? 154 : density === "topics" ? 126 : 100;
  const nodes: PositionedGraphNode[] = [];
  const positioned = new Set<string>();
  let routeNode: JourneyGraphNode | undefined = root;
  let row = 0;

  nodes.push({ node: root, x: (canvasWidth - nodeWidth) / 2, y: 28, width: nodeWidth, height: nodeHeight });
  positioned.add(root.id);

  while (routeNode) {
    const children = routeNode.children.slice(0, 2);
    if (!children.length) break;
    row += 1;
    const childY = 28 + row * rowGap;
    children.forEach((child, index) => {
      const childWidth = nodeWidth;
      const x = children.length === 1
        ? (canvasWidth - childWidth) / 2
        : index === 0 ? 10 : canvasWidth - childWidth - 10;
      nodes.push({ node: child, x, y: childY, width: childWidth, height: child.kind === "open" ? Math.max(54, nodeHeight - 8) : nodeHeight });
      positioned.add(child.id);
    });
    routeNode = children.find((child) => routeIds.has(child.id) && child.kind === "turn");
  }

  const maxBottom = Math.max(...nodes.map((item) => item.y + item.height));
  return { nodes: nodes.filter((item) => positioned.has(item.node.id)), width: canvasWidth, height: maxBottom + 88, mobile: true };
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const responsiveInitializedRef = useRef(false);
  const [density, setDensity] = useState<GraphDensity>("topics");
  const [viewMode, setViewMode] = useState<GraphViewMode>("graph");
  const [focusRootId, setFocusRootId] = useState<string | null>(null);
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(() => new Set());
  const [outlineExpanded, setOutlineExpanded] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [scale, setScale] = useState(.86);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [pendingBranch, setPendingBranch] = useState<{ turnId: string; optionId: string } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const update = () => {
      setIsMobile(media.matches);
      if (!responsiveInitializedRef.current) {
        responsiveInitializedRef.current = true;
        if (media.matches) setInspectorOpen(false);
      }
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const fullGraph = useMemo(() => buildJourneyGraph(journey), [journey]);
  const turnIndex = useMemo(() => new Map(journey.turns.map((turn, index) => [turn.id, index + 1])), [journey.turns]);
  const activeTurn = journey.turns.find((turn) => turn.id === activeTurnId) ?? journey.turns[0];
  const focusRoot = focusRootId ? findGraphNode(fullGraph, focusRootId) ?? fullGraph : fullGraph;
  const currentPath = useMemo(() => findGraphPath(fullGraph, journey.currentTurnId) ?? [fullGraph], [fullGraph, journey.currentTurnId]);
  const currentPathIds = new Set(currentPath.map((node) => node.id));
  const focusedCurrentPath = useMemo(() => findGraphPath(focusRoot, journey.currentTurnId) ?? [focusRoot], [focusRoot, journey.currentTurnId]);
  const routeIds = useMemo(() => new Set(focusedCurrentPath.map((node) => node.id)), [focusedCurrentPath]);
  const visibleGraph = useMemo(
    () => visibleJourneyGraph(focusRoot, routeIds, density, isMobile, expandedBranches),
    [density, expandedBranches, focusRoot, isMobile, routeIds],
  );
  const layout = useMemo(
    () => isMobile ? mobileGraphLayout(visibleGraph, routeIds, density) : desktopGraphLayout(visibleGraph, density),
    [density, isMobile, routeIds, visibleGraph],
  );
  const positionById = new Map(layout.nodes.map((item) => [item.node.id, item]));
  const scaledWidth = isMobile ? layout.width : layout.width * scale;
  const scaledHeight = isMobile ? layout.height : layout.height * scale;
  const focusBreadcrumb = focusRootId ? findGraphPath(fullGraph, focusRootId) ?? [] : [];

  const openRouteIds = useMemo(() => {
    const ids = new Set<string>();
    const collect = (node: JourneyGraphNode): boolean => {
      const hasOpen = node.kind === "open" || node.children.some(collect);
      if (hasOpen) ids.add(node.kind === "cluster" ? node.turn.id : node.id);
      return hasOpen;
    };
    collect(fullGraph);
    return ids;
  }, [fullGraph]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return journey.turns.flatMap((turn) => {
      const turnMatch = `${turn.question} ${turn.topicLabel} ${turn.answer}`.toLocaleLowerCase().includes(normalizedQuery)
        ? [{ kind: "turn" as const, turn, option: null }]
        : [];
      const options = turn.options
        .filter((option) => option.question.toLocaleLowerCase().includes(normalizedQuery))
        .map((option) => ({ kind: "open" as const, turn, option }));
      return [...turnMatch, ...options];
    }).slice(0, 8);
  }, [journey.turns, normalizedQuery]);
  const matchingIds = new Set(searchResults.flatMap((result) => result.kind === "turn"
    ? [result.turn.id]
    : [`open:${result.turn.id}:${result.option?.id}`]));

  const fitGraph = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || isMobile) return;
    const nextScale = Math.max(.48, Math.min(1, (viewport.clientWidth - 28) / layout.width));
    setScale(nextScale);
    requestAnimationFrame(() => {
      viewport.scrollTo({ left: 0, top: Math.max(0, (layout.height * nextScale - viewport.clientHeight) / 2), behavior: "smooth" });
    });
  }, [isMobile, layout.height, layout.width]);

  const selectAndReveal = useCallback((turnId: string) => {
    const path = findGraphPath(fullGraph, turnId) ?? [];
    setExpandedBranches((current) => new Set([...current, ...path.map((node) => node.id)]));
    onSelect(turnId);
    setInspectorOpen(true);
    requestAnimationFrame(() => {
      const target = viewportRef.current?.querySelector<HTMLElement>(`[data-turn-id="${turnId}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    });
  }, [fullGraph, onSelect]);

  function previewBranch(turnId: string, optionId: string) {
    onSelect(turnId);
    setPendingBranch({ turnId, optionId });
    setInspectorOpen(true);
  }

  function graphConnector(parent: PositionedGraphNode, child: PositionedGraphNode) {
    if (layout.mobile) {
      const startX = parent.x + parent.width / 2;
      const startY = parent.y + parent.height;
      const endX = child.x + child.width / 2;
      const endY = child.y;
      const middle = startY + (endY - startY) / 2;
      return `M ${startX} ${startY} V ${middle} H ${endX} V ${endY}`;
    }
    const startX = parent.x + parent.width;
    const startY = parent.y + parent.height / 2;
    const endX = child.x;
    const endY = child.y + child.height / 2;
    const middle = startX + (endX - startX) / 2;
    return `M ${startX} ${startY} H ${middle} V ${endY} H ${endX}`;
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (isMobile || event.button !== 0 || (event.target as HTMLElement).closest("button, input, a")) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("panning");
  }

  function handleCanvasPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    const viewport = viewportRef.current;
    if (!pan || !viewport || pan.pointerId !== event.pointerId) return;
    viewport.scrollLeft = pan.left - (event.clientX - pan.x);
    viewport.scrollTop = pan.top - (event.clientY - pan.y);
  }

  function endCanvasPan(event: React.PointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId !== event.pointerId) return;
    viewportRef.current?.classList.remove("panning");
    panRef.current = null;
  }

  function handleOutlineKeys(event: KeyboardEvent<HTMLDivElement>) {
    const targets = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-outline-target]")].filter((item) => item.offsetParent !== null);
    const index = targets.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) event.preventDefault();
    if (event.key === "ArrowDown") targets[Math.min(index + 1, targets.length - 1)]?.focus();
    if (event.key === "ArrowUp") targets[Math.max(index - 1, 0)]?.focus();
    if (event.key === "Home") targets[0]?.focus();
    if (event.key === "End") targets.at(-1)?.focus();
    const item = targets[index]?.closest<HTMLElement>("li[role='treeitem']");
    const nodeId = targets[index]?.dataset.outlineNodeId;
    if (event.key === "ArrowRight" && item?.getAttribute("aria-expanded") === "false" && nodeId) {
      setOutlineExpanded((current) => new Set([...current, nodeId]));
    } else if (event.key === "ArrowRight" && item?.getAttribute("aria-expanded") === "true") {
      item.querySelector<HTMLElement>("ul [data-outline-target]")?.focus();
    }
    if (event.key === "ArrowLeft" && item?.getAttribute("aria-expanded") === "true" && nodeId && !routeIds.has(nodeId)) {
      setOutlineExpanded((current) => { const next = new Set(current); next.delete(nodeId); return next; });
    } else if (event.key === "ArrowLeft") {
      item?.parentElement?.closest<HTMLElement>("li[role='treeitem']")?.querySelector<HTMLElement>("[data-outline-target]")?.focus();
    }
  }

  const renderOutlineNode = (node: JourneyGraphNode, level = 1): React.ReactNode => {
    const expanded = outlineExpanded.has(node.id) || routeIds.has(node.id);
    if (node.kind === "open") {
      return (
        <li role="treeitem" aria-level={level} aria-selected={false} key={node.id} className="journey-outline-open">
          <button type="button" data-outline-target onClick={() => previewBranch(node.turn.id, node.option?.id ?? "")}>
            <span>{t("Open path")}</span><strong>{node.option?.question}</strong>
          </button>
        </li>
      );
    }
    return (
      <li role="treeitem" aria-level={level} aria-selected={activeTurnId === node.turn.id} aria-expanded={node.children.length ? expanded : undefined} key={node.id}>
        <div className="journey-outline-row">
          {node.children.length ? (
            <button
              type="button"
              className="outline-expand"
              aria-label={t(expanded ? "Collapse branch" : "Expand branch")}
              onClick={() => setOutlineExpanded((current) => {
                const next = new Set(current);
                if (expanded) next.delete(node.id); else next.add(node.id);
                return next;
              })}
            >{expanded ? <CaretDown aria-hidden="true" /> : <CaretRight aria-hidden="true" />}</button>
          ) : <span className="outline-spacer" />}
          <button
            type="button"
            data-outline-target
            data-outline-node-id={node.id}
            className={activeTurnId === node.turn.id ? "selected" : ""}
            aria-current={journey.currentTurnId === node.turn.id ? "step" : undefined}
            onClick={() => selectAndReveal(node.turn.id)}
          >
            <span>{t("Turn {number}", { number: turnIndex.get(node.turn.id) ?? 1 })} · {node.turn.topicLabel}</span>
            <strong>{node.turn.question}</strong>
            <small>{node.openCount ? t("{count} open questions", { count: node.openCount }) : t("Explored")}</small>
          </button>
        </div>
        {expanded && node.children.length > 0 && <ul role="group">{node.children.map((child) => renderOutlineNode(child, level + 1))}</ul>}
      </li>
    );
  };

  const selectedParent = activeTurn.parentTurnId ? journey.turns.find((turn) => turn.id === activeTurn.parentTurnId) : null;
  const selectedNode = findGraphNode(fullGraph, activeTurn.id);
  const pendingOption = pendingBranch && pendingBranch.turnId === activeTurn.id
    ? activeTurn.options.find((option) => option.id === pendingBranch.optionId)
    : null;

  return (
    <section className="map-view journey-tree-view" aria-labelledby="map-title">
      <header className="map-header journey-tree-header">
        <div>
          <p className="eyebrow"><span /> {t("Journey tree")}</p>
          <h1 id="map-title">{journey.title}</h1>
          <p>{t("See the whole exploration, follow your current route, or grow a new branch from any open question.")}</p>
        </div>
        <dl aria-label={t("Journey overview")}>
          <div><dt>{t("Turns")}</dt><dd>{journey.turnCount}</dd></div>
          <div><dt>{t("Open paths")}</dt><dd>{journey.openBranchCount}</dd></div>
          <div><dt>{t("Sources")}</dt><dd>{journey.sourceCount}</dd></div>
        </dl>
      </header>

      <div className="journey-tree-controls" aria-label={t("Journey tree controls")}>
        <div className="journey-tree-search">
          <MagnifyingGlass aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={t("Find a turn or open question")}
            aria-label={t("Find a turn or open question")}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && <button type="button" aria-label={t("Clear search")} onClick={() => setQuery("")}><X aria-hidden="true" /></button>}
          {normalizedQuery && (
            <div className="journey-tree-search-results">
              <span>{t("{count} matches", { count: searchResults.length })}</span>
              {searchResults.length ? searchResults.map((result) => (
                <button
                  type="button"
                  key={`${result.kind}-${result.turn.id}-${result.option?.id ?? "turn"}`}
                  onClick={() => {
                    setQuery("");
                    if (result.option) previewBranch(result.turn.id, result.option.id);
                    else selectAndReveal(result.turn.id);
                  }}
                >
                  <small>{result.option ? t("Open path") : `${t("Turn")} ${turnIndex.get(result.turn.id)}`}</small>
                  <strong>{result.option?.question ?? result.turn.question}</strong>
                </button>
              )) : <p>{t("No matching turns yet.")}</p>}
            </div>
          )}
        </div>
        <div className="journey-tree-control-group density-control" aria-label={t("Detail level")}>
          {(["overview", "topics", "detail"] as GraphDensity[]).map((level) => (
            <button type="button" key={level} className={density === level ? "active" : ""} aria-pressed={density === level} onClick={() => setDensity(level)}>
              {t(level === "overview" ? "Overview" : level === "topics" ? "Topics" : "Full cards")}
            </button>
          ))}
        </div>
        <div className="journey-tree-control-group">
          <button type="button" className={openOnly ? "active" : ""} aria-pressed={openOnly} onClick={() => setOpenOnly((current) => !current)}><Path aria-hidden="true" /> {t("Open paths")}</button>
          <button type="button" className={viewMode === "outline" ? "active" : ""} aria-pressed={viewMode === "outline"} onClick={() => setViewMode((current) => current === "graph" ? "outline" : "graph")}>
            {viewMode === "graph" ? <ListBullets aria-hidden="true" /> : <TreeStructure aria-hidden="true" />} {t(viewMode === "graph" ? "Outline" : "Graph")}
          </button>
        </div>
      </div>

      {focusRootId && (
        <nav className="journey-focus-bar" aria-label={t("Focused branch path")}>
          <button type="button" onClick={() => { setFocusRootId(null); setPendingBranch(null); }}><ArrowLeft aria-hidden="true" /> {t("Full tree")}</button>
          <ol>
            {focusBreadcrumb.map((node, index) => (
              <li key={node.id}>
                <button type="button" onClick={() => index === 0 ? setFocusRootId(null) : setFocusRootId(node.id)}>{node.turn.topicLabel}</button>
              </li>
            ))}
          </ol>
          <span>{t("Focused branch")}</span>
        </nav>
      )}

      <div className={`journey-tree-workspace ${viewMode}`}>
        {viewMode === "graph" ? (
          <div className="journey-graph-shell">
            <div className="journey-graph-statusbar">
              <span><Crosshair aria-hidden="true" /> {t("Turn {number}", { number: turnIndex.get(journey.currentTurnId) ?? journey.turnCount })} · {t("You are here")}</span>
              <span>{focusRootId ? t("Focused branch") : t("Whole tree")} · {t("{count} open questions", { count: journey.openBranchCount })}</span>
            </div>
            <div
              className="journey-graph-viewport"
              ref={viewportRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={endCanvasPan}
              onPointerCancel={endCanvasPan}
            >
              <div className="journey-graph-scale-stage" style={{ width: scaledWidth, height: scaledHeight }}>
                <div className="journey-graph-canvas" style={{ width: layout.width, height: layout.height, transform: isMobile ? undefined : `scale(${scale})` }}>
                  <svg className="journey-graph-edges" width={layout.width} height={layout.height} aria-hidden="true">
                    {layout.nodes.flatMap((parent) => parent.node.children.map((child) => {
                      const childPosition = positionById.get(child.id);
                      if (!childPosition) return null;
                      const active = routeIds.has(parent.node.id) && routeIds.has(child.id);
                      return <path key={`${parent.node.id}-${child.id}`} d={graphConnector(parent, childPosition)} className={`${active ? "active" : ""} ${child.kind === "open" ? "open" : ""}`} />;
                    }))}
                  </svg>
                  {layout.nodes.map(({ node, x, y, width, height }) => {
                    const realId = node.kind === "cluster" ? node.turn.id : node.id;
                    const selected = node.turn.id === activeTurn.id && node.kind !== "open";
                    const current = node.turn.id === journey.currentTurnId && node.kind === "turn";
                    const active = routeIds.has(realId);
                    const matched = matchingIds.has(node.id) || matchingIds.has(realId);
                    const dimmed = (openOnly && !openRouteIds.has(realId) && node.kind !== "open") || (normalizedQuery.length > 0 && !matched);
                    const preview = pendingBranch && node.kind === "open" && node.turn.id === pendingBranch.turnId && node.option?.id === pendingBranch.optionId;
                    const className = ["journey-graph-node", node.kind, selected && "selected", current && "current", active && "active-route", matched && "match", dimmed && "dimmed", preview && "preview"].filter(Boolean).join(" ");
                    if (node.kind === "cluster") {
                      return (
                        <button
                          type="button"
                          className={className}
                          key={node.id}
                          style={{ left: x, top: y, width, height }}
                          aria-label={t("Expand {topic}: {turns} turns and {open} open questions", { topic: node.turn.topicLabel, turns: node.turnCount, open: node.openCount })}
                          onClick={() => setExpandedBranches((currentSet) => new Set([...currentSet, node.turn.id]))}
                        >
                          <span className="journey-cluster-stack" aria-hidden="true" />
                          <small>{node.turn.topicLabel}</small>
                          <strong>{node.turnCount} {t("turns")} · {node.openCount} {t("open")}</strong>
                          <Plus aria-hidden="true" />
                        </button>
                      );
                    }
                    if (node.kind === "open") {
                      return (
                        <button
                          type="button"
                          className={className}
                          key={node.id}
                          style={{ left: x, top: y, width, height }}
                          aria-label={`${t("Open path")}: ${node.option?.question}`}
                          onClick={() => previewBranch(node.turn.id, node.option?.id ?? "")}
                        >
                          <span className="journey-node-number">{preview ? <Plus aria-hidden="true" /> : (node.option?.position ?? 0) + 1}</span>
                          <small>{preview ? t("New turn preview") : t("Open path")}</small>
                          <strong>{node.option?.question}</strong>
                        </button>
                      );
                    }
                    return (
                      <button
                        type="button"
                        className={className}
                        key={node.id}
                        data-turn-id={node.turn.id}
                        style={{ left: x, top: y, width, height }}
                        aria-pressed={selected}
                        aria-current={current ? "step" : undefined}
                        onClick={() => { onSelect(node.turn.id); setInspectorOpen(true); setPendingBranch(null); }}
                      >
                        <span className="journey-node-number">{turnIndex.get(node.turn.id)}</span>
                        <small>{node.turn.topicLabel}</small>
                        {density !== "overview" && <strong>{node.turn.question}</strong>}
                        {density === "detail" && <p>{node.turn.answerBlocks[0]?.text ?? node.turn.answer}</p>}
                        {current && <em>{t("You are here")}</em>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {!isMobile && (
                <div className="journey-minimap" aria-hidden="true">
                  {layout.nodes.map((item) => (
                    <i
                      key={item.node.id}
                      className={`${routeIds.has(item.node.kind === "cluster" ? item.node.turn.id : item.node.id) ? "active" : ""} ${item.node.kind}`}
                      style={{ left: `${item.x / layout.width * 100}%`, top: `${item.y / layout.height * 100}%` }}
                    />
                  ))}
                  <span />
                </div>
              )}
              {!isMobile && (
                <div className="journey-zoom-controls" aria-label={t("Graph zoom controls")}>
                  <button type="button" aria-label={t("Zoom out")} onClick={() => setScale((current) => Math.max(.48, current - .1))}><Minus aria-hidden="true" /></button>
                  <button type="button" onClick={fitGraph}><CornersOut aria-hidden="true" /> {t("Fit all")}</button>
                  <button type="button" aria-label={t("Zoom in")} onClick={() => setScale((current) => Math.min(1.35, current + .1))}><Plus aria-hidden="true" /></button>
                  <output aria-label={t("Current zoom")}>{Math.round(scale * 100)}%</output>
                </div>
              )}
              {isMobile && focusedCurrentPath.length > 3 && (
                <button type="button" className="journey-offscreen-cue top" onClick={() => viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" })}>
                  {t("{count} ancestors above", { count: focusedCurrentPath.length - 2 })}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="journey-outline" onKeyDown={handleOutlineKeys}>
            <header><ListBullets aria-hidden="true" /><div><span>{t("Accessible outline")}</span><strong>{t("The same journey, in reading order")}</strong></div></header>
            <ul role="tree" aria-label={t("Journey outline")}>{renderOutlineNode(focusRoot)}</ul>
          </div>
        )}

        {inspectorOpen && (
          <aside className={`journey-node-inspector ${pendingOption ? "confirming" : ""}`} aria-label={pendingOption ? t("Confirm new branch") : t("Selected turn details")}>
            <div className="journey-inspector-handle" aria-hidden="true" />
            <header>
              <div>
                <span>{pendingOption ? t("New branch preview") : t("Turn {number}", { number: turnIndex.get(activeTurn.id) ?? 1 })}</span>
                <strong>{pendingOption?.question ?? activeTurn.topicLabel}</strong>
              </div>
              <button type="button" aria-label={t("Close details")} onClick={() => { setInspectorOpen(false); setPendingBranch(null); }}><X aria-hidden="true" /></button>
            </header>
            {pendingOption ? (
              <div className="journey-branch-confirmation" role="dialog" aria-modal="false" aria-labelledby="branch-confirmation-title">
                <p id="branch-confirmation-title">{t("This will grow a new child from Turn {number}.", { number: turnIndex.get(activeTurn.id) ?? 1 })}</p>
                <ul>
                  <li>{t("Your current route stays intact.")}</li>
                  <li>{t("One live research turn will begin.")}</li>
                  <li>{t("The result will appear at the previewed position in this tree.")}</li>
                </ul>
                <div>
                  <button type="button" className="primary" onClick={() => { const branch = pendingBranch; setPendingBranch(null); if (branch) onChoose(branch.turnId, branch.optionId); }}>{t("Start research")}</button>
                  <button type="button" onClick={() => setPendingBranch(null)}>{t("Keep exploring")}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="journey-inspector-context">
                  {selectedParent ? <button type="button" onClick={() => selectAndReveal(selectedParent.id)}><ArrowLeft aria-hidden="true" /> {selectedParent.topicLabel}</button> : <span>{t("Journey root")}</span>}
                  <span>{currentPathIds.has(activeTurn.id) ? t("On current route") : t("Earlier branch")}</span>
                </div>
                <p className="journey-inspector-question">{activeTurn.question}</p>
                <p className="journey-inspector-answer">{activeTurn.answerBlocks[0]?.text ?? activeTurn.answer}</p>
                <div className="journey-inspector-actions">
                  <button type="button" className="primary" onClick={() => onContinue(activeTurn.id)}>{t("Open full answer")}</button>
                  <button type="button" onClick={() => { setFocusRootId(activeTurn.id); setPendingBranch(null); }}><Crosshair aria-hidden="true" /> {t("Focus branch")}</button>
                  {selectedNode && expandedBranches.has(selectedNode.id) && !currentPathIds.has(selectedNode.id) && (
                    <button type="button" onClick={() => setExpandedBranches((current) => { const next = new Set(current); next.delete(selectedNode.id); return next; })}>{t("Fold branch")}</button>
                  )}
                </div>
                <div className="journey-inspector-directions">
                  <span>{t("Two directions from here")}</span>
                  {activeTurn.options.map((option) => {
                    const action = journey.actions.find((item) => item.turnId === activeTurn.id && item.optionId === option.id && item.resultTurnId);
                    const resultTurn = action?.resultTurnId ? journey.turns.find((turn) => turn.id === action.resultTurnId) : null;
                    if (option.state === "proposed") {
                      return <button type="button" className="open" key={option.id} onClick={() => previewBranch(activeTurn.id, option.id)}><small>{t("Option")} {option.position === 0 ? "A" : "B"} · {t("Open")}</small><strong>{option.question}</strong><em>{t("Preview branch")}</em></button>;
                    }
                    return <button type="button" key={option.id} disabled={!resultTurn} onClick={() => resultTurn && selectAndReveal(resultTurn.id)}><small>{t("Option")} {option.position === 0 ? "A" : "B"} · {t(option.state === "chosen" ? "path taken" : option.state)}</small><strong>{option.question}</strong><em>{resultTurn ? t("Show result") : t("Closed")}</em></button>;
                  })}
                </div>
              </>
            )}
          </aside>
        )}
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
        <div><p className="eyebrow"><span /> {t("Saved journeys")}</p><h1 id="library-title">{t("Your saved questions")}</h1></div>
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

type SavedItem = {
  key: string;
  kind: "journey" | "question";
  journeyId: string;
  turnId?: string;
  title: string;
  context: string;
  time: number;
  performerId: PerformerId;
  pinned: boolean;
  sourceCount: number;
};

function BookmarksView({
  journeys,
  bookmarks,
  onOpen,
  onToggle,
  onPin,
  onNew,
}: {
  journeys: JourneySummary[];
  bookmarks: Record<string, number>;
  onOpen: (journeyId: string, turnId?: string) => void;
  onToggle: (journeyId: string, turnId: string) => void;
  onPin: (journeyId: string, pinned: boolean) => void;
  onNew: () => void;
}) {
  const { locale } = useI18n();
  const [details, setDetails] = useState<Record<string, JourneyDetail>>({});
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState<"all" | "questions" | "pinned">("all");
  const [performer, setPerformer] = useState<PerformerId | "all">("all");
  const [sort, setSort] = useState<"recent" | "oldest" | "title">("recent");

  useEffect(() => {
    let cancelled = false;
    const needed = [...new Set(Object.keys(bookmarks).map((key) => key.split("::")[0]))]
      .filter((id) => !details[id] && journeys.some((journey) => journey.id === id));
    if (!needed.length) return;
    void Promise.all(needed.map((id) => api<JourneyDetail>(`/api/journeys/${id}`).then((payload) => payload.data)))
      .then((loaded) => {
        if (!cancelled) setDetails((current) => ({ ...current, ...Object.fromEntries(loaded.map((detail) => [detail.id, detail])) }));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [bookmarks, details, journeys]);

  const items = useMemo(() => {
    const journeyItems: SavedItem[] = journeys.filter((journey) => !journey.hidden).map((journey) => ({
      key: `journey:${journey.id}`,
      kind: "journey",
      journeyId: journey.id,
      title: journey.title,
      context: journey.topicLabels.join(" · ") || "Saved exploration",
      time: journey.updatedAt,
      performerId: journey.performerId,
      pinned: journey.pinned,
      sourceCount: journey.sourceCount,
    }));
    const questionItems: SavedItem[] = Object.entries(bookmarks).flatMap(([key, savedAt]) => {
      const [journeyId, turnId] = key.split("::");
      const journey = journeys.find((item) => item.id === journeyId);
      const turn = details[journeyId]?.turns.find((item) => item.id === turnId);
      if (!journey || !turn) return [];
      return [{
        key: `question:${key}`,
        kind: "question" as const,
        journeyId,
        turnId,
        title: turn.question,
        context: `${journey.title} · ${turn.topicLabel}`,
        time: savedAt,
        performerId: journey.performerId,
        pinned: false,
        sourceCount: turn.sources.length,
      }];
    });
    const normalizedQuery = query.trim().toLowerCase();
    return [...journeyItems, ...questionItems]
      .filter((item) => collection === "all" || (collection === "questions" ? item.kind === "question" : item.pinned))
      .filter((item) => performer === "all" || item.performerId === performer)
      .filter((item) => !normalizedQuery || `${item.title} ${item.context}`.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => sort === "title" ? left.title.localeCompare(right.title) : sort === "oldest" ? left.time - right.time : right.time - left.time);
  }, [bookmarks, collection, details, journeys, performer, query, sort]);

  const grouped = items.reduce<Array<{ label: string; items: SavedItem[] }>>((groups, item) => {
    const label = timelineLabel(item.time);
    const group = groups.find((entry) => entry.label === label);
    if (group) group.items.push(item);
    else groups.push({ label, items: [item] });
    return groups;
  }, []);
  const questionCount = Object.keys(bookmarks).length;
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <section className="bookmarks-view" aria-labelledby="bookmarks-title">
      <header className="bookmarks-header">
        <div>
          <p className="eyebrow"><span /> Saved for later</p>
          <h1 id="bookmarks-title">Your bookmarks</h1>
          <p>Every trail you kept, plus the exact questions you wanted to find again.</p>
        </div>
        <div className="bookmark-summary" aria-label="Bookmark summary">
          <span><strong>{journeys.filter((journey) => !journey.hidden).length}</strong> journeys</span>
          <span><strong>{questionCount}</strong> questions</span>
          <button type="button" onClick={onNew}>Explore something new <ArrowRight aria-hidden="true" /></button>
        </div>
      </header>

      <div className="bookmark-workspace">
        <aside className="bookmark-collections" aria-label="Collections">
          <p>Collections</p>
          <button type="button" className={collection === "all" ? "active" : ""} onClick={() => setCollection("all")}><span>Everything</span><b>{journeys.length + questionCount}</b></button>
          <button type="button" className={collection === "questions" ? "active" : ""} onClick={() => setCollection("questions")}><span>Saved questions</span><b>{questionCount}</b></button>
          <button type="button" className={collection === "pinned" ? "active" : ""} onClick={() => setCollection("pinned")}><span>Pinned journeys</span><b>{journeys.filter((journey) => journey.pinned).length}</b></button>
          <div className="bookmark-care-note"><BookmarkSimple weight="fill" aria-hidden="true" /><p><strong>A small tip</strong>Save any answer from its question page. It will wait here with the path that led to it.</p></div>
        </aside>

        <div className="bookmark-library">
          <div className="bookmark-tools" aria-label="Find and organize bookmarks">
            <label className="bookmark-search"><MagnifyingGlass aria-hidden="true" /><span className="sr-only">Search bookmarks</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions, journeys, or topics" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X aria-hidden="true" /></button>}</label>
            <label><span>Performer</span><select value={performer} onChange={(event) => setPerformer(event.target.value as PerformerId | "all")}><option value="all">All performers</option>{PERFORMERS.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="recent">Recently saved</option><option value="oldest">Oldest first</option><option value="title">A–Z</option></select></label>
          </div>

          <div className="bookmark-result-line"><span>{items.length} {items.length === 1 ? "item" : "items"}</span><span>Organized by when you saved or explored them</span></div>
          {items.length ? grouped.map((group) => (
            <section className="bookmark-time-group" key={group.label} aria-labelledby={`group-${group.label.replace(/\s/g, "-")}`}>
              <h2 id={`group-${group.label.replace(/\s/g, "-")}`}>{group.label}</h2>
              <div>
                {group.items.map((item) => {
                  const persona = PERFORMERS.find((entry) => entry.id === item.performerId)!;
                  return (
                    <article className={`bookmark-row ${item.kind}`} key={item.key}>
                      <span className={`bookmark-kind ${persona.accent}`}><BookmarkSimple weight={item.kind === "question" ? "fill" : "regular"} aria-hidden="true" /></span>
                      <div className="bookmark-copy"><p><span>{item.kind === "question" ? "Question" : "Journey"}</span>{item.context}</p><h3>{item.title}</h3><small>{formatter.format(item.time)} · {item.sourceCount} sources · with {persona.name}</small></div>
                      <div className="bookmark-row-actions">
                        {item.kind === "journey" ? <button type="button" className={item.pinned ? "pinned" : ""} onClick={() => onPin(item.journeyId, !item.pinned)}>{item.pinned ? "Pinned" : "Pin"}</button> : <button type="button" onClick={() => onToggle(item.journeyId, item.turnId!)}>Remove</button>}
                        <button type="button" className="open-bookmark" onClick={() => onOpen(item.journeyId, item.turnId)}>Open <ArrowRight aria-hidden="true" /></button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )) : (
            <div className="bookmark-empty"><BookmarkSimple aria-hidden="true" /><h2>Nothing tucked away here yet</h2><p>{query ? "Try a broader search or clear a filter." : "Save a question from any answer, or begin a new journey. We’ll keep its place for you."}</p><button type="button" onClick={query ? () => setQuery("") : onNew}>{query ? "Clear search" : "Start exploring"} <ArrowRight aria-hidden="true" /></button></div>
          )}
        </div>
      </div>
    </section>
  );
}

function timelineLabel(time: number) {
  const now = new Date();
  const then = new Date(time);
  if (then.toDateString() === now.toDateString()) return "Today";
  if (now.getTime() - then.getTime() < 7 * 24 * 60 * 60 * 1000) return "This week";
  return "Earlier";
}

function UsageView({
  usage,
  viewer,
  loading,
  error,
  onRefresh,
  onOpenLibrary,
}: {
  usage: UsageSummary | null;
  viewer: Viewer | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenLibrary: () => void;
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
  const libraryPercent = usage?.library.limit
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
            <article className="usage-secondary library-capacity">
              <header><div><span>{t("Saved journeys")}</span><h2>Library capacity</h2></div><strong>{usage.library.remaining}<small>places left</small></strong></header>
              <div className="usage-meter light"><div><span>Used: <b>{usage.library.used}</b></span><span>Limit: <b>{usage.library.limit}</b></span></div><progress value={usage.library.used} max={usage.library.limit || 1} aria-label={t("Saved journey capacity used")} /><p>{libraryPercent}% used · Does not reset</p></div>
              {usage.library.remaining === 0 && <p>Delete a journey to free a place.</p>}
              <button type="button" onClick={onOpenLibrary}>{t("Manage saved journeys")}</button>
            </article>

            <details className="usage-spend">
              <summary><span>Provider spend</span><strong>${usage.spend.usedUsd.toFixed(3)} / ${usage.spend.limitUsd.toFixed(2)}</strong></summary>
              <progress value={usage.spend.usedUsd} max={usage.spend.limitUsd || 1} aria-label={t("Provider spend used in the last 24 hours")} />
              <p>{usage.spend.nextReleaseAt ? t("Spend begins leaving the window {time}.", { time: time(usage.spend.nextReleaseAt) }) : t("No metered provider spend in the current window.")}</p>
            </details>

            <aside className="usage-account">
              <div className="usage-account-avatar" aria-hidden="true">{viewer?.displayName?.charAt(0).toUpperCase() || "W"}</div>
              <div><span>{viewer?.mode === "guest" ? t("Guest session") : t("Account usage")}</span><strong>{viewer?.displayName || "WonderDrive user"}</strong><p>{viewer?.mode === "guest" ? "Limits and saved journeys belong to this browser session." : t("These limits follow your signed-in ChatGPT identity across devices.")}</p></div>
              {viewer?.mode === "guest" && <a href="/signin-with-chatgpt?return_to=%2F">{t("Sign in")} →</a>}
            </aside>
          </div>

          <details className="usage-window-note"><summary>{t("How rolling limits work")}</summary><p>{t("There is no midnight reset. Each run and each dollar leaves the window 24 hours after it was recorded.")}</p>{viewer?.mode === "guest" && usage.guestSessionExpiresAt && <p>{t("This browser session is scheduled to remain available until {time}.", { time: time(usage.guestSessionExpiresAt) })}</p>}</details>
        </div>
      ) : null}
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
    const lastGroup = Number(window.sessionStorage.getItem("wonderdrive-last-quote-group"));
    let nextGroup = Math.floor(Math.random() * groupCount);
    if (groupCount > 1 && Number.isInteger(lastGroup) && nextGroup === lastGroup) {
      nextGroup = (nextGroup + 1) % groupCount;
    }

    window.sessionStorage.setItem("wonderdrive-last-quote-group", String(nextGroup));
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

function ArtGalleryDevSettings() {
  const { t } = useI18n();
  const [draft, setDraft] = useState<CivitaiGalleryConfig>(getGalleryConfig);
  const [sample, setSample] = useState<CivitaiImage[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [saved, setSaved] = useState(false);
  const tags = useMemo(() => collectCivitaiTags(sample), [sample]);
  const visibleTags = tags.filter((tag) => tag.name.toLowerCase().includes(tagSearch.trim().toLowerCase()));

  async function discoverTags() {
    setLoadingTags(true);
    try {
      setSample(await fetchCivitaiImages({ ...draft, includeTags: [], excludeTags: [] }));
    } finally {
      setLoadingTags(false);
    }
  }

  function cycleTag(name: string) {
    const included = draft.includeTags.includes(name);
    const excluded = draft.excludeTags.includes(name);
    setDraft({
      ...draft,
      includeTags: included ? draft.includeTags.filter((tag) => tag !== name) : excluded ? draft.includeTags : [...draft.includeTags, name],
      excludeTags: excluded ? draft.excludeTags.filter((tag) => tag !== name) : included ? [...draft.excludeTags, name] : draft.excludeTags,
    });
  }

  function saveConfig() {
    saveGalleryDevOverride(draft);
    const source = `${JSON.stringify(draft, null, 2)}\n`;
    const url = URL.createObjectURL(new Blob([source], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "wonderdrive-art.config.json";
    link.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  return (
    <section className="art-dev-settings" aria-labelledby="art-dev-title">
      <header>
        <div>
          <p className="eyebrow"><span /> Development only</p>
          <h2 id="art-dev-title">{t("Art settings")}</h2>
        </div>
        <span className="dev-seal">Not rendered in production</span>
      </header>
      <div className="art-dev-grid">
        <label className="check-setting"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span>Show gallery window</span></label>
        <label><span>Rotation cadence</span><select value={draft.intervalMs} onChange={(event) => setDraft({ ...draft, intervalMs: Number(event.target.value) })}><option value={5000}>5 seconds</option><option value={8000}>8 seconds</option><option value={10000}>10 seconds</option><option value={12000}>12 seconds</option></select></label>
        <label><span>Ranking</span><select value={draft.sort} onChange={(event) => setDraft({ ...draft, sort: event.target.value as CivitaiGalleryConfig["sort"] })}><option>Most Reactions</option><option>Most Comments</option><option>Most Collected</option><option>Newest</option><option>Random</option></select></label>
        <label><span>Period</span><select value={draft.period} onChange={(event) => setDraft({ ...draft, period: event.target.value as CivitaiGalleryConfig["period"] })}><option>Day</option><option>Week</option><option>Month</option><option>Year</option><option>AllTime</option></select></label>
        <label><span>Candidate pool</span><input type="number" min="20" max="200" value={draft.poolSize} onChange={(event) => setDraft({ ...draft, poolSize: Number(event.target.value) })} /><small>Sampled from a randomized SFW result page; filtering and shuffling happen in the browser.</small></label>
        <label><span>Base models</span><input value={draft.baseModels.join(", ")} onChange={(event) => setDraft({ ...draft, baseModels: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} placeholder="SDXL 1.0, Flux.1 D" /><small>Optional, comma separated.</small></label>
        <label><span>Required tag rule</span><select value={draft.includeMode} onChange={(event) => setDraft({ ...draft, includeMode: event.target.value as "any" | "all" })}><option value="any">Match any selected tag</option><option value="all">Match every selected tag</option></select></label>
      </div>
      <div className="tag-workbench">
        <div className="tag-workbench-tools">
          <div><strong>Tag workbench</strong><small>Click once to require, twice to strictly exclude, three times to clear.</small></div>
          <input type="search" value={tagSearch} onChange={(event) => setTagSearch(event.target.value)} placeholder="Filter discovered tags…" />
          <button type="button" disabled={loadingTags} onClick={() => void discoverTags()}>{loadingTags ? "Scanning…" : "Discover from pool"}</button>
        </div>
        <div className="tag-selection-summary">
          <span><b>{draft.includeTags.length}</b> selected</span>
          <span><b>{draft.excludeTags.length}</b> strict no</span>
          <span><b>{tags.length}</b> discovered</span>
        </div>
        <div className="tag-catalog">
          {visibleTags.length ? visibleTags.map((tag) => {
            const state = draft.includeTags.includes(tag.name) ? "include" : draft.excludeTags.includes(tag.name) ? "exclude" : "";
            return <button type="button" className={state} key={tag.name} onClick={() => cycleTag(tag.name)}><span>{state === "include" ? "+" : state === "exclude" ? "−" : "·"}</span>{tag.name}<small>{tag.count}</small></button>;
          }) : <p>{sample.length ? "No tags match this search." : "Discover a live sample to build the tag catalog."}</p>}
        </div>
      </div>
      <div className="art-dev-actions">
        <p>{saved ? "Preview saved locally and JSON generated." : <>Saving applies a local dev preview and generates <code>wonderdrive-art.config.json</code>. Replace the bundled file before a production build.</>}</p>
        <button type="button" onClick={saveConfig}>Save + generate JSON <i aria-hidden="true">↘</i></button>
      </div>
    </section>
  );
}

function SettingsView({
  viewer,
  savedJourneyCount,
  preferences,
  catalog,
  busy,
  onPreviewTextSize,
  onSave,
}: {
  viewer: Viewer | null;
  savedJourneyCount: number;
  preferences: UserPreferences;
  catalog: BootstrapCatalog;
  busy: boolean;
  onPreviewTextSize: (textSize: TextSize) => void;
  onSave: (next: UserPreferences) => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(preferences);
  const displayName = viewer?.displayName ?? t("Opening library…");
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "W";
  const detailPreference = draft.answerDensity === "brief" ? 0 : draft.answerDensity === "balanced" ? 1 : 2;
  const textSizeOptions: Array<{ id: TextSize; label: string }> = [
    { id: "s", label: t("Small") },
    { id: "m", label: t("Medium") },
    { id: "l", label: t("Large") },
    { id: "xl", label: t("Extra large") },
  ];

  const updateDetailPreference = (value: number) => {
    const answerDensity: AnswerDensity = value === 0 ? "brief" : value === 1 ? "balanced" : "rich";
    setDraft({ ...draft, answerDensity });
  };

  return (
    <section className="settings-view" aria-labelledby="settings-title">
      <header className="settings-heading">
        <div>
          <p className="eyebrow"><span /> {t("Your preferences")}</p>
          <h1 id="settings-title">{t("Settings")}</h1>
        </div>
        <p>{t("Tune how WonderDrive looks and answers.")}</p>
      </header>
      <div className="settings-layout">
        <aside className="account-card" aria-labelledby="account-title">
          <span className="account-avatar" aria-hidden="true">{initials}</span>
          <div className="account-identity">
            <span id="account-title">{t("Account")}</span>
            <strong>{displayName}</strong>
            <small>{t(viewer?.mode === "chatgpt" ? "ChatGPT account" : "Guest session")}</small>
          </div>
          <dl>
            <div><dt>{t("Saved")}</dt><dd>{savedJourneyCount} / {viewer?.journeyLimit ?? "—"}</dd></div>
            <div><dt>{t("Preferences")}</dt><dd>{t(viewer?.mode === "chatgpt" ? "Synced" : "This device")}</dd></div>
          </dl>
          {viewer?.mode === "chatgpt" ? (
            <a className="account-action danger" href="/signout-with-chatgpt?return_to=%2Fsettings">{t("Sign out")} <span aria-hidden="true">↗</span></a>
          ) : viewer?.mode === "guest" ? (
            <a className="account-action" href="/signin-with-chatgpt?return_to=%2Fsettings">{t("Sign in")} <span aria-hidden="true">↗</span></a>
          ) : null}
        </aside>

        <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}>
          <div className="settings-select-row">
            <label className="language-setting"><span>{t("Experience language")}</span><select value={draft.interfaceLocale} onChange={(event) => { const interfaceLocale = event.target.value as UserPreferences["interfaceLocale"]; const next = { ...draft, interfaceLocale, defaultOutputLocale: interfaceLocale }; setDraft(next); void onSave(next); }}>{SUPPORTED_LOCALES.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
            <label className="model-setting"><span>{t("Research model")}</span><select value={draft.defaultModelId} onChange={(event) => setDraft({ ...draft, defaultModelId: event.target.value as ModelId })}>{catalog.models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.speedBand}</option>)}</select></label>
          </div>
          <section className="preference-panel" aria-labelledby="answer-style-title" aria-describedby="preference-help">
            <header className="settings-section-heading">
              <h2 id="answer-style-title">{t("Answer style")}</h2>
              <p id="preference-help">{t("These choices change presentation, never research quality.")}</p>
            </header>
            <div className="preference-scales">
              <div className="visual-contract-setting">
                <span>Real-world visual evidence</span>
                <strong>Always on</strong>
                <p>Every new answer includes at least one sourced factual image. Generated artwork is never used as evidence.</p>
              </div>
              <label className="preference-scale">
                <span>{t("Answer detail")}</span>
                <output>{t(detailPreference === 0 ? "Quick read" : detailPreference === 1 ? "Just right" : "Deep dive")}</output>
                <input type="range" min="0" max="2" step="1" value={detailPreference} onChange={(event) => updateDetailPreference(Number(event.target.value))} aria-label={t("Preference for answer detail")} />
                <div aria-hidden="true"><span>{t("Quick read")}</span><span>{t("Balanced")}</span><span>{t("Deep dive")}</span></div>
              </label>
            </div>
          </section>
          <section className="comfort-panel" aria-labelledby="comfort-title">
            <header className="settings-section-heading">
              <h2 id="comfort-title">{t("Comfort")}</h2>
              <p>{t("Make the stage comfortable.")}</p>
            </header>
            <div className="text-size-setting">
              <span>{t("Text size")}</span>
              <div className="text-size-options" role="group" aria-label={t("Text size")}>
                {textSizeOptions.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={draft.textSize === option.id ? "selected" : ""}
                    aria-pressed={draft.textSize === option.id}
                    onClick={() => {
                      setDraft({ ...draft, textSize: option.id });
                      onPreviewTextSize(option.id);
                    }}
                  >
                    <strong>{option.label}</strong>
                    <span className={`text-size-sample size-${option.id}`}>{t("Ask anything…")}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="check-setting"><input type="checkbox" checked={draft.reduceMotion} onChange={(event) => setDraft({ ...draft, reduceMotion: event.target.checked })} /><span>{t("Reduce interface motion")}</span></label>
          </section>
          <div className="settings-actions">
            <small>{t(viewer?.mode === "chatgpt" ? "Synced to your ChatGPT identity" : "Saved to this guest session")}</small>
            <button className="launch-button" type="submit" disabled={busy}>{t(busy ? "Saving…" : "Save preferences")}<i aria-hidden="true">↘</i></button>
          </div>
        </form>
      </div>
      {process.env.NODE_ENV !== "production" && <details className="art-dev-disclosure"><summary>{t("Art settings")} <span>{t("Development only")}</span></summary><ArtGalleryDevSettings /></details>}
    </section>
  );
}

function LoadingStage() {
  const { t } = useI18n();
  return <section className="loading-stage" aria-live="polite"><span className="loading-orbit" /><p>{t("Opening your WonderDrive library…")}</p><small>{t("Resolving a durable guest identity")}</small></section>;
}

function EmptyStage({ onOpenLibrary, label = "Open the journey library" }: { onOpenLibrary: () => void; label?: string }) {
  const { t } = useI18n();
  return <section className="empty-stage"><span aria-hidden="true">?</span><h1>{t("No saved questions yet")}</h1><p>{t("Start a new question or return to one you have already saved.")}</p><button type="button" onClick={onOpenLibrary}>{t(label)} →</button></section>;
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
