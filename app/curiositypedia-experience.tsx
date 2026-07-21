"use client";

import {
  type Dispatch,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  ArrowsClockwise,
  BookmarkSimple,
  CaretRight,
  ArrowSquareOut,
  MagicWand,
  Pause,
  PencilSimple,
  Play,
  ShareNetwork,
  MoonStars,
  Sun,
  X,
} from "@phosphor-icons/react";

import {
  BOOTSTRAP_CATALOG,
  DEFAULT_PREFERENCES,
  PERFORMERS,
  PROMPT_VERSION,
} from "../lib/catalog";
import { LANDING_RECOMMENDATION_CATEGORIES, STARTING_QUESTION_MAX_LENGTH } from "../lib/contracts";
import type {
  AdvanceJourneyRequest,
  AnswerDensity,
  Bookmark,
  BootstrapCatalog,
  ApiFailure,
  ImportBookmarksResult,
  JourneyDetail,
  KnowledgeJourneySeed,
  JourneySnapshot,
  JourneySummary,
  JourneyTurn,
  LandingRecommendation,
  LandingRecommendationPage,
  ModelId,
  PerformerId,
  ResearchPreset,
  ResearchActivity,
  UsageSummary,
  UserPreferences,
  Viewer,
  LiveResearchRequest,
} from "../lib/contracts";
import { localeDirection } from "../lib/i18n";
import { canonicalImageQuestion, questionBearingMedia } from "../lib/knowledge-check-contracts";
import {
  api,
  diagnosticIdFrom,
  errorCodeFrom,
  type LiveResearchState,
  messageFrom,
  streamLiveResearch,
} from "./client-api";
import { migrateLegacyBookmarks } from "./bookmarks-client";
import { EmptyStage } from "./experience/empty-stage";
import { BookmarksView } from "./experience/bookmarks-view";
import { JourneyMap } from "./experience/journey-map";
import { JourneysView } from "./experience/journeys-view";
import { SettingsView } from "./experience/settings-view";
import { UsageView } from "./experience/usage-view";
import { AboutView } from "./experience/about-view";
import { KnowledgeCheckExperience } from "./experience/knowledge-check";
import { I18nProvider, translate, useI18n } from "./i18n";
import {
  journeyMapPath,
  journeyStagePath,
  parseCuriosityPediaRoute,
  staticRoutePath,
  type CuriosityPediaRoute,
} from "./routes";
import { validateDisplayImage } from "../lib/image-validation";

export const validateImage = validateDisplayImage;

const EMPTY_VALIDATED_IMAGE_URLS = new Set<string>();

function useImageValidation(urls: string[], progressive: boolean) {
  const validationKey = JSON.stringify([...new Set(urls)]);
  const [validation, setValidation] = useState<{
    key: string;
    validUrls: Set<string>;
    settled: boolean;
  }>(() => ({ key: validationKey, validUrls: new Set(), settled: urls.length === 0 }));

  useEffect(() => {
    let cancelled = false;
    const candidates = JSON.parse(validationKey) as string[];

    if (candidates.length === 0) {
      return () => { cancelled = true; };
    }

    const validations = candidates.map(async (url) => ({
      url,
      result: await validateImage(url),
    }));

    if (progressive) {
      for (const pending of validations) {
        void pending.then(({ url, result }) => {
          if (cancelled || !result.valid) return;
          setValidation((current) => {
            const next = current.key === validationKey
              ? new Set(current.validUrls)
              : new Set<string>();
            next.add(url);
            return { key: validationKey, validUrls: next, settled: false };
          });
        });
      }
    }

    void Promise.all(validations).then((results) => {
      if (cancelled) return;
      const validUrls = progressive
        ? null
        : new Set(results.filter(({ result }) => result.valid).map(({ url }) => url));
      setValidation((current) => ({
        key: validationKey,
        validUrls: validUrls ?? (current.key === validationKey ? current.validUrls : new Set()),
        settled: true,
      }));
    });

    return () => { cancelled = true; };
  }, [progressive, validationKey]);

  if (validationKey === "[]") {
    return { key: validationKey, validUrls: EMPTY_VALIDATED_IMAGE_URLS, settled: true };
  }

  return validation.key === validationKey
    ? validation
    : { key: validationKey, validUrls: EMPTY_VALIDATED_IMAGE_URLS, settled: false };
}

function useValidatedImageUrls(urls: string[]) {
  return useImageValidation(urls, true).validUrls;
}

const HTMLFlipBook = dynamic(() => import("react-pageflip"), { ssr: false });

type View = "start" | "journey" | "map" | "journeys" | "bookmarks" | "usage" | "settings" | "about";
type Theme = "light" | "dark";
type CelestialMarkVariant = "brand" | "loader" | "status";

type SessionPayload = {
  journeys: JourneySummary[];
};

type BootstrapPayload = {
  catalog: BootstrapCatalog;
  preferences: UserPreferences;
};

type JourneyViewOptions = {
  turnId?: string;
  view?: View;
  syncJourneys?: boolean;
  history?: "push" | "replace" | "none";
};

const navItems: Array<{ id: View; label: string }> = [
  { id: "start", label: "Home" },
  { id: "journeys", label: "Journeys" },
  { id: "bookmarks", label: "Bookmarks" },
  { id: "usage", label: "Usage" },
  { id: "settings", label: "Settings" },
  { id: "about", label: "About" },
];

function viewFromRoute(route: CuriosityPediaRoute | null): View {
  if (!route) return "start";
  if (route.name === "journey") return route.surface === "map" ? "map" : "journey";
  return route.name;
}

type ResearchPreview = Pick<
  LandingRecommendation,
  "question" | "teaser" | "imageUrl" | "imageAlt" | "sourceLabel" | "sourceUrl"
>;

const DISCOVERY_CATEGORIES = ["All", ...LANDING_RECOMMENDATION_CATEGORIES] as const;

function CelestialMark({
  variant,
  state,
}: {
  variant: CelestialMarkVariant;
  state?: LiveResearchState["status"];
}) {
  return (
    <span className={`celestial-mark celestial-mark-${variant} ${state ?? ""}`} aria-hidden="true">
      <span className="celestial-orbit-line" />
      <span className="celestial-moon" />
      <span className="celestial-earth">
        <span className="celestial-map" />
        <span className="celestial-grid" />
      </span>
    </span>
  );
}

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
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [liveResearch, setLiveResearch] = useState<LiveResearchState | null>(null);
  const [researchActivities, setResearchActivities] = useState<ResearchActivity[]>([]);
  const [researchPreview, setResearchPreview] = useState<ResearchPreview | null>(null);
  const [catalog, setCatalog] = useState<BootstrapCatalog>(BOOTSTRAP_CATALOG);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [nextModelId, setNextModelId] = useState<ModelId | null>(null);
  const [nextPerformerId, setNextPerformerId] = useState<PerformerId | null>(null);
  const [sourcesRequestToken, setSourcesRequestToken] = useState(0);
  const [theme, setTheme] = useState<Theme>("light");
  const activeJourneyRef = useRef(activeJourney);
  const journeysRef = useRef(journeys);
  const viewerRef = useRef(viewer);
  const preferencesRef = useRef(preferences);
  const liveResearchRef = useRef(liveResearch);
  const liveResearchAbortRef = useRef<AbortController | null>(null);
  const pendingResearchRef = useRef<LiveResearchRequest | null>(null);
  const takeoverRequestIdRef = useRef<string | null>(null);
  activeJourneyRef.current = activeJourney;
  journeysRef.current = journeys;
  viewerRef.current = viewer;
  preferencesRef.current = preferences;
  liveResearchRef.current = liveResearch;
  const returnTo = encodeURIComponent(`${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`);
  const t = (key: string, values?: Record<string, string | number>) => translate(preferences.interfaceLocale, key, values);

  useEffect(() => {
    document.documentElement.dataset.textSize = preferences.textSize;
    return () => {
      delete document.documentElement.dataset.textSize;
    };
  }, [preferences.textSize]);

  useEffect(() => {
    const activeTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    // Theme is initialized by the pre-hydration script in app/layout.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(activeTheme);
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem("curiositypedia-theme", nextTheme);
  }

  const refreshSession = useCallback(async () => {
    setError(null);
    setErrorCode(null);
    try {
      // Resolve the session first so a new guest cookie is established before
      // identity-scoped reads race in parallel.
      const session = await api<SessionPayload>("/api/session");
      const [bootstrap, bookmarkPayload] = await Promise.all([
        api<BootstrapPayload>("/api/bootstrap"),
        api<Bookmark[]>("/api/bookmarks"),
      ]);
      setViewer(session.viewer);
      setJourneys(session.data.journeys);
      setCatalog(bootstrap.data.catalog);
      setPreferences(bootstrap.data.preferences);
      setBookmarks(bookmarkPayload.data);
      try {
        const imported = await migrateLegacyBookmarks(
          window.localStorage,
          async (entries) => {
            const payload = await api<ImportBookmarksResult>("/api/bookmarks/import", {
              method: "POST",
              body: JSON.stringify({ entries }),
            });
            setViewer(payload.viewer);
            return payload.data.bookmarks;
          },
        );
        if (imported) setBookmarks(imported);
      } catch (cause) {
        setError(messageFrom(cause));
        setErrorCode(errorCodeFrom(cause));
      }
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
      syncJourneys = true,
      history = "push",
    }: JourneyViewOptions = {},
  ) => {
    setViewer(nextViewer);
    setActiveJourney(detail);
    setNextModelId(detail.modelId);
    setNextPerformerId(detail.performerId);
    setActiveTurnId(turnId);
    setView(view);
    if (syncJourneys) setJourneys((current) => upsertSummary(current, detail));
    if (history !== "none") {
      const href = view === "map"
        ? journeyMapPath(detail.id, turnId)
        : journeyStagePath(detail.id, turnId);
      router[history](href);
    }
  }, [router]);

  const refreshResearchActivities = useCallback(async () => {
    try {
      const activityT = (key: string) => translate(preferencesRef.current.interfaceLocale, key);
      const payload = await api<ResearchActivity[]>("/api/research/background");
      setViewer(payload.viewer);
      setResearchActivities(payload.data);
      if (payload.data.some((activity) => activity.status === "ready"
        && activity.journeyId
        && !journeysRef.current.some((journey) => journey.id === activity.journeyId))) {
        const session = await api<SessionPayload>("/api/session");
        setViewer(session.viewer);
        setJourneys(session.data.journeys);
      }
      const current = liveResearchRef.current;
      const matching = current?.diagnosticId
        ? payload.data.find((activity) => activity.id === current.diagnosticId)
        : null;
      if (current?.status === "running" && matching?.status === "researching") {
        setLiveResearch((state) => state && {
          ...state,
          message: matching.phase === "finalizing"
            ? activityT("Checking citations and finding images")
            : activityT("Searching sources and writing the answer"),
        });
      }
      if (current?.status === "running" && matching?.status === "ready" && matching.journeyId) {
        const journey = await api<JourneyDetail>(`/api/journeys/${matching.journeyId}`);
        presentJourney(journey.data, journey.viewer);
        setLiveResearch((state) => state && {
          ...state,
          status: "complete",
          result: journey.data,
          message: activityT("Research committed"),
        });
      } else if (current?.status === "running" && matching?.status === "failed") {
        setLiveResearch((state) => state && {
          ...state,
          status: "error",
          error: matching.error ?? activityT("Research stopped"),
          message: activityT("Research stopped"),
        });
      }
    } catch (cause) {
      // A temporary status refresh failure should not replace the page the user is viewing.
      console.error("Unable to refresh background research activity", cause);
    }
  }, [presentJourney]);

  useEffect(() => {
    // Establish the identity cookie before reading identity-scoped background work.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSession().then(refreshResearchActivities);
  }, [refreshResearchActivities, refreshSession]);

  const researchingCount = researchActivities.filter((activity) => activity.status === "researching").length;
  useEffect(() => {
    if (!researchingCount) return;
    const interval = window.setInterval(() => void refreshResearchActivities(), 5_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshResearchActivities();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [refreshResearchActivities, researchingCount]);

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
        syncJourneys: false,
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
    outputLocale: UserPreferences["defaultOutputLocale"];
    preview?: ResearchPreview;
  }) {
    if (viewer && journeys.length >= viewer.journeyLimit) {
      setErrorCode("JOURNEY_LIMIT");
      setError(t("Your journey capacity is full ({count}/{limit}). Delete one journey to make room.", {
        count: journeys.length,
        limit: viewer.journeyLimit,
      }));
      navigate("journeys");
      return;
    }
    await runMutation("create", async () => {
      const { preview, ...requestConfig } = config;
      setResearchPreview(preview ?? null);
      setView("journey");
      setLiveResearch({
        question: config.seed,
        performerId: config.performerId,
        message: t("Researching in the background. You can safely leave this page."),
        events: [],
        status: "running",
        result: null,
        error: null,
        errorCode: null,
        diagnosticId: null,
        retryAttempt: 0,
        maxRetries: 0,
      });
      const request: LiveResearchRequest = { kind: "create", ...requestConfig, idempotencyKey: crypto.randomUUID() };
      pendingResearchRef.current = request;
      const started = await api<ResearchActivity>("/api/research/background", {
        method: "POST",
        body: JSON.stringify(request),
      });
      setViewer(started.viewer);
      setResearchActivities((current) => [
        started.data,
        ...current.filter((activity) => activity.id !== started.data.id),
      ]);
      setLiveResearch((current) => current && {
        ...current,
        diagnosticId: started.data.id,
        message: t("Researching in the background. You can safely leave this page."),
      });
    }, (message) => {
      setLiveResearch((current) =>
        current ? { ...current, status: "error", error: message, message: t("Research stopped") } : null,
      );
    });
  }

  async function exploreKnowledgeQuestion(seed: KnowledgeJourneySeed, fromTurnId: string) {
    if (!activeJourney) return;
    const modelId = nextModelId ?? activeJourney.modelId;
    await runMutation("explore", async () => {
      setResearchPreview({
        question: seed.question,
        teaser: seed.imageCaption,
        imageUrl: seed.imageUrl,
        imageAlt: seed.imageAlt,
        sourceLabel: seed.imageSourceLabel,
        sourceUrl: seed.imageSourceUrl,
      });
      setView("journey");
      setLiveResearch({
        question: seed.question,
        performerId: activeJourney.performerId,
        message: t("Researching in the background. You can safely leave this page."),
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
        fromTurnId,
        action: "explore",
        modelId,
        question: seed.question,
        sourcePageUrl: seed.imageSourceUrl,
        expectedVersion: activeJourney.version,
        idempotencyKey: crypto.randomUUID(),
      };
      pendingResearchRef.current = request;
      const started = await api<ResearchActivity>("/api/research/background", {
        method: "POST",
        body: JSON.stringify(request),
      });
      setViewer(started.viewer);
      setResearchActivities((current) => [
        started.data,
        ...current.filter((activity) => activity.id !== started.data.id),
      ]);
      setLiveResearch((current) => current && {
        ...current,
        diagnosticId: started.data.id,
        message: t("Researching in the background. You can safely leave this page."),
      });
    }, (message) => {
      setLiveResearch((current) => current
        ? { ...current, status: "error", error: message, message: t("Research stopped") }
        : null);
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
          message: t("Researching in the background. You can safely leave this page."),
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
        const started = await api<ResearchActivity>("/api/research/background", {
          method: "POST",
          body: JSON.stringify(request),
        });
        setViewer(started.viewer);
        setResearchActivities((current) => [
          started.data,
          ...current.filter((activity) => activity.id !== started.data.id),
        ]);
        setLiveResearch((current) => current && {
          ...current,
          diagnosticId: started.data.id,
          message: t("Researching in the background. You can safely leave this page."),
        });
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
    const previewMedia = activeTurn.media[0];
    await create({
      seed: activeTurn.question,
      performerId: nextPerformerId ?? activeJourney.performerId,
      modelId: nextModelId ?? activeJourney.modelId,
      researchPreset: "standard",
      answerDensity: preferences.answerDensity,
      outputLocale: preferences.defaultOutputLocale,
      preview: previewMedia ? {
        question: activeTurn.question,
        teaser: previewMedia.caption,
        imageUrl: previewMedia.imageUrl,
        imageAlt: previewMedia.alt,
        sourceLabel: previewMedia.title ?? activeTurn.topicLabel,
        sourceUrl: previewMedia.sourcePageUrl,
      } : undefined,
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
      setBookmarks((current) => current.filter((bookmark) => bookmark.journeyId !== journeyId));
      if (activeJourney?.id === journeyId) {
        setActiveJourney(null);
        setActiveTurnId(null);
        navigate("journeys");
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

  async function toggleTurnBookmark(journeyId: string, turnId: string) {
    const saved = bookmarks.some((bookmark) => bookmark.turnId === turnId);
    await runMutation(`bookmark-${turnId}`, async () => {
      if (saved) {
        await api<{ turnId: string }>(`/api/bookmarks/${turnId}`, { method: "DELETE" });
        setBookmarks((current) => current.filter((bookmark) => bookmark.turnId !== turnId));
        return;
      }
      const payload = await api<Bookmark>("/api/bookmarks", {
        method: "POST",
        body: JSON.stringify({ journeyId, turnId }),
      });
      setViewer(payload.viewer);
      setBookmarks((current) => [
        payload.data,
        ...current.filter((bookmark) => bookmark.turnId !== payload.data.turnId),
      ]);
    });
  }

  function navigate(next: View) {
    if ((next === "journey" || next === "map") && !activeJourney) {
      const fallback = journeys.length ? "journeys" : "start";
      setView(fallback);
      router.push(staticRoutePath(fallback));
      return;
    }
    liveResearchAbortRef.current?.abort();
    liveResearchAbortRef.current = null;
    setView(next);
    setLiveResearch(null);
    setResearchPreview(null);
    const href = next === "journey"
      ? journeyStagePath(activeJourney!.id, activeTurnId ?? activeJourney!.currentTurnId)
      : next === "map"
        ? journeyMapPath(activeJourney!.id, activeTurnId ?? activeJourney!.currentTurnId)
        : staticRoutePath(next);
    router.push(href);
  }

  return (
    <I18nProvider locale={preferences.interfaceLocale}>
    <main className={`app-shell ${preferences.reduceMotion ? "reduce-motion" : ""} ${view === "journey" && activeJourney && activeTurn ? "journey-stage-active" : ""} ${view === "map" && activeJourney && activeTurn ? "journey-map-active" : ""}`}>
      <header className="app-header">
        <button className="wordmark" type="button" onClick={() => navigate("start")}>
          <CelestialMark variant="brand" />
          <span>
            CuriosityPedia
            <small>{t("A field guide to everything")}</small>
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
              {item.id === "start" ? item.label : t(item.label)}
            </button>
          ))}
        </nav>

        {researchingCount > 0 && (
          <button
            type="button"
            className="research-activity-button"
            onClick={() => navigate("journeys")}
          >
            <span aria-hidden="true" />
            {t("Researching {count}", { count: researchingCount })}
          </button>
        )}

        <div className="header-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "light" ? t("Switch to dark edition") : t("Switch to light edition")}
            title={theme === "light" ? t("Switch to dark edition") : t("Switch to light edition")}
          >
            <Sun weight="fill" aria-hidden="true" />
            <span aria-hidden="true" />
            <MoonStars weight="fill" aria-hidden="true" />
          </button>
          <div className="identity-control">
            <span className={`identity-dot ${viewer?.mode ?? "loading"}`} aria-hidden="true" />
            {viewer?.mode === "chatgpt" ? (
              <span><strong>{viewer.displayName}</strong><small>{t("ChatGPT account")}</small></span>
            ) : (
            <span><strong>{viewer?.displayName ?? t("Opening journeys…")}</strong><small>{viewer ? t("{count}/{limit} saved", { count: journeys.length, limit: viewer.journeyLimit }) : t("durable session")}</small></span>
            )}
            {viewer?.mode === "guest" ? (
              <a className="identity-action" href={`/signin-with-chatgpt?return_to=${returnTo}`}>{t("Sign in")}</a>
            ) : viewer?.mode === "chatgpt" ? (
              <a className="identity-action" href={`/signout-with-chatgpt?return_to=${returnTo}`}>{t("Sign out")}</a>
            ) : null}
          </div>
        </div>
      </header>

      {viewer?.mode === "chatgpt" && viewer.hasGuestUpgrade && (
        <div className="upgrade-banner" role="status">
          <span>{t("Your guest journeys are still separate.")}</span>
          <button type="button" onClick={() => void upgradeGuestJourneys(setViewer, refreshSession, setError)}>
            {t("Move guest journeys into this account")}
          </button>
        </div>
      )}

      {error && !liveResearch && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <div className="error-banner-actions">
            {errorCode === "JOURNEY_LIMIT" ? (
              <button type="button" onClick={() => { setError(null); navigate("journeys"); }}>{t("Manage saved journeys")}</button>
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
          preview={researchPreview}
          errorCode={liveResearch.errorCode ?? errorCode}
          onComplete={() => {
            if (liveResearch.result) {
              setActiveJourney(liveResearch.result);
              setActiveTurnId(liveResearch.result.currentTurnId);
            }
            setLiveResearch(null);
            setResearchPreview(null);
            setView("journey");
          }}
          onBack={() => {
            setLiveResearch(null);
            setResearchPreview(null);
            setError(null);
            setErrorCode(null);
            if ((liveResearch.errorCode ?? errorCode) === "JOURNEY_LIMIT") navigate("journeys");
            else if (["LIVE_RESEARCH_LIMIT", "BUDGET_EXCEEDED"].includes(liveResearch.errorCode ?? errorCode ?? "")) navigate("usage");
            else navigate(activeJourney ? "journey" : "start");
          }}
          onTakeOver={errorCode === "ALREADY_IN_PROGRESS" ? () => void takeOverResearch() : undefined}
        />
      ) : view === "start" ? (
        <StartStage
          onCreate={create}
          creating={mutation === "create"}
          preferences={preferences}
        />
      ) : view === "journeys" ? (
        <JourneysView
          journeys={journeys}
          activities={researchActivities}
          viewer={viewer}
          busy={mutation}
          onOpen={(id) => void openJourney(id, "map")}
          onDelete={(id) => void removeJourney(id)}
          onManage={(id, changes) => void manageJourney(id, changes)}
          onRetry={(id) => void runMutation(`retry-${id}`, async () => {
            const payload = await api<ResearchActivity>(`/api/research/background/${id}/retry`, { method: "POST" });
            setViewer(payload.viewer);
            setResearchActivities((current) => [payload.data, ...current.filter((activity) => activity.id !== id)]);
          })}
          onCancel={(id) => void runMutation(`cancel-${id}`, async () => {
            const payload = await api<ResearchActivity>(`/api/research/background/${id}`, { method: "DELETE" });
            setViewer(payload.viewer);
            setResearchActivities((current) => [
              payload.data,
              ...current.filter((activity) => activity.id !== id),
            ]);
            setLiveResearch((current) => current?.diagnosticId === id ? {
              ...current,
              status: "error",
              error: payload.data.error ?? t("Research stopped"),
              message: t("Research stopped"),
            } : current);
          })}
          onDismiss={(id) => void runMutation(`dismiss-${id}`, async () => {
            const payload = await api<ResearchActivity>(`/api/research/background/${id}?dismiss=true`, { method: "DELETE" });
            setViewer(payload.viewer);
            setResearchActivities((current) => current.filter((activity) => activity.id !== id));
          })}
          onNew={() => navigate("start")}
        />
      ) : view === "bookmarks" ? (
        <BookmarksView
          bookmarks={bookmarks}
          onOpen={(journeyId, turnId) => router.push(journeyStagePath(journeyId, turnId))}
          onRemove={(turnId) => {
            const bookmark = bookmarks.find((item) => item.turnId === turnId);
            if (bookmark) void toggleTurnBookmark(bookmark.journeyId, turnId);
          }}
          onNew={() => navigate("start")}
        />
      ) : view === "usage" ? (
        <UsageView
          usage={usage}
          viewer={viewer}
          loading={usageLoading}
          error={usageError}
          onRefresh={() => void refreshUsage()}
          onOpenJourneys={() => navigate("journeys")}
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
            });
          }}
        />
      ) : view === "about" ? (
        <AboutView onBegin={() => navigate("start")} />
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
                <span>Personality</span>
                <select
                  aria-label="Personality"
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
            <div className="journey-session-question" aria-label={t("Current knowledge session question")}>
              <span><i aria-hidden="true" /> Knowledge session · {t("Turn {number}", { number: activeTurn.depth + 1 })}</span>
              <strong>{activeTurn.question}</strong>
            </div>
            <div className="journey-view-controls">
              <button type="button" className={view === "journey" ? "active" : ""} aria-current={view === "journey" ? "page" : undefined} onClick={() => navigate("journey")}>{t("Full answer")}</button>
              <button type="button" className={view === "map" ? "active" : ""} aria-current={view === "map" ? "page" : undefined} onClick={() => navigate("map")}>{t("Journey map")}</button>
              {view === "journey" && <>
                <button type="button" className="journey-source-control" onClick={() => setSourcesRequestToken((current) => current + 1)}>Sources <span>{activeTurn.sources.length}</span></button>
                <button
                  type="button"
                  className={`journey-save-control ${bookmarks.some((bookmark) => bookmark.turnId === activeTurn.id) ? "saved" : ""}`}
                  aria-pressed={bookmarks.some((bookmark) => bookmark.turnId === activeTurn.id)}
                  onClick={() => void toggleTurnBookmark(activeJourney.id, activeTurn.id)}
                >
                  <BookmarkSimple weight={bookmarks.some((bookmark) => bookmark.turnId === activeTurn.id) ? "fill" : "regular"} aria-hidden="true" />
                  {bookmarks.some((bookmark) => bookmark.turnId === activeTurn.id) ? "Saved" : "Save"}
                </button>
              </>}
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
              onExploreKnowledge={(turnId, seed) => void exploreKnowledgeQuestion(seed, turnId)}
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
              bookmarked={bookmarks.some((bookmark) => bookmark.turnId === activeTurn.id)}
              onBookmark={() => void toggleTurnBookmark(activeJourney.id, activeTurn.id)}
              onKnowledgeDeepDive={(seed) => void exploreKnowledgeQuestion(seed, activeTurn.id)}
              sourcesRequestToken={sourcesRequestToken}
            />
          )}
        </div>
      ) : (
        <EmptyStage onOpenJourneys={() => navigate("journeys")} />
      )}

      {view !== "start" && (
        <footer className="app-footer">
          <p><span aria-hidden="true">W/V3</span> One personality. One researched turn. Exactly two ways forward.</p>
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
  preferences,
}: {
  onCreate: (config: {
    seed: string;
    performerId: PerformerId;
    modelId: ModelId;
    researchPreset: ResearchPreset;
    answerDensity: AnswerDensity;
    outputLocale: UserPreferences["defaultOutputLocale"];
    preview?: ResearchPreview;
  }) => void;
  creating: boolean;
  preferences: UserPreferences;
}) {
  const { t } = useI18n();
  const [seed, setSeed] = useState("");
  const [questionLimitOpen, setQuestionLimitOpen] = useState(false);
  const questionInputRef = useRef<HTMLTextAreaElement>(null);
  const performerId: PerformerId = "sage";
  const modelId = preferences.defaultModelId;
  const [category, setCategory] = useState<(typeof DISCOVERY_CATEGORIES)[number]>("All");
  const [loadedCategory, setLoadedCategory] = useState<(typeof DISCOVERY_CATEGORIES)[number]>("All");
  const [failedEncounterIds, setFailedEncounterIds] = useState<string[]>([]);
  const catalogRequestRef = useRef(0);
  const [recommendationPage, setRecommendationPage] = useState<LandingRecommendationPage>({
    batchId: null,
    batchTitle: null,
    publishedAt: null,
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0,
    items: [],
  });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const placeholderQuestions = useMemo(
    () => recommendationPage.items.slice(0, 8).map((item) => item.question),
    [recommendationPage.items],
  );
  const animatedPlaceholder = useQuestionPlaceholder(
    placeholderQuestions,
    seed.length === 0 && !preferences.reduceMotion,
  );
  const visibleEncounters = loadedCategory === category ? recommendationPage.items : [];

  const loadRecommendationPage = useCallback(async (
    page: number,
    selectedCategory: (typeof DISCOVERY_CATEGORIES)[number],
  ) => {
    const requestId = ++catalogRequestRef.current;
    setCatalogLoading(true);
    setCatalogError(null);
    setFailedEncounterIds([]);
    const searchParams = new URLSearchParams({ page: String(page) });
    if (selectedCategory !== "All") searchParams.set("category", selectedCategory);
    try {
      const response = await api<LandingRecommendationPage>(`/api/landing-recommendations?${searchParams}`);
      if (catalogRequestRef.current !== requestId) return;
      setRecommendationPage(response.data);
      setLoadedCategory(selectedCategory);
    } catch (cause) {
      if (catalogRequestRef.current !== requestId) return;
      setCatalogError(messageFrom(cause));
    } finally {
      if (catalogRequestRef.current === requestId) setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadRecommendationPage(1, "All"), 0);
    return () => {
      window.clearTimeout(timeoutId);
      catalogRequestRef.current += 1;
    };
  }, [loadRecommendationPage]);

  useEffect(() => {
    if (!questionLimitOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setQuestionLimitOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [questionLimitOpen]);

  function updateSeed(value: string) {
    if (value.length > STARTING_QUESTION_MAX_LENGTH) {
      setQuestionLimitOpen(true);
      return;
    }
    setSeed(value);
  }

  function closeQuestionLimit() {
    setQuestionLimitOpen(false);
    window.requestAnimationFrame(() => questionInputRef.current?.focus());
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
        outputLocale: preferences.defaultOutputLocale,
      });
    }
  }

  function explore(encounter: LandingRecommendation) {
    onCreate({
      seed: encounter.question,
      performerId,
      modelId,
      researchPreset: "standard",
      answerDensity: preferences.answerDensity,
      outputLocale: preferences.defaultOutputLocale,
      preview: {
        question: encounter.question,
        teaser: encounter.teaser,
        imageUrl: encounter.imageUrl,
        imageAlt: encounter.imageAlt,
        sourceLabel: encounter.sourceLabel,
        sourceUrl: encounter.sourceUrl,
      },
    });
  }

  function surpriseMe() {
    const encounter = visibleEncounters[Math.floor(Math.random() * visibleEncounters.length)];
    if (!encounter) return;
    explore(encounter);
  }

  function selectCategory(selectedCategory: (typeof DISCOVERY_CATEGORIES)[number]) {
    if (selectedCategory === category && loadedCategory === category && !catalogError) return;
    setCategory(selectedCategory);
    void loadRecommendationPage(1, selectedCategory);
  }

  return (
    <section className="start-stage-simple" aria-label="Curiosity discovery board">
      <form className="discovery-landing" onSubmit={submit}>
        <div className="discovery-search-hero">
          <div className="question-field-shell">
            <label className="question-input question-input-simple">
              <span className="sr-only">{t("Starting question")}</span>
              <textarea
                ref={questionInputRef}
                value={seed}
                onChange={(event) => updateSeed(event.target.value)}
                minLength={3}
                rows={2}
                required
                placeholder={preferences.reduceMotion ? placeholderQuestions[0] ?? t("Ask anything…") : animatedPlaceholder}
              />
              <button className="question-submit" type="submit" disabled={creating || seed.trim().length < 3}>
                <span>{t(creating ? "Researching…" : "Begin wonder")}</span>
                <i aria-hidden="true">→</i>
              </button>
            </label>
          </div>
        </div>

        <nav className="discovery-categories" aria-label="Browse concept categories">
          {DISCOVERY_CATEGORIES.map((item) => (
            <button
              key={item}
              className={category === item ? "active" : ""}
              type="button"
              aria-pressed={category === item}
              onClick={() => selectCategory(item)}
            >
              {item}
            </button>
          ))}
          <button type="button" onClick={surpriseMe}>Surprise me</button>
        </nav>

        <div className={`discovery-grid ${category !== "All" ? "filtered" : ""}`} aria-live="polite" aria-busy={creating || catalogLoading}>
          {visibleEncounters.map((encounter, index) => (
            <article className="discovery-card" key={encounter.id}>
              <button
                className="discovery-card-image"
                type="button"
                onClick={() => explore(encounter)}
                disabled={creating}
                aria-label={`Explore: ${encounter.question}`}
              >
                {failedEncounterIds.includes(encounter.id) ? (
                  <span className="discovery-card-image-fallback" role="img" aria-label={encounter.imageAlt}>
                    <span>{encounter.category}</span>
                  </span>
                ) : (
                  /* Editorial images are remote, source-controlled URLs and retain their original delivery semantics. */
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={encounter.imageUrl}
                    alt={encounter.imageAlt}
                    loading={index > 7 ? "lazy" : "eager"}
                    decoding="async"
                    onError={() => setFailedEncounterIds((current) => current.includes(encounter.id) ? current : [...current, encounter.id])}
                  />
                )}
              </button>
              <div className="discovery-card-copy">
                <div className="discovery-card-meta">
                  <span className="discovery-card-category">{encounter.category}</span>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </div>
                <h2>{encounter.question}</h2>
                <p>{encounter.teaser}</p>
                <div className="discovery-card-actions">
                  <a href={encounter.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open ${encounter.sourceLabel} source in a new tab`}>
                    {encounter.sourceLabel}<ArrowSquareOut aria-hidden="true" />
                  </a>
                  <button type="button" onClick={() => explore(encounter)} disabled={creating}>
                    {creating ? "Opening…" : "Explore"}<ArrowRight aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
        {catalogLoading && (
          <p className="discovery-catalog-status">
            {category === "All" ? "Opening the latest editorial page…" : `Gathering all ${category.toLowerCase()} topics…`}
          </p>
        )}
        {!catalogLoading && catalogError && (
          <p className="discovery-catalog-status" role="alert">
            {catalogError} <button type="button" onClick={() => void loadRecommendationPage(recommendationPage.page, category)}>Try again</button>
          </p>
        )}
        {!catalogLoading && !catalogError && visibleEncounters.length === 0 && (
          <p className="discovery-catalog-status">
            {category === "All" ? "No recommendation pages have been published yet." : `No ${category.toLowerCase()} topics have been published yet.`}
          </p>
        )}
        {loadedCategory === category && recommendationPage.totalPages > 1 && (
          <nav className="discovery-pagination" aria-label="Recommendation archive pages">
            <button
              type="button"
              disabled={catalogLoading || recommendationPage.page <= 1}
              onClick={() => void loadRecommendationPage(recommendationPage.page - 1, category)}
            >
              ← Page Up
            </button>
            <div className="discovery-page-numbers">
              {Array.from({ length: recommendationPage.totalPages }, (_, index) => index + 1).map((page) => (
                <button
                  key={page}
                  className={page === recommendationPage.page ? "active" : ""}
                  type="button"
                  aria-label={`Open recommendation page ${page}`}
                  aria-current={page === recommendationPage.page ? "page" : undefined}
                  disabled={catalogLoading || page === recommendationPage.page}
                  onClick={() => void loadRecommendationPage(page, category)}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={catalogLoading || recommendationPage.page >= recommendationPage.totalPages}
              onClick={() => void loadRecommendationPage(recommendationPage.page + 1, category)}
            >
              Page Down →
            </button>
          </nav>
        )}
      </form>
      {questionLimitOpen && (
        <div className="question-limit-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeQuestionLimit(); }}>
          <section className="question-limit-dialog" role="alertdialog" aria-modal="true" aria-labelledby="question-limit-title" aria-describedby="question-limit-description">
            <span>Question length</span>
            <h2 id="question-limit-title">That question needs a shorter frame.</h2>
            <p id="question-limit-description">Keep it under 5,000 characters, then begin the wonder again. Your current question is still here.</p>
            <button type="button" autoFocus onClick={closeQuestionLimit}>Return to my question</button>
          </section>
        </div>
      )}
    </section>
  );
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
  preview,
  errorCode,
  onComplete,
  onBack,
  onTakeOver,
}: {
  state: LiveResearchState;
  preview: ResearchPreview | null;
  errorCode: ApiFailure["error"]["code"] | null;
  onComplete: () => void;
  onBack: () => void;
  onTakeOver?: () => void;
}) {
  const { t } = useI18n();
  // Card images were already rendered successfully before the learner clicked
  // them. Show that image immediately instead of making the loading state wait
  // for a second size probe.
  const renderablePreview = preview;
  useEffect(() => {
    if (state.status !== "complete") return;
    const timer = window.setTimeout(onComplete, 650);
    return () => window.clearTimeout(timer);
  }, [onComplete, state.status]);

  const performer = PERFORMERS.find((item) => item.id === state.performerId) ?? PERFORMERS[0];
  const capacityError = errorCode === "JOURNEY_LIMIT";
  const usageError = errorCode === "LIVE_RESEARCH_LIMIT" || errorCode === "BUDGET_EXCEEDED";
  const stoppedLabel = capacityError ? t("Journey capacity full") : usageError ? t("Usage limit reached") : t("Research stopped");
  const activity = state.events.slice(-5);
  const workingLabel = state.retryAttempt > 0
    ? t("Retrying {attempt} of {max}", { attempt: state.retryAttempt, max: state.maxRetries })
    : activity.at(-1)?.label ?? state.message;

  return (
    <section className="knowledge-loading" aria-labelledby="buffering-title" aria-busy={state.status === "running"}>
      <div className="knowledge-loading-intro">
        <p className="knowledge-session-kicker"><span /> Knowledge Session · {performer.name}</p>
        <h1 id="buffering-title">{state.question}</h1>
        <p>{preview?.teaser ?? "A source-backed visual explanation is being assembled around your question."}</p>
        <div className={`knowledge-loading-current ${state.status}`} role="status" aria-live="polite">
          <CelestialMark variant="status" state={state.status} />
          <div>
            <strong>{state.status === "complete" ? "The session is ready" : state.status === "error" ? stoppedLabel : "Building your visual story"}</strong>
            <small>{state.status === "running" ? workingLabel : state.status === "complete" ? "Arranging the final page" : state.error}</small>
          </div>
        </div>
      </div>

      <figure className={`knowledge-loading-hero ${renderablePreview ? "has-preview" : "without-preview"}`}>
        {renderablePreview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="knowledge-loading-hero-backdrop" src={renderablePreview.imageUrl} alt="" aria-hidden="true" referrerPolicy="no-referrer" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="knowledge-loading-hero-artwork" src={renderablePreview.imageUrl} alt={renderablePreview.imageAlt} referrerPolicy="no-referrer" />
            <figcaption><span>Starting image</span><a href={renderablePreview.sourceUrl} target="_blank" rel="noreferrer">{renderablePreview.sourceLabel} ↗</a></figcaption>
          </>
        ) : <div className="knowledge-loading-placeholder" aria-hidden="true"><i /><i /><i /></div>}
      </figure>

      <div className="knowledge-loading-filmstrip" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => <span key={index} style={{ animationDelay: `${index * 90}ms` }} />)}
      </div>

      <section className="knowledge-loading-ledger" aria-label="Research progress">
        <p>Research desk</p>
        <ol>
          {(activity.length ? activity : [
            { id: "starting", label: "Preparing source and image searches" },
            { id: "collecting", label: "Collecting high-quality visual evidence" },
            { id: "editing", label: "Planning the editorial sequence" },
          ]).map((event, index) => (
            <li key={event.id} className={index === activity.length - 1 ? "current" : ""}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{event.label}</p>
            </li>
          ))}
        </ol>
      </section>

      {state.status === "error" && (
        <div className="knowledge-loading-recovery" role="alert">
          <p><strong>{capacityError ? t("Your journeys need space.") : usageError ? "The current usage window is full." : "This attempt stopped safely."}</strong> {state.error}</p>
          {state.diagnosticId && <small>Diagnostic {formatDiagnosticId(state.diagnosticId)}</small>}
          <div>
            {onTakeOver && <button type="button" onClick={onTakeOver}>{t("Use this tab")}</button>}
            <button type="button" onClick={onBack}>{capacityError ? t("Manage saved journeys") : usageError ? t("View usage") : t("Return safely")}</button>
          </div>
        </div>
      )}
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
  onKnowledgeDeepDive,
  sourcesRequestToken,
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
  onKnowledgeDeepDive: (seed: KnowledgeJourneySeed) => void;
  sourcesRequestToken: number;
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

  useEffect(() => {
    if (sourcesRequestToken <= 0) return;
    const frame = window.requestAnimationFrame(() => setDeepDiveOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, [sourcesRequestToken]);

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
      <header className="performance-header article-journey-header sr-only">
        <div>
          <p className="eyebrow"><span /> Knowledge session · {t("Turn {number}", { number: turn.depth + 1 })}</p>
          <h1 id="performance-title">{turn.question}</h1>
        </div>
      </header>

      {historical && (
        <div className="branch-notice" role="note">
          <span aria-hidden="true">⑂</span>
          <p><strong>{t("You are revisiting an earlier turn.")}</strong> {t("Choosing a path here creates a visible branch; your existing turns stay in the map.")}</p>
        </div>
      )}

      <EditorialKnowledgeSession
        key={turn.id}
        turn={turn}
        onKnowledgeDeepDive={onKnowledgeDeepDive}
      />

      <div hidden className={`journey-answer-layout ${turn.media.length ? "has-media" : "without-media"}`}>
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
              <div><p>{t("Deeper dive")} · {t("Turn {number}", { number: turn.depth + 1 })}</p><h2 id="deep-dive-title">Sources &amp; research</h2></div>
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

const KnowledgeFlipPage = forwardRef<HTMLElement, {
  children: ReactNode;
  className: string;
  label: string;
  style?: CSSProperties;
}>(function KnowledgeFlipPage({ children, className, label, style }, ref) {
  return (
    <section ref={ref} className={className} data-knowledge-panel aria-label={label} style={style}>
      <div className="knowledge-atlas-page-content">{children}</div>
    </section>
  );
});

type FlipBookHandle = {
  pageFlip: () => {
    flip: (page: number, corner?: "top" | "bottom") => void;
    turnToPage: (page: number) => void;
  };
};

function EditorialKnowledgeSession({
  turn,
  onKnowledgeDeepDive,
}: {
  turn: JourneyTurn;
  onKnowledgeDeepDive: (seed: KnowledgeJourneySeed) => void;
}) {
  const { t } = useI18n();
  // PageFlip moves its React-rendered page nodes into an imperative wrapper. Do
  // not let the child list grow as image probes resolve or React can attempt to
  // insert a new page before a node that PageFlip has already reparented.
  const mediaValidation = useImageValidation(turn.media.map((item) => item.imageUrl), false);
  const media = turn.media.filter((item) => mediaValidation.validUrls.has(item.imageUrl)).slice(0, 12);
  // The projector, answer flow, result cards, and Journey Map all use this
  // complete set of question-bearing images. Never cap it independently.
  const knowledgeMedia = questionBearingMedia(media, turn.topicLabel);
  const atlasPages = media.map((item, index) => ({ item, mediaIndex: index }));
  const atlasSpreads = Array.from({ length: Math.ceil(atlasPages.length / 2) }, (_, index) => atlasPages.slice(index * 2, index * 2 + 2));
  const panelCount = atlasSpreads.length;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState(0);
  const [previewPanel, setPreviewPanel] = useState<number | null>(null);
  const [knowledgeQuestionIndex, setKnowledgeQuestionIndex] = useState(0);
  const [knowledgeQuestionDirection, setKnowledgeQuestionDirection] = useState<1 | -1>(1);
  const [unknownQuestions, setUnknownQuestions] = useState<number[]>([]);
  const [knowledgeAutoRotate, setKnowledgeAutoRotate] = useState(true);
  const [knowledgeRotationSeconds, setKnowledgeRotationSeconds] = useState(4);
  const [knowledgeDeclarationOpen, setKnowledgeDeclarationOpen] = useState(false);
  const [knowledgeCheckOpen, setKnowledgeCheckOpen] = useState(false);
  const [mediaPalette, setMediaPalette] = useState<Record<string, string>>({});
  const flipBookRef = useRef<FlipBookHandle | null>(null);
  const activeKnowledgeMedia = knowledgeMedia[knowledgeQuestionIndex];
  const activeSpread = atlasSpreads[activePanel] ?? [];
  const completedPageCount = activeSpread.length
    ? activeSpread[activeSpread.length - 1].mediaIndex + 1
    : 0;

  useEffect(() => {
    if (!knowledgeAutoRotate || !knowledgeDeclarationOpen || knowledgeMedia.length < 2) return;
    const timeout = window.setTimeout(() => {
      setKnowledgeQuestionDirection(1);
      setKnowledgeQuestionIndex((current) => (current + 1) % knowledgeMedia.length);
    }, knowledgeRotationSeconds * 1000);
    return () => window.clearTimeout(timeout);
  }, [knowledgeAutoRotate, knowledgeDeclarationOpen, knowledgeMedia.length, knowledgeQuestionIndex, knowledgeRotationSeconds]);

  function goToPanel(index: number, immediate = false) {
    if (index >= panelCount) {
      setKnowledgeDeclarationOpen(true);
      return;
    }
    const targetIndex = Math.max(0, Math.min(index, panelCount - 1));
    if (targetIndex === activePanel) return;
    const pageFlip = flipBookRef.current?.pageFlip();
    if (immediate) pageFlip?.turnToPage(targetIndex * 2);
    else pageFlip?.flip(targetIndex * 2, targetIndex > activePanel ? "bottom" : "top");
  }

  function panelFromMinimap(clientX: number, element: HTMLElement) {
    const bounds = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    return Math.min(panelCount - 1, Math.floor(ratio * panelCount));
  }

  function previewFromMinimap(event: ReactPointerEvent<HTMLDivElement>) {
    const panel = panelFromMinimap(event.clientX, event.currentTarget);
    setPreviewPanel(panel);
    if (event.buttons === 1) goToPanel(panel, true);
  }

  function beginMinimapSeek(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const panel = panelFromMinimap(event.clientX, event.currentTarget);
    setPreviewPanel(panel);
    goToPanel(panel, true);
  }

  function moveKnowledgeQuestion(direction: -1 | 1) {
    setKnowledgeQuestionDirection(direction);
    setKnowledgeQuestionIndex((current) => (current + direction + knowledgeMedia.length) % knowledgeMedia.length);
  }

  function selectKnowledgeQuestion(index: number) {
    if (index === knowledgeQuestionIndex) return;
    const forwardDistance = (index - knowledgeQuestionIndex + knowledgeMedia.length) % knowledgeMedia.length;
    const backwardDistance = (knowledgeQuestionIndex - index + knowledgeMedia.length) % knowledgeMedia.length;
    setKnowledgeQuestionDirection(forwardDistance <= backwardDistance ? 1 : -1);
    setKnowledgeQuestionIndex(index);
  }

  function markUnknown() {
    setUnknownQuestions((current) => current.includes(knowledgeQuestionIndex)
      ? current.filter((index) => index !== knowledgeQuestionIndex)
      : [...current, knowledgeQuestionIndex]);
  }

  function knowledgeOrbitOffset(index: number) {
    const midpoint = Math.floor(knowledgeMedia.length / 2);
    const offset = ((index - knowledgeQuestionIndex + midpoint + knowledgeMedia.length) % knowledgeMedia.length) - midpoint;
    return offset < -2 ? -3 : offset > 2 ? 3 : offset;
  }

  function rememberPalette(imageUrl: string, color: string) {
    setMediaPalette((current) => current[imageUrl] === color ? current : { ...current, [imageUrl]: color });
  }

  function spreadStyle(items: JourneyTurn["media"]): CSSProperties {
    const colors = items.map((item) => mediaPalette[item.imageUrl]).filter(Boolean);
    return colors[0] ? { "--spread-accent": colors[0] } as CSSProperties : {};
  }

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

  if (knowledgeCheckOpen) {
    return (
      <article className="knowledge-session" aria-label={`${turn.topicLabel} knowledge check`}>
        <KnowledgeCheckExperience
          items={knowledgeMedia.map((item, index) => ({
            index,
            question: canonicalImageQuestion(item, turn.topicLabel),
            imageUrl: item.imageUrl,
            imageAlt: item.alt,
            imageCaption: item.caption,
            imageSourceUrl: item.sourcePageUrl,
            imageSourceLabel: item.title ?? turn.topicLabel,
            known: !unknownQuestions.includes(index),
            knowledgeCheck: item.knowledgeCheck,
          }))}
          onBackToDeclaration={() => setKnowledgeCheckOpen(false)}
          onKnowledgeChange={(index, known) => setUnknownQuestions((current) => known
            ? current.filter((candidate) => candidate !== index)
            : current.includes(index) ? current : [...current, index])}
          onDeepDive={onKnowledgeDeepDive}
        />
      </article>
    );
  }

  return (
    <article className="knowledge-session" aria-label={`${turn.topicLabel} knowledge session`}>
      <div
        className="knowledge-stpageflip-stage"
        tabIndex={0}
        aria-label={knowledgeDeclarationOpen ? "Knowledge gap declaration" : "Page-turning knowledge atlas"}
        onKeyDown={(event) => {
          if (knowledgeDeclarationOpen) {
            if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); moveKnowledgeQuestion(-1); }
            if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); moveKnowledgeQuestion(1); }
            return;
          }
          if (event.key === "ArrowLeft") { event.preventDefault(); goToPanel(activePanel - 1); }
          if (event.key === "ArrowRight") { event.preventDefault(); goToPanel(activePanel + 1); }
        }}
      >
        {!mediaValidation.settled ? (
          <div className="knowledge-atlas-loading" role="status">Preparing the knowledge atlas…</div>
        ) : knowledgeDeclarationOpen && activeKnowledgeMedia ? (
          <section className="knowledge-run-declaration" data-question-direction={knowledgeQuestionDirection} aria-labelledby="knowledge-run-question" aria-live="polite">
            <div className="knowledge-run-projection-beam" aria-hidden="true"><i /></div>

            <div className="knowledge-run-copy">
              {knowledgeMedia.length > 1 && (
                <div className="knowledge-run-neighbor previous" key={`knowledge-previous-${knowledgeQuestionIndex}`} aria-hidden="true">
                  <p>{String((knowledgeQuestionIndex - 1 + knowledgeMedia.length) % knowledgeMedia.length + 1).padStart(2, "0")} / {String(knowledgeMedia.length).padStart(2, "0")}</p>
                  <span>{canonicalImageQuestion(knowledgeMedia[(knowledgeQuestionIndex - 1 + knowledgeMedia.length) % knowledgeMedia.length], turn.topicLabel)}</span>
                </div>
              )}
              <div className="knowledge-run-active-question" key={`knowledge-question-${knowledgeQuestionIndex}`}>
                <p>{String(knowledgeQuestionIndex + 1).padStart(2, "0")} / {String(knowledgeMedia.length).padStart(2, "0")} · {(activeKnowledgeMedia.role ?? "context").replace("-", " ")}</p>
                <h2 id="knowledge-run-question">{canonicalImageQuestion(activeKnowledgeMedia, turn.topicLabel)}</h2>
                <button type="button" className="knowledge-run-unknown" onClick={markUnknown} aria-pressed={unknownQuestions.includes(knowledgeQuestionIndex)}>I don’t know</button>
              </div>
              {knowledgeMedia.length > 1 && (
                <div className="knowledge-run-neighbor next" key={`knowledge-next-${knowledgeQuestionIndex}`} aria-hidden="true">
                  <p>{String((knowledgeQuestionIndex + 1) % knowledgeMedia.length + 1).padStart(2, "0")} / {String(knowledgeMedia.length).padStart(2, "0")}</p>
                  <span>{canonicalImageQuestion(knowledgeMedia[(knowledgeQuestionIndex + 1) % knowledgeMedia.length], turn.topicLabel)}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="knowledge-run-orbit-step previous"
              onClick={() => moveKnowledgeQuestion(-1)}
              aria-label="Previous knowledge question"
            >
              <ArrowUp aria-hidden="true" />
            </button>

            <figure className="knowledge-run-hero">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={`knowledge-backdrop-${knowledgeQuestionIndex}`} className="knowledge-run-hero-backdrop" src={activeKnowledgeMedia.imageUrl} alt="" aria-hidden="true" referrerPolicy="no-referrer" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={`knowledge-artwork-${knowledgeQuestionIndex}`} className="knowledge-run-hero-artwork" src={activeKnowledgeMedia.imageUrl} alt={activeKnowledgeMedia.alt} referrerPolicy="no-referrer" />
              <div className="knowledge-run-ribbon" aria-label="Projector slide reel">
                <span className="knowledge-run-ribbon-label" aria-hidden="true">Slide reel</span>
                {knowledgeMedia.map((item, index) => (
                  <button
                    type="button"
                    className={`${index === knowledgeQuestionIndex ? "active" : ""} ${unknownQuestions.includes(index) ? "unknown" : ""}`}
                    data-orbit-offset={knowledgeOrbitOffset(index)}
                    key={`${item.imageUrl}-knowledge-ribbon-${index}`}
                    onClick={() => selectKnowledgeQuestion(index)}
                    aria-label={`Open knowledge question ${index + 1}${unknownQuestions.includes(index) ? ", marked I don’t know" : ""}`}
                    aria-current={index === knowledgeQuestionIndex ? "step" : undefined}
                  >
                    <span style={{ backgroundImage: `url(${item.imageUrl})` }} />
                    <small>{String(index + 1).padStart(2, "0")}</small>
                  </button>
                ))}
              </div>
              <figcaption key={`knowledge-caption-${knowledgeQuestionIndex}`}>
                <strong>{activeKnowledgeMedia.title ?? activeKnowledgeMedia.caption ?? turn.topicLabel}</strong>
                <span>{activeKnowledgeMedia.caption ?? activeKnowledgeMedia.alt}</span>
              </figcaption>
              <button type="button" className="knowledge-run-finish" onClick={() => { setKnowledgeAutoRotate(false); setKnowledgeCheckOpen(true); }}>
                Finish <ArrowRight aria-hidden="true" />
              </button>
            </figure>

            <div
              className="knowledge-run-auto-controls"
              data-playing={knowledgeAutoRotate}
              style={{ "--rotation-duration": `${knowledgeRotationSeconds}s` } as CSSProperties}
            >
              <label>
                <span>Rotate</span>
                <select
                  aria-label="Automatic image rotation interval"
                  value={knowledgeRotationSeconds}
                  onChange={(event) => setKnowledgeRotationSeconds(Number(event.target.value))}
                >
                  <option value={4}>4s</option>
                  <option value={8}>8s</option>
                  <option value={12}>12s</option>
                  <option value={20}>20s</option>
                </select>
              </label>
              <button
                type="button"
                aria-label={knowledgeAutoRotate ? "Pause automatic image rotation" : "Resume automatic image rotation"}
                aria-pressed={!knowledgeAutoRotate}
                onClick={() => setKnowledgeAutoRotate((current) => !current)}
              >
                {knowledgeAutoRotate ? <Pause aria-hidden="true" weight="fill" /> : <Play aria-hidden="true" weight="fill" />}
              </button>
              <i key={`${knowledgeQuestionIndex}-${knowledgeRotationSeconds}-${knowledgeAutoRotate}`} aria-hidden="true" />
            </div>

            <button
              type="button"
              className="knowledge-run-orbit-step next"
              onClick={() => moveKnowledgeQuestion(1)}
              aria-label="Continue to the next question"
            >
              <ArrowDown aria-hidden="true" />
            </button>

            <footer className="knowledge-run-declaration-footer">
              <span>Move on when you know it. Save only the gaps.</span>
            </footer>
          </section>
        ) : (
        <HTMLFlipBook
          ref={flipBookRef}
          className="knowledge-stpageflip"
          style={{}}
          width={800}
          height={650}
          minWidth={280}
          maxWidth={1100}
          minHeight={360}
          maxHeight={1100}
          size="stretch"
          startPage={activePanel * 2}
          drawShadow
          flippingTime={760}
          usePortrait={false}
          startZIndex={2}
          autoSize
          maxShadowOpacity={0.34}
          showCover={false}
          mobileScrollSupport
          clickEventForward
          useMouseEvents
          swipeDistance={24}
          showPageCorners
          disableFlipByClick={false}
          onFlip={(event) => {
            const page = Math.max(0, Math.min(Number(event.data) || 0, atlasPages.length - 1));
            const spread = Math.min(panelCount - 1, Math.floor(page / 2));
            setActivePanel(spread);
          }}
        >
        {atlasPages.map((page, pageIndex) => {
          const block = turn.answerBlocks[Math.min(page.mediaIndex, turn.answerBlocks.length - 1)];
          const opening = page.mediaIndex < 2;
          return (
            <KnowledgeFlipPage
              className={`knowledge-atlas-panel knowledge-atlas-leaf ${opening ? "knowledge-atlas-opening" : "knowledge-atlas-record"} ${pageIndex % 2 === 0 ? "knowledge-leaf-left" : "knowledge-leaf-right"}`}
              key={`${page.item.imageUrl}-atlas-page`}
              label={opening ? `Overview page ${page.mediaIndex + 1}` : `Visual record ${page.mediaIndex + 1}`}
              style={spreadStyle([page.item])}
            >
              <span className="knowledge-spread-ambient" aria-hidden="true" style={{ backgroundImage: `url(${page.item.imageUrl})` }} />
              <header className="knowledge-leaf-copy">
                <p className="knowledge-session-kicker"><span /> {page.mediaIndex === 0 ? "The short answer" : `Visual record ${String(page.mediaIndex + 1).padStart(2, "0")}`}</p>
                <p className="knowledge-atlas-index">Field note {String(page.mediaIndex + 1).padStart(2, "0")} / {String(media.length).padStart(2, "0")}</p>
                {page.mediaIndex === 0
                  ? <h2>{turn.topicLabel}</h2>
                  : <h3>{page.item.title ?? page.item.caption ?? turn.topicLabel}</h3>}
                {block && <p className="knowledge-atlas-summary">{block.text} {citations(block.sourceIds)}</p>}
              </header>
              <div className="knowledge-leaf-image">
                <EditorialImage
                  item={page.item}
                  number={page.mediaIndex + 1}
                  layout="plate"
                  onOpen={() => setLightboxIndex(page.mediaIndex)}
                  onPalette={rememberPalette}
                  shareQuestion={turn.question}
                  shareSummary={block?.text ?? turn.answer}
                />
              </div>
              <span className="knowledge-leaf-folio" aria-hidden="true">{String(pageIndex + 1).padStart(2, "0")}</span>
            </KnowledgeFlipPage>
          );
        })}
        </HTMLFlipBook>
        )}
      </div>

      <div className={`knowledge-atlas-stage-arrows ${knowledgeDeclarationOpen ? "run-active" : ""}`} aria-label="Atlas navigation">
        <button type="button" className="previous" disabled={!knowledgeDeclarationOpen && activePanel === 0} onClick={() => knowledgeDeclarationOpen ? setKnowledgeDeclarationOpen(false) : goToPanel(activePanel - 1)} aria-label={knowledgeDeclarationOpen ? "Return to the final atlas page" : "Previous atlas section"}><ArrowLeft aria-hidden="true" /></button>
        <button type="button" className="next" disabled={knowledgeDeclarationOpen} onClick={() => goToPanel(activePanel + 1)} aria-label={activePanel === panelCount - 1 ? "Continue to the knowledge questions" : "Next atlas section"}><ArrowRight aria-hidden="true" /></button>
      </div>

      <footer className={`knowledge-atlas-navigation ${knowledgeDeclarationOpen ? "run-active" : ""}`}>
        <div
          className="knowledge-atlas-minimap"
          role="slider"
          aria-label="Knowledge atlas overview"
          aria-valuemin={0}
          aria-valuemax={atlasPages.length}
          aria-valuenow={completedPageCount}
          aria-valuetext={`${completedPageCount} of ${atlasPages.length} pages read`}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") { event.preventDefault(); goToPanel(activePanel - 1); }
            if (event.key === "ArrowRight") { event.preventDefault(); goToPanel(activePanel + 1); }
          }}
          onFocus={() => setPreviewPanel(activePanel)}
          onBlur={() => setPreviewPanel(null)}
          onPointerEnter={previewFromMinimap}
          onPointerMove={previewFromMinimap}
          onPointerLeave={(event) => { if (event.buttons !== 1) setPreviewPanel(null); }}
          onPointerDown={beginMinimapSeek}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        >
          {previewPanel !== null && (
            <div
              className="knowledge-atlas-preview"
              aria-hidden="true"
              style={{ "--preview-position": `${((previewPanel + .5) / panelCount) * 100}%` } as CSSProperties}
            >
              <span>Pages {previewPanel * 2 + 1}–{Math.min(atlasPages.length, previewPanel * 2 + 2)} of {atlasPages.length}</span>
              <div className="knowledge-atlas-preview-pages">
                {atlasSpreads[previewPanel].map((page, index) => (
                  <i key={`${page.item.imageUrl}-preview-${index}`} style={{ backgroundImage: `url(${page.item.imageUrl})` }} />
                ))}
              </div>
              <strong>{previewPanel === 0 ? turn.topicLabel : `Field notes ${String(previewPanel * 2 + 1).padStart(2, "0")}–${String(Math.min(atlasPages.length, previewPanel * 2 + 2)).padStart(2, "0")}`}</strong>
            </div>
          )}
          <div className="knowledge-atlas-progress" aria-hidden="true">
            <span className="knowledge-atlas-progress-fill" style={{ width: `${((activePanel + 1) / panelCount) * 100}%` }} />
            {atlasSpreads.map((_, spreadIndex) => (
              <i
                className={spreadIndex === activePanel ? "active" : spreadIndex < activePanel ? "complete" : ""}
                key={`progress-step-${spreadIndex}`}
                style={{ left: `${((spreadIndex + 1) / panelCount) * 100}%` }}
              />
            ))}
          </div>
        </div>
        <span className="knowledge-atlas-position"><b>{String(completedPageCount).padStart(2, "0")}</b> / {String(atlasPages.length).padStart(2, "0")}</span>
      </footer>

      {lightboxIndex !== null && media[lightboxIndex] && (
        <KnowledgeImageLightbox
          media={media}
          index={lightboxIndex}
          onChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </article>
  );
}

function EditorialImage({
  item,
  number,
  layout,
  onOpen,
  onPalette,
  shareQuestion,
  shareSummary,
}: {
  item: JourneyTurn["media"][number];
  number: number;
  layout: string;
  onOpen: () => void;
  onPalette?: (imageUrl: string, color: string) => void;
  shareQuestion: string;
  shareSummary: string;
}) {
  const commentary = item.commentary?.trim() || item.caption;
  const [orientation, setOrientation] = useState<"portrait" | "landscape" | "panorama">("landscape");

  function inspectImage(image: HTMLImageElement) {
    const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
    setOrientation(ratio > 1.72 ? "panorama" : ratio < .82 ? "portrait" : "landscape");
    if (!onPalette) return;
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      canvas.width = 18;
      canvas.height = 18;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0;
      let green = 0;
      let blue = 0;
      let weight = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3] / 255;
        const luminance = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
        const useful = alpha * (luminance > 244 ? .18 : 1);
        red += pixels[index] * useful;
        green += pixels[index + 1] * useful;
        blue += pixels[index + 2] * useful;
        weight += useful;
      }
      if (weight > 0) onPalette(item.imageUrl, `${Math.round(red / weight)} ${Math.round(green / weight)} ${Math.round(blue / weight)}`);
    } catch {
      // Cross-origin images may decline canvas access; the neutral paper palette remains intentional.
    }
  }

  return (
    <figure className={`editorial-image editorial-image-${layout}`} data-orientation={orientation}>
      <button type="button" className="editorial-image-open" onClick={onOpen} aria-label={`Enlarge ${item.title ?? item.caption}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="editorial-image-artwork" src={item.imageUrl} alt={item.alt} loading="lazy" referrerPolicy="no-referrer" onLoad={(event) => inspectImage(event.currentTarget)} />
        <span className="knowledge-image-expand" aria-hidden="true">View ↗</span>
      </button>
      <ShareDiscovery question={shareQuestion} summary={shareSummary} media={item} />
      <figcaption>
        <span>{String(number).padStart(2, "0")} · {(item.role ?? "context").replace("-", " ")}</span>
        <strong>{item.title ?? item.caption}</strong>
        <p>{commentary}</p>
        <a className="editorial-source" href={item.sourcePageUrl} target="_blank" rel="noreferrer">
          <span>Source:</span>
          <small>{item.sourcePageUrl}</small>
          <b aria-hidden="true">↗</b>
        </a>
      </figcaption>
    </figure>
  );
}

function KnowledgeImageLightbox({
  media,
  index,
  onChange,
  onClose,
}: {
  media: JourneyTurn["media"];
  index: number;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const selected = media[index];
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onChange((index - 1 + media.length) % media.length);
      if (event.key === "ArrowRight") onChange((index + 1) % media.length);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [index, media.length, onChange, onClose]);

  return (
    <div className="knowledge-lightbox-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="knowledge-lightbox" role="dialog" aria-modal="true" aria-labelledby="knowledge-lightbox-title">
        <header>
          <p>{String(index + 1).padStart(2, "0")} / {String(media.length).padStart(2, "0")} · {(selected.role ?? "context").replace("-", " ")}</p>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close full image"><X aria-hidden="true" /></button>
        </header>
        <div className="knowledge-lightbox-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="knowledge-lightbox-image-backdrop" src={selected.imageUrl} alt="" aria-hidden="true" referrerPolicy="no-referrer" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="knowledge-lightbox-image-artwork" src={selected.imageUrl} alt={selected.alt} referrerPolicy="no-referrer" />
          {media.length > 1 && <>
            <button type="button" className="previous" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onChange((index - 1 + media.length) % media.length); }} aria-label="Previous image"><ArrowLeft aria-hidden="true" /></button>
            <button type="button" className="next" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onChange((index + 1) % media.length); }} aria-label="Next image"><ArrowRight aria-hidden="true" /></button>
          </>}
        </div>
        <footer>
          <div>
            <h2 id="knowledge-lightbox-title">{selected.title ?? selected.caption}</h2>
            <p>{selected.commentary?.trim() || selected.caption}</p>
          </div>
          <a className="knowledge-lightbox-source" href={selected.sourcePageUrl} target="_blank" rel="noreferrer">
            <span>Source:</span>
            <small>{selected.sourcePageUrl}</small>
            <b aria-hidden="true">↗</b>
          </a>
        </footer>
      </section>
    </div>
  );
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
  const validatedMediaUrls = useValidatedImageUrls(media.map((item) => item.imageUrl));
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const visible = media
    .filter((item) => validatedMediaUrls.has(item.imageUrl) && !failedUrls.includes(item.imageUrl))
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
              onError={() => {
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
              src={item.imageUrl}
              alt=""
              loading={index === 0 ? "eager" : "lazy"}
              referrerPolicy="no-referrer"
              onError={() => {
                setFailedUrls((current) => current.includes(item.imageUrl) ? current : [...current, item.imageUrl]);
              }}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

function ShareDiscovery({
  question,
  summary,
  media,
}: {
  question: string;
  summary: string;
  media: JourneyTurn["media"][number];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState("");
  const title = media.title ?? media.caption;

  function close() {
    dialogRef.current?.close();
    setStatus("");
  }

  async function copyLink() {
    const link = window.location.href;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(link);
      setStatus("Link copied");
      return;
    } catch {
      const field = document.createElement("textarea");
      field.value = link;
      field.readOnly = true;
      field.style.position = "fixed";
      field.style.left = "-9999px";
      document.body.appendChild(field);
      field.select();
      field.setSelectionRange(0, field.value.length);
      const copied = document.execCommand("copy");
      field.remove();
      if (copied) {
        setStatus("Link copied");
        return;
      }
      window.prompt("Copy this link", link);
      setStatus("Link ready to copy");
    }
  }

  async function buildShareImage() {
    await document.fonts.ready;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const context = canvas.getContext("2d");
    if (!context) return null;

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.src = media.imageUrl;
    await image.decode();
    const imageHeight = 790;
    const scale = Math.max(canvas.width / image.naturalWidth, imageHeight / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (canvas.width - width) / 2, (imageHeight - height) / 2, width, height);
    context.fillStyle = "#fbf8f1";
    context.fillRect(0, imageHeight, canvas.width, canvas.height - imageHeight);
    context.fillStyle = "rgba(19,36,30,.34)";
    context.fillRect(0, imageHeight, canvas.width, 2);

    context.fillStyle = "rgba(251,248,241,.94)";
    context.fillRect(34, 32, 306, 70);
    context.fillStyle = "#dfff58";
    context.beginPath();
    context.arc(73, 67, 23, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#13241e";
    context.font = "700 20px 'IBM Plex Sans', sans-serif";
    context.textAlign = "center";
    context.fillText("C", 73, 74);
    context.textAlign = "left";
    context.font = "700 21px 'IBM Plex Sans', sans-serif";
    context.fillText("CuriosityPedia", 110, 75);

    context.fillStyle = "#ff755f";
    context.fillRect(70, 845, 10, 10);
    context.fillStyle = "#637068";
    context.font = "700 16px 'IBM Plex Sans', sans-serif";
    context.fillText(question.toUpperCase(), 99, 855);
    context.fillStyle = "#13241e";
    context.font = "600 53px 'Newsreader', Georgia, serif";
    drawWrappedText(context, title, 70, 935, 930, 56, 3);
    context.fillStyle = "#637068";
    context.font = "400 26px 'Newsreader', Georgia, serif";
    drawWrappedText(context, summary, 70, 1110, 930, 36, 4);
    context.fillStyle = "#13241e";
    context.fillRect(70, 1292, 938, 1);
    context.fillStyle = "#637068";
    context.font = "italic 19px 'Newsreader', Georgia, serif";
    context.fillText("Curiosity, worth passing on.", 70, 1325);

    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", .94));
  }

  async function saveImage() {
    try {
      const blob = await buildShareImage();
      if (!blob) throw new Error("No image available");
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `curiositypedia-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 54) || "discovery"}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      setStatus("Share image saved");
    } catch {
      await copyLink();
      setStatus("Image host blocked download — link copied instead");
    }
  }

  async function share() {
    const shareData: ShareData = { title, text: summary, url: window.location.href };
    try {
      const blob = await buildShareImage();
      if (blob) {
        const file = new File([blob], "curiositypedia-discovery.png", { type: "image/png" });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) shareData.files = [file];
      }
    } catch {
      // The link and text remain shareable when a third-party image blocks canvas export.
    }
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        await copyLink();
      }
    } else await saveImage();
  }

  const shareText = encodeURIComponent(`${title}\n${summary}\n${typeof window === "undefined" ? "" : window.location.href}`);

  return <>
    <button type="button" className="editorial-share-action" onClick={() => dialogRef.current?.showModal()} aria-label={`Share ${title}`}>
      <ShareNetwork aria-hidden="true" /> Share image
    </button>
    <dialog ref={dialogRef} className="share-discovery-dialog" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="share-discovery-shell" aria-labelledby="share-discovery-title">
        <header>
          <div><p><i /> CuriosityPedia discovery</p><h2 id="share-discovery-title">Share this image</h2></div>
          <button type="button" onClick={close} aria-label="Close share dialog"><X aria-hidden="true" /></button>
        </header>
        <div className="share-discovery-layout">
          <article className="share-discovery-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media.imageUrl} alt={media.alt} referrerPolicy="no-referrer" />
            <div className="share-card-brand"><span>C</span><strong>CuriosityPedia</strong></div>
            <div className="share-card-copy"><p><i /> {question}</p><h3>{title}</h3><div>{summary}</div><small>Curiosity, worth passing on.</small></div>
          </article>
          <aside>
            <div className="share-privacy-note"><span>✓</span><p><strong>This image, in context</strong>The image, its title, and the explanation above it. Notes and sources stay out.</p></div>
            <button className="share-primary-action" type="button" onClick={() => void share()}><ShareNetwork aria-hidden="true" /> Share image</button>
            <div className="share-action-grid">
              <button type="button" onClick={() => void copyLink()}>↗ <span>Copy link</span></button>
              <a href={`https://twitter.com/intent/tweet?text=${shareText}`} target="_blank" rel="noreferrer">𝕏 <span>Post</span></a>
              <a href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noreferrer">◉ <span>WhatsApp</span></a>
              <button type="button" onClick={() => void saveImage()}>↓ <span>Save image</span></button>
            </div>
            <p className="share-discovery-tip">Save the image to share it on Instagram or anywhere else.</p>
            <p className="share-discovery-status" role="status" aria-live="polite">{status}</p>
          </aside>
        </div>
      </section>
    </dialog>
  </>;
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  let line = "";
  let lines = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    context.fillText(line, x, y + lines * lineHeight);
    lines += 1;
    line = word;
    if (lines === maxLines - 1) break;
  }
  if (line && lines < maxLines) {
    let rendered = line;
    while (context.measureText(rendered).width > maxWidth && rendered.length > 1) rendered = `${rendered.slice(0, -2)}…`;
    context.fillText(rendered, x, y + lines * lineHeight);
  }
}

function LoadingStage() {
  const { t } = useI18n();
  return <section className="loading-stage" aria-live="polite"><CelestialMark variant="loader" /><p>{t("Opening your CuriosityPedia journeys…")}</p><small>{t("Resolving a durable guest identity")}</small></section>;
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
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    topicLabels: detail.topicLabels,
    leadMedia: detail.turns.find((turn) => turn.parentTurnId === null)?.media[0],
  };
  return [summary, ...current.filter((journey) => journey.id !== summary.id)];
}

function formatDiagnosticId(value: string) {
  return `WD-${value.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

async function upgradeGuestJourneys(
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
