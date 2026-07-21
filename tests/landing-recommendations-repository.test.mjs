import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import {
  getLandingRecommendationPage,
  publishLandingRecommendationBatch,
} from "../lib/landing-recommendations-repository.ts";

function memoryD1(seed = {}) {
  const batches = [...(seed.batches ?? [])];
  const recommendations = [...(seed.recommendations ?? [])];

  function prepare(sql) {
    let values = [];
    return {
      bind(...input) {
        values = input;
        return this;
      },
      async first() {
        if (sql.includes("COUNT(*) AS count")) {
          const publishedIds = new Set(batches.filter((batch) => batch.status === "published").map((batch) => batch.id));
          const category = sql.includes("r.category = ?") ? values[0] : null;
          return {
            count: recommendations.filter((item) => publishedIds.has(item.batch_id)
              && (!category || item.category === category)).length,
          };
        }
        return null;
      },
      async all() {
        if (!sql.includes("FROM landing_recommendations")) return { results: [] };
        const publishedBatches = new Map(
          batches.filter((batch) => batch.status === "published").map((batch) => [batch.id, batch]),
        );
        const category = sql.includes("r.category = ?") ? values[0] : null;
        const [limit, offset] = category ? values.slice(1) : values;
        return {
          results: recommendations
            .filter((item) => publishedBatches.has(item.batch_id)
              && (!category || item.category === category))
            .sort((left, right) => {
              const leftBatch = publishedBatches.get(left.batch_id);
              const rightBatch = publishedBatches.get(right.batch_id);
              return rightBatch.published_at - leftBatch.published_at
                || rightBatch.created_at - leftBatch.created_at
                || rightBatch.id.localeCompare(leftBatch.id)
                || left.position - right.position;
            })
            .slice(offset, offset + limit)
            .map((item) => ({
              ...item,
              batch_title: publishedBatches.get(item.batch_id).title,
              published_at: publishedBatches.get(item.batch_id).published_at,
            })),
        };
      },
      async run() {
        if (sql.includes("INSERT INTO landing_recommendation_batches")) {
          batches.push({ id: values[0], title: values[1], status: "published", created_at: values[2], published_at: values[3] });
        } else if (sql.includes("INSERT INTO landing_recommendations")) {
          recommendations.push({
            id: values[0], batch_id: values[1], position: values[2], category: values[3],
            question: values[4], teaser: values[5], image_url: values[6], image_alt: values[7],
            source_label: values[8], source_url: values[9], size: values[10], created_at: values[11],
          });
        }
        return { success: true };
      },
    };
  }

  return {
    prepare,
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
}

function row(id, batchId, position) {
  return {
    id,
    batch_id: batchId,
    position,
    category: "Science",
    question: `Question ${id}?`,
    teaser: `Teaser ${id}`,
    image_url: `https://example.com/${id}.jpg`,
    image_alt: `Image ${id}`,
    source_label: "Example",
    source_url: `https://example.com/${id}`,
    size: "standard",
    created_at: position,
  };
}

test("published recommendations are paginated 20 at a time newest first", async () => {
  env.DB = memoryD1({
    batches: [
      { id: "older", title: "Older", status: "published", created_at: 100, published_at: 100 },
      { id: "newer", title: "Newer", status: "published", created_at: 200, published_at: 200 },
      { id: "draft", title: "Draft", status: "draft", created_at: 300, published_at: null },
    ],
    recommendations: [
      ...Array.from({ length: 25 }, (_, index) => row(`old-${index}`, "older", index)),
      ...Array.from({ length: 10 }, (_, index) => row(`new-${index}`, "newer", index)),
    ],
  });

  const first = await getLandingRecommendationPage(1);
  const second = await getLandingRecommendationPage(2);
  assert.equal(first.batchId, "newer");
  assert.equal(first.pageSize, 20);
  assert.equal(first.totalItems, 35);
  assert.equal(first.totalPages, 2);
  assert.deepEqual(first.items.slice(0, 10).map((item) => item.id), Array.from({ length: 10 }, (_, index) => `new-${index}`));
  assert.equal(first.items.length, 20);
  assert.equal(second.batchId, "older");
  assert.equal(second.items.length, 15);
  assert.deepEqual(second.items.map((item) => item.id), Array.from({ length: 15 }, (_, index) => `old-${index + 10}`));
});

test("category pages query the full published catalog before pagination", async () => {
  const scienceRows = Array.from({ length: 22 }, (_, index) => row(`science-${index}`, "published", index));
  const historyRows = Array.from({ length: 7 }, (_, index) => ({
    ...row(`history-${index}`, "published", index + scienceRows.length),
    category: "History",
  }));
  env.DB = memoryD1({
    batches: [{ id: "published", title: "Published", status: "published", created_at: 100, published_at: 100 }],
    recommendations: [...scienceRows, ...historyRows],
  });

  const history = await getLandingRecommendationPage(1, "History");
  assert.equal(history.totalItems, 7);
  assert.equal(history.totalPages, 1);
  assert.deepEqual(history.items.map((item) => item.id), Array.from({ length: 7 }, (_, index) => `history-${index}`));

  const scienceSecondPage = await getLandingRecommendationPage(2, "Science");
  assert.equal(scienceSecondPage.totalItems, 22);
  assert.equal(scienceSecondPage.totalPages, 2);
  assert.deepEqual(scienceSecondPage.items.map((item) => item.id), ["science-20", "science-21"]);
});

test("unsupported recommendation categories are rejected", async () => {
  env.DB = memoryD1();
  await assert.rejects(
    () => getLandingRecommendationPage(1, "Unknown"),
    (error) => error?.code === "BAD_REQUEST" && error?.status === 400,
  );
});

test("owner publishing prepends cards and shifts older cards across pages", async () => {
  env.DB = memoryD1({
    batches: [{ id: "older", title: "Older", status: "published", created_at: 100, published_at: 100 }],
    recommendations: Array.from({ length: 20 }, (_, index) => row(`old-${index}`, "older", index)),
  });

  const published = await publishLandingRecommendationBatch({
    title: "New editorial run",
    recommendations: [{
      category: "Nature",
      question: "How does an octopus change its appearance?",
      teaser: "Several layers of specialized skin work together.",
      imageUrl: "https://example.com/octopus.jpg",
      imageAlt: "An octopus changing color",
      sourceLabel: "Example museum",
      sourceUrl: "https://example.com/octopus",
      size: "wide",
    }],
  });

  assert.equal(published.page, 1);
  assert.equal(published.totalPages, 2);
  assert.equal(published.items[0].question, "How does an octopus change its appearance?");
  assert.equal(published.items[1].id, "old-0");
  const older = await getLandingRecommendationPage(2);
  assert.equal(older.batchId, "older");
  assert.deepEqual(older.items.map((item) => item.id), ["old-19"]);
});
