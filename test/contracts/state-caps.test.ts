import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";
import { makeState } from "../_harness/factories.js";
import {
  setFocus,
  setFiles,
  setGraphQueries,
} from "../../src/domains/attention/attention-domain.js";

describe("State caps enforcement", () => {
  let ctx: TestContext & { cleanup: () => void };
  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => {
    ctx.cleanup();
  });

  it("focus truncated at 200 chars", () => {
    const state = makeState();
    setFocus(state, "x".repeat(250));
    expect(state.attention.focus.length).toBe(200);
  });

  it("files truncated at 10", () => {
    const state = makeState();
    setFiles(state, Array.from({ length: 15 }, (_, i) => `file${i}.ts`));
    expect(state.attention.files.length).toBe(10);
  });

  it("graphQueries truncated at 5", () => {
    const state = makeState();
    setGraphQueries(state, Array.from({ length: 10 }, (_, i) => `query_${i}`));
    expect(state.attention.graphQueries.length).toBe(5);
  });

  it("graphQueries each truncated at 200 chars", () => {
    const state = makeState();
    setGraphQueries(state, ["x".repeat(300)]);
    expect(state.attention.graphQueries[0]!.length).toBe(200);
  });
});
