"use client";

import { useState } from "react";
import {
  type AnswerDensity,
  type BootstrapCatalog,
  type ModelId,
  type TextSize,
  type UserPreferences,
  type Viewer,
} from "../../lib/contracts";
import { SUPPORTED_LOCALES } from "../../lib/i18n";
import { useI18n } from "../i18n";

export function SettingsView({
  viewer,
  savedJourneyCount,
  preferences,
  catalog,
  busy,
  onPreviewTextSize,
  onSave,
}: {
  viewer: Viewer | null;
  savedJourneyCount: number;
  preferences: UserPreferences;
  catalog: BootstrapCatalog;
  busy: boolean;
  onPreviewTextSize: (textSize: TextSize) => void;
  onSave: (next: UserPreferences) => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(preferences);
  const displayName = viewer?.displayName ?? t("Opening journeys…");
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "W";
  const detailPreference = draft.answerDensity === "brief" ? 0 : draft.answerDensity === "balanced" ? 1 : 2;
  const textSizeOptions: Array<{ id: TextSize; label: string }> = [
    { id: "s", label: t("Small") },
    { id: "m", label: t("Medium") },
    { id: "l", label: t("Large") },
    { id: "xl", label: t("Extra large") },
  ];

  const updateDetailPreference = (value: number) => {
    const answerDensity: AnswerDensity = value === 0 ? "brief" : value === 1 ? "balanced" : "rich";
    setDraft({ ...draft, answerDensity });
  };

  return (
    <section className="settings-view" aria-labelledby="settings-title">
      <header className="settings-heading">
        <div>
          <p className="eyebrow"><span /> {t("Your preferences")}</p>
          <h1 id="settings-title">{t("Settings")}</h1>
        </div>
        <p>{t("Tune how CuriosityPedia looks and answers.")}</p>
      </header>
      <div className="settings-layout">
        <aside className="account-card" aria-labelledby="account-title">
          <span className="account-avatar" aria-hidden="true">{initials}</span>
          <div className="account-identity">
            <span id="account-title">{t("Account")}</span>
            <strong>{displayName}</strong>
            <small>{t(viewer?.mode === "chatgpt" ? "ChatGPT account" : "Guest session")}</small>
          </div>
          <dl>
            <div><dt>{t("Saved")}</dt><dd>{savedJourneyCount} / {viewer?.journeyLimit ?? "—"}</dd></div>
            <div><dt>{t("Preferences")}</dt><dd>{t(viewer?.mode === "chatgpt" ? "Synced" : "This device")}</dd></div>
          </dl>
          {viewer?.mode === "chatgpt" ? (
            <a className="account-action danger" href="/signout-with-chatgpt?return_to=%2Fsettings">{t("Sign out")} <span aria-hidden="true">↗</span></a>
          ) : viewer?.mode === "guest" ? (
            <a className="account-action" href="/signin-with-chatgpt?return_to=%2Fsettings">{t("Sign in")} <span aria-hidden="true">↗</span></a>
          ) : null}
        </aside>

        <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}>
          <div className="settings-select-row">
            <label className="language-setting"><span>{t("Experience language")}</span><select value={draft.interfaceLocale} onChange={(event) => { const interfaceLocale = event.target.value as UserPreferences["interfaceLocale"]; const next = { ...draft, interfaceLocale, defaultOutputLocale: interfaceLocale }; setDraft(next); void onSave(next); }}>{SUPPORTED_LOCALES.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
            <label className="model-setting"><span>{t("Research model")}</span><select value={draft.defaultModelId} onChange={(event) => setDraft({ ...draft, defaultModelId: event.target.value as ModelId })}>{catalog.models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.speedBand}</option>)}</select></label>
          </div>
          <section className="preference-panel" aria-labelledby="answer-style-title" aria-describedby="preference-help">
            <header className="settings-section-heading">
              <h2 id="answer-style-title">{t("Answer style")}</h2>
              <p id="preference-help">{t("These choices change presentation, never research quality.")}</p>
            </header>
            <div className="preference-scales">
              <label className="preference-scale">
                <span>{t("Answer detail")}</span>
                <output>{t(detailPreference === 0 ? "Quick read" : detailPreference === 1 ? "Just right" : "Deep dive")}</output>
                <input type="range" min="0" max="2" step="1" value={detailPreference} onChange={(event) => updateDetailPreference(Number(event.target.value))} aria-label={t("Preference for answer detail")} />
                <div aria-hidden="true"><span>{t("Quick read")}</span><span>{t("Balanced")}</span><span>{t("Deep dive")}</span></div>
              </label>
            </div>
          </section>
          <section className="comfort-panel" aria-labelledby="comfort-title">
            <header className="settings-section-heading">
              <h2 id="comfort-title">{t("Comfort")}</h2>
              <p>{t("Make the stage comfortable.")}</p>
            </header>
            <div className="text-size-setting">
              <span>{t("Text size")}</span>
              <div className="text-size-options" role="group" aria-label={t("Text size")}>
                {textSizeOptions.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={draft.textSize === option.id ? "selected" : ""}
                    aria-pressed={draft.textSize === option.id}
                    onClick={() => {
                      setDraft({ ...draft, textSize: option.id });
                      onPreviewTextSize(option.id);
                    }}
                  >
                    <strong>{option.label}</strong>
                    <span className={`text-size-sample size-${option.id}`}>{t("Ask anything…")}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="check-setting"><input type="checkbox" checked={draft.reduceMotion} onChange={(event) => setDraft({ ...draft, reduceMotion: event.target.checked })} /><span>{t("Reduce interface motion")}</span></label>
          </section>
          <div className="settings-actions">
            <small>{t(viewer?.mode === "chatgpt" ? "Synced to your ChatGPT identity" : "Saved to this guest session")}</small>
            <button className="launch-button" type="submit" disabled={busy}>{t(busy ? "Saving…" : "Save preferences")}<i aria-hidden="true">↘</i></button>
          </div>
        </form>
      </div>
    </section>
  );
}
