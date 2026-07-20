"use client";

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  CaretDown,
  CaretRight,
  CornersOut,
  Crosshair,
  ListBullets,
  MagnifyingGlass,
  Minus,
  Plus,
  X,
} from "@phosphor-icons/react";
import type { JourneyDetail, JourneyTurn, KnowledgeJourneySeed } from "../../lib/contracts";
import { validateDisplayImage } from "../../lib/image-validation";
import { questionBearingMedia } from "../../lib/knowledge-check-contracts";
import { useI18n } from "../i18n";
import {
  buildJourneyGraph,
  desktopGraphLayout,
  findGraphNode,
  findGraphPath,
  mobileGraphLayout,
  CURIOSITY_OPTION_PREFIX,
  openQuestionsForTurn,
  visibleJourneyGraph,
  type GraphDensity,
  type JourneyGraphNode,
  type PositionedGraphNode,
} from "./journey-graph";

type GraphViewMode = "graph" | "outline";

function useJourneyImageUrls(urls: string[]) {
  const validationKey = JSON.stringify([...new Set(urls)]);
  const candidates = useMemo(() => JSON.parse(validationKey) as string[], [validationKey]);
  const [validation, setValidation] = useState<{ key: string; validUrls: Set<string> }>(() => ({
    key: validationKey,
    // Keep the map stable while probes run, then remove the same failed images
    // that the book omits from its atlas and Knowledge Session.
    validUrls: new Set(candidates),
  }));

  useEffect(() => {
    let cancelled = false;
    if (candidates.length === 0) {
      return () => { cancelled = true; };
    }

    void Promise.all(candidates.map(async (url) => ({
      url,
      result: await validateDisplayImage(url),
    }))).then((results) => {
      if (cancelled) return;
      setValidation({
        key: validationKey,
        validUrls: new Set(results.filter(({ result }) => result.valid).map(({ url }) => url)),
      });
    });

    return () => { cancelled = true; };
  }, [candidates, validationKey]);

  return validation.key === validationKey ? validation.validUrls : new Set(candidates);
}

export function JourneyMap({
  journey,
  activeTurnId,
  onSelect,
  onContinue,
  onChoose,
  onExploreKnowledge,
}: {
  journey: JourneyDetail;
  activeTurnId: string;
  onSelect: (id: string) => void;
  onContinue: (id: string) => void;
  onChoose: (turnId: string, optionId: string) => void;
  onExploreKnowledge: (turnId: string, seed: KnowledgeJourneySeed) => void;
}) {
  const { t } = useI18n();
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const responsiveInitializedRef = useRef(false);
  const [density] = useState<GraphDensity>("topics");
  const [viewMode] = useState<GraphViewMode>("graph");
  const [focusRootId, setFocusRootId] = useState<string | null>(null);
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(() => new Set());
  const [outlineExpanded, setOutlineExpanded] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [openOnly] = useState(false);
  const [scale, setScale] = useState(.86);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [pendingBranch, setPendingBranch] = useState<{ turnId: string; optionId: string } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const journeyMediaUrls = useMemo(
    () => journey.turns.flatMap((turn) => turn.media.map((item) => item.imageUrl)),
    [journey.turns],
  );
  const validJourneyImageUrls = useJourneyImageUrls(journeyMediaUrls);
  const mapJourney = useMemo<JourneyDetail>(() => ({
    ...journey,
    turns: journey.turns.map((turn) => ({
      ...turn,
      media: turn.media.filter((item) => validJourneyImageUrls.has(item.imageUrl)),
    })),
  }), [journey, validJourneyImageUrls]);

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

  const fullGraph = useMemo(() => buildJourneyGraph(mapJourney), [mapJourney]);
  const turnIndex = useMemo(() => new Map(mapJourney.turns.map((turn, index) => [turn.id, index + 1])), [mapJourney.turns]);
  const activeTurn = mapJourney.turns.find((turn) => turn.id === activeTurnId) ?? mapJourney.turns[0];
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
    return mapJourney.turns.flatMap((turn) => {
      const turnMatch = `${turn.question} ${turn.topicLabel} ${turn.answer}`.toLocaleLowerCase().includes(normalizedQuery)
        ? [{ kind: "turn" as const, turn, option: null }]
        : [];
      const options = openQuestionsForTurn(turn)
        .filter((option) => option.question.toLocaleLowerCase().includes(normalizedQuery))
        .map((option) => ({ kind: "open" as const, turn, option }));
      return [...turnMatch, ...options];
    }).slice(0, 8);
  }, [mapJourney.turns, normalizedQuery]);
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
    setPendingBranch({ turnId, optionId });
  }

  function knowledgeSeedForOption(turn: JourneyTurn, optionId: string): KnowledgeJourneySeed | null {
    if (!optionId.startsWith(CURIOSITY_OPTION_PREFIX)) return null;
    const mediaIndex = Number(optionId.slice(CURIOSITY_OPTION_PREFIX.length));
    const media = questionBearingMedia(turn.media, turn.topicLabel)[mediaIndex];
    const option = openQuestionsForTurn(turn).find((candidate) => candidate.id === optionId);
    if (!media || !option) return null;
    return {
      question: option.question,
      imageUrl: media.imageUrl,
      imageAlt: media.alt,
      imageCaption: media.caption,
      imageSourceUrl: media.sourcePageUrl,
      imageSourceLabel: media.title ?? turn.topicLabel,
    };
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

  const selectedParent = activeTurn.parentTurnId ? mapJourney.turns.find((turn) => turn.id === activeTurn.parentTurnId) : null;
  const selectedNode = findGraphNode(fullGraph, activeTurn.id);
  const pendingTurn = pendingBranch ? mapJourney.turns.find((turn) => turn.id === pendingBranch.turnId) : null;
  const pendingNode = pendingTurn ? findGraphNode(fullGraph, pendingTurn.id) : null;
  const pendingOption = pendingBranch && pendingTurn
    ? pendingNode?.children.find((child) => child.kind === "open" && child.option?.id === pendingBranch.optionId)?.option
      ?? openQuestionsForTurn(pendingTurn).find((option) => option.id === pendingBranch.optionId)
    : null;
  const openQuestionCount = fullGraph.openCount;

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
          <div><dt>{t("Open paths")}</dt><dd>{openQuestionCount}</dd></div>
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

      <div className={`journey-tree-workspace ${viewMode} ${inspectorOpen ? "" : "inspector-closed"}`}>
        {viewMode === "graph" ? (
          <div className="journey-graph-shell">
            <div className="journey-graph-statusbar">
              <span><Crosshair aria-hidden="true" /> {t("Turn {number}", { number: turnIndex.get(journey.currentTurnId) ?? journey.turnCount })} · {t("You are here")}</span>
              <span>{focusRootId ? t("Focused branch") : t("Whole tree")} · {t("{count} open questions", { count: openQuestionCount })}</span>
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
                      const questionNumber = node.option?.id.startsWith(CURIOSITY_OPTION_PREFIX)
                        ? Number(node.option.id.slice(CURIOSITY_OPTION_PREFIX.length)) + 1
                        : (node.option?.position ?? 0) + 1;
                      return (
                        <button
                          type="button"
                          className={className}
                          key={node.id}
                          style={{ left: x, top: y, width, height }}
                          aria-label={`${t("Open path")}: ${node.option?.question}`}
                          onClick={() => previewBranch(node.turn.id, node.option?.id ?? "")}
                        >
                          <span className="journey-node-number">{preview ? <Plus aria-hidden="true" /> : questionNumber}</span>
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
                        onClick={() => onContinue(node.turn.id)}
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
          <aside className="journey-node-inspector" aria-label={t("Selected turn details")}>
            <div className="journey-inspector-handle" aria-hidden="true" />
            <header>
              <div>
                <span>{t("Turn {number}", { number: turnIndex.get(activeTurn.id) ?? 1 })}</span>
                <strong>{activeTurn.topicLabel}</strong>
              </div>
              <button type="button" aria-label={t("Close details")} onClick={() => { setInspectorOpen(false); setPendingBranch(null); }}><X aria-hidden="true" /></button>
            </header>
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
                  <span>{t("Questions from this session")}</span>
                  {openQuestionsForTurn(activeTurn).map((option, optionIndex) => {
                    const action = journey.actions.find((item) => item.turnId === activeTurn.id && item.optionId === option.id && item.resultTurnId);
                    const resultTurn = action?.resultTurnId ? mapJourney.turns.find((turn) => turn.id === action.resultTurnId) : null;
                    if (option.state === "proposed") {
                      return <button type="button" className="open" key={option.id} onClick={() => previewBranch(activeTurn.id, option.id)}><small>{t("Question")} {String(optionIndex + 1).padStart(2, "0")} · {t("Open")}</small><strong>{option.question}</strong><em>{t("Preview journey")}</em></button>;
                    }
                    return <button type="button" key={option.id} disabled={!resultTurn} onClick={() => resultTurn && selectAndReveal(resultTurn.id)}><small>{t("Option")} {option.position === 0 ? "A" : "B"} · {t(option.state === "chosen" ? "path taken" : option.state)}</small><strong>{option.question}</strong><em>{resultTurn ? t("Show result") : t("Closed")}</em></button>;
                  })}
                </div>
              </>
          </aside>
        )}
      </div>

      {pendingBranch && pendingTurn && pendingOption && (
        <div className="journey-research-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPendingBranch(null);
        }}>
          <div className="journey-research-modal" role="dialog" aria-modal="true" aria-labelledby="journey-research-title" aria-describedby="journey-research-description">
            <header>
              <span>{t("Open question")}</span>
              <button type="button" aria-label={t("Close")} onClick={() => setPendingBranch(null)}><X aria-hidden="true" /></button>
            </header>
            <div>
              <p className="eyebrow"><span /> {t("New research path")}</p>
              <h2 id="journey-research-title">{t("Deep dive into this question?")}</h2>
              <p className="journey-research-question">{pendingOption.question}</p>
              <p id="journey-research-description">{t("This starts one new researched answer from Turn {number}. Your current journey stays intact.", { number: turnIndex.get(pendingTurn.id) ?? 1 })}</p>
            </div>
            <footer>
              <button type="button" className="primary" onClick={() => {
                const branch = pendingBranch;
                const turn = pendingTurn;
                setPendingBranch(null);
                const seed = knowledgeSeedForOption(turn, branch.optionId);
                if (seed) onExploreKnowledge(branch.turnId, seed);
                else onChoose(branch.turnId, branch.optionId);
              }}>{t("Start research")}</button>
              <button type="button" onClick={() => setPendingBranch(null)}>{t("Not now")}</button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
