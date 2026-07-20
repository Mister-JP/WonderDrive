"use client";

import { useI18n } from "../i18n";

export function EmptyStage({ onOpenJourneys, label = "Open journeys" }: { onOpenJourneys: () => void; label?: string }) {
  const { t } = useI18n();
  return <section className="empty-stage"><span aria-hidden="true">?</span><h1>{t("No saved questions yet")}</h1><p>{t("Start a new question or return to one you have already saved.")}</p><button type="button" onClick={onOpenJourneys}>{t(label)} →</button></section>;
}
