"use strict";

/**
 * Real-World Developer Smoke Suite
 *
 * Mid-complex real-world scenarios that mimic actual developer workflows:
 * debugging CI, refactoring, incident response, and code review.
 * Each scenario exercises coherent multi-tool workflows with realistic
 * human-like prompts.
 */

import { createSmokeContext } from "../harness.ts";
import {
  assertAttentionSet,
  assertBeliefCount,
  assertDecisionExists,
  assertFactExists,
  assertHypothesisExists,
  assertLearningCount,
  assertWorkflowExists,
  AssertionError,
} from "../assertions.ts";
import { PROMPT_TIMEOUT_MS } from "../config.ts";
import type { SuiteResult, ScenarioResult } from "../reporter.ts";
import type { NoesisState } from "../../../src/schema.ts";

// ---------------------------------------------------------------------------
// Scenario 1: Debug a failing CI pipeline
// ---------------------------------------------------------------------------

async function scenarioDebugCI(): Promise<ScenarioResult> {
  const name = "debug a failing CI pipeline";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Turn 1: Developer reports CI failure — agent investigates
    await ctx.prompt(
      "hey my CI is failing with this error: 'TypeError: Cannot read properties of undefined'. " +
        "The test file is src/auth.test.ts. Can you debug this?",
    );
    await ctx.waitForTool("noesis_attend", PROMPT_TIMEOUT_MS);

    // Turn 2: Ask agent to record a hypothesis about root cause
    await ctx.prompt(
      "Use the infer tool with action=\"add_hypothesis\" to record what you " +
        "think is causing the TypeError in src/auth.test.ts.",
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);

    // Turn 3: Ask agent to believe the fix strategy
    await ctx.prompt(
      'Record a fact about the fix using the believe tool with type="fact", ' +
        'source="execution", confidence=0.8. Describe what needs to change.',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    // Turn 4: Ask agent to create a workflow tracking the fix
    await ctx.prompt(
      'Use the commit tool with mode="extend_workflow" to create a workflow. ' +
        'Goal: "Fix TypeError in auth tests". Steps: ["Reproduce failure", "Identify undefined variable", "Add null guard", "Verify tests pass"].',
    );
    await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);

    // Verify structural state
    const state = await ctx.readState();
    if (!state) throw new AssertionError("state file not found after prompts");

    assertAttentionSet(state);
    assertFactExists(state);
    assertHypothesisExists(state);
    assertWorkflowExists(state);

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

// ---------------------------------------------------------------------------
// Scenario 2: Refactor a codebase with architectural decisions
// ---------------------------------------------------------------------------

async function scenarioRefactorCodebase(): Promise<ScenarioResult> {
  const name = "refactor a codebase with architectural decisions";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Turn 1: Developer describes refactoring need — agent focuses on target
    await ctx.prompt(
      "I need to extract the auth logic from src/server.ts into a separate module. " +
        "The current file is 800 lines. Help me plan and execute this.",
    );
    await ctx.waitForTool("noesis_focus", PROMPT_TIMEOUT_MS);

    // Turn 2: Ask agent to record architectural decisions
    await ctx.prompt(
      'Use the believe tool with type="decision" to record a decision about ' +
        'the refactoring approach. Include what module structure you recommend.',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    // Turn 3: Ask agent to create a workflow tracking refactoring steps
    await ctx.prompt(
      'Use the commit tool with mode="extend_workflow" to create a workflow. ' +
        'Goal: "Extract auth module from src/server.ts". ' +
        'Steps: ["Identify auth-related code", "Create src/auth.ts", "Move auth functions", "Update imports", "Write tests", "Remove old code"].',
    );
    await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);

    // Verify structural state
    const state = await ctx.readState();
    if (!state) throw new AssertionError("state file not found after prompts");

    assertAttentionSet(state);
    assertDecisionExists(state);
    assertBeliefCount(state, 1);
    assertWorkflowExists(state);

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

// ---------------------------------------------------------------------------
// Scenario 3: Learning from production incident
// ---------------------------------------------------------------------------

async function scenarioProdIncident(): Promise<ScenarioResult> {
  const name = "learning from production incident";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Turn 1: Developer reports a production incident
    await ctx.prompt(
      "We had a prod outage. The logs show 'Connection pool exhausted' at 14:32 UTC. " +
        "DB is PostgreSQL. Help me investigate and prevent recurrence.",
    );
    await ctx.waitForTool("noesis_attend", PROMPT_TIMEOUT_MS);

    // Turn 2: Ask agent to infer a hypothesis about root cause
    await ctx.prompt(
      'Use the infer tool with action="add_hypothesis" to record a hypothesis ' +
        'about what caused the connection pool exhaustion.',
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);

    // Turn 3: Ask agent to record a belief about the diagnostic
    await ctx.prompt(
      'Record a fact about the incident using the believe tool with type="fact", ' +
        'source="execution", confidence=0.9. Describe the actual root cause.',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    // Turn 4: Ask agent to commit a tracking workflow
    await ctx.prompt(
      'Use the commit tool with mode="extend_workflow" to create a workflow. ' +
        'Goal: "Prevent connection pool exhaustion". ' +
        'Steps: ["Investigate pool settings", "Add connection monitoring", "Review query efficiency", "Implement retry with backoff", "Deploy fix"].',
    );
    await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);

    // Verify structural state
    const state = await ctx.readState();
    if (!state) throw new AssertionError("state file not found after prompts");

    assertAttentionSet(state);
    assertFactExists(state);
    assertHypothesisExists(state);
    assertLearningCount(state, 1);
    assertWorkflowExists(state);

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

// ---------------------------------------------------------------------------
// Scenario 4: Multi-turn code review
// ---------------------------------------------------------------------------

async function scenarioCodeReview(): Promise<ScenarioResult> {
  const name = "multi-turn code review";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Turn 1: Developer asks for a code review — agent attends to focus on file
    await ctx.prompt(
      "Review src/middleware/auth.ts for security issues. " +
        "I'm concerned about JWT validation and rate limiting.",
    );
    await ctx.waitForTool("noesis_attend", PROMPT_TIMEOUT_MS);

    // Turn 2: Ask agent to record findings as belief decisions
    await ctx.prompt(
      'Use the believe tool with type="decision" to record a finding about ' +
        'a security issue you identified in the auth middleware.',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    // Turn 3: Ask agent to record unresolved questions as hypotheses
    await ctx.prompt(
      'Use the infer tool with action="add_hypothesis" to record an unresolved ' +
        'question or potential improvement you want to investigate further.',
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);

    // Turn 4: Ask agent to commit a review checklist workflow
    await ctx.prompt(
      'Use the commit tool with mode="extend_workflow" to create a workflow ' +
        'to track the review. Goal: "Auth middleware security review". ' +
        'Steps: ["Check JWT validation", "Review rate limiting", "Audit error handling", "Verify input sanitization", "Write review summary"].',
    );
    await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);

    // Verify structural state
    const state = await ctx.readState();
    if (!state) throw new AssertionError("state file not found after prompts");

    assertAttentionSet(state);
    assertDecisionExists(state);
    assertHypothesisExists(state);
    assertWorkflowExists(state);

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

export async function runRealWorldDeveloper(): Promise<SuiteResult> {
  const scenarios: ScenarioResult[] = [];
  const start = Date.now();

  scenarios.push(await scenarioDebugCI());
  scenarios.push(await scenarioRefactorCodebase());
  scenarios.push(await scenarioProdIncident());
  scenarios.push(await scenarioCodeReview());

  const passed = scenarios.filter(s => s.passed).length;
  const failed = scenarios.length - passed;

  return {
    name: "real-world-developer",
    scenarios,
    passed,
    failed,
    durationMs: Date.now() - start,
  };
}
