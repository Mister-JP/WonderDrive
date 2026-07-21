import { getD1 } from "../db";
import {
  LANDING_RECOMMENDATION_DIMENSIONS,
  LANDING_RECOMMENDATION_CATEGORIES,
  type LandingRecommendation,
  type LandingRecommendationCategory,
  type LandingRecommendationDimension,
  type LandingRecommendationPage,
  type LandingRecommendationSize,
} from "./contracts";
import { RepositoryError } from "./errors";

const SIZES = new Set<LandingRecommendationSize>(["wide", "tall", "standard", "compact"]);
const CATEGORIES = new Set<string>(LANDING_RECOMMENDATION_CATEGORIES);
const DIMENSIONS = new Set<string>(LANDING_RECOMMENDATION_DIMENSIONS);
const MAX_BATCH_SIZE = 100;
const MAX_DIMENSIONS_PER_CARD = 4;
const LANDING_RECOMMENDATION_PAGE_SIZE = 20;

const LEGACY_CATEGORY_DIMENSION: Record<LandingRecommendationCategory, LandingRecommendationDimension> = {
  Nature: "Living World",
  Science: "Forces & Energy",
  History: "Time & History",
  Culture: "Society",
  Systems: "Design & Technology",
  Space: "Cosmos",
  Technology: "Design & Technology",
  Art: "Art & Expression",
};

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
  dimensions_json: string;
  batch_id: string;
  batch_title: string;
  published_at: number;
};

export type PublishLandingBatchInput = {
  title: string;
  recommendations: Array<
    Omit<LandingRecommendation, "id" | "dimensions"> & {
      id?: string;
      dimensions?: LandingRecommendationDimension[];
    }
  >;
};

export async function getLandingRecommendationPage(
  requestedPage = 1,
  requestedDimension?: string | null,
): Promise<LandingRecommendationPage> {
  const dimension = requestedDimension?.trim() || null;
  if (dimension && !DIMENSIONS.has(dimension)) {
    throw new RepositoryError("BAD_REQUEST", "The requested recommendation dimension is not supported.", 400);
  }
  const db = getD1();
  const dimensionClause = dimension
    ? ` AND EXISTS (
         SELECT 1 FROM landing_recommendation_dimensions d
         WHERE d.recommendation_id = r.id AND d.dimension = ?
       )`
    : "";
  const countStatement = db.prepare(
    `SELECT COUNT(*) AS count
     FROM landing_recommendations r
     JOIN landing_recommendation_batches b ON b.id = r.batch_id
     WHERE b.status = 'published'${dimensionClause}`,
  );
  const countRow = await countStatement
    .bind(...(dimension ? [dimension] : []))
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
            r.source_label, r.source_url, r.size,
            COALESCE((
              SELECT json_group_array(ordered.dimension)
              FROM (
                SELECT d.dimension
                FROM landing_recommendation_dimensions d
                WHERE d.recommendation_id = r.id
                ORDER BY d.position, d.dimension
              ) ordered
            ), '[]') AS dimensions_json,
            b.id AS batch_id,
            b.title AS batch_title, b.published_at
     FROM landing_recommendations r
     JOIN landing_recommendation_batches b ON b.id = r.batch_id
     WHERE b.status = 'published'${dimensionClause}
     ORDER BY b.published_at DESC, b.created_at DESC, b.id DESC,
              r.position, r.created_at, r.id
     LIMIT ? OFFSET ?`,
  );
  const result = await resultStatement
    .bind(...(dimension ? [dimension] : []), LANDING_RECOMMENDATION_PAGE_SIZE, (page - 1) * LANDING_RECOMMENDATION_PAGE_SIZE)
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
    ...cards.flatMap((card, index) => [
      db.prepare(
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
      ),
      ...card.dimensions.map((dimension, dimensionIndex) => db.prepare(
        `INSERT INTO landing_recommendation_dimensions
          (recommendation_id, dimension, position)
         VALUES (?, ?, ?)`,
      ).bind(card.id, dimension, dimensionIndex)),
    ]),
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
    dimensions: validateDimensions(input.dimensions, category as LandingRecommendationCategory, index),
    question: requiredText(input.question, `Card ${index + 1} question`, 500),
    teaser: requiredText(input.teaser, `Card ${index + 1} teaser`, 1_000),
    imageUrl: publicHttpUrl(input.imageUrl, `Card ${index + 1} image URL`),
    imageAlt: requiredText(input.imageAlt, `Card ${index + 1} image alt text`, 500),
    sourceLabel: requiredText(input.sourceLabel, `Card ${index + 1} source label`, 200),
    sourceUrl: publicHttpUrl(input.sourceUrl, `Card ${index + 1} source URL`),
    size,
  };
}

function validateDimensions(
  input: LandingRecommendationDimension[] | undefined,
  category: LandingRecommendationCategory,
  index: number,
): LandingRecommendationDimension[] {
  if (input === undefined) return [LEGACY_CATEGORY_DIMENSION[category]];
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_DIMENSIONS_PER_CARD) {
    throw new RepositoryError(
      "BAD_REQUEST",
      `Card ${index + 1} must have between 1 and ${MAX_DIMENSIONS_PER_CARD} dimensions.`,
      400,
    );
  }
  const dimensions = input.map((value) => requiredText(value, `Card ${index + 1} dimension`, 80));
  if (dimensions.some((value) => !DIMENSIONS.has(value))) {
    throw new RepositoryError("BAD_REQUEST", `Card ${index + 1} has an unsupported dimension.`, 400);
  }
  if (new Set(dimensions).size !== dimensions.length) {
    throw new RepositoryError("BAD_REQUEST", `Card ${index + 1} repeats a dimension.`, 400);
  }
  return dimensions as LandingRecommendationDimension[];
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
  const category = row.category as LandingRecommendationCategory;
  return {
    id: row.id,
    category,
    dimensions: parseDimensions(row.dimensions_json, category),
    question: row.question,
    teaser: row.teaser,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    size: row.size as LandingRecommendationSize,
  };
}

function parseDimensions(
  value: string,
  category: LandingRecommendationCategory,
): LandingRecommendationDimension[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const dimensions = parsed.filter(
        (item): item is LandingRecommendationDimension => typeof item === "string" && DIMENSIONS.has(item),
      );
      if (dimensions.length) return [...new Set(dimensions)];
    }
  } catch {
    // Deployed legacy rows fall through to their stable compatibility lens.
  }
  return [LEGACY_CATEGORY_DIMENSION[category]];
}
