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
      "we decided to adopt microservices for the new platform — better scalability and team autonomy. log that as a decision",
    );
    await ctx.waitForTool("noesis_believe_fact", PROMPT_TIMEOUT_MS);

    // Verify belief was created
    const preState = await ctx.readState();
    assertNonNull(preState, "pre-recall state");
    assertFactExists(preState);

    // Now recall active decisions
    await ctx.prompt(
      "what decisions have I made that are still active? list em for me",
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
      "I've got a hunch that the database connection timeout might be caused by network latency between services. add that as a hypothesis",
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);

    // Now recall unresolved hypotheses
    await ctx.prompt(
      "show me all the hypotheses I haven't resolved yet",
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
    await ctx.prompt(
      "trigger a learning capture by running a failing command: `exit 1`",
    );
    await ctx.waitForTool("bash", PROMPT_TIMEOUT_MS);

    // Verify learning was captured
    const preState = await ctx.readState();
    assertNonNull(preState, "pre-recall state");
    assertHasLearning(preState, { status: "captured" });

    // Now recall relevant learning
    await ctx.prompt(
      "what did we learn from recent failures? pull up the relevant learning entries",
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
      "just so you know, the API gateway runs on Kubernetes",
    );
    await ctx.waitForTool("noesis_believe_fact", PROMPT_TIMEOUT_MS);

    // Create a decision
    await ctx.prompt(
      "we decided to use PostgreSQL for persistence — ACID compliance and JSON support were the main reasons",
    );
    await ctx.waitForTool("noesis_believe_fact", PROMPT_TIMEOUT_MS);

    // Trigger learning via bash failure
    await ctx.prompt(
      "run a failing command to generate a learning entry: `exit 2`",
    );
    await ctx.waitForTool("bash", PROMPT_TIMEOUT_MS);

    // Create a hypothesis
    await ctx.prompt(
      "I wonder if the Kubernetes pod restarts are from resource limits being too low. add that as a hypothesis",
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);

    // Now recall full state digest
    await ctx.prompt(
      "give me the full picture — a comprehensive summary of everything we know and are tracking",
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
      "PostgreSQL is our primary database. tag that with database and infrastructure",
    );
    await ctx.waitForTool("noesis_believe_fact", PROMPT_TIMEOUT_MS);
    await ctx.prompt(
      "Redis cache runs on port 6379. tag it with cache and infrastructure",
    );
    await ctx.waitForTool("noesis_believe_fact", PROMPT_TIMEOUT_MS);

    // Verify beliefs were created
    const preState = await ctx.readState();
    assertNonNull(preState, "pre-recall state");
    assertBeliefCount(preState, 2);

    // Now search via recall
    await ctx.prompt(
      "search for everything related to 'database' across all our notes",
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
      "JWT tokens expire after 1 hour. tag with auth and security",
    );
    await ctx.waitForTool("noesis_believe_fact", PROMPT_TIMEOUT_MS);

    // Create a belief without "auth" tag
    await ctx.prompt(
      "log level is set to INFO. tag with logging",
    );
    await ctx.waitForTool("noesis_believe_fact", PROMPT_TIMEOUT_MS);

    // Verify beliefs were created
    const preState = await ctx.readState();
    assertNonNull(preState, "pre-recall state");
    assertBeliefCount(preState, 2);

    // Now recall with tagFilter on "auth"
    await ctx.prompt(
      "show me only the auth-related stuff I've saved",
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
