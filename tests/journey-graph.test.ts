import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJourneyGraph,
  desktopGraphLayout,
  findGraphNode,
  findGraphPath,
  mobileGraphLayout,
  visibleJourneyGraph,
  type JourneyGraphNode,
} from "../app/experience/journey-graph";
import type { JourneyDetail, JourneyTurn, TurnOption } from "../lib/contracts";

function option(
  id: string,
  position: 0 | 1,
  state: TurnOption["state"] = "proposed",
): TurnOption {
  return { id, position, question: `Question ${id}?`, angle: `Angle ${id}`, state };
}

function turn(
  id: string,
  parentTurnId: string | null,
  options: TurnOption[],
  preferredPosition: 0 | 1 = 0,
): JourneyTurn {
  return {
    id,
    parentTurnId,
    depth: parentTurnId ? 1 : 0,
    question: `Question ${id}?`,
    answer: `Answer ${id}`,
    answerBlocks: [{ text: `Answer ${id}`, sourceIds: [] }],
    media: [],
    transition: `Transition ${id}`,
    topicLabel: `Topic ${id}`,
    researchSummary: `Summary ${id}`,
    researchHandoff: {
      discoveries: [],
      uncertainties: [],
      unresolvedThreads: [],
      sourceLeads: [],
    },
    preferredPosition,
    optionSetVersion: 1,
    options,
    sources: [],
    researchEvents: [],
    metadata: {
      performerId: "atlas",
      performerVersion: "test",
      provider: "fixture",
      modelId: "gpt-5.4-mini",
      modelSnapshot: "test",
      researchPreset: "standard",
      answerDensity: "balanced",
      imagePreference: "prefer",
      outputLocale: "en",
      promptVersion: "test",
      researchedAt: 1,
    },
    research: {
      mode: "fixture",
      providerResponseId: null,
      usage: {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        webSearchCalls: 0,
        pageFetches: 0,
        latencyMs: 0,
        estimatedCostUsd: 0,
        rateEffectiveAt: "2026-07-18",
      },
    },
    createdAt: 1,
  };
}

function journeyFixture(): JourneyDetail {
  const root = turn("root", null, [option("root-a", 0, "chosen"), option("root-b", 1)]);
  const chosen = turn("chosen", "root", [option("chosen-a", 0, "chosen"), option("chosen-b", 1, "chosen")]);
  const current = turn("current", "chosen", [option("current-a", 0), option("current-b", 1)], 0);
  const medium = turn("medium-1", "chosen", [option("medium-1-a", 0, "chosen"), option("medium-1-b", 1, "rejected")], 1);
  const medium2 = turn("medium-2", "medium-1", [option("medium-2-a", 0, "chosen"), option("medium-2-b", 1, "rejected")]);
  const medium3 = turn("medium-3", "medium-2", [option("medium-3-a", 0, "rejected"), option("medium-3-b", 1, "rejected")]);
  const orphan1 = turn("orphan-1", "root", [option("orphan-1-a", 0, "chosen"), option("orphan-1-b", 1, "rejected")]);
  const orphan2 = turn("orphan-2", "orphan-1", [option("orphan-2-a", 0, "chosen"), option("orphan-2-b", 1, "rejected")]);
  const orphan3 = turn("orphan-3", "orphan-2", [option("orphan-3-a", 0, "chosen"), option("orphan-3-b", 1, "rejected")]);
  const orphan4 = turn("orphan-4", "orphan-3", [option("orphan-4-a", 0, "chosen"), option("orphan-4-b", 1, "rejected")]);
  const orphan5 = turn("orphan-5", "orphan-4", [option("orphan-5-a", 0, "chosen"), option("orphan-5-b", 1, "rejected")]);
  const orphan6 = turn("orphan-6", "orphan-5", [option("orphan-6-a", 0), option("orphan-6-b", 1)]);
  const turns = [root, chosen, current, medium, medium2, medium3, orphan1, orphan2, orphan3, orphan4, orphan5, orphan6];
  const links = [
    ["root", "root-a", "chosen"],
    ["chosen", "chosen-a", "current"],
    ["chosen", "chosen-b", "medium-1"],
    ["medium-1", "medium-1-a", "medium-2"],
    ["medium-2", "medium-2-a", "medium-3"],
    ["orphan-1", "orphan-1-a", "orphan-2"],
    ["orphan-2", "orphan-2-a", "orphan-3"],
    ["orphan-3", "orphan-3-a", "orphan-4"],
    ["orphan-4", "orphan-4-a", "orphan-5"],
    ["orphan-5", "orphan-5-a", "orphan-6"],
  ] as const;
  return {
    id: "journey",
    title: "Journey",
    seed: "Seed",
    performerId: "atlas",
    modelId: "gpt-5.4-mini",
    researchPreset: "standard",
    answerDensity: "balanced",
    imagePreference: "prefer",
    outputLocale: "en",
    currentTurnId: "current",
    turnCount: turns.length,
    sourceCount: 0,
    openBranchCount: 4,
    version: 1,
    pinned: false,
    hidden: false,
    createdAt: 1,
    updatedAt: 1,
    topicLabels: [],
    status: "active",
    turns,
    actions: links.map(([turnId, optionId, resultTurnId], index) => ({
      id: `action-${index}`,
      turnId,
      kind: "choose",
      optionId,
      resultTurnId,
      reason: null,
      adventure: null,
      createdAt: index,
    })),
  };
}

function shape(node: JourneyGraphNode): unknown {
  return {
    id: node.id,
    parentId: node.parentId,
    kind: node.kind,
    branchPosition: node.branchPosition,
    turnId: node.turn.id,
    optionId: node.option?.id ?? null,
    turnCount: node.turnCount,
    openCount: node.openCount,
    children: node.children.map(shape),
  };
}

test("projects chosen, open, rejected, and unmatched persisted branches without reordering", () => {
  const graph = buildJourneyGraph(journeyFixture());

  assert.deepEqual(shape(graph), {
    id: "root",
    parentId: null,
    kind: "turn",
    branchPosition: 0,
    turnId: "root",
    optionId: null,
    turnCount: 12,
    openCount: 5,
    children: [
      {
        id: "chosen",
        parentId: "root",
        kind: "turn",
        branchPosition: 0,
        turnId: "chosen",
        optionId: null,
        turnCount: 5,
        openCount: 2,
        children: [
          {
            id: "current",
            parentId: "chosen",
            kind: "turn",
            branchPosition: 0,
            turnId: "current",
            optionId: null,
            turnCount: 1,
            openCount: 2,
            children: [
              { id: "open:current:current-a", parentId: "current", kind: "open", branchPosition: 0, turnId: "current", optionId: "current-a", turnCount: 0, openCount: 1, children: [] },
              { id: "open:current:current-b", parentId: "current", kind: "open", branchPosition: 1, turnId: "current", optionId: "current-b", turnCount: 0, openCount: 1, children: [] },
            ],
          },
          {
            id: "medium-1",
            parentId: "chosen",
            kind: "turn",
            branchPosition: 1,
            turnId: "medium-1",
            optionId: null,
            turnCount: 3,
            openCount: 0,
            children: [
              { id: "medium-2", parentId: "medium-1", kind: "turn", branchPosition: 0, turnId: "medium-2", optionId: null, turnCount: 2, openCount: 0, children: [
                { id: "medium-3", parentId: "medium-2", kind: "turn", branchPosition: 0, turnId: "medium-3", optionId: null, turnCount: 1, openCount: 0, children: [] },
              ] },
            ],
          },
        ],
      },
      { id: "open:root:root-b", parentId: "root", kind: "open", branchPosition: 1, turnId: "root", optionId: "root-b", turnCount: 0, openCount: 1, children: [] },
      {
        id: "orphan-1",
        parentId: "root",
        kind: "turn",
        branchPosition: 1,
        turnId: "orphan-1",
        optionId: null,
        turnCount: 6,
        openCount: 2,
        children: [{ id: "orphan-2", parentId: "orphan-1", kind: "turn", branchPosition: 0, turnId: "orphan-2", optionId: null, turnCount: 5, openCount: 2, children: [
          { id: "orphan-3", parentId: "orphan-2", kind: "turn", branchPosition: 0, turnId: "orphan-3", optionId: null, turnCount: 4, openCount: 2, children: [
            { id: "orphan-4", parentId: "orphan-3", kind: "turn", branchPosition: 0, turnId: "orphan-4", optionId: null, turnCount: 3, openCount: 2, children: [
              { id: "orphan-5", parentId: "orphan-4", kind: "turn", branchPosition: 0, turnId: "orphan-5", optionId: null, turnCount: 2, openCount: 2, children: [
                { id: "orphan-6", parentId: "orphan-5", kind: "turn", branchPosition: 0, turnId: "orphan-6", optionId: null, turnCount: 1, openCount: 2, children: [
                  { id: "open:orphan-6:orphan-6-a", parentId: "orphan-6", kind: "open", branchPosition: 0, turnId: "orphan-6", optionId: "orphan-6-a", turnCount: 0, openCount: 1, children: [] },
                  { id: "open:orphan-6:orphan-6-b", parentId: "orphan-6", kind: "open", branchPosition: 1, turnId: "orphan-6", optionId: "orphan-6-b", turnCount: 0, openCount: 1, children: [] },
                ] },
              ] },
            ] },
          ] },
        ] }],
      },
    ],
  });
});

test("finds selected nodes and paths and preserves missing-node results", () => {
  const graph = buildJourneyGraph(journeyFixture());

  assert.equal(findGraphNode(graph, "medium-2")?.turn.id, "medium-2");
  assert.equal(findGraphNode(graph, "missing"), null);
  assert.deepEqual(findGraphPath(graph, "current")?.map((node) => node.id), ["root", "chosen", "current"]);
  assert.deepEqual(findGraphPath(graph, "open:current:current-b")?.map((node) => node.id), ["root", "chosen", "current", "open:current:current-b"]);
  assert.equal(findGraphPath(graph, "missing"), null);
});

test("uses every generated image question as an open journey instead of the two fallback options", () => {
  const journey = journeyFixture();
  const current = journey.turns.find((candidate) => candidate.id === "current")!;
  current.media = Array.from({ length: 10 }, (_, index) => ({
    imageUrl: `https://images.example.org/${index}.jpg`,
    sourcePageUrl: `https://example.org/${index}`,
    caption: `Image ${index}`,
    alt: `Image ${index}`,
    knowledgeCheck: {
      declarationQuestion: `Do you understand idea ${index}?`,
      question: index === 0 ? "Why does this process happen?" : `What changes process ${index}?`,
      options: Array.from({ length: 8 }, (_, optionIndex) => `Answer ${optionIndex}`),
      correctOptionIndex: 0,
      explanation: `Explanation ${index}`,
    },
  }));

  const graph = buildJourneyGraph(journey);
  const currentNode = findGraphNode(graph, "current")!;
  assert.equal(currentNode.children.length, 10);
  assert.deepEqual(
    currentNode.children.map((child) => child.option?.id),
    Array.from({ length: 10 }, (_, index) => `curiosity:${index}`),
  );
  assert.equal(currentNode.children[0]?.option?.question, "Why does this process happen?");
});

test("keeps one question node for every displayed image even when legacy question text repeats", () => {
  const journey = journeyFixture();
  const current = journey.turns.find((candidate) => candidate.id === "current")!;
  const questions = [
    "How can pale trenches last for centuries?",
    "How can pale trenches last for centuries?",
    "Why are these channels so straight?",
    "How can pale trenches last for centuries?",
    "What made the surface turn white?",
    "How can pale trenches last for centuries?",
  ];
  current.media = questions.map((question, index) => ({
    imageUrl: `https://images.example.org/repeated-${index}.jpg`,
    sourcePageUrl: `https://example.org/repeated-${index}`,
    caption: `Image ${index}`,
    alt: `Image ${index}`,
    knowledgeCheck: {
      question,
      options: Array.from({ length: 8 }, (_, optionIndex) => `Answer ${optionIndex}`),
      correctOptionIndex: 0,
      explanation: `Explanation ${index}`,
    },
  }));

  const currentNode = findGraphNode(buildJourneyGraph(journey), "current")!;
  assert.equal(currentNode.children.length, 6);
  assert.deepEqual(currentNode.children.map((child) => child.option?.question), questions);
  assert.deepEqual(
    currentNode.children.map((child) => child.option?.id),
    ["curiosity:0", "curiosity:1", "curiosity:2", "curiosity:3", "curiosity:4", "curiosity:5"],
  );
});

test("folds only off-route branches at the current density and mobile thresholds", () => {
  const graph = buildJourneyGraph(journeyFixture());
  const routeIds = new Set(["root", "chosen", "current"]);

  const overview = visibleJourneyGraph(graph, routeIds, "overview", false, new Set());
  assert.deepEqual(overview.children.map((node) => node.id), ["chosen", "open:root:root-b", "cluster:orphan-1"]);
  assert.equal(findGraphNode(visibleJourneyGraph(graph, routeIds, "overview", false, new Set()), "cluster:medium-1")?.turnCount, 3);
  assert.equal(findGraphNode(visibleJourneyGraph(graph, routeIds, "topics", false, new Set()), "medium-1")?.kind, "turn");
  assert.equal(findGraphNode(visibleJourneyGraph(graph, routeIds, "topics", false, new Set()), "cluster:orphan-1")?.openCount, 2);
  assert.equal(findGraphNode(visibleJourneyGraph(graph, routeIds, "detail", false, new Set()), "orphan-6")?.kind, "turn");
  assert.equal(findGraphNode(visibleJourneyGraph(graph, routeIds, "detail", true, new Set()), "cluster:medium-1")?.kind, "cluster");
  assert.equal(findGraphNode(visibleJourneyGraph(graph, routeIds, "overview", false, new Set(["orphan-1"])), "cluster:orphan-2")?.kind, "cluster");
});

test("keeps deterministic desktop geometry for every density", () => {
  const graph = buildJourneyGraph(journeyFixture());
  const routeIds = new Set(["root", "chosen", "current"]);
  const expected = {
    overview: {
      width: 860,
      height: 560,
      nodes: [
        { id: "open:current:current-a", x: 590, y: 42, width: 132, height: 54 },
        { id: "open:current:current-b", x: 590, y: 124, width: 132, height: 54 },
        { id: "current", x: 408, y: 83, width: 132, height: 58 },
        { id: "cluster:medium-1", x: 408, y: 206, width: 132, height: 58 },
        { id: "chosen", x: 226, y: 144.5, width: 132, height: 58 },
        { id: "open:root:root-b", x: 226, y: 288, width: 132, height: 54 },
        { id: "cluster:orphan-1", x: 226, y: 370, width: 132, height: 58 },
        { id: "root", x: 44, y: 267.5, width: 132, height: 58 },
      ],
    },
    topics: {
      width: 1300,
      height: 658,
      nodes: [
        { id: "open:current:current-a", x: 776, y: 42, width: 190, height: 78 },
        { id: "open:current:current-b", x: 776, y: 154, width: 190, height: 78 },
        { id: "current", x: 532, y: 98, width: 190, height: 88 },
        { id: "medium-3", x: 1020, y: 266, width: 190, height: 88 },
        { id: "medium-2", x: 776, y: 266, width: 190, height: 88 },
        { id: "medium-1", x: 532, y: 266, width: 190, height: 88 },
        { id: "chosen", x: 288, y: 182, width: 190, height: 88 },
        { id: "open:root:root-b", x: 288, y: 378, width: 190, height: 78 },
        { id: "cluster:orphan-1", x: 288, y: 490, width: 190, height: 88 },
        { id: "root", x: 44, y: 350, width: 190, height: 88 },
      ],
    },
    detail: {
      width: 2422,
      height: 986,
      nodes: [
        { id: "open:current:current-a", x: 926, y: 42, width: 230, height: 114 },
        { id: "open:current:current-b", x: 926, y: 192, width: 230, height: 114 },
        { id: "current", x: 632, y: 117, width: 230, height: 124 },
        { id: "medium-3", x: 1220, y: 342, width: 230, height: 124 },
        { id: "medium-2", x: 926, y: 342, width: 230, height: 124 },
        { id: "medium-1", x: 632, y: 342, width: 230, height: 124 },
        { id: "chosen", x: 338, y: 229.5, width: 230, height: 124 },
        { id: "open:root:root-b", x: 338, y: 492, width: 230, height: 114 },
        { id: "open:orphan-6:orphan-6-a", x: 2102, y: 642, width: 230, height: 114 },
        { id: "open:orphan-6:orphan-6-b", x: 2102, y: 792, width: 230, height: 114 },
        { id: "orphan-6", x: 1808, y: 717, width: 230, height: 124 },
        { id: "orphan-5", x: 1514, y: 717, width: 230, height: 124 },
        { id: "orphan-4", x: 1220, y: 717, width: 230, height: 124 },
        { id: "orphan-3", x: 926, y: 717, width: 230, height: 124 },
        { id: "orphan-2", x: 632, y: 717, width: 230, height: 124 },
        { id: "orphan-1", x: 338, y: 717, width: 230, height: 124 },
        { id: "root", x: 44, y: 479.5, width: 230, height: 124 },
      ],
    },
  } as const;

  for (const density of ["overview", "topics", "detail"] as const) {
    const visible = visibleJourneyGraph(graph, routeIds, density, false, new Set());
    const layout = desktopGraphLayout(visible, density);
    assert.equal(layout.mobile, false);
    assert.deepEqual(
      {
        width: layout.width,
        height: layout.height,
        nodes: layout.nodes.map(({ node, x, y, width, height }) => ({ id: node.id, x, y, width, height })),
      },
      expected[density],
    );
  }
});

test("keeps deterministic mobile geometry and displays at most two children per route row", () => {
  const graph = buildJourneyGraph(journeyFixture());
  const routeIds = new Set(["root", "chosen", "current"]);
  const visible = visibleJourneyGraph(graph, routeIds, "topics", true, new Set());
  const layout = mobileGraphLayout(visible, routeIds, "topics");

  assert.deepEqual(layout.nodes.map(({ node, x, y, width, height }) => ({ id: node.id, x, y, width, height })), [
    { id: "root", x: 101, y: 28, width: 154, height: 82 },
    { id: "chosen", x: 10, y: 154, width: 154, height: 82 },
    { id: "open:root:root-b", x: 192, y: 154, width: 154, height: 74 },
    { id: "current", x: 10, y: 280, width: 154, height: 82 },
    { id: "cluster:medium-1", x: 192, y: 280, width: 154, height: 82 },
    { id: "open:current:current-a", x: 10, y: 406, width: 154, height: 74 },
    { id: "open:current:current-b", x: 192, y: 406, width: 154, height: 74 },
  ]);
  assert.deepEqual({ width: layout.width, height: layout.height, mobile: layout.mobile }, { width: 356, height: 568, mobile: true });
  assert.equal(layout.nodes.some(({ node }) => node.id === "cluster:orphan-1"), false);
});

test("retains the current runtime error for a malformed empty journey", () => {
  const malformed = { ...journeyFixture(), turns: [] };
  assert.throws(() => buildJourneyGraph(malformed), TypeError);
});
