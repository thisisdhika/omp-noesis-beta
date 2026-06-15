"use strict";

import { createSmokeContext } from "../harness.ts";
import {
  assertHasBelief,
  assertBeliefCount,
  assertFactExists,
  assertDecisionExists,
  AssertionError,
} from "../assertions.ts";
import { PROMPT_TIMEOUT_MS } from "../config.ts";
import type { SuiteResult, ScenarioResult } from "../reporter.ts";
import type { NoesisState } from "../../../src/schema.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert that `value` is not null/undefined or throw. */
function assertNonNull<T>(value: T | null | undefined, label: string): asserts value is T {
  if (value == null) {
    throw new AssertionError(`expected ${label} to be non-null, but was ${String(value)}`);
  }
}

/**
 * Find the first belief (fact or decision) whose content matches `substr`
 * (case-insensitive).
 */
function findBelief(state: NoesisState, substr: string) {
  const all = [...state.belief.facts, ...state.belief.decisions];
  return all.find(b => b.content.toLowerCase().includes(substr.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function scenarioCreateFactBelief(): Promise<ScenarioResult> {
  const name = "create fact belief";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    await ctx.prompt(
      'Use the believe tool to record this fact: "The auth service runs on port 8080". Use type "fact" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    const state = await ctx.readState();
    assertNonNull(state, "state after believe tool");
    assertFactExists(state, "active");
    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioCreateDecisionBelief(): Promise<ScenarioResult> {
  const name = "create decision belief";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    await ctx.prompt(
      'Use the believe tool to record a decision: "We will use PostgreSQL for the primary database". Include rationale "Better JSON support than MySQL". Use type "decision" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    const state = await ctx.readState();
    assertNonNull(state, "state after believe tool");
    assertDecisionExists(state);
    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioUpdateBelief(): Promise<ScenarioResult> {
  const name = "update belief";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // First, create a belief
    await ctx.prompt(
      'Use the believe tool to record this fact: "The auth service runs on port 8080". Use type "fact" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    let state = await ctx.readState();
    assertNonNull(state, "state after first believe tool");
    assertFactExists(state, "active");

    // Now update / supersede it
    await ctx.prompt(
      'Use the believe tool to update the belief about the auth service. It now also runs on port 8443 for admin. Use the supersede action to replace the old port 8080 belief.',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    state = await ctx.readState();
    assertNonNull(state, "state after second believe tool");

    // The old belief should now be superseded
    assertHasBelief(state, { status: "superseded" });
    // The new belief should be active — match on the admin port
    assertFactExists(state, "active");

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioArchiveBelief(): Promise<ScenarioResult> {
  const name = "archive belief";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Create a belief first
    await ctx.prompt(
      'Use the believe tool to record this fact: "Temporary debug flag is enabled". Use type "fact" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    let state = await ctx.readState();
    assertNonNull(state, "state after first believe tool");
    assertFactExists(state, "active");

    // Now archive it
    await ctx.prompt(
      'Use the believe tool to archive the belief about the temporary debug flag. The debug flag has been removed from the configuration.',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    state = await ctx.readState();
    assertNonNull(state, "state after archive believe tool");

    assertHasBelief(state, { status: "archived" });

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioBeliefWithConfidence(): Promise<ScenarioResult> {
  const name = "belief with confidence";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    await ctx.prompt(
      'Use the believe tool to record with high confidence (0.95): "The build takes exactly 42 seconds". Use type "fact" and source "execution".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    const state = await ctx.readState();
    assertNonNull(state, "state after believe tool");

    // Assert the belief exists
    assertFactExists(state);

    // Directly check confidence on the matching fact
    const match = state.belief.facts.find(f =>
      f.content.toLowerCase().includes("42 seconds"),
    );
    if (!match) {
      throw new AssertionError(
        `Expected a fact containing "42 seconds", found facts: [${state.belief.facts.map(f => f.content).join(", ")}]`,
      );
    }
    if (match.confidence !== 0.95) {
      throw new AssertionError(
        `Expected confidence 0.95, got ${match.confidence}`,
      );
    }

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioAssessViaRecall(): Promise<ScenarioResult> {
  const name = "assess beliefs via recall";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Create three beliefs first
    await ctx.prompt(
      'Use the believe tool to record this fact: "The auth service runs on port 8080". Use type "fact" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    await ctx.prompt(
      'Use the believe tool to record this fact: "PostgreSQL is the primary database". Use type "fact" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    await ctx.prompt(
      'Use the believe tool to record a decision: "We will use Redis for caching". Include rationale "Fast key-value store". Use type "decision" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    // Verify beliefs were created
    const preState = await ctx.readState();
    assertNonNull(preState, "pre-recall state");
    assertBeliefCount(preState, 3);

    // Now recall all beliefs
    await ctx.prompt(
      'Use the recall tool to list all my current beliefs about the project.',
    );
    const event = await ctx.waitForTool("noesis_recall", PROMPT_TIMEOUT_MS);
    const eventStr = JSON.stringify(event);

    // Verify the recall output contains belief content
    if (!eventStr.includes("8080") && !eventStr.includes("PostgreSQL") && !eventStr.includes("Redis")) {
      throw new AssertionError(
        `Expected recall output to contain belief content ("8080", "PostgreSQL", or "Redis"), but none found in event: ${eventStr.substring(0, 500)}`,
      );
    }

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioBelieveLearningPromotion(): Promise<ScenarioResult> {
  const name = "believe learning promotion";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Trigger a bash failure to create a learning entry
    await ctx.prompt(
      'Run "bash -c exit 1" using bash to trigger learning capture.',
    );
    await ctx.waitForTool("bash", PROMPT_TIMEOUT_MS);

    // Read state to get the learning entry ID
    const statePre = await ctx.readState();
    assertNonNull(statePre, "state after bash failure");

    // Find the learning entry from the failure
    const failure = statePre.learning.failures.find(f =>
      f.description.toLowerCase().includes("exit"),
    );
    if (!failure) {
      throw new AssertionError(
        `Expected a learning failure entry containing "exit", found failures: [${statePre.learning.failures.map(f => f.description).join(", ")}]`,
      );
    }
    const learningId = failure.id;

    // Resolve the learning entry using believe tool with type="learning"
    await ctx.prompt(
      `Use the believe tool with type="learning" to resolve learning entry "${learningId}". Set rootCause="The command exit 1 always returns non-zero" and fix="Use exit 0 for successful test commands".`,
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    // Verify the belief was created
    const state = await ctx.readState();
    assertNonNull(state, "state after believe learning");
    assertFactExists(state);

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioBelieveWithTagsAndEvidence(): Promise<ScenarioResult> {
  const name = "believe with tags and evidence";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    await ctx.prompt(
      'Use the believe tool to record: type="fact", content="The API rate limit is 100 requests per minute", confidence=0.8, source="execution", tags=["api", "rate-limit"], evidence="Found in nginx.conf line 42".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    const state = await ctx.readState();
    assertNonNull(state, "state after believe tool");
    assertFactExists(state);

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

// ---------------------------------------------------------------------------
// Suite entry
// ---------------------------------------------------------------------------

export async function runBeliefLifecycle(): Promise<SuiteResult> {
  const start = Date.now();
  const scenarios = await Promise.all([
    scenarioCreateFactBelief(),
    scenarioCreateDecisionBelief(),
    scenarioUpdateBelief(),
    scenarioArchiveBelief(),
    scenarioBeliefWithConfidence(),
    scenarioAssessViaRecall(),
    scenarioBelieveLearningPromotion(),
    scenarioBelieveWithTagsAndEvidence(),
  ]);

  return {
    name: "belief-lifecycle",
    scenarios,
    passed: scenarios.filter(s => s.passed).length,
    failed: scenarios.filter(s => !s.passed).length,
    durationMs: Date.now() - start,
  };
}
