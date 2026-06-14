import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";
import { captureFailure, getTopLearning } from "../../src/domains/learning/learning-domain.js";
import { rankLearning } from "../../src/domains/learning/ranking-strategy.js";

describe("Scenario E: Repeated failure and learning", () => {
  let ctx: TestContext & { cleanup: () => void };

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("captures 3 bash failures → resolves one → resolved entry ranks highest", () => {
    const state = ctx.state.read();

    // Step 1: Capture 3 failures for the bash tool in the "shell" skill scope
    const failure1 = captureFailure(state, "bash", "cmd failed: invalid syntax", "shell");
    const failure2 = captureFailure(state, "bash", "cmd failed again: missing arg", "shell");
    const failure3 = captureFailure(state, "bash", "cmd failed third time: permission denied", "shell");

    // All 3 failures are recorded
    expect(state.learning.failures).toHaveLength(3);
    expect(state.learning.summary.failureCount).toBe(3);

    // Each failure has an id and capturedAt
    expect(failure1.id).toBeDefined();
    expect(failure1.capturedAt).toBeDefined();
    expect(failure2.id).toBeDefined();
    expect(failure3.id).toBeDefined();

    // None are resolved yet
    expect(failure1.rootCause).toBeUndefined();
    expect(failure1.fix).toBeUndefined();

    // Step 2: Resolve the first failure
    failure1.rootCause = "bad command syntax";
    failure1.fix = "use correct syntax";
    state.learning.summary.resolvedCount++;

    // Step 3: Rank all learning entries
    const allEntries = [...state.learning.successes, ...state.learning.failures];
    const ranked = rankLearning(allEntries, "shell");

    // Resolved entry (failure1) should rank highest — it gets failureMul=2.0 × resolvedMul=2.0 = 4× multiplier
    // Unresolved entries only get failureMul=2.0 (no fix) = 2× multiplier
    expect(ranked[0]!.id).toBe(failure1.id);
    expect(ranked[0]!.rootCause).toBe("bad command syntax");
    expect(ranked[0]!.fix).toBe("use correct syntax");

    // The remaining entries are the unresolved failures
    expect(ranked[1]!.id).not.toBe(failure1.id);
    expect(ranked[2]!.id).not.toBe(failure1.id);

    // Step 4: getTopLearning surfaces resolved entry at count=1
    const top1 = getTopLearning(allEntries, 1, "shell");
    expect(top1).toHaveLength(1);
    expect(top1[0]!.id).toBe(failure1.id);
    expect(top1[0]!.rootCause).toBeDefined();
    expect(top1[0]!.fix).toBeDefined();

    // Summary counts are correct
    expect(state.learning.summary.failureCount).toBe(3);
    expect(state.learning.summary.resolvedCount).toBe(1);
  });

  it("unresolved failures rank below resolved even with more recent timestamps", () => {
    const state = ctx.state.read();

    // Capture failures — first is oldest
    const failure1 = captureFailure(state, "bash", "old failure", "shell");
    const failure2 = captureFailure(state, "bash", "recent failure", "shell");

    // Resolve the older failure (which would otherwise rank lower on recency)
    failure1.rootCause = "stale cache";
    failure1.fix = "clear cache before run";

    const allEntries = [...state.learning.successes, ...state.learning.failures];
    const ranked = rankLearning(allEntries, "shell");

    // Resolved older entry still outranks unresolved newer entry
    // because resolvedMul (2.0) outweighs recency decay
    expect(ranked[0]!.id).toBe(failure1.id);
    expect(ranked[0]!.rootCause).toBe("stale cache");
    expect(ranked[0]!.fix).toBe("clear cache before run");
  });

  it("learning entries with matching skillScope score higher than mismatched", () => {
    const state = ctx.state.read();

    // Two failures: one matching current skillScope, one different
    const matchingFailure = captureFailure(state, "bash", "shell failure", "shell");
    const mismatchedFailure = captureFailure(state, "bash", "python failure", "python");

    // Resolve both so the only difference is relevance
    matchingFailure.rootCause = "bad shell cmd";
    matchingFailure.fix = "fix shell cmd";
    mismatchedFailure.rootCause = "bad python cmd";
    mismatchedFailure.fix = "fix python cmd";

    const allEntries = [...state.learning.successes, ...state.learning.failures];
    const ranked = rankLearning(allEntries, "shell");

    // Matching scope (relevance=1.0) outranks mismatched (relevance=0.5)
    expect(ranked[0]!.skillScope).toBe("shell");
    expect(ranked[0]!.id).toBe(matchingFailure.id);
  });

  it("learning entries with no skillScope score zero relevance", () => {
    const state = ctx.state.read();

    // Failure captured without skillScope
    const noScopeFailure = captureFailure(state, "bash", "unknown origin failure");
    noScopeFailure.rootCause = "mystery";
    noScopeFailure.fix = "investigate";

    const allEntries = [...state.learning.successes, ...state.learning.failures];
    const ranked = rankLearning(allEntries, "shell");

    // Entry with no skillScope has relevance=0.0, so score=0 regardless of resolution
    expect(ranked[ranked.length - 1]!.id).toBe(noScopeFailure.id);
  });
  it("matching scope outranks mismatched scope, which outranks missing scope", () => {
    const capturedAt = "2026-06-14T00:00:00.000Z";
    const matching = {
      id: "match",
      toolName: "bash",
      description: "matching",
      capturedAt,
      skillScope: "shell",
      rootCause: "bad syntax",
      fix: "fix syntax",
    };
    const mismatched = {
      id: "mismatch",
      toolName: "bash",
      description: "mismatched",
      capturedAt,
      skillScope: "db",
      rootCause: "bad syntax",
      fix: "fix syntax",
    };
    const missing = {
      id: "missing",
      toolName: "bash",
      description: "missing",
      capturedAt,
      rootCause: "bad syntax",
      fix: "fix syntax",
    };

    const ranked = rankLearning([missing, mismatched, matching], "shell");

    expect(ranked.map((entry) => entry.id)).toEqual(["match", "mismatch", "missing"]);
  });
});
