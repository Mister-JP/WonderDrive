import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import { BOOTSTRAP_CATALOG, DEFAULT_PREFERENCES } from "../lib/catalog";
import type { Bookmark, JourneySummary, KnowledgeJourneySeed, ResearchActivity, TextSize, TurnMedia, UsageSummary, UserPreferences, Viewer } from "../lib/contracts";
import { buttonByText, elements, find, HookHarness, text, type TestElement } from "./leaf-view-harness";

register(new URL("./journey-map-loader.mjs", import.meta.url));

const hooks = new HookHarness();
(globalThis as typeof globalThis & { __CURIOSITYPEDIA_JOURNEY_MAP_HARNESS__: HookHarness })
  .__CURIOSITYPEDIA_JOURNEY_MAP_HARNESS__ = hooks;

type UsageViewComponent = (props: {
  usage: UsageSummary | null;
  viewer: Viewer | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenJourneys: () => void;
}) => TestElement;

type JourneysComponent = (props: {
  journeys: JourneySummary[];
  activities: ResearchActivity[];
  viewer: Viewer | null;
  busy: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onManage: (id: string, changes: { title?: string; pinned?: boolean; hidden?: boolean }) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
  onNew: () => void;
}) => TestElement;

type BookmarksComponent = (props: {
  bookmarks: Bookmark[];
  onOpen: (journeyId: string, turnId: string) => void;
  onRemove: (turnId: string) => void;
  onNew: () => void;
}) => TestElement;

type SettingsComponent = (props: {
  viewer: Viewer | null;
  savedJourneyCount: number;
  preferences: UserPreferences;
  catalog: typeof BOOTSTRAP_CATALOG;
  busy: boolean;
  onPreviewTextSize: (textSize: TextSize) => void;
  onSave: (next: UserPreferences) => Promise<void>;
}) => TestElement;

type KnowledgeCheckComponent = (props: {
  items: Array<{
    index: number;
    question: string;
    imageUrl: string;
    imageAlt: string;
    imageCaption: string;
    imageSourceUrl: string;
    imageSourceLabel: string;
    known: boolean;
    knowledgeCheck?: {
      declarationQuestion: string;
      question: string;
      options: string[];
      correctOptionIndex: number;
      explanation: string;
    };
  }>;
  onBackToDeclaration: () => void;
  onKnowledgeChange: (index: number, known: boolean) => void;
  onDeepDive: (seed: KnowledgeJourneySeed) => void;
}) => TestElement;

const { UsageView } = await import("../app/experience/usage-view") as unknown as {
  UsageView: UsageViewComponent;
};
const { JourneysView } = await import("../app/experience/journeys-view") as unknown as {
  JourneysView: JourneysComponent;
};
const { BookmarksView } = await import("../app/experience/bookmarks-view") as unknown as {
  BookmarksView: BookmarksComponent;
};
const { SettingsView } = await import("../app/experience/settings-view") as unknown as {
  SettingsView: SettingsComponent;
};
const { KnowledgeCheckExperience } = await import("../app/experience/knowledge-check") as unknown as {
  KnowledgeCheckExperience: KnowledgeCheckComponent;
};

test.beforeEach(() => hooks.clear());

test("KnowledgeCheckExperience renders stored questions immediately with eight choices and a safe unknown action", () => {
  const options = Array.from({ length: 8 }, (_, index) => `Complete conceptual answer option ${index + 1}`);
  const root = KnowledgeCheckExperience({
    items: [{
      index: 0,
      question: "Why do the visible parts move together?",
      imageUrl: "https://images.example.org/mechanism.jpg",
      imageAlt: "A visible mechanism",
      imageCaption: "The connected parts of the mechanism.",
      imageSourceUrl: "https://example.org/mechanism",
      imageSourceLabel: "Example source",
      known: true,
      knowledgeCheck: {
        declarationQuestion: "Do you understand how the visible parts work together?",
        question: "Why do the visible parts move together?",
        options,
        correctOptionIndex: 0,
        explanation: "The first option follows the causal model taught in the encyclopedia.",
      },
    }],
    onBackToDeclaration() {},
    onKnowledgeChange() {},
    onDeepDive() {},
  });

  assert.match(text(root), /Why do the visible parts move together/);
  assert.equal(elements(root).filter((element) => element.props.role === "radio").length, 8);
  assert.ok(buttonByText(root, "I don’t know"));
  assert.doesNotMatch(text(root), /Preparing|Loading|Try preparing again/);
});

test("KnowledgeCheckExperience turns the completed check into image-linked rabbit holes with answer keys", () => {
  const options = Array.from({ length: 8 }, (_, index) => `Complete conceptual answer option ${index + 1}`);
  hooks.setSlot(0, [{
    index: 0,
    question: "Why do the visible parts move together?",
    imageUrl: "https://images.example.org/mechanism.jpg",
    imageAlt: "A visible mechanism",
    imageCaption: "The connected parts of the mechanism.",
    imageSourceUrl: "https://example.org/mechanism",
    imageSourceLabel: "Example source",
    known: true,
    knowledgeCheck: {
      declarationQuestion: "Do you understand how the visible parts work together?",
      question: "Why do the visible parts move together?",
      options,
      correctOptionIndex: 0,
      explanation: "The first option follows the causal model taught in the encyclopedia.",
    },
  }]);
  hooks.setSlot(1, 0);
  hooks.setSlot(2, { 0: "unknown" });
  hooks.setSlot(3, true);
  const deepDiveSeeds: KnowledgeJourneySeed[] = [];
  const root = KnowledgeCheckExperience({
    items: [{
      index: 0,
      question: "Why do the visible parts move together?",
      imageUrl: "https://images.example.org/mechanism.jpg",
      imageAlt: "A visible mechanism",
      imageCaption: "The connected parts of the mechanism.",
      imageSourceUrl: "https://example.org/mechanism",
      imageSourceLabel: "Example source",
      known: true,
      knowledgeCheck: {
        declarationQuestion: "Do you understand how the visible parts work together?",
        question: "Why do the visible parts move together?",
        options,
        correctOptionIndex: 0,
        explanation: "The first option follows the causal model taught in the encyclopedia.",
      },
    }],
    onBackToDeclaration() {},
    onKnowledgeChange() {},
    onDeepDive(seed) { deepDiveSeeds.push(seed); },
  });

  assert.match(text(root), /Pick a question/);
  assert.match(text(root), /Right: you said “I don’t know”/);
  assert.match(text(root), /Correct answerComplete conceptual answer option 1/);
  const rabbitHole = find(root, (element) => element.type === "button" && String(element.props.className).includes("knowledge-check-result-card"));
  (rabbitHole.props.onClick as () => void)();
  assert.equal(deepDiveSeeds[0]?.question, "Why do the visible parts move together?");
  assert.equal(deepDiveSeeds[0]?.imageUrl, "https://images.example.org/mechanism.jpg");
});

test("KnowledgeCheckExperience keeps the active question mounted when I don't know changes its parent declaration", () => {
  const options = Array.from({ length: 8 }, (_, index) => `Complete conceptual answer option ${index + 1}`);
  let known = true;
  const item = {
    index: 0,
    question: "Why do the visible parts move together?",
    imageUrl: "https://images.example.org/mechanism.jpg",
    imageAlt: "A visible mechanism",
    imageCaption: "The connected parts of the mechanism.",
    imageSourceUrl: "https://example.org/mechanism",
    imageSourceLabel: "Example source",
    known,
    knowledgeCheck: {
      declarationQuestion: "Do you understand how the visible parts work together?",
      question: "Why do the visible parts move together?",
      options,
      correctOptionIndex: 0,
      explanation: "The first option follows the causal model taught in the encyclopedia.",
    },
  };
  const props = {
    items: [item],
    onBackToDeclaration() {},
    onKnowledgeChange(_index: number, nextKnown: boolean) { known = nextKnown; },
    onDeepDive() {},
  };

  let root = KnowledgeCheckExperience(props);
  (buttonByText(root, "I don’t know").props.onClick as () => void)();
  assert.equal(known, false);

  hooks.reset();
  root = KnowledgeCheckExperience({ ...props, items: [{ ...item, known }] });
  assert.match(text(root), /Why do the visible parts move together/);
  assert.ok(buttonByText(root, "I don’t know"));
});

const viewer: Viewer = {
  mode: "guest",
  displayName: "Guest Explorer",
  journeyLimit: 12,
  guestExpiresAt: 2_000_000_000_000,
};

const usage: UsageSummary = {
  asOf: 1_800_000_000_000,
  windowHours: 24,
  liveResearch: {
    used: 3,
    limit: 3,
    remaining: 0,
    nextSlotAt: 1_800_003_600_000,
    releasesAt: [1_800_003_600_000, 1_800_007_200_000],
  },
  spend: {
    usedUsd: 1.234,
    heldUsd: 0.125,
    accountedUsd: 1.359,
    limitUsd: 5,
    remainingUsd: 3.641,
    nextReleaseAt: 1_800_003_600_000,
  },
  library: {
    used: 12,
    limit: 12,
    remaining: 0,
  },
  guestSessionExpiresAt: 2_000_000_000_000,
};

function journeySummary(
  id: string,
  changes: Partial<JourneySummary> = {},
): JourneySummary {
  return {
    id,
    title: `Journey ${id}`,
    seed: `Seed ${id}`,
    performerId: "atlas",
    modelId: "gpt-5.4-mini",
    researchPreset: "standard",
    answerDensity: "balanced",
    imagePreference: "prefer",
    outputLocale: "en",
    currentTurnId: `${id}-turn`,
    turnCount: 2,
    sourceCount: 4,
    openBranchCount: 2,
    version: 1,
    pinned: false,
    hidden: false,
    createdAt: 1_704_204_000_000,
    updatedAt: 100,
    topicLabels: [`Topic ${id}`],
    ...changes,
  };
}

function renderJourneys(journeys: JourneySummary[], overrides: Partial<Parameters<JourneysComponent>[0]> = {}) {
  const opened: string[] = [];
  const deleted: string[] = [];
  const managed: Array<[string, { title?: string; pinned?: boolean; hidden?: boolean }]> = [];
  const cancelled: string[] = [];
  const dismissed: string[] = [];
  let newCount = 0;
  const props = {
    journeys,
    activities: [],
    viewer,
    busy: null,
    onOpen: (id: string) => opened.push(id),
    onDelete: (id: string) => deleted.push(id),
    onManage: (id: string, changes: { title?: string; pinned?: boolean; hidden?: boolean }) => managed.push([id, changes]),
    onRetry: () => {},
    onCancel: (id: string) => cancelled.push(id),
    onDismiss: (id: string) => dismissed.push(id),
    onNew: () => { newCount += 1; },
    ...overrides,
  };
  const rerender = () => {
    hooks.reset();
    return JourneysView(props);
  };
  return { props, opened, deleted, managed, cancelled, dismissed, get newCount() { return newCount; }, rerender, root: rerender() };
}

function bookmark(id: string, changes: Partial<Bookmark> = {}): Bookmark {
  return {
    id,
    journeyId: `journey-${id}`,
    turnId: `turn-${id}`,
    bookmarkedAt: 1_704_204_000_000,
    question: `Saved question ${id}`,
    topicLabel: `Saved topic ${id}`,
    journeySeed: `Seed ${id}`,
    journeyTitle: `Journey ${id}`,
    performerId: "atlas",
    sourceCount: 2,
    ...changes,
  };
}

function renderBookmarks(bookmarks: Bookmark[]) {
  const opened: Array<[string, string]> = [];
  const removed: string[] = [];
  let newCount = 0;
  const props = {
    bookmarks,
    onOpen: (journeyId: string, turnId: string) => opened.push([journeyId, turnId]),
    onRemove: (turnId: string) => removed.push(turnId),
    onNew: () => { newCount += 1; },
  };
  const rerender = () => {
    hooks.reset();
    return BookmarksView(props);
  };
  return { opened, removed, get newCount() { return newCount; }, rerender, root: rerender() };
}

test("UsageView preserves loading and error accessibility states", () => {
  const loading = UsageView({ usage: null, viewer, loading: true, error: null, onRefresh() {}, onOpenJourneys() {} });
  assert.equal(find(loading, (element) => element.props.role === "status").props.className, "usage-loading");
  assert.match(text(loading), /Reading your rolling limits…/);

  let refreshed = 0;
  const failed = UsageView({ usage: null, viewer, loading: false, error: "Usage unavailable", onRefresh: () => { refreshed += 1; }, onOpenJourneys() {} });
  assert.equal(find(failed, (element) => element.props.role === "alert").props.className, "usage-load-error");
  (buttonByText(failed, "Try again").props.onClick as () => void)();
  assert.equal(refreshed, 1);
});

test("UsageView preserves quota, journey capacity, spend, identity, and journeys behavior", () => {
  let openedJourneys = 0;
  const root = UsageView({ usage, viewer, loading: false, error: null, onRefresh() {}, onOpenJourneys: () => { openedJourneys += 1; } });

  assert.equal(find(root, (element) => element.type === "h1").props.id, "usage-title");
  assert.ok(elements(root).some((element) => element.props.className === "usage-primary quota-reached"));
  assert.equal(find(root, (element) => element.props["aria-label"] === "Live research used in the last 24 hours").props.value, 3);
  assert.equal(find(root, (element) => element.props["aria-label"] === "Saved journey capacity used").props.value, 12);
  assert.match(text(root), /Action required/);
  assert.match(text(root), /Journey capacity/);
  assert.doesNotMatch(text(root), /Library capacity/);
  assert.match(text(root), /Delete a journey to free a place\./);
  assert.match(text(root), /\$1\.359 \/ \$5\.00/);
  assert.match(text(root), /\$1\.234 settled · \$0\.125 held/);
  assert.equal(find(root, (element) => element.type === "a").props.href, "/signin-with-chatgpt?return_to=%2F");
  (buttonByText(root, "Manage saved journeys").props.onClick as () => void)();
  assert.equal(openedJourneys, 1);
});

test("JourneysView prioritizes the first question, creation time, and simple filtering", () => {
  const journeys = [
    journeySummary("alpha", {
      seed: "Why do fireflies glow?",
      title: "Alpha trail",
      createdAt: Date.UTC(2024, 0, 2, 15, 4),
      updatedAt: Date.UTC(2030, 0, 2),
      leadMedia: {
        imageUrl: "https://images.example/firefly.jpg",
        thumbnailUrl: "https://images.example/firefly-thumb.jpg",
        sourcePageUrl: "https://example.org/fireflies",
        caption: "A glowing firefly",
        alt: "Firefly glowing at night",
      },
    }),
    journeySummary("beta", { seed: "How do whales navigate?", title: "Beta trail", performerId: "sage", pinned: true, updatedAt: 100 }),
    journeySummary("hidden", { title: "Hidden trail", hidden: true, updatedAt: 300 }),
  ];
  const rendered = renderJourneys(journeys);

  assert.equal(find(rendered.root, (element) => element.type === "h1").props.id, "journeys-title");
  assert.deepEqual(elements(rendered.root).filter((element) => element.type === "h2").map(text), ["How do whales navigate?", "Why do fireflies glow?", "Seed hidden"]);
  assert.match(text(rendered.root), /3 of 12 journeys/);
  assert.match(text(rendered.root), /2024/);
  assert.doesNotMatch(text(rendered.root), /2030/);
  assert.doesNotMatch(text(rendered.root), /Turns|Sources|Open|unclassified journey/);
  const leadVisual = find(rendered.root, (element) => (element.props.media as TurnMedia | undefined)?.imageUrl === "https://images.example/firefly.jpg");
  const leadMedia = leadVisual.props.media as TurnMedia;
  assert.equal(leadMedia.thumbnailUrl, "https://images.example/firefly-thumb.jpg");
  assert.equal(leadMedia.alt, "Firefly glowing at night");

  const search = find(rendered.root, (element) => element.type === "input" && element.props.placeholder === "First question or journey label");
  (search.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "Alpha" } });
  let root = rendered.rerender();
  assert.deepEqual(elements(root).filter((element) => element.type === "h2").map(text), ["Why do fireflies glow?"]);

  (find(root, (element) => element.type === "input" && element.props.placeholder === "First question or journey label").props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "" } });
  root = rendered.rerender();
  assert.deepEqual(elements(root).filter((element) => element.type === "h2").map(text), ["How do whales navigate?", "Why do fireflies glow?", "Seed hidden"]);

  const empty = renderJourneys([]);
  (find(empty.root, (element) => element.type === "button" && text(element).includes("Start a journey")).props.onClick as () => void)();
  assert.equal(empty.newCount, 1);
});

test("JourneysView keeps only useful journey management controls", () => {
  const rendered = renderJourneys([journeySummary("alpha")]);
  Object.defineProperty(globalThis, "window", { value: { prompt: () => "Renamed trail" }, configurable: true });

  (find(rendered.root, (element) => element.type === "button" && text(element).trim().startsWith("Show Journey")).props.onClick as () => void)();
  (buttonByText(rendered.root, "Remove journey").props.onClick as () => void)();
  const root = rendered.rerender();
  (buttonByText(root, "Delete").props.onClick as () => void)();
  (buttonByText(root, "Rename label").props.onClick as () => void)();
  (buttonByText(root, "Pin").props.onClick as () => void)();
  (buttonByText(root, "New journey").props.onClick as () => void)();

  assert.deepEqual(rendered.opened, ["alpha"]);
  assert.deepEqual(rendered.deleted, ["alpha"]);
  assert.deepEqual(rendered.managed, [
    ["alpha", { title: "Renamed trail" }],
    ["alpha", { pinned: true }],
  ]);
  assert.equal(rendered.newCount, 1);
  assert.doesNotMatch(text(root), /Hide|Snapshot|Export/);
  assert.doesNotMatch(text(root), /Resume|New drive/);
});

test("JourneysView confirms before stopping active background research", () => {
  const activity: ResearchActivity = {
    id: "research-active",
    question: "Why do fireflies flash?",
    performerId: "sage",
    status: "researching",
    phase: "finalizing",
    journeyId: null,
    error: null,
    createdAt: Date.now(),
    startedAt: Date.now(),
    timeoutAt: Date.now() + 60_000,
    completedAt: null,
  };
  const rendered = renderJourneys([], { activities: [activity] });

  (find(rendered.root, (element) => element.type === "button" && element.props["aria-label"] === "Stop research").props.onClick as () => void)();
  const confirmation = rendered.rerender();
  assert.match(text(confirmation), /Stop this research\?/);
  (buttonByText(confirmation, "Stop").props.onClick as () => void)();

  assert.deepEqual(rendered.cancelled, [activity.id]);
});

test("JourneysView confirms before dismissing failed background research", () => {
  const activity: ResearchActivity = {
    id: "research-failed",
    question: "Why did this research fail?",
    performerId: "sage",
    status: "failed",
    phase: null,
    journeyId: null,
    error: "Provider allowance exceeded.",
    createdAt: Date.now(),
    startedAt: Date.now(),
    timeoutAt: null,
    completedAt: Date.now(),
  };
  const rendered = renderJourneys([], { activities: [activity] });

  (find(rendered.root, (element) => element.type === "button" && text(element).trim().startsWith("Remove failed research")).props.onClick as () => void)();
  const confirmation = rendered.rerender();
  assert.match(text(confirmation), /Remove this failed research\?/);
  (buttonByText(confirmation, "Remove").props.onClick as () => void)();

  assert.deepEqual(rendered.dismissed, [activity.id]);
});

test("BookmarksView contains only explicitly bookmarked questions", () => {
  const now = Date.now();
  const rendered = renderBookmarks([bookmark("alpha", {
    bookmarkedAt: now - 500,
    leadMedia: {
      imageUrl: "https://images.example/bookmark.jpg",
      sourcePageUrl: "https://example.org/bookmark",
      caption: "Saved visual",
      alt: "Saved question visual",
    },
  })]);

  assert.equal(find(rendered.root, (element) => element.type === "h1").props.id, "bookmarks-title");
  assert.deepEqual(elements(rendered.root).filter((element) => element.type === "h3").map(text), ["Saved question alpha"]);
  assert.doesNotMatch(text(rendered.root), /Pinned journeys|Everything/);
  assert.match(text(find(rendered.root, (element) => element.props["aria-label"] === "Bookmark summary")), /1 question/);
  assert.equal(
    (find(rendered.root, (element) => (element.props.media as TurnMedia | undefined)?.imageUrl === "https://images.example/bookmark.jpg").props.media as TurnMedia).alt,
    "Saved question visual",
  );

  let root = rendered.root;
  const search = find(root, (element) => element.type === "input" && element.props.placeholder === "Search saved questions or topics");
  (search.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "missing" } });
  root = rendered.rerender();
  assert.match(text(root), /Nothing tucked away here yet/);
  assert.match(text(root), /Try a broader search or clear a filter\./);
  (buttonByText(root, "Clear search").props.onClick as () => void)();
  root = rendered.rerender();
  assert.equal(elements(root).filter((element) => element.type === "h3").length, 1);

  const empty = renderBookmarks([]);
  assert.match(text(empty.root), /Saved topics and questions will appear here/);
});

test("BookmarksView preserves question callback payloads", () => {
  const rendered = renderBookmarks([bookmark("alpha")]);
  (buttonByText(rendered.root, "Remove").props.onClick as () => void)();
  let root = rendered.rerender();
  assert.match(text(root), /Remove bookmark\?/);
  (buttonByText(root, "Remove").props.onClick as () => void)();
  root = rendered.rerender();
  (buttonByText(root, "Open").props.onClick as () => void)();
  (buttonByText(rendered.root, "Explore something new").props.onClick as () => void)();

  assert.deepEqual(rendered.removed, ["turn-alpha"]);
  assert.deepEqual(rendered.opened, [["journey-alpha", "turn-alpha"]]);
  assert.equal(rendered.newCount, 1);
});

function renderSettings(
  settingsViewer: Viewer | null = viewer,
  overrides: Partial<Parameters<SettingsComponent>[0]> = {},
) {
  const previews: TextSize[] = [];
  const saves: UserPreferences[] = [];
  const props = {
    viewer: settingsViewer,
    savedJourneyCount: 4,
    preferences: DEFAULT_PREFERENCES,
    catalog: BOOTSTRAP_CATALOG,
    busy: false,
    onPreviewTextSize: (textSize: TextSize) => previews.push(textSize),
    onSave: async (next: UserPreferences) => { saves.push(next); },
    ...overrides,
  };
  const rerender = () => {
    hooks.reset();
    return SettingsView(props);
  };
  return { previews, saves, rerender, root: rerender() };
}

test("SettingsView preserves headings, identity messaging, actions, and busy state", () => {
  const guest = renderSettings();
  assert.equal(find(guest.root, (element) => element.type === "h1").props.id, "settings-title");
  assert.match(text(guest.root), /Your preferencesSettingsTune how CuriosityPedia looks and answers\./);
  assert.match(text(guest.root), /Guest ExplorerGuest sessionSaved4 \/ 12PreferencesThis device/);
  assert.doesNotMatch(text(guest.root), /Real-world visual evidence|Always on/);
  assert.equal(find(guest.root, (element) => element.type === "a").props.href, "/signin-with-chatgpt?return_to=%2Fsettings");
  const signedIn = renderSettings({ mode: "chatgpt", displayName: "Ada Lovelace", journeyLimit: 20 }, { busy: true });
  assert.match(text(signedIn.root), /Ada LovelaceChatGPT accountSaved4 \/ 20PreferencesSynced/);
  assert.match(text(signedIn.root), /Synced to your ChatGPT identity/);
  assert.equal(find(signedIn.root, (element) => element.type === "a").props.href, "/signout-with-chatgpt?return_to=%2Fsettings");
  assert.equal(buttonByText(signedIn.root, "Saving…↘").props.disabled, true);
});

test("SettingsView preserves preference drafts, preview payloads, immediate locale save, and submit payload", () => {
  const rendered = renderSettings();

  (buttonByText(rendered.root, "LargeAsk anything…").props.onClick as () => void)();
  let root = rendered.rerender();
  assert.deepEqual(rendered.previews, ["l"]);
  assert.equal(buttonByText(root, "LargeAsk anything…").props["aria-pressed"], true);

  const detail = find(root, (element) => element.type === "input" && element.props.type === "range");
  (detail.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "2" } });
  root = rendered.rerender();
  assert.match(text(find(root, (element) => element.type === "output")), /Deep dive/);

  const model = find(root, (element) => element.type === "select" && element.props.value === DEFAULT_PREFERENCES.defaultModelId);
  const nextModel = BOOTSTRAP_CATALOG.models.find((entry) => entry.id !== DEFAULT_PREFERENCES.defaultModelId)!.id;
  (model.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: nextModel } });
  root = rendered.rerender();

  const reduceMotion = find(root, (element) => element.type === "input" && element.props.type === "checkbox");
  (reduceMotion.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
  root = rendered.rerender();

  const locale = find(root, (element) => element.type === "select" && element.props.value === DEFAULT_PREFERENCES.interfaceLocale);
  (locale.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "fr" } });
  assert.deepEqual(rendered.saves[0], {
    ...DEFAULT_PREFERENCES,
    textSize: "l",
    answerDensity: "rich",
    defaultModelId: nextModel,
    reduceMotion: true,
    interfaceLocale: "fr",
    defaultOutputLocale: "fr",
  });

  root = rendered.rerender();
  const form = find(root, (element) => element.type === "form");
  let prevented = false;
  (form.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(rendered.saves[1], rendered.saves[0]);
});
