import { Suspense } from "react";
import { CuriosityPediaExperience } from "./curiositypedia-experience";

export default function RoutedExperiencePage() {
  return (
    <Suspense fallback={<RoutedExperienceFallback />}>
      <CuriosityPediaExperience />
    </Suspense>
  );
}

function RoutedExperienceFallback() {
  return (
    <main className="app-shell text-medium">
      <header className="app-header">
        <div className="wordmark">
          <span className="wordmark-mark" aria-hidden="true">C</span>
          <span>CuriosityPedia</span>
        </div>
      </header>
      <section className="loading-stage" aria-live="polite">
        <span className="loading-orbit" />
        <p>Opening your CuriosityPedia journeys…</p>
        <small>Resolving a durable guest identity</small>
      </section>
      <footer className="app-footer">
        <p><span aria-hidden="true">W/V3</span> One personality. One researched turn. Many ways forward.</p>
      </footer>
    </main>
  );
}
