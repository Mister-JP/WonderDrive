"use client";

import { useMemo, useState } from "react";
import {
  type AnswerDensity,
  type BootstrapCatalog,
  type ModelId,
  type TextSize,
  type UserPreferences,
  type Viewer,
} from "../../lib/contracts";
import { SUPPORTED_LOCALES } from "../../lib/i18n";
import {
  collectCivitaiTags,
  fetchCivitaiImages,
  getGalleryConfig,
  saveGalleryDevOverride,
  type CivitaiGalleryConfig,
  type CivitaiImage,
} from "../../lib/civitai-gallery";
import { useI18n } from "../i18n";

function ArtGalleryDevSettings() {
  const { t } = useI18n();
  const [draft, setDraft] = useState<CivitaiGalleryConfig>(getGalleryConfig);
  const [sample, setSample] = useState<CivitaiImage[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [saved, setSaved] = useState(false);
  const tags = useMemo(() => collectCivitaiTags(sample), [sample]);
  const visibleTags = tags.filter((tag) => tag.name.toLowerCase().includes(tagSearch.trim().toLowerCase()));

  async function discoverTags() {
    setLoadingTags(true);
    try {
      setSample(await fetchCivitaiImages({ ...draft, includeTags: [], excludeTags: [] }));
    } finally {
      setLoadingTags(false);
    }
  }

  function cycleTag(name: string) {
    const included = draft.includeTags.includes(name);
    const excluded = draft.excludeTags.includes(name);
    setDraft({
      ...draft,
      includeTags: included ? draft.includeTags.filter((tag) => tag !== name) : excluded ? draft.includeTags : [...draft.includeTags, name],
      excludeTags: excluded ? draft.excludeTags.filter((tag) => tag !== name) : included ? [...draft.excludeTags, name] : draft.excludeTags,
    });
  }

  function saveConfig() {
    saveGalleryDevOverride(draft);
    const source = `${JSON.stringify(draft, null, 2)}\n`;
    const url = URL.createObjectURL(new Blob([source], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "curiositypedia-art.config.json";
    link.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  return (
    <section className="art-dev-settings" aria-labelledby="art-dev-title">
      <header>
        <div>
          <p className="eyebrow"><span /> Development only</p>
          <h2 id="art-dev-title">{t("Art settings")}</h2>
        </div>
        <span className="dev-seal">Not rendered in production</span>
      </header>
      <div className="art-dev-grid">
        <label className="check-setting"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><span>Show gallery window</span></label>
        <label><span>Rotation cadence</span><select value={draft.intervalMs} onChange={(event) => setDraft({ ...draft, intervalMs: Number(event.target.value) })}><option value={5000}>5 seconds</option><option value={8000}>8 seconds</option><option value={10000}>10 seconds</option><option value={12000}>12 seconds</option></select></label>
        <label><span>Ranking</span><select value={draft.sort} onChange={(event) => setDraft({ ...draft, sort: event.target.value as CivitaiGalleryConfig["sort"] })}><option>Most Reactions</option><option>Most Comments</option><option>Most Collected</option><option>Newest</option><option>Random</option></select></label>
        <label><span>Period</span><select value={draft.period} onChange={(event) => setDraft({ ...draft, period: event.target.value as CivitaiGalleryConfig["period"] })}><option>Day</option><option>Week</option><option>Month</option><option>Year</option><option>AllTime</option></select></label>
        <label><span>Candidate pool</span><input type="number" min="20" max="200" value={draft.poolSize} onChange={(event) => setDraft({ ...draft, poolSize: Number(event.target.value) })} /><small>Sampled from a randomized SFW result page; filtering and shuffling happen in the browser.</small></label>
        <label><span>Base models</span><input value={draft.baseModels.join(", ")} onChange={(event) => setDraft({ ...draft, baseModels: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} placeholder="SDXL 1.0, Flux.1 D" /><small>Optional, comma separated.</small></label>
        <label><span>Required tag rule</span><select value={draft.includeMode} onChange={(event) => setDraft({ ...draft, includeMode: event.target.value as "any" | "all" })}><option value="any">Match any selected tag</option><option value="all">Match every selected tag</option></select></label>
      </div>
      <div className="tag-workbench">
        <div className="tag-workbench-tools">
          <div><strong>Tag workbench</strong><small>Click once to require, twice to strictly exclude, three times to clear.</small></div>
          <input type="search" value={tagSearch} onChange={(event) => setTagSearch(event.target.value)} placeholder="Filter discovered tags…" />
          <button type="button" disabled={loadingTags} onClick={() => void discoverTags()}>{loadingTags ? "Scanning…" : "Discover from pool"}</button>
        </div>
        <div className="tag-selection-summary">
          <span><b>{draft.includeTags.length}</b> selected</span>
          <span><b>{draft.excludeTags.length}</b> strict no</span>
          <span><b>{tags.length}</b> discovered</span>
        </div>
        <div className="tag-catalog">
          {visibleTags.length ? visibleTags.map((tag) => {
            const state = draft.includeTags.includes(tag.name) ? "include" : draft.excludeTags.includes(tag.name) ? "exclude" : "";
            return <button type="button" className={state} key={tag.name} onClick={() => cycleTag(tag.name)}><span>{state === "include" ? "+" : state === "exclude" ? "−" : "·"}</span>{tag.name}<small>{tag.count}</small></button>;
          }) : <p>{sample.length ? "No tags match this search." : "Discover a live sample to build the tag catalog."}</p>}
        </div>
      </div>
      <div className="art-dev-actions">
        <p>{saved ? "Preview saved locally and JSON generated." : <>Saving applies a local dev preview and generates <code>curiositypedia-art.config.json</code>. Replace the bundled file before a production build.</>}</p>
        <button type="button" onClick={saveConfig}>Save + generate JSON <i aria-hidden="true">↘</i></button>
      </div>
    </section>
  );
}

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
      {process.env.NODE_ENV !== "production" && <details className="art-dev-disclosure"><summary>{t("Art settings")} <span>{t("Development only")}</span></summary><ArtGalleryDevSettings /></details>}
    </section>
  );
}
