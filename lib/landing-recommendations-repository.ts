import { getD1 } from "../db";
import {
  LANDING_RECOMMENDATION_CATEGORIES,
  type LandingRecommendation,
  type LandingRecommendationCategory,
  type LandingRecommendationPage,
  type LandingRecommendationSize,
} from "./contracts";
import { RepositoryError } from "./errors";

const SIZES = new Set<LandingRecommendationSize>(["wide", "tall", "standard", "compact"]);
const CATEGORIES = new Set<string>(LANDING_RECOMMENDATION_CATEGORIES);
const MAX_BATCH_SIZE = 100;
const LANDING_RECOMMENDATION_PAGE_SIZE = 20;

type RecommendationRow = {
  id: string;
  category: string;
  question: string;
  teaser: string;
  image_url: string;
  image_alt: string;
  source_label: string;
  source_url: string;
  size: string;
  batch_id: string;
  batch_title: string;
  published_at: number;
};

export type PublishLandingBatchInput = {
  title: string;
  recommendations: Array<Omit<LandingRecommendation, "id"> & { id?: string }>;
};

export async function getLandingRecommendationPage(
  requestedPage = 1,
  requestedCategory?: string | null,
): Promise<LandingRecommendationPage> {
  const category = requestedCategory?.trim() || null;
  if (category && !CATEGORIES.has(category)) {
    throw new RepositoryError("BAD_REQUEST", "The requested recommendation category is not supported.", 400);
  }
  const db = getD1();
  const categoryClause = category ? " AND r.category = ?" : "";
  const countStatement = db.prepare(
    `SELECT COUNT(*) AS count
     FROM landing_recommendations r
     JOIN landing_recommendation_batches b ON b.id = r.batch_id
     WHERE b.status = 'published'${categoryClause}`,
  );
  const countRow = await countStatement
    .bind(...(category ? [category] : []))
    .first<{ count: number }>();
  const totalItems = Number(countRow?.count ?? 0);
  const totalPages = Math.ceil(totalItems / LANDING_RECOMMENDATION_PAGE_SIZE);
  if (totalPages === 0) {
    return {
      batchId: null,
      batchTitle: null,
      publishedAt: null,
      page: 1,
      pageSize: LANDING_RECOMMENDATION_PAGE_SIZE,
      totalItems: 0,
      totalPages: 0,
      items: [],
    };
  }

  const page = Math.min(Math.max(Math.trunc(requestedPage) || 1, 1), totalPages);
  const resultStatement = db.prepare(
    `SELECT r.id, r.category, r.question, r.teaser, r.image_url, r.image_alt,
            r.source_label, r.source_url, r.size, b.id AS batch_id,
            b.title AS batch_title, b.published_at
     FROM landing_recommendations r
     JOIN landing_recommendation_batches b ON b.id = r.batch_id
     WHERE b.status = 'published'${categoryClause}
     ORDER BY b.published_at DESC, b.created_at DESC, b.id DESC,
              r.position, r.created_at, r.id
     LIMIT ? OFFSET ?`,
  );
  const result = await resultStatement
    .bind(...(category ? [category] : []), LANDING_RECOMMENDATION_PAGE_SIZE, (page - 1) * LANDING_RECOMMENDATION_PAGE_SIZE)
    .all<RecommendationRow>();
  const firstItem = result.results[0];

  return {
    batchId: firstItem?.batch_id ?? null,
    batchTitle: firstItem?.batch_title ?? null,
    publishedAt: firstItem?.published_at ?? null,
    page,
    pageSize: LANDING_RECOMMENDATION_PAGE_SIZE,
    totalItems,
    totalPages,
    items: result.results.map(mapRecommendation),
  };
}

export async function publishLandingRecommendationBatch(
  input: PublishLandingBatchInput,
): Promise<LandingRecommendationPage> {
  if (!input || typeof input !== "object") {
    throw new RepositoryError("BAD_REQUEST", "The request must contain a recommendation batch.", 400);
  }
  const title = requiredText(input.title, "Batch title", 160);
  if (!Array.isArray(input.recommendations) || input.recommendations.length === 0) {
    throw new RepositoryError("BAD_REQUEST", "A recommendation batch must contain at least one card.", 400);
  }
  if (input.recommendations.length > MAX_BATCH_SIZE) {
    throw new RepositoryError("BAD_REQUEST", `A recommendation batch may contain at most ${MAX_BATCH_SIZE} cards.`, 400);
  }

  const batchId = crypto.randomUUID();
  const now = Date.now();
  const cards = input.recommendations.map((item, index) => validateRecommendation(item, index));
  if (new Set(cards.map((card) => card.id)).size !== cards.length) {
    throw new RepositoryError("BAD_REQUEST", "Card ids must be unique within a recommendation batch.", 400);
  }
  const db = getD1();
  await db.batch([
    db.prepare(
      `INSERT INTO landing_recommendation_batches (id, title, status, created_at, published_at)
       VALUES (?, ?, 'published', ?, ?)`,
    ).bind(batchId, title, now, now),
    ...cards.map((card, index) => db.prepare(
      `INSERT INTO landing_recommendations
        (id, batch_id, position, category, question, teaser, image_url, image_alt,
         source_label, source_url, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      card.id,
      batchId,
      index,
      card.category,
      card.question,
      card.teaser,
      card.imageUrl,
      card.imageAlt,
      card.sourceLabel,
      card.sourceUrl,
      card.size,
      now,
    )),
  ]);
  return getLandingRecommendationPage(1);
}

function validateRecommendation(
  input: PublishLandingBatchInput["recommendations"][number],
  index: number,
): LandingRecommendation {
  const category = requiredText(input.category, `Card ${index + 1} category`, 40);
  if (!CATEGORIES.has(category)) {
    throw new RepositoryError("BAD_REQUEST", `Card ${index + 1} has an unsupported category.`, 400);
  }
  const size = input.size ?? "standard";
  if (!SIZES.has(size)) {
    throw new RepositoryError("BAD_REQUEST", `Card ${index + 1} has an unsupported size.`, 400);
  }
  return {
    id: requiredText(input.id ?? crypto.randomUUID(), `Card ${index + 1} id`, 100),
    category: category as LandingRecommendationCategory,
    question: requiredText(input.question, `Card ${index + 1} question`, 500),
    teaser: requiredText(input.teaser, `Card ${index + 1} teaser`, 1_000),
    imageUrl: publicHttpUrl(input.imageUrl, `Card ${index + 1} image URL`),
    imageAlt: requiredText(input.imageAlt, `Card ${index + 1} image alt text`, 500),
    sourceLabel: requiredText(input.sourceLabel, `Card ${index + 1} source label`, 200),
    sourceUrl: publicHttpUrl(input.sourceUrl, `Card ${index + 1} source URL`),
    size,
  };
}

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new RepositoryError("BAD_REQUEST", `${label} is required and must be at most ${maxLength} characters.`, 400);
  }
  return value.trim();
}

function publicHttpUrl(value: unknown, label: string) {
  const text = requiredText(value, label, 2_000);
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
    return url.toString();
  } catch {
    throw new RepositoryError("BAD_REQUEST", `${label} must be a valid public HTTP URL.`, 400);
  }
}

function mapRecommendation(row: RecommendationRow): LandingRecommendation {
  return {
    id: row.id,
    category: row.category as LandingRecommendationCategory,
    question: row.question,
    teaser: row.teaser,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    size: row.size as LandingRecommendationSize,
  };
}
