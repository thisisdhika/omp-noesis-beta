import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";

describe.skip("Scenario B: Active coding session — requires real OMP tool execution", () => {
  let ctx: TestContext & { cleanup: () => void };
  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => {
    ctx.cleanup();
  });

  it("simulates a full debugging workflow: attend → believe → infer → confirm → commit", async () => {
    // Step 1: Attend — set cognitive focus on the auth bug
    const attendResult = await ctx.extension.invokeTool("noesis_attend", {
      focus: "Debug auth token expiry",
      files: ["src/auth.ts"],
      graphQueries: [],
    });
    expect(attendResult.content).toBeDefined();
    expect(attendResult.content.length).toBeGreaterThan(0);

    const attendState = ctx.state.read();
    expect(attendState.attention.focus).toBe("Debug auth token expiry");
    expect(attendState.attention.files).toEqual(["src/auth.ts"]);

    // Step 2: Believe a fact about JWT TTL
    const believeResult = await ctx.extension.invokeTool("noesis_believe", {
      type: "fact",
      content: "JWT token TTL is 1 hour",
      confidence: 0.95,
      source: "execution",
      tags: ["auth"],
    });
    expect(believeResult.content).toBeDefined();
    expect(believeResult.content.length).toBeGreaterThan(0);

    const stateAfterBelieve = ctx.state.read();
    expect(stateAfterBelieve.belief.facts.length).toBe(1);
    expect(stateAfterBelieve.belief.facts[0]!.content).toBe("JWT token TTL is 1 hour");
    expect(stateAfterBelieve.belief.facts[0]!.confidence).toBe(0.95);
    expect(stateAfterBelieve.belief.facts[0]!.status).toBe("active");

    // Step 3: Infer a hypothesis about the refresh path
    const inferResult = await ctx.extension.invokeTool("noesis_infer", {
      action: "hypothesize",
      content: "Token expiry not checked on refresh",
      evidence: "src/auth.ts:L42",
    });
    expect(inferResult.content).toBeDefined();
    expect(inferResult.content.length).toBeGreaterThan(0);

    const stateAfterInfer = ctx.state.read();
    expect(stateAfterInfer.inference.hypotheses.length).toBe(1);
    expect(stateAfterInfer.inference.hypotheses[0]!.content).toBe(
      "Token expiry not checked on refresh",
    );
    expect(stateAfterInfer.inference.hypotheses[0]!.status).toBe("testing");

    const hypothesisId = stateAfterInfer.inference.hypotheses[0]!.id;

    // Step 4: Confirm the hypothesis — auto-creates a belief at 0.75 confidence
    const confirmResult = await ctx.extension.invokeTool("noesis_infer", {
      action: "confirm",
      hypothesisId,
    });
    expect(confirmResult.content).toBeDefined();

    const stateAfterConfirm = ctx.state.read();
    // Hypothesis is now confirmed
    expect(stateAfterConfirm.inference.hypotheses[0]!.status).toBe("confirmed");
    // A new belief was auto-created from the confirmed hypothesis
    expect(stateAfterConfirm.belief.facts.length).toBe(2);
    const inferredBelief = stateAfterConfirm.belief.facts[1]!;
    expect(inferredBelief.content).toBe("Token expiry not checked on refresh");
    expect(inferredBelief.confidence).toBe(0.75);
    expect(inferredBelief.source).toBe("inference");
    expect(inferredBelief.status).toBe("active");

    // Step 5: Commit to a workflow to fix the bug
    const commitResult = await ctx.extension.invokeTool("noesis_commit", {
      mode: "replace",
      goal: "Fix auth token expiry",
      steps: [{ description: "Add expiry check" }],
    });
    expect(commitResult.content).toBeDefined();

    const finalState = ctx.state.read();

    // Final assertions: all layers are coherent
    expect(finalState.attention.focus).toBe("Debug auth token expiry");
    expect(finalState.belief.facts.length).toBeGreaterThanOrEqual(2);
    expect(finalState.inference.hypotheses[0]!.status).toBe("confirmed");
    expect(finalState.commitment.workflow.goal).toBe("Fix auth token expiry");
    expect(finalState.commitment.workflow.steps.length).toBeGreaterThanOrEqual(1);
    expect(finalState.commitment.workflow.steps[0]!.description).toBe("Add expiry check");
  });
});
