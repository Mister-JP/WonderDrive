import fs from "node:fs/promises";

const CATEGORIES = new Set(["Nature", "Science", "History", "Culture", "Systems", "Space", "Technology", "Art"]);
const DIMENSIONS = new Set([
  "Living World",
  "Planet Earth",
  "Cosmos",
  "Matter",
  "Forces & Energy",
  "Numbers & Logic",
  "Body",
  "Mind",
  "Time & History",
  "Society",
  "Language",
  "Belief & Ideas",
  "Art & Expression",
  "Design & Technology",
  "Food & Agriculture",
]);
const SIZES = new Set(["wide", "tall", "standard", "compact"]);

const [batchPath, ...flags] = process.argv.slice(2);
const baseUrl = valueAfter(flags, "--base-url") ?? "http://localhost:3000";
const dryRun = flags.includes("--dry-run");

if (!batchPath) fail("Usage: npm run landing:replenish -- <batch.json> [--base-url URL] [--dry-run]");

const batch = JSON.parse(await fs.readFile(batchPath, "utf8"));
validateBatch(batch);

const existing = await readExistingCatalog(baseUrl);
const existingIds = new Set(existing.map((item) => item.id));
const existingQuestions = new Set(existing.map((item) => normalize(item.question)));
const existingImages = new Set(existing.map((item) => canonicalImage(item.imageUrl)));
const duplicateIds = batch.recommendations.filter((item) => existingIds.has(item.id)).map((item) => item.id);
const duplicateQuestions = batch.recommendations
  .filter((item) => existingQuestions.has(normalize(item.question)))
  .map((item) => item.question);
const duplicateImages = batch.recommendations
  .filter((item) => existingImages.has(canonicalImage(item.imageUrl)))
  .map((item) => item.id);
if (duplicateIds.length || duplicateQuestions.length || duplicateImages.length) {
  fail(`Batch overlaps the published catalog. Duplicate ids: ${duplicateIds.join(", ") || "none"}. Duplicate questions: ${duplicateQuestions.join(" | ") || "none"}. Duplicate images: ${duplicateImages.join(", ") || "none"}.`);
}

const assetChecks = await Promise.all(batch.recommendations.map(checkImage));
const brokenAssets = assetChecks.filter((result) => !result.ok);
const assetWarnings = assetChecks.filter((result) => result.warning);
if (brokenAssets.length) {
  fail(`Image validation failed:\n${brokenAssets.map((item) => `- ${item.id}: ${item.message}`).join("\n")}`);
}
if (assetWarnings.length) {
  console.warn(`Image validation warnings:\n${assetWarnings.map((item) => `- ${item.id}: ${item.message}`).join("\n")}`);
}

console.log(`Validated ${batch.recommendations.length} new cards against ${existing.length} published cards.`);
if (dryRun) {
  console.log("Dry run complete; the database was not changed.");
  process.exit(0);
}

const editorKey = process.env.EDITOR_API_KEY?.trim();
if (!editorKey) fail("EDITOR_API_KEY must be set to publish a batch.");
const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/landing-recommendations`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${editorKey}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(batch),
});
const payload = await response.json().catch(() => null);
if (!response.ok) fail(`Publish failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
const page = payload?.data ?? payload;
console.log(`Published ${batch.recommendations.length} cards. Catalog now reports ${page.totalItems} cards across ${page.totalPages} pages.`);

async function readExistingCatalog(origin) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await fetch(`${origin.replace(/\/$/, "")}/api/landing-recommendations?page=${page}`);
    if (!response.ok) fail(`Could not read existing catalog page ${page} (HTTP ${response.status}).`);
    const payload = await response.json();
    const result = payload.data ?? payload;
    items.push(...result.items);
    totalPages = result.totalPages;
    page += 1;
  } while (page <= totalPages);
  return items;
}

async function checkImage(item) {
  try {
    const response = await fetch(item.imageUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: { "user-agent": "CuriosityPediaEditorial/1.0" },
    });
    const type = response.headers.get("content-type") ?? "";
    if (response.status === 403 || response.status === 429) {
      return { id: item.id, ok: true, warning: true, message: `host declined automated validation with HTTP ${response.status}; inspect manually` };
    }
    if (!response.ok) return { id: item.id, ok: false, warning: false, message: `HTTP ${response.status}` };
    if (!type.startsWith("image/")) return { id: item.id, ok: false, message: `expected image content, received ${type || "no content type"}` };
    return { id: item.id, ok: true, warning: false };
  } catch (error) {
    return { id: item.id, ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function validateBatch(input) {
  if (!input || typeof input !== "object" || typeof input.title !== "string" || !input.title.trim()) fail("Batch title is required.");
  if (!Array.isArray(input.recommendations) || input.recommendations.length < 1 || input.recommendations.length > 100) {
    fail("Batch must contain between 1 and 100 recommendations.");
  }
  const ids = new Set();
  const questions = new Set();
  const images = new Set();
  for (const [index, item] of input.recommendations.entries()) {
    const label = `Card ${index + 1}`;
    for (const field of ["id", "category", "question", "teaser", "imageUrl", "imageAlt", "sourceLabel", "sourceUrl", "size"]) {
      if (typeof item?.[field] !== "string" || !item[field].trim()) fail(`${label} is missing ${field}.`);
    }
    if (!CATEGORIES.has(item.category)) fail(`${label} has unsupported category ${item.category}.`);
    if (item.dimensions !== undefined) {
      if (!Array.isArray(item.dimensions) || item.dimensions.length < 1 || item.dimensions.length > 4) {
        fail(`${label} must have between 1 and 4 dimensions.`);
      }
      if (new Set(item.dimensions).size !== item.dimensions.length) fail(`${label} repeats a dimension.`);
      const unsupported = item.dimensions.filter((dimension) => !DIMENSIONS.has(dimension));
      if (unsupported.length) fail(`${label} has unsupported dimensions: ${unsupported.join(", ")}.`);
    }
    if (!SIZES.has(item.size)) fail(`${label} has unsupported size ${item.size}.`);
    for (const field of ["imageUrl", "sourceUrl"]) {
      const url = new URL(item[field]);
      if (url.protocol !== "https:" && url.protocol !== "http:") fail(`${label} ${field} must use HTTP or HTTPS.`);
    }
    if (ids.has(item.id)) fail(`${label} repeats id ${item.id}.`);
    if (questions.has(normalize(item.question))) fail(`${label} repeats a question within the batch.`);
    if (images.has(canonicalImage(item.imageUrl))) fail(`${label} repeats an image within the batch.`);
    ids.add(item.id);
    questions.add(normalize(item.question));
    images.add(canonicalImage(item.imageUrl));
  }
}

function normalize(value) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function canonicalImage(value) {
  try {
    const url = new URL(value);
    const decoded = decodeURIComponent(url.pathname).replace("/thumb/", "/");
    const pathWithoutThumbnail = decoded.replace(/\/\d+px-[^/]+$/, "");
    if (url.hostname.endsWith("wikimedia.org")) {
      return pathWithoutThumbnail.split("/").at(-1).toLocaleLowerCase().replaceAll("_", " ");
    }
    return `${url.hostname}${pathWithoutThumbnail}`.toLocaleLowerCase();
  } catch {
    return normalize(value);
  }
}

function valueAfter(values, flag) {
  const index = values.indexOf(flag);
  return index >= 0 ? values[index + 1] : undefined;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
