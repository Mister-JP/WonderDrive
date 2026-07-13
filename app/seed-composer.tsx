"use client";

import { FormEvent, useState } from "react";

const starters = [
  "What does a building sound like?",
  "Can a map tell the truth?",
  "Why do some ideas feel inevitable?",
] as const;

export function SeedComposer() {
  const [seed, setSeed] = useState(starters[0]);
  const [heldSeed, setHeldSeed] = useState<string | null>(null);

  function holdSeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = seed.trim();
    if (!value) return;
    setHeldSeed(value);
  }

  return (
    <div className="seed-composer">
      <div className="starter-list" aria-label="Starter questions">
        {starters.map((starter) => (
          <button
            type="button"
            key={starter}
            aria-pressed={seed === starter}
            onClick={() => {
              setSeed(starter);
              setHeldSeed(null);
            }}
          >
            {starter}
          </button>
        ))}
      </div>
      <form onSubmit={holdSeed}>
        <label htmlFor="seed">Your question</label>
        <div className="seed-input-row">
          <input
            id="seed"
            name="seed"
            value={seed}
            onChange={(event) => {
              setSeed(event.target.value);
              setHeldSeed(null);
            }}
            maxLength={280}
            autoComplete="off"
          />
          <button type="submit">Hold this thought <span aria-hidden="true">↗</span></button>
        </div>
      </form>
      <p className="seed-status" role="status" aria-live="polite">
        {heldSeed
          ? `“${heldSeed}” is ready for the first live research adapter.`
          : "This Phase 0 interaction is local and intentionally makes no AI request."}
      </p>
    </div>
  );
}
