import assert from "node:assert/strict";
import test from "node:test";
import { starterRecommendationsUrl } from "../app/client-api.ts";

test("starter recommendations use cache unless a person explicitly refreshes", () => {
  assert.equal(starterRecommendationsUrl("sage"), "/api/starters?performer=sage");
  assert.equal(
    starterRecommendationsUrl("mechanist", true),
    "/api/starters?performer=mechanist&refresh=1",
  );
});
