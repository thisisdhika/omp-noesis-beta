"use strict";

/**
 * Real-World Workflows Smoke Suite
 *
 * Multi-turn scenarios that mimic realistic human developer interactions
 * with agentic coding assistants. These tests exercise coherent multi-tool
 * workflows rather than isolated tool calls.
 */

import { createSmokeContext } from "../harness.ts";
import {
  assertFactExists,
  assertLearningCount,
  assertWorkflowExists,
  AssertionError,
} from "../assertions.ts";
import { PROMPT_TIMEOUT_MS } from "../config.ts";
import type { SuiteResult, ScenarioResult } from "../reporter.ts";
import type { NoesisState } from "../../../src/schema.ts";

// ---------------------------------------------------------------------------
// Scenario 1: Bug investigation workflow
// ---------------------------------------------------------------------------

async function scenarioBugInvestigation(): Promise<ScenarioResult> {
  const name = "bug investigation workflow";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Turn 1: Developer reports a bug — agent investigates via read/search
    await ctx.prompt(
      "I'm seeing timeout errors on the auth endpoint. The logs say 'connection timeout after 30s'.",
    );
    // Wait for any tool to be used (agent reads/searchs to investigate)
    await ctx.waitForEvent(
      e => e.type === "tool_execution_end",
      PROMPT_TIMEOUT_MS,
    );

    // Turn 2: Ask agent to record a hypothesis about the cause
    await ctx.prompt(
      "ok so what do you think is causing this? jot down a hypothesis — feels like maybe the connection pool is exhausted or something",
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);

    // Turn 3: Ask agent to record a belief about the timeout issue
    await ctx.prompt(
      "hey record that as a fact will you? call it a timeout issue on the auth endpoint, source is execution, confidence like 0.7 since we haven't fully confirmed yet",
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    // Turn 4: Ask to create a workflow to fix the bug
    await ctx.prompt(
      "let's create a workflow to actually fix this. goal is 'Fix auth timeout bug'. Steps: investigate the DB connection pool, add connection timeout to config, add retry logic, then write tests",
    );
    await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);

    // Verify state has belief, hypothesis, AND workflow
    const state = await ctx.readState();
    if (!state) throw new AssertionError("state file not found after prompts");

    assertFactExists(state);

    if (!state.inference?.hypotheses?.length) {
      throw new AssertionError("No hypothesis found in inference layer");
    }

    assertWorkflowExists(state);

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

// ---------------------------------------------------------------------------
// Scenario 2: Learning from failure workflow
// ---------------------------------------------------------------------------

async function scenarioLearningFromFailure(): Promise<ScenarioResult> {
  const name = "learning from failure workflow";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Turn 1: Run a failing command to trigger learning capture
    await ctx.prompt(
      "hey can you run this real quick? `node -e \"throw new Error('BUG-42: null pointer in parser')\"` — want to see how the error handling catches this kind of parser crash",
    );
    await ctx.waitForTool("bash", PROMPT_TIMEOUT_MS);

    // Turn 2: Ask to recall what was learned
    await ctx.prompt(
      "what did we learn from that failure? check the learning log for me",
    );
    await ctx.waitForTool("noesis_recall", PROMPT_TIMEOUT_MS);

    // Turn 3: Diagnose the captured learning entry
    await ctx.prompt(
      "alright so the root cause here is a missing null check before dereference. can you log that as a learning entry with the fix? should be adding a null guard around line 42 in the parser",
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    // Verify learning was captured and belief was created
    const state = await ctx.readState();
    if (!state) throw new AssertionError("state file not found after prompts");

    assertLearningCount(state, 1);
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

export async function runRealWorldWorkflows(): Promise<SuiteResult> {
  const start = Date.now();
  const scenarios = await Promise.all([
    scenarioBugInvestigation(),
    scenarioLearningFromFailure(),
  ]);

  return {
    name: "real-world-workflows",
    scenarios,
    passed: scenarios.filter(s => s.passed).length,
    failed: scenarios.filter(s => !s.passed).length,
    durationMs: Date.now() - start,
  };
}
