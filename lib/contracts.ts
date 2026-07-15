export type PerformerId = "sage" | "spark" | "mechanist";
export type ModelId =
  | "gpt-5.6-sol"
  | "gpt-5.6-terra"
  | "gpt-5.6-luna"
  | "gpt-5.5"
  | "gpt-5.4"
  | "gpt-5.4-mini"
  | "gpt-5.4-nano";
export type ResearchPreset = "spark" | "standard" | "deep";
export type AnswerDensity = "brief" | "balanced" | "rich";
export type TextSize = "s" | "m" | "l" | "xl";
export type ImagePreference = "avoid" | "when-useful" | "prefer";

export type UserPreferences = {
  answerDensity: AnswerDensity;
  textSize: TextSize;
  imagePreference: ImagePreference;
  speechRate: number;
  reduceMotion: boolean;
};

export type Performer = {
  id: PerformerId;
  version: string;
  name: string;
  role: string;
  cue: string;
  mark: string;
  accent: "coral" | "sky" | "acid";
  sampleOpening: string;
  values: string[];
  voiceTraits: string[];
  avoids: string[];
  toolPosture: string;
  recommendedModelId: ModelId;
};

export type ModelConfig = {
  id: ModelId;
  snapshot: string;
  provider: "OpenAI" | "WonderDrive";
  name: string;
  disclosure: string;
  mode: "live" | "fixture";
  status: "enabled" | "retired";
  apiSurface: "responses" | "fixture";
  tools: string[];
  reasoningModes: string[];
  speedBand: "instant" | "fast" | "balanced" | "deliberate";
  qualityBand: "reviewed" | "strong";
  costBand: "free" | "low" | "metered";
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
  searchUsdPerCall: number;
  priceEffectiveAt: string;
  recommended: boolean;
  evaluationVersion: string;
};

export type PresetConfig = {
  id: ResearchPreset;
  name: string;
  description: string;
  sourceRange: string;
  waitBand: string;
  costBand: string;
  maxToolCalls: number;
  maxOutputTokens: number;
  deadlineMs: number;
};

export type BootstrapCatalog = {
  performers: Performer[];
  models: ModelConfig[];
  presets: PresetConfig[];
  starters: Record<PerformerId, string[]>;
  discoveryStarters: PersonalizedStarter[];
  promptVersion: string;
  schemaVersion: string;
};

export type PersonalizedStarter = {
  question: string;
  topic: string;
};

export type Viewer = {
  mode: "guest" | "chatgpt";
  displayName: string;
  journeyLimit: number;
  guestExpiresAt?: number;
  hasGuestUpgrade?: boolean;
};

export type Source = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  relation: "consulted" | "cited" | "image";
  publishedAt?: string | null;
  retrievedAt?: number;
  warning?: string | null;
  licenseNote?: string | null;
};

export type ResearchEvent = {
  id: string;
  sequence: number;
  kind: "search" | "source" | "check" | "synthesis" | "status";
  label: string;
  sourceId: string | null;
};

export type AnswerBlock = {
  text: string;
  sourceIds: string[];
};

export type TurnMedia = {
  imageUrl: string;
  thumbnailUrl?: string;
  sourcePageUrl: string;
  caption: string;
  alt: string;
};

export type ResearchHandoff = {
  discoveries: string[];
  uncertainties: string[];
  unresolvedThreads: string[];
  sourceLeads: string[];
};

export type TurnOption = {
  id: string;
  position: 0 | 1;
  question: string;
  angle: string;
  state: "proposed" | "chosen" | "rejected" | "superseded";
};

export type JourneyAction = {
  id: string;
  turnId: string;
  kind: "choose" | "reject" | "delegate" | "branch" | "pause";
  optionId: string | null;
  resultTurnId: string | null;
  reason: string | null;
  adventure: number | null;
  createdAt: number;
};

export type JourneyTurn = {
  id: string;
  parentTurnId: string | null;
  depth: number;
  question: string;
  answer: string;
  answerBlocks: AnswerBlock[];
  media: TurnMedia[];
  transition: string;
  topicLabel: string;
  researchSummary: string;
  researchHandoff: ResearchHandoff;
  preferredPosition: 0 | 1;
  optionSetVersion: number;
  options: TurnOption[];
  sources: Source[];
  researchEvents: ResearchEvent[];
  metadata: {
    performerId: PerformerId;
    performerVersion: string;
    provider: string;
    modelId: ModelId;
    modelSnapshot: string;
    researchPreset: ResearchPreset;
    answerDensity: AnswerDensity;
    imagePreference: ImagePreference;
    promptVersion: string;
    researchedAt: number;
  };
  research: {
    mode: "live" | "fixture";
    providerResponseId: string | null;
    usage: {
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      totalTokens: number;
      webSearchCalls: number;
      pageFetches: number;
      latencyMs: number;
      estimatedCostUsd: number;
      rateEffectiveAt: string;
    };
  };
  createdAt: number;
};

export type JourneySummary = {
  id: string;
  title: string;
  seed: string;
  performerId: PerformerId;
  modelId: ModelId;
  researchPreset: ResearchPreset;
  answerDensity: AnswerDensity;
  imagePreference: ImagePreference;
  currentTurnId: string;
  turnCount: number;
  sourceCount: number;
  openBranchCount: number;
  version: number;
  pinned: boolean;
  hidden: boolean;
  updatedAt: number;
  topicLabels: string[];
};

export type JourneyDetail = JourneySummary & {
  status: "active" | "paused";
  turns: JourneyTurn[];
  actions: JourneyAction[];
};

export type JourneySnapshot = {
  id: string;
  journeyId: string;
  label: string;
  graphVersion: number;
  summary: string;
  createdAt: number;
};

export type CreateJourneyRequest = {
  seed: string;
  performerId: PerformerId;
  modelId: ModelId;
  researchPreset: ResearchPreset;
  answerDensity: AnswerDensity;
  imagePreference: ImagePreference;
  idempotencyKey: string;
};

export type AdvanceJourneyRequest = {
  fromTurnId: string;
  action: "choose" | "reject" | "delegate";
  modelId?: ModelId;
  optionId?: string;
  adventure?: number;
  reason?: string;
  expectedVersion: number;
  idempotencyKey: string;
};

export type LiveResearchRequest =
  | {
      kind: "create";
      seed: string;
      performerId: PerformerId;
      modelId: ModelId;
      researchPreset: ResearchPreset;
      answerDensity: AnswerDensity;
      imagePreference: ImagePreference;
      idempotencyKey: string;
    }
  | {
      kind: "advance";
      journeyId: string;
      fromTurnId: string;
      action: "choose" | "delegate";
      modelId?: ModelId;
      optionId?: string;
      expectedVersion: number;
      idempotencyKey: string;
    };

export type LiveResearchStreamEvent =
  | { type: "started"; requestId: string; question: string; message: string }
  | { type: "heartbeat"; at: number }
  | { type: "activity"; event: ResearchEvent }
  | { type: "complete"; data: JourneyDetail; viewer: Viewer }
  | { type: "error"; error: ApiFailure["error"] };

export type CompareJourneyDetail = JourneySummary & {
  performerName: string;
  modelName: string;
  actionCount: number;
  rejectedCount: number;
  delegatedCount: number;
  totalEstimatedCostUsd: number;
  timeline: Array<{
    turnId: string;
    question: string;
    topicLabel: string;
    transition: string;
    researchedAt: number;
    sourceCount: number;
  }>;
};

export type CompareResult = {
  left: CompareJourneyDetail;
  right: CompareJourneyDetail;
  sharedTopics: string[];
  leftOnlyTopics: string[];
  rightOnlyTopics: string[];
  observations: string[];
  confounders: string[];
};

export type ApiSuccess<T> = { data: T; viewer: Viewer };

export type ApiFailure = {
  error: {
    code:
      | "BAD_REQUEST"
      | "AUTH_REQUIRED"
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "VERSION_CONFLICT"
      | "IDEMPOTENCY_CONFLICT"
      | "ALREADY_IN_PROGRESS"
      | "JOURNEY_LIMIT"
      | "LIVE_RESEARCH_LIMIT"
      | "BUDGET_EXCEEDED"
      | "PROVIDER_UNAVAILABLE"
      | "PROVIDER_ERROR"
      | "PROVIDER_TIMEOUT"
      | "SCHEMA_INVALID"
      | "CITATION_INVALID"
      | "SAFETY_BLOCKED"
      | "RESEARCH_VALIDATION_FAILED"
      | "INTERNAL_ERROR";
    message: string;
    retryable: boolean;
    diagnosticId?: string;
  };
};

export type DiagnosticIncident = {
  diagnosticId: string;
  kind: "create" | "advance";
  status: "failed";
  modelId: string;
  researchPreset: string;
  errorCode: string;
  errorMessage: string;
  providerRequestId: string | null;
  providerResponseId: string | null;
  httpStatus: number | null;
  stage: string;
  lastProviderEventType: string;
  providerEventCount: number;
  malformedEventCount: number;
  outputDeltaCount: number;
  sawProviderDone: boolean;
  latencyMs: number;
  createdAt: number;
  completedAt: number | null;
};

export type DiagnosticsReport = {
  retentionDays: number;
  summary: {
    requests24h: number;
    failures24h: number;
    failureRate24h: number;
  };
  repeatedFailures: Array<{
    errorCode: string;
    count: number;
    latestAt: number;
  }>;
  incidents: DiagnosticIncident[];
};
