import type { JourneyDetail, JourneyTurn } from "../../lib/contracts";
import { canonicalImageQuestion, questionBearingMedia } from "../../lib/knowledge-check-contracts";

export type GraphDensity = "overview" | "topics" | "detail";

export const CURIOSITY_OPTION_PREFIX = "curiosity:";

export function openQuestionsForTurn(turn: JourneyTurn): JourneyTurn["options"] {
  const curiosityQuestions = questionBearingMedia(turn.media, turn.topicLabel).flatMap((media, mediaIndex) => {
    const question = canonicalImageQuestion(media, turn.topicLabel);
    if (!question) return [];
    return [{
      id: `${CURIOSITY_OPTION_PREFIX}${mediaIndex}`,
      position: (mediaIndex % 2) as 0 | 1,
      question,
      angle: media.role ?? "question",
      state: "proposed" as const,
    }];
  });
  return curiosityQuestions.length
    ? curiosityQuestions
    : turn.options.filter((option) => option.state === "proposed");
}

export type JourneyGraphNode = {
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

export type PositionedGraphNode = {
  node: JourneyGraphNode;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GraphLayout = {
  nodes: PositionedGraphNode[];
  width: number;
  height: number;
  mobile: boolean;
};

export function buildJourneyGraph(journey: JourneyDetail): JourneyGraphNode {
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

    // A completed child consumes one matching image question, not every legacy
    // image that happened to receive the same generated wording.
    const unmatchedDirectChildren = [...directChildren];
    const openQuestions = openQuestionsForTurn(turn).filter((option) => {
      const matchingChildIndex = unmatchedDirectChildren.findIndex(
        (child) => child.question.localeCompare(option.question, turn.metadata.outputLocale, { sensitivity: "base", ignorePunctuation: true }) === 0,
      );
      if (matchingChildIndex < 0) return true;
      unmatchedDirectChildren.splice(matchingChildIndex, 1);
      return false;
    });
    const hasCuriosityQuestions = openQuestions.some((option) => option.id.startsWith(CURIOSITY_OPTION_PREFIX));
    for (const option of [...turn.options].sort((left, right) => left.position - right.position)) {
      const resultId = resultByOption.get(`${turn.id}:${option.id}`);
      const resultTurn = resultId ? turnById.get(resultId) : undefined;
      if (resultTurn && resultTurn.parentTurnId === turn.id) {
        usedChildren.add(resultTurn.id);
        children.push(buildTurn(resultTurn, turn.id, option.position));
      } else if (option.state === "proposed" && !hasCuriosityQuestions) {
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

    if (hasCuriosityQuestions) {
      for (const option of openQuestions) {
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

export function findGraphNode(root: JourneyGraphNode, id: string): JourneyGraphNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const match = findGraphNode(child, id);
    if (match) return match;
  }
  return null;
}

export function findGraphPath(root: JourneyGraphNode, id: string): JourneyGraphNode[] | null {
  if (root.id === id) return [root];
  for (const child of root.children) {
    const path = findGraphPath(child, id);
    if (path) return [root, ...path];
  }
  return null;
}

export function visibleJourneyGraph(
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

export function desktopGraphLayout(root: JourneyGraphNode, density: GraphDensity): GraphLayout {
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

export function mobileGraphLayout(root: JourneyGraphNode, routeIds: Set<string>, density: GraphDensity): GraphLayout {
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
