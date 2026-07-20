import { modelById, performerById } from "../catalog";
import type {
  CompareResult,
  JourneyDetail,
  JourneySummary,
} from "../contracts";

export function projectJourneyComparison(
  leftDetail: JourneyDetail,
  rightDetail: JourneyDetail,
): CompareResult {
  const leftSummary = summaryFromDetail(leftDetail);
  const rightSummary = summaryFromDetail(rightDetail);
  const decorate = (detail: JourneyDetail) => ({
    ...summaryFromDetail(detail),
    performerName: performerById(detail.performerId).name,
    modelName: modelById(detail.modelId).name,
    actionCount: detail.actions.length,
    rejectedCount: detail.actions.filter((action) => action.kind === "reject").length,
    delegatedCount: detail.actions.filter((action) => action.kind === "delegate").length,
    totalEstimatedCostUsd: detail.turns.reduce(
      (total, turn) => total + turn.research.usage.estimatedCostUsd,
      0,
    ),
    timeline: detail.turns.map((turn) => ({
      turnId: turn.id,
      question: turn.question,
      topicLabel: turn.topicLabel,
      transition: turn.transition,
      researchedAt: turn.metadata.researchedAt,
      sourceCount: turn.sources.length,
    })),
  });
  const left = decorate(leftDetail);
  const right = decorate(rightDetail);
  const sharedTopics = leftSummary.topicLabels.filter((topic) => rightSummary.topicLabels.includes(topic));
  const leftOnlyTopics = leftSummary.topicLabels.filter((topic) => !rightSummary.topicLabels.includes(topic));
  const rightOnlyTopics = rightSummary.topicLabels.filter((topic) => !leftSummary.topicLabels.includes(topic));
  const observations: CompareResult["observations"] = [
    sharedTopics.length
      ? { key: "Both journeys touched {topics}.", values: { topics: formatList(sharedTopics) } }
      : { key: "The journeys did not land on the same fixture topic." },
    left.performerId === right.performerId
      ? { key: "They used the same performer, so the path—not the persona—is the clearest visible difference." }
      : { key: "They used different performers, so both path and persona shape the contrast." },
    left.turnCount === right.turnCount
      ? { key: left.turnCount === 1 ? "Both contain 1 committed turn." : "Both contain {count} committed turns.", values: { count: left.turnCount } }
      : { key: "{leftTitle} contains {leftCount} turns; {rightTitle} contains {rightCount}.", values: { leftTitle: left.title, leftCount: left.turnCount, rightTitle: right.title, rightCount: right.turnCount } },
  ];
  return {
    left,
    right,
    sharedTopics,
    leftOnlyTopics,
    rightOnlyTopics,
    observations,
    confounders: [
      { key: "Live-web evidence can change between research dates." },
      { key: "Audience choices and rejected paths change the context of later turns." },
      { key: "Model output is stochastic; this view is descriptive, not a winner ranking." },
      { key: left.seed === right.seed ? "Both journeys began from the same seed." : "The starting seeds differ." },
    ],
  };
}

function summaryFromDetail(detail: JourneyDetail): JourneySummary {
  return {
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
}

function formatList(values: string[]): string {
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}
