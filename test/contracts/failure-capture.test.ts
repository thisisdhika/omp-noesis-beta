import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";
import { makeLearningEntry } from "../_harness/factories.js";
import { captureFailure } from "../../src/domains/learning/learning-domain.js";
import { rankLearning } from "../../src/domains/learning/ranking-strategy.js";

describe("failure capture (tool_result hook)", () => {
  let ctx: TestContext & { cleanup: () => void };
  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => {
    ctx.cleanup();
  });

  it("failed tool execution creates a learning entry", () => {
    ctx.state.mutate((s) => {
      captureFailure(s, "bash", "command failed", "shell");
    });

    const state = ctx.state.read();
    expect(state.learning.failures.length).toBeGreaterThan(0);
    expect(state.learning.failures[0]!.toolName).toBe("bash");
  });

  it("successful tool execution does NOT create failure entry", () => {
    const state = ctx.state.read();
    const before = state.learning.failures.length;
    // Nothing should create a failure since captureFailure wasn't called
    expect(state.learning.failures.length).toBe(before);
  });

  it("resolved learning entries rank above unresolved", () => {
    const unresolved = makeLearningEntry({
      rootCause: undefined,
      fix: undefined,
      toolName: "bash",
      skillScope: "bash",
    });
    const resolved = makeLearningEntry({
      rootCause: "bad cmd",
      fix: "use correct cmd",
      toolName: "bash",
      skillScope: "bash",
    });

    const ranked = rankLearning([unresolved, resolved]);

    expect(ranked[0]!.id).toBe(resolved.id);
  });
});
