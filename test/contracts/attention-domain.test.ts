import { describe, it, expect } from "vitest";
import { vi } from "vitest";
import { makeState } from "../_harness/factories.js";
import {
  setFocus,
  setGraphQueries,
  setFiles,
  storeGraphFindings,
  clearGraphFindings,
} from "../../src/domains/attention/attention-domain.js";

describe("attention-domain contracts", () => {
  it("setFocus truncates focus to 200 chars", () => {
    const long = "a".repeat(300);
    const state = makeState();
    setFocus(state, long);

    expect(state.attention.focus.length).toBeLessThanOrEqual(200);
    expect(state.attention.focus.startsWith("a".repeat(197))).toBe(true);
    expect(state.attention.focus.endsWith("...")).toBe(true);
  });

  it("setFocus updates timestamp", () => {
    vi.useFakeTimers();
    const state = makeState();
    setFocus(state, "first");
    const first = state.attention.updatedAt;
    vi.advanceTimersByTime(1000);
    setFocus(state, "second");
    const second = state.attention.updatedAt;
    expect(first).not.toEqual(second);
    vi.useRealTimers();
  });

  it("setGraphQueries truncates and limits queries", () => {
    const queries = ["q1", "q2".repeat(200), "q3"];
    const state = makeState();
    setGraphQueries(state, queries);

    expect(state.attention.graphQueries.length).toBeLessThanOrEqual(5);
    expect(state.attention.graphQueries[1].length).toBeLessThanOrEqual(200);
  });

  it("setGraphQueries caps at 5 entries", () => {
    const queries = Array.from({ length: 10 }, (_, i) => `q${i}`);
    const state = makeState();
    setGraphQueries(state, queries);

    expect(state.attention.graphQueries.length).toBe(5);
  });

  it("setFiles limits to 10 entries", () => {
    const files = Array.from({ length: 20 }, (_, i) => `file${i}`);
    const state = makeState();
    setFiles(state, files);

    expect(state.attention.files.length).toBe(10);
  });

  it("setFiles preserves order", () => {
    const files = ["a", "b", "c"];
    const state = makeState();
    setFiles(state, files);

    expect(state.attention.files).toEqual(["a", "b", "c"]);
  });

  it("storeGraphFindings sets findings on attention", () => {
    const state = makeState();
    const findings = [{ label: "A", value: 1 }];
    storeGraphFindings(state, findings);

    expect(state.attention.graphFindings).toBe(findings);
  });

  it("storeGraphFindings replaces previous findings", () => {
    const state = makeState();
    storeGraphFindings(state, [{ label: "A" }]);
    storeGraphFindings(state, [{ label: "B" }]);

    expect(state.attention.graphFindings).toEqual([{ label: "B" }]);
  });

  it("clearGraphFindings removes findings key", () => {
    const state = makeState();
    storeGraphFindings(state, [{ label: "A" }]);
    expect(state.attention.graphFindings).toBeDefined();

    clearGraphFindings(state);
    expect(state.attention).not.toHaveProperty("graphFindings");
  });

  it("clearGraphFindings is idempotent", () => {
    const state = makeState();
    clearGraphFindings(state);
    clearGraphFindings(state);

    expect(state.attention).not.toHaveProperty("graphFindings");
  });
});
