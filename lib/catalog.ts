import type { ModelConfig, Performer } from "./contracts";

export const PERFORMERS: Performer[] = [
  {
    id: "archivist",
    name: "The Archivist",
    role: "Finds the thread history tried to hide",
    cue: "Patient, precise, and attentive to what survives in records and rituals.",
    mark: "A",
    accent: "coral",
  },
  {
    id: "field-naturalist",
    name: "The Field Naturalist",
    role: "Starts with behavior, texture, and change",
    cue: "Observant and concrete, with a preference for mechanisms over slogans.",
    mark: "F",
    accent: "acid",
  },
  {
    id: "systems-cartographer",
    name: "The Systems Cartographer",
    role: "Draws the forces around the obvious answer",
    cue: "Clear-eyed about feedback loops, boundaries, incentives, and second-order effects.",
    mark: "S",
    accent: "sky",
  },
];

export const MODELS: ModelConfig[] = [
  {
    id: "fixture-terra",
    provider: "OpenAI",
    name: "OpenAI · Terra fixture",
    disclosure: "Interface fixture · no model call in Phase 1",
  },
];

export const STARTER_QUESTIONS = [
  "What does a building sound like?",
  "Can a map tell the truth?",
  "Where does a city keep its memories?",
  "Why do some ideas feel inevitable?",
  "Can silence be designed?",
  "What can an ocean hear that we cannot?",
] as const;

export const PRESET_LABELS = {
  spark: {
    name: "Spark",
    description: "A brisk fixture rehearsal",
  },
  standard: {
    name: "Standard",
    description: "The balanced Phase 1 path",
  },
  deep: {
    name: "Deep",
    description: "A slower, denser stage replay",
  },
} as const;
