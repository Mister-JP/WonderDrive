"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BookmarkSimple, MagnifyingGlass, X } from "@phosphor-icons/react";
import { PERFORMERS } from "../../lib/catalog";
import type { Bookmark, PerformerId } from "../../lib/contracts";
import { useI18n } from "../i18n";

export function BookmarksView({
  bookmarks,
  onOpen,
  onRemove,
  onNew,
}: {
  bookmarks: Bookmark[];
  onOpen: (journeyId: string, turnId: string) => void;
  onRemove: (turnId: string) => void;
  onNew: () => void;
}) {
  const { locale } = useI18n();
  const [query, setQuery] = useState("");
  const [performer, setPerformer] = useState<PerformerId | "all">("all");
  const [sort, setSort] = useState<"recent" | "oldest" | "title">("recent");

  const items = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return bookmarks
      .filter((item) => performer === "all" || item.performerId === performer)
      .filter((item) => !normalizedQuery || (
        `${item.question} ${item.topicLabel} ${item.journeyTitle} ${item.journeySeed}`
          .toLowerCase()
          .includes(normalizedQuery)
      ))
      .sort((left, right) => sort === "title"
        ? left.question.localeCompare(right.question)
        : sort === "oldest"
          ? left.bookmarkedAt - right.bookmarkedAt
          : right.bookmarkedAt - left.bookmarkedAt);
  }, [bookmarks, performer, query, sort]);

  const grouped = items.reduce<Array<{ label: string; items: Bookmark[] }>>((groups, item) => {
    const label = timelineLabel(item.bookmarkedAt);
    const group = groups.find((entry) => entry.label === label);
    if (group) group.items.push(item);
    else groups.push({ label, items: [item] });
    return groups;
  }, []);
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <section className="bookmarks-view" aria-labelledby="bookmarks-title">
      <header className="bookmarks-header">
        <div>
          <p className="eyebrow"><span /> Saved for later</p>
          <h1 id="bookmarks-title">Your bookmarks</h1>
          <p>The exact topics and questions you saved, ready to reopen at the same turn.</p>
        </div>
        <div className="bookmark-summary" aria-label="Bookmark summary">
          <span><strong>{bookmarks.length}</strong> {bookmarks.length === 1 ? "question" : "questions"}</span>
          <button type="button" onClick={onNew}>Explore something new <ArrowRight aria-hidden="true" /></button>
        </div>
      </header>

      <div className="bookmark-workspace">
        <aside className="bookmark-collections" aria-label="Collections">
          <p>Collection</p>
          <button type="button" className="active"><span>Saved questions</span><b>{bookmarks.length}</b></button>
          <div className="bookmark-care-note"><BookmarkSimple weight="fill" aria-hidden="true" /><p><strong>A small tip</strong>Save any answer from its question page. It will wait here with the path that led to it.</p></div>
        </aside>

        <div className="bookmark-library">
          <div className="bookmark-tools" aria-label="Find and organize bookmarks">
            <label className="bookmark-search"><MagnifyingGlass aria-hidden="true" /><span className="sr-only">Search bookmarks</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search saved questions or topics" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X aria-hidden="true" /></button>}</label>
            <label><span>Performer</span><select value={performer} onChange={(event) => setPerformer(event.target.value as PerformerId | "all")}><option value="all">All performers</option>{PERFORMERS.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="recent">Recently saved</option><option value="oldest">Oldest first</option><option value="title">A–Z</option></select></label>
          </div>

          <div className="bookmark-result-line"><span>{items.length} {items.length === 1 ? "item" : "items"}</span><span>Organized by when you saved them</span></div>
          {items.length ? grouped.map((group) => (
            <section className="bookmark-time-group" key={group.label} aria-labelledby={`group-${group.label.replace(/\s/g, "-")}`}>
              <h2 id={`group-${group.label.replace(/\s/g, "-")}`}>{group.label}</h2>
              <div>
                {group.items.map((item) => {
                  const persona = PERFORMERS.find((entry) => entry.id === item.performerId)!;
                  return (
                    <article className="bookmark-row question" key={item.id}>
                      <span className={`bookmark-kind ${persona.accent}`}><BookmarkSimple weight="fill" aria-hidden="true" /></span>
                      <div className="bookmark-copy"><p><span>Question</span>{item.journeyTitle} · {item.topicLabel}</p><h3>{item.question}</h3><small>{formatter.format(item.bookmarkedAt)} · {item.sourceCount} sources · with {persona.name}</small></div>
                      <div className="bookmark-row-actions">
                        <button type="button" onClick={() => onRemove(item.turnId)}>Remove</button>
                        <button type="button" className="open-bookmark" onClick={() => onOpen(item.journeyId, item.turnId)}>Open <ArrowRight aria-hidden="true" /></button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )) : (
            <div className="bookmark-empty"><BookmarkSimple aria-hidden="true" /><h2>Nothing tucked away here yet</h2><p>{query ? "Try a broader search or clear a filter." : "Saved topics and questions will appear here when you bookmark an answer."}</p><button type="button" onClick={query ? () => setQuery("") : onNew}>{query ? "Clear search" : "Start exploring"} <ArrowRight aria-hidden="true" /></button></div>
          )}
        </div>
      </div>
    </section>
  );
}

function timelineLabel(time: number) {
  const now = new Date();
  const then = new Date(time);
  if (then.toDateString() === now.toDateString()) return "Today";
  if (now.getTime() - then.getTime() < 7 * 24 * 60 * 60 * 1000) return "This week";
  return "Earlier";
}
