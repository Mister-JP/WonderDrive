import type { TurnMedia } from "./contracts";

export function standaloneKnowledgeQuestion(question: string) {
  const cleaned = question.trim()
    .replace(/\baccording to (?:the )?encyclopedia(?:'s)? answer,?\s*/gi, "")
    .replace(/\baccording to (?:the )?encyclopedia,?\s*/gi, "")
    .trim();
  return cleaned ? `${cleaned.charAt(0).toLocaleUpperCase()}${cleaned.slice(1)}` : question.trim();
}

function legacyCuriosityQuestion(item: TurnMedia, topicLabel: string) {
  const subject = (item.title?.trim() || item.caption.trim())
    .replace(/[.!?]+$/, "")
    .replace(/^the\s+/i, "the ");

  switch (item.role) {
    case "mechanism":
    case "process":
      return `How does ${subject} work?`;
    case "scale":
      return `How big is ${subject}?`;
    case "comparison":
      return `Why is ${subject} different?`;
    default:
      return `What is happening in ${subject || topicLabel}?`;
  }
}

const QUIZ_LIKE_QUESTION = /\b(?:which (?:option|choice|description|explanation)|best (?:matches|explains|describes)|according to|what does (?:this|the) (?:image|panel)|shown by (?:this|the) panel|do you understand)\b/i;

/** One canonical image question shared by the projector, answers, results, and map. */
export function canonicalImageQuestion(item: TurnMedia, topicLabel: string) {
  const legacyCuriosity = standaloneKnowledgeQuestion(item.curiosityQuestion ?? "");
  if (legacyCuriosity) return legacyCuriosity;
  const storedQuestion = standaloneKnowledgeQuestion(item.knowledgeCheck?.question ?? "");
  if (storedQuestion && !QUIZ_LIKE_QUESTION.test(storedQuestion)) return storedQuestion;
  return legacyCuriosityQuestion(item, topicLabel);
}

/** The single ordered image set used by every question surface. One image means one question. */
export function questionBearingMedia(media: TurnMedia[], topicLabel = "") {
  return media.filter((item) => item.knowledgeCheck && canonicalImageQuestion(item, topicLabel));
}
