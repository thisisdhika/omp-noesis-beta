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
      'Based on what you found, use the infer tool with action="add_hypothesis" to record a hypothesis about the cause.',
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);

    // Turn 3: Ask agent to record a belief about the timeout issue
    await ctx.prompt(
      'Use the believe tool to record a fact about the timeout issue with type="fact", source="execution", confidence=0.7.',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    // Turn 4: Ask to create a workflow to fix the bug
    await ctx.prompt(
      'Use the commit tool with mode="extend_workflow" to create a workflow: goal="Fix auth timeout bug", steps=["Investigate DB connection pool", "Add connection timeout to config", "Add retry logic", "Write tests"].',
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
      'Run the command "node -e throw new Error(\'BUG-42: null pointer in parser\')" using bash.',
    );
    await ctx.waitForTool("bash", PROMPT_TIMEOUT_MS);

    // Turn 2: Ask to recall what was learned
    await ctx.prompt(
      'Use the recall tool with query="relevant_learning" to check what we learned from the failure.',
    );
    await ctx.waitForTool("noesis_recall", PROMPT_TIMEOUT_MS);

    // Turn 3: Diagnose the captured learning entry
    await ctx.prompt(
      'Use the believe tool with type="learning" to diagnose the captured failure. Find the learning entry and set rootCause="Null check missing before dereference" and fix="Add null guard at line 42".',
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
