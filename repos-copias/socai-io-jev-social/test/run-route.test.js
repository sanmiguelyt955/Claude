import assert from "node:assert/strict";
import test from "node:test";
import { parseRunRoute, resultHash } from "../public/run-route.js";

test("result routes carry a recoverable run id", () => {
  assert.deepEqual(parseRunRoute("#results/20260922010101-a1b2c3"), {
    view: "results",
    id: "20260922010101-a1b2c3",
  });
  assert.deepEqual(parseRunRoute("#results"), { view: "results", id: "" });
  assert.equal(parseRunRoute("#results/../../etc"), null);
  assert.equal(resultHash("20260922010101-a1b2c3"), "#results/20260922010101-a1b2c3");
});
