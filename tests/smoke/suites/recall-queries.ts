"use strict";

/**
 * Recall Query Smoke Suite
 *
 * Tests all 7 recall query types: active_beliefs (via tagFilter scenario),
 * active_decisions, unresolved_hypotheses, relevant_learning, current_workflow
 * (not exercised via prompt but schema includes it), full_state_digest, and
 * search. Also exercises tagFilter on active_beliefs.
 */

import { createSmokeContext } from "../harness.ts";
import {
  assertHasBelief,
  assertHasLearning,
  assertBeliefCount,
  assertFactExists,
  AssertionError,
} from "../assertions.ts";
import { PROMPT_TIMEOUT_MS } from "../config.ts";
import type { SuiteResult, ScenarioResult } from "../reporter.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert that `value` is not null/undefined or throw. */
function assertNonNull<T>(value: T | null | undefined, label: string): asserts value is T {
  if (value == null) {
    throw new AssertionError(`expected ${label} to be non-null, but was ${String(value)}`);
  }
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function scenarioRecallActiveDecisions(): Promise<ScenarioResult> {
  const name = "recall active decisions";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Create a decision belief first
    await ctx.prompt(
      'Use the believe tool to record a decision: "We will adopt microservices architecture for the new platform". Include rationale "Better scalability and team autonomy". Use type "decision" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    // Verify belief was created
    const preState = await ctx.readState();
    assertNonNull(preState, "pre-recall state");
    assertFactExists(preState);

    // Now recall active decisions
    await ctx.prompt(
      'Use the recall tool with query="active_decisions" to list all active decisions.',
    );
    const event = await ctx.waitForTool("noesis_recall", PROMPT_TIMEOUT_MS);
    const eventStr = JSON.stringify(event);

    // Verify the recall output contains decision content
    if (!eventStr.includes("microservices")) {
      throw new AssertionError(
        `Expected recall output to contain decision content "microservices", but none found in event: ${eventStr.substring(0, 500)}`,
      );
    }

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioRecallUnresolvedHypotheses(): Promise<ScenarioResult> {
  const name = "recall unresolved hypotheses";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Create a hypothesis (unresolved / testing status)
    await ctx.prompt(
      'Use the infer tool with action="add_hypothesis" to record a hypothesis: "The database connection timeout might be caused by network latency between services".',
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);

    // Now recall unresolved hypotheses
    await ctx.prompt(
      'Use the recall tool with query="unresolved_hypotheses" to list unresolved hypotheses.',
    );
    await ctx.waitForTool("noesis_recall", PROMPT_TIMEOUT_MS);

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioRecallRelevantLearning(): Promise<ScenarioResult> {
  const name = "recall relevant learning";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Trigger a bash failure to create learning entries
    await ctx.prompt('Run a command that will fail: "bash -c exit 1" using the bash tool.');
    await ctx.waitForTool("bash", PROMPT_TIMEOUT_MS);

    // Verify learning was captured
    const preState = await ctx.readState();
    assertNonNull(preState, "pre-recall state");
    assertHasLearning(preState, { status: "captured" });

    // Now recall relevant learning
    await ctx.prompt(
      'Use the recall tool with query="relevant_learning" to show relevant learning entries.',
    );
    await ctx.waitForTool("noesis_recall", PROMPT_TIMEOUT_MS);

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioRecallFullStateDigest(): Promise<ScenarioResult> {
  const name = "recall full state digest";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Create a fact belief
    await ctx.prompt(
      'Use the believe tool to record this fact: "The API gateway runs on Kubernetes". Use type "fact" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    // Create a decision
    await ctx.prompt(
      'Use the believe tool to record a decision: "We will use PostgreSQL for persistence". Include rationale "ACID compliance and JSON support". Use type "decision" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    // Trigger learning via bash failure
    await ctx.prompt('Run a command that will fail: "bash -c exit 2" using the bash tool.');
    await ctx.waitForTool("bash", PROMPT_TIMEOUT_MS);

    // Create a hypothesis
    await ctx.prompt(
      'Use the infer tool with action="add_hypothesis" to record a hypothesis: "Kubernetes pod restarts might be caused by resource limits being too low".',
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);

    // Now recall full state digest
    await ctx.prompt(
      'Use the recall tool with query="full_state_digest" to show a comprehensive state summary.',
    );
    const event = await ctx.waitForTool("noesis_recall", PROMPT_TIMEOUT_MS);
    const eventStr = JSON.stringify(event);

    // Verify digest output contains content from multiple cognitive layers
    if (!eventStr.includes("Kubernetes") || !eventStr.includes("PostgreSQL")) {
      throw new AssertionError(
        `Expected recall digest to contain content from multiple cognitive layers, but none found in event: ${eventStr.substring(0, 500)}`,
      );
    }

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioRecallWithSearch(): Promise<ScenarioResult> {
  const name = "recall with search";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Create beliefs with distinct tags
    await ctx.prompt(
      'Use the believe tool to record this fact: "PostgreSQL is the primary database". Add tags ["database", "infrastructure"]. Use type "fact" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    await ctx.prompt(
      'Use the believe tool to record this fact: "Redis cache runs on port 6379". Add tags ["cache", "infrastructure"]. Use type "fact" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    // Verify beliefs were created
    const preState = await ctx.readState();
    assertNonNull(preState, "pre-recall state");
    assertBeliefCount(preState, 2);

    // Now search via recall
    await ctx.prompt(
      'Use the recall tool with query="search" and keyword="database" to search across all cognitive layers.',
    );
    const event = await ctx.waitForTool("noesis_recall", PROMPT_TIMEOUT_MS);
    const eventStr = JSON.stringify(event);

    // Verify search output contains database-related content
    if (!eventStr.includes("PostgreSQL") && !eventStr.includes("database")) {
      throw new AssertionError(
        `Expected search output to contain database-related content, but none found in event: ${eventStr.substring(0, 500)}`,
      );
    }

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioRecallWithTagFilter(): Promise<ScenarioResult> {
  const name = "recall with tagFilter";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Create a belief with tag "auth"
    await ctx.prompt(
      'Use the believe tool to record this fact: "JWT tokens expire after 1 hour". Add tags ["auth", "security"]. Use type "fact" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    // Create a belief without "auth" tag
    await ctx.prompt(
      'Use the believe tool to record this fact: "Log level is set to INFO". Add tags ["logging"]. Use type "fact" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    // Verify beliefs were created
    const preState = await ctx.readState();
    assertNonNull(preState, "pre-recall state");
    assertBeliefCount(preState, 2);

    // Now recall with tagFilter on "auth"
    await ctx.prompt(
      'Use the recall tool with query="active_beliefs" and tagFilter=["auth"] to show only auth-related beliefs.',
    );
    const event = await ctx.waitForTool("noesis_recall", PROMPT_TIMEOUT_MS);
    const eventStr = JSON.stringify(event);

    // Verify recall output contains auth-tagged belief content
    if (!eventStr.includes("JWT") && !eventStr.includes("auth")) {
      throw new AssertionError(
        `Expected recall output to contain auth-tagged belief content, but none found in event: ${eventStr.substring(0, 500)}`,
      );
    }

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

export async function runRecallQueries(): Promise<SuiteResult> {
  const scenarios: ScenarioResult[] = [];
  const start = Date.now();

  scenarios.push(await scenarioRecallActiveDecisions());
  scenarios.push(await scenarioRecallUnresolvedHypotheses());
  scenarios.push(await scenarioRecallRelevantLearning());
  scenarios.push(await scenarioRecallFullStateDigest());
  scenarios.push(await scenarioRecallWithSearch());
  scenarios.push(await scenarioRecallWithTagFilter());

  const passed = scenarios.filter(s => s.passed).length;
  const failed = scenarios.filter(s => !s.passed).length;

  return {
    name: "recall-queries",
    scenarios,
    passed,
    failed,
    durationMs: Date.now() - start,
  };
}
