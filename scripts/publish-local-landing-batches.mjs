import crypto from "node:crypto";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const [databasePath, ...batchPaths] = process.argv.slice(2);
if (!databasePath || batchPaths.length === 0) {
  fail("Usage: node scripts/publish-local-landing-batches.mjs <local.sqlite> <batch.json> [...batch.json]");
}

const batches = batchPaths.map((batchPath) => JSON.parse(fs.readFileSync(batchPath, "utf8")));
const cards = batches.flatMap((batch) => batch.recommendations ?? []);
if (cards.length === 0) fail("No recommendation cards were found.");

const database = new DatabaseSync(databasePath);
database.exec("PRAGMA foreign_keys = ON");

const existing = database.prepare("SELECT id, question, image_url FROM landing_recommendations").all();
const ids = new Set(existing.map((item) => item.id));
const questions = new Set(existing.map((item) => normalize(item.question)));
const images = new Set(existing.map((item) => canonicalImage(item.image_url)));

for (const card of cards) {
  if (ids.has(card.id)) fail(`Duplicate recommendation id: ${card.id}`);
  if (questions.has(normalize(card.question))) fail(`Duplicate recommendation question: ${card.question}`);
  if (images.has(canonicalImage(card.imageUrl))) fail(`Duplicate recommendation image: ${card.id}`);
  if (!Array.isArray(card.dimensions) || card.dimensions.length < 1 || card.dimensions.length > 4) {
    fail(`Invalid dimensions for ${card.id}.`);
  }
  ids.add(card.id);
  questions.add(normalize(card.question));
  images.add(canonicalImage(card.imageUrl));
}

const insertBatch = database.prepare(
  "INSERT INTO landing_recommendation_batches (id, title, status, created_at, published_at) VALUES (?, ?, 'published', ?, ?)",
);
const insertCard = database.prepare(
  `INSERT INTO landing_recommendations
    (id, batch_id, position, category, question, teaser, image_url, image_alt,
     source_label, source_url, size, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const insertDimension = database.prepare(
  "INSERT INTO landing_recommendation_dimensions (recommendation_id, dimension, position) VALUES (?, ?, ?)",
);

database.exec("BEGIN IMMEDIATE");
try {
  batches.forEach((batch, batchIndex) => {
    const batchId = crypto.randomUUID();
    const now = Date.now() + batchIndex;
    insertBatch.run(batchId, batch.title, now, now);
    batch.recommendations.forEach((card, position) => {
      insertCard.run(
        card.id,
        batchId,
        position,
        card.category,
        card.question,
        card.teaser,
        card.imageUrl,
        card.imageAlt,
        card.sourceLabel,
        card.sourceUrl,
        card.size,
        now,
      );
      card.dimensions.forEach((dimension, dimensionPosition) => {
        insertDimension.run(card.id, dimension, dimensionPosition);
      });
    });
  });
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
}

const total = database.prepare("SELECT COUNT(*) AS count FROM landing_recommendations").get().count;
const integrity = database.prepare("PRAGMA integrity_check").get().integrity_check;
const foreignKeyErrors = database.prepare("PRAGMA foreign_key_check").all();
if (integrity !== "ok" || foreignKeyErrors.length) {
  fail(`Database verification failed: integrity=${integrity}, foreign-key errors=${foreignKeyErrors.length}.`);
}
console.log(`Published ${cards.length} local cards across ${batches.length} batches. Catalog total: ${total}.`);

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

function normalize(value) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
