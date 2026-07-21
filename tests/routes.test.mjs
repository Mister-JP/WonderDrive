import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  journeyMapPath,
  journeyStagePath,
  parseCuriosityPediaRoute,
  staticRoutePath,
} from "../app/routes.ts";

test("parses stable product routes", () => {
  assert.deepEqual(parseCuriosityPediaRoute("/"), { name: "start" });
  assert.deepEqual(parseCuriosityPediaRoute("/journeys/"), { name: "journeys" });
  assert.deepEqual(parseCuriosityPediaRoute("/library/"), { name: "journeys" });
  assert.deepEqual(parseCuriosityPediaRoute("/bookmarks"), { name: "bookmarks" });
  assert.deepEqual(parseCuriosityPediaRoute("/usage"), { name: "usage" });
  assert.deepEqual(parseCuriosityPediaRoute("/settings"), { name: "settings" });
  assert.deepEqual(parseCuriosityPediaRoute("/about"), { name: "about" });
});

test("round trips journey stage and map routes", () => {
  const stagePath = journeyStagePath("journey/one", "turn two");
  assert.equal(stagePath, "/journeys/journey%2Fone/turns/turn%20two");
  assert.deepEqual(parseCuriosityPediaRoute(stagePath), {
    name: "journey",
    journeyId: "journey/one",
    turnId: "turn two",
    surface: "stage",
  });

  const mapPath = journeyMapPath("journey-1", "turn-2");
  assert.equal(mapPath, "/journeys/journey-1/map?turn=turn-2");
  assert.deepEqual(parseCuriosityPediaRoute("/journeys/journey-1/map", "?turn=turn-2"), {
    name: "journey",
    journeyId: "journey-1",
    turnId: "turn-2",
    surface: "map",
  });
});

test("rejects paths outside the product route contract", () => {
  assert.equal(parseCuriosityPediaRoute("/journeys/id/unknown"), null);
  assert.equal(parseCuriosityPediaRoute("/not-a-route"), null);
  assert.equal(staticRoutePath("start"), "/");
  assert.equal(staticRoutePath("journeys"), "/journeys");
  assert.equal(staticRoutePath("bookmarks"), "/bookmarks");
  assert.equal(staticRoutePath("about"), "/about");
});

test("orchestration exposes Journeys navigation and opens cards on the map", async () => {
  const source = await readFile(new URL("../app/curiositypedia-experience.tsx", import.meta.url), "utf8");
  assert.match(source, /\{ id: "journeys", label: "Journeys" \}/);
  assert.doesNotMatch(source, /label: "Library"/);
  assert.doesNotMatch(source, /New drive/);
  assert.match(source, /onOpen=\{\(id\) => void openJourney\(id, "map"\)\}/);
});

test("the page-flip atlas waits for image validation before mounting its imperative child list", async () => {
  const source = await readFile(new URL("../app/curiositypedia-experience.tsx", import.meta.url), "utf8");
  const settledGuard = source.indexOf("!mediaValidation.settled");
  const flipBook = source.indexOf("<HTMLFlipBook", settledGuard);

  assert.ok(settledGuard >= 0);
  assert.ok(flipBook > settledGuard);
  assert.match(source, /useImageValidation\(turn\.media\.map\(\(item\) => item\.imageUrl\), false\)/);
});

test("the page-flip atlas leaves the final media page readable until the user continues", async () => {
  const source = await readFile(new URL("../app/curiositypedia-experience.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /Keep the gaps worth exploring/);
  assert.doesNotMatch(source, /kind: "run" as const/);
  assert.match(source, /if \(index >= panelCount\) \{\s*setKnowledgeDeclarationOpen\(true\);/);
  assert.match(source, /activePanel === panelCount - 1 \? "Continue to the knowledge questions"/);
  assert.match(source, /knowledgeDeclarationOpen \? setKnowledgeDeclarationOpen\(false\)/);
});

test("retrying a question preserves its lead image on the research loading page", async () => {
  const source = await readFile(new URL("../app/curiositypedia-experience.tsx", import.meta.url), "utf8");
  const retryStart = source.indexOf("async function retryActiveQuestion()");
  const retryEnd = source.indexOf("async function takeOverResearch()", retryStart);
  const retrySource = source.slice(retryStart, retryEnd);

  assert.ok(retryStart >= 0);
  assert.ok(retryEnd > retryStart);
  assert.match(retrySource, /const previewMedia = activeTurn\.media\[0\]/);
  assert.match(retrySource, /preview: previewMedia \? \{/);
  assert.match(retrySource, /imageUrl: previewMedia\.imageUrl/);
  assert.match(retrySource, /sourceUrl: previewMedia\.sourcePageUrl/);
});
