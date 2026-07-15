import { DISCOVERY_STARTERS, PROMPT_VERSION, STARTERS, performerById } from "./catalog";
import type { PersonalizedStarter, PerformerId } from "./contracts";
import { getD1 } from "../db";
import type { ViewerContext } from "./viewer";
import {
  isRecord,
  openAIConfigured,
  outputText,
  requestOpenAI,
  structuredOutput,
} from "./openai";
import { hashPayload } from "./request";
import { recordOpenAIUsage } from "./provider-usage";

const STARTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["starters"],
  properties: {
    starters: {
      type: "array",
      minItems: 20,
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "topic"],
        properties: {
          question: { type: "string", minLength: 9, maxLength: 120 },
          topic: { type: "string", minLength: 1, maxLength: 68 },
        },
      },
    },
  },
} as const;

export async function getPersonalizedStarters(
  viewer: ViewerContext,
  performerId: PerformerId = "sage",
  options: { refresh?: boolean } = {},
): Promise<PersonalizedStarter[]> {
  const topics = await orderedTopicHistory(viewer);
  const historyHash = await hashPayload({ performerId, topics });
  const performer = performerById(performerId);
  if (!options.refresh) {
    const cached = await getD1()
      .prepare(
        `SELECT questions_json
         FROM starter_recommendations
         WHERE identity_id = ? AND history_hash = ? AND expires_at > ? LIMIT 1`,
      )
      .bind(viewer.identityId, historyHash, Date.now())
      .first<{ questions_json: string }>();
    const cachedQuestions = parseStarters(cached?.questions_json);
    if (cachedQuestions) return cachedQuestions;
  }

  if (!openAIConfigured()) return fallbackStarters(performerId);

  const startedAt = Date.now();
  const purpose = options.refresh ? "manual_refresh" : "cache_miss_or_expired";
  let usageRecorded = false;
  try {
    const response = await requestOpenAI({
        model: "gpt-5.6-luna",
        instructions: [
          `WonderDrive prompt ${PROMPT_VERSION}. Create 24 short, playful starting questions for a learner's curiosity ticker.`,
          "First use web search to scan what is unfolding now across science, computing, space, climate, engineering, archaeology, biology, mathematics, infrastructure, and other knowledge-rich domains.",
          "Use current events as trapdoors into durable ideas, not as disposable headlines. Prefer strange abilities, surprising cause-and-effect, tiny mysteries, vivid comparisons, and hidden ways everyday things work.",
          "Use only the ordered topic history supplied below as personalization context. Do not infer private traits, repeat earlier questions, or mention personalization.",
          `Write through the ${performer.name} performer layer: ${performer.cue}`,
          `Voice: ${performer.voiceTraits.join(", ")}. Values: ${performer.values.join(", ")}. Avoid: ${performer.avoids.join(", ")}.`,
          "Mix roughly eight history-adjacent rabbit holes, eight questions sparked by current developments, and eight lateral departures. If there is no history, redistribute those slots across current signals and wildly varied domains.",
          "Every question must be researchable, vivid, meaningfully different, and specific enough to spark a rabbit hole. Use 5–12 words, plain everyday language, one idea at a time, and wording that is fun to say out loud. A curious kid should understand it instantly without the question talking down to them.",
          "Prefer concrete subjects and a surprising hook: 'Can trees warn each other about bugs?', 'Why do astronauts grow taller in space?', or 'Could a mushroom help build a house?' Avoid academic framing, jargon, stacked clauses, vague abstraction, self-help, listicles, celebrity news, and quiz-like recall.",
          "Do not ask directly about breaking tragedy or turn human suffering into entertainment. Label topics with the underlying domain, not a news outlet or headline.",
          "Return structured output only.",
        ].join("\n"),
        input: [
          `Current discovery scan requested at ${new Date().toISOString()}.`,
          topics.length
            ? `Topics this learner has explored, oldest to newest:\n${topics.map((topic, index) => `${index + 1}. ${topic}`).join("\n")}`
            : "This learner has no topic history yet. Offer a broad, varied first set.",
        ].join("\n\n"),
        max_output_tokens: 1_800,
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        max_tool_calls: 2,
        reasoning: { effort: "low" },
        text: structuredOutput("wonderdrive_starters", STARTER_SCHEMA),
        safety_identifier: `wd_starters_${viewer.identityId}`.slice(0, 64),
        store: false,
    });
    if (!response.ok) {
      usageRecorded = true;
      await recordOpenAIUsage({
        identityId: viewer.identityId,
        modelId: "gpt-5.6-luna",
        operation: "starter_generation",
        purpose,
        outcome: "http_error",
        providerRequestId: response.headers.get("x-request-id"),
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: `HTTP_${response.status}`,
        errorMessage: "Starter generation provider request was rejected.",
        metadata: { performerId, forcedRefresh: Boolean(options.refresh) },
      });
      throw new Error(`starter provider status ${response.status}`);
    }
    const payload = await response.json();
    const generated = parseStarters(outputText(payload));
    usageRecorded = true;
    await recordOpenAIUsage({
      identityId: viewer.identityId,
      modelId: "gpt-5.6-luna",
      operation: "starter_generation",
      purpose,
      outcome: generated ? "completed" : "validation_failed",
      response: payload,
      providerRequestId: response.headers.get("x-request-id"),
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      ...(generated ? {} : {
        errorCode: "SCHEMA_INVALID",
        errorMessage: "Starter generation returned an invalid structured response.",
      }),
      metadata: { performerId, forcedRefresh: Boolean(options.refresh) },
    });
    if (!generated) throw new Error("starter output was invalid");
    const now = Date.now();
    await getD1()
      .prepare(
        `INSERT INTO starter_recommendations
          (identity_id, history_hash, questions_json, generated_at, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(identity_id) DO UPDATE SET
           history_hash = excluded.history_hash,
           questions_json = excluded.questions_json,
           generated_at = excluded.generated_at,
           expires_at = excluded.expires_at`,
      )
      .bind(viewer.identityId, historyHash, JSON.stringify(generated), now, now + 86_400_000)
      .run();
    return generated;
  } catch (error) {
    if (!usageRecorded) {
      await recordOpenAIUsage({
        identityId: viewer.identityId,
        modelId: "gpt-5.6-luna",
        operation: "starter_generation",
        purpose,
        outcome: "transport_error",
        latencyMs: Date.now() - startedAt,
        errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
        errorMessage: error instanceof Error ? error.message : "Starter generation was interrupted.",
        metadata: { performerId, forcedRefresh: Boolean(options.refresh) },
      });
    }
    console.error("WonderDrive starter generation failed", error);
    return fallbackStarters(performerId);
  }
}

function fallbackStarters(performerId: PerformerId): PersonalizedStarter[] {
  const performer = performerById(performerId);
  const featured = STARTERS[performerId].map((question) => ({
    question,
    topic: `${performer.name} pick`,
  }));
  const combined = [...featured, ...DISCOVERY_STARTERS];
  return combined.filter(
    (item, index) => combined.findIndex((candidate) => normalize(candidate.question) === normalize(item.question)) === index,
  ).slice(0, 24);
}

async function orderedTopicHistory(viewer: ViewerContext) {
  const result = await getD1()
    .prepare(
      `SELECT t.topic_label
       FROM turns t
       JOIN journeys j ON j.id = t.journey_id
       WHERE j.owner_identity_id = ? AND j.deleted_at IS NULL
         AND t.status = 'ready' AND t.topic_label IS NOT NULL
       ORDER BY t.created_at`,
    )
    .bind(viewer.identityId)
    .all<{ topic_label: string }>();
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const item of result.results) {
    const topic = item.topic_label.trim().replace(/\s+/g, " ");
    if (!topic || seen.has(topic)) continue;
    seen.add(topic);
    topics.push(topic);
  }
  return topics;
}

function parseStarters(value: string | undefined): PersonalizedStarter[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    const items = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.starters)
        ? parsed.starters
        : [];
    const starters = items
      .filter(isRecord)
      .map((item) => ({
        question: text(item.question),
        topic: text(item.topic),
      }))
      .filter((item) => item.question.length >= 10 && item.question.length <= 120 && item.topic.length >= 2);
    const unique = starters.filter(
      (item, index) => starters.findIndex((candidate) => normalize(candidate.question) === normalize(item.question)) === index,
    );
    return unique.length >= 20 && unique.length <= 30 ? unique : null;
  } catch {
    return null;
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
