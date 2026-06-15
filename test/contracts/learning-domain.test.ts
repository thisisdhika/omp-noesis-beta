import { describe, it, expect } from "vitest";
import { makeLearningEntry, makeState } from "../_harness/factories.js";
import {
  captureFailure,
  captureSuccess,
  applyRetentionPolicy,
  getTopLearning,
  captureResult,
} from "../../src/domains/learning/learning-domain.js";

describe("learning-domain contracts", () => {
  it("captureFailure appends to failures and increments summary", () => {
    const state = makeState();
    const beforeCount = state.learning.summary.failureCount;

    const entry = captureFailure(state, "bash", "cmd failed", "shell");

    expect(state.learning.failures).toContain(entry);
    expect(state.learning.summary.failureCount).toBe(beforeCount + 1);
    expect(entry.toolName).toBe("bash");
    expect(entry.description).toContain("cmd failed");
    expect(entry.skillScope).toBe("shell");
  });

  it("captureFailure without skillScope omits it", () => {
    const state = makeState();
    const entry = captureFailure(state, "bash", "cmd failed");

    expect(entry.skillScope).toBeUndefined();
  });

  it("captureSuccess appends to successes and increments summary", () => {
    const state = makeState();
    const beforeCount = state.learning.summary.successCount;

    const entry = captureSuccess(state, "bash", "cmd worked", "shell");

    expect(state.learning.successes).toContain(entry);
    expect(state.learning.summary.successCount).toBe(beforeCount + 1);
    expect(entry.toolName).toBe("bash");
  });

  it("applyRetentionPolicy returns all when under max", () => {
    const entries = [makeLearningEntry(), makeLearningEntry()];
    const result = applyRetentionPolicy(entries, 10);

    expect(result.length).toBe(2);
    expect(result).toEqual(entries);
  });

  it("applyRetentionPolicy evicts to max", () => {
    const entries = Array.from({ length: 60 }, (_, i) => makeLearningEntry({ id: `le-${i}` }));
    const result = applyRetentionPolicy(entries, 50);

    expect(result.length).toBe(50);
  });

  it("getTopLearning returns top entries by rank", () => {
    const entries = [
      { ...makeLearningEntry(), description: "low", capturedAt: new Date(Date.now() - 100000).toISOString() },
      { ...makeLearningEntry(), description: "high", capturedAt: new Date().toISOString() },
    ];

    const top = getTopLearning(entries, 1);

    expect(top.length).toBe(1);
    expect(top[0].description).toBe("high");
  });

  it("getTopLearning respects count", () => {
    const entries = [makeLearningEntry(), makeLearningEntry(), makeLearningEntry()];
    const top = getTopLearning(entries, 2);

    expect(top.length).toBe(2);
  });

  it("getTopLearning returns higher-scored entries regardless of scope", () => {
    const entries = [
      makeLearningEntry({ description: "a-entry", skillScope: "a" }),
      makeLearningEntry({ description: "b-entry", skillScope: "b" }),
      makeLearningEntry({ description: "a-entry2", skillScope: "a" }),
    ];

    const top = getTopLearning(entries, 10, "a");

    // "a" entries score higher due to relevance=1.0 vs 0.5, so top entries should be a-scoped
    expect(top.length).toBeGreaterThanOrEqual(2);
    expect(top.filter((e) => e.skillScope === "a").length).toBeGreaterThanOrEqual(2);
  });

  it("captureResult returns new entries array with added entry", () => {
    const entries = [makeLearningEntry()];
    const result = captureResult(entries, "tool", "result msg", true, "scope");

    expect(result.newEntries.length).toBe(entries.length + 1);
    expect(result.newEntries[result.newEntries.length - 1].toolName).toBe("tool");
    expect(result.newEntries[result.newEntries.length - 1].severity).toBe(2);
  });

  it("captureResult sets severity 1 for success", () => {
    const entries = [];
    const result = captureResult(entries, "tool", "ok", false);

    expect(result.newEntries[0].severity).toBe(1);
  });

  it("captureResult does not mutate original array", () => {
    const entries = [makeLearningEntry()];
    const originalLength = entries.length;

    captureResult(entries, "tool", "msg", true);

    expect(entries.length).toBe(originalLength);
  });
});
