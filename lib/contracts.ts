export type PerformerId = "archivist" | "field-naturalist" | "systems-cartographer";
export type ModelId = "fixture-terra";
export type ResearchPreset = "spark" | "standard" | "deep";

export type Performer = {
  id: PerformerId;
  name: string;
  role: string;
  cue: string;
  mark: string;
  accent: "coral" | "sky" | "acid";
};

export type ModelConfig = {
  id: ModelId;
  provider: "OpenAI";
  name: string;
  disclosure: string;
};

export type Viewer = {
  mode: "guest" | "chatgpt";
  displayName: string;
  journeyLimit: number;
};

export type Source = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  relation: "consulted" | "cited" | "image";
};

export type ResearchEvent = {
  id: string;
  sequence: number;
  kind: "search" | "source" | "check" | "synthesis" | "status";
  label: string;
  sourceId: string | null;
};

export type Interlude = {
  id: string;
  text: string;
  sourceTitle: string;
  sourceUrl: string;
};

export type AnswerBlock = {
  text: string;
  sourceIds: string[];
};

export type TurnOption = {
  id: string;
  position: 0 | 1;
  question: string;
  angle: string;
  state: "proposed" | "chosen" | "rejected" | "superseded";
};

export type JourneyTurn = {
  id: string;
  parentTurnId: string | null;
  depth: number;
  question: string;
  answer: string;
  answerBlocks: AnswerBlock[];
  transition: string;
  topicLabel: string;
  researchSummary: string;
  preferredPosition: 0 | 1;
  optionSetVersion: number;
  options: TurnOption[];
  sources: Source[];
  researchEvents: ResearchEvent[];
  interlude: Interlude;
  createdAt: number;
};

export type JourneySummary = {
  id: string;
  title: string;
  seed: string;
  performerId: PerformerId;
  modelId: ModelId;
  researchPreset: ResearchPreset;
  currentTurnId: string;
  turnCount: number;
  sourceCount: number;
  version: number;
  updatedAt: number;
  topicLabels: string[];
};

export type JourneyDetail = JourneySummary & {
  status: "active" | "paused";
  turns: JourneyTurn[];
};

export type CreateJourneyRequest = {
  seed: string;
  performerId: PerformerId;
  modelId: ModelId;
  researchPreset: ResearchPreset;
  idempotencyKey: string;
};

export type AdvanceJourneyRequest = {
  fromTurnId: string;
  action: "choose" | "reject" | "delegate";
  optionId?: string;
  adventure?: number;
  expectedVersion: number;
  idempotencyKey: string;
};

export type CompareResult = {
  left: JourneySummary;
  right: JourneySummary;
  sharedTopics: string[];
  leftOnlyTopics: string[];
  rightOnlyTopics: string[];
  observations: string[];
};

export type ApiSuccess<T> = {
  data: T;
  viewer: Viewer;
};

export type ApiFailure = {
  error: {
    code:
      | "BAD_REQUEST"
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "VERSION_CONFLICT"
      | "IDEMPOTENCY_CONFLICT"
      | "JOURNEY_LIMIT"
      | "INTERNAL_ERROR";
    message: string;
    retryable: boolean;
  };
};
