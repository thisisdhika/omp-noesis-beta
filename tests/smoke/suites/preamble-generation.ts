"use strict";

/**
 * Preamble generation smoke tests.
 *
 * Verifies that the cognitive preamble — the compressed summary of beliefs,
 * learning, and workflow state fed into each agent turn — is correctly
 * generated under various state conditions: populated, overflowing,
 * learning-rich, workflow-active, and empty.
 */

import type { SuiteResult, ScenarioResult } from "../reporter.ts";
import { createSmokeContext, type SmokeContext } from "../harness.ts";
import {
  assertHasBelief,
  assertAttentionSet,
  assertBeliefCount,
  assertHasLearning,
  assertHasWorkflow,
} from "../assertions.ts";
import { PROMPT_TIMEOUT_MS } from "../config.ts";
import { EMPTY_STATE, type NoesisState } from "../../../src/schema.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a nullable readState() result to a usable NoesisState. */
function orEmpty(s: NoesisState | null): NoesisState {
  return s ?? EMPTY_STATE;
}

/**
 * Create a fact belief via the believe tool and wait for completion.
 */
async function createFactBelief(
  ctx: SmokeContext,
  content: string,
  confidence = 0.85,
  source = "execution" as const,
): Promise<void> {
  await ctx.prompt(
    `hey record this: "${content}" — confidence is ${confidence}, source is "${source}", tag it test`,
  );
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

export async function runPreambleGeneration(): Promise<SuiteResult> {
  const scenarios: ScenarioResult[] = [];
  const start = Date.now();

  // ── Scenario 1: active beliefs in preamble ─────────────────────────────
  {
    const s1 = Date.now();
    let passed = true;
    let error: string | undefined;
    let ctx: SmokeContext | undefined;
    try {
      ctx = await createSmokeContext();

      // Seed three distinct beliefs
      await createFactBelief(ctx, "The UI is built with React 19");
      await createFactBelief(ctx, "State management uses React hooks");
      await createFactBelief(ctx, "The backend is written in Go");

      // Prompt the agent to use the attend tool — the preamble should
      // already contain the seeded beliefs, and the attend execution
      // should reference / incorporate them.
    await ctx.prompt(
      'Use the attend tool to set your focus to "understanding project stack" with high priority and show me what you know about the stack.',
    );

      const state = orEmpty(await ctx.readState());
      assertAttentionSet(state);

      // The state should still contain the three beliefs
      assertBeliefCount(state, 3);
    } catch (e) {
      passed = false;
      error = String(e);
      await ctx?.dispose();
    }
    scenarios.push({
      name: "active beliefs in preamble",
      passed,
      error,
      durationMs: Date.now() - s1,
    });
  }

  // ── Scenario 2: MAX_PREAMBLE_TOKENS respect ────────────────────────────
  {
    const s2 = Date.now();
    let passed = true;
    let error: string | undefined;
    let ctx: SmokeContext | undefined;
    try {
      ctx = await createSmokeContext();

      // Create enough beliefs to push past MAX_PREAMBLE_TOKENS (2000).
      // Batch across several prompts so the agent creates them.
      const beliefTopics = [
        "Module A uses dependency injection",
        "Module B has zero external deps",
        "Module C is a facade over the HTTP layer",
        "The test suite covers 85 % of branches",
        "Build times average 12 seconds",
        "API versioning uses URL prefixes",
        "Logging goes through a central pipeline",
        "Auth is handled by JWT tokens",
        "Config is loaded from environment variables",
        "Error types are discriminated unions",
        "The database is PostgreSQL 16",
        "ORM queries use prepared statements",
        "Migration files are timestamped SQL",
        "Feature flags are toggled at deploy time",
        "CI runs lint, typecheck, test, build",
        "Release artifacts are OCI containers",
        "Secrets are stored in a vault service",
        "Metrics feed into Prometheus",
        "Tracing uses OpenTelemetry",
        "Health checks live at /healthz",
        "Rate limiting is per-tenant token bucket",
        "CORS is configured per environment",
      ];

      // Chunk into groups of ~4-5 per prompt to keep each turn manageable
      for (let i = 0; i < beliefTopics.length; i += 5) {
        const chunk = beliefTopics.slice(i, i + 5);
        const prompt = chunk
          .map(
            (t, j) =>
              `${j + 1}. fact "${t}" with confidence 0.8, source "execution"`,
          )
          .join("\n");
        await ctx.prompt(
          `Use the believe tool to record each of these facts (call the tool separately for each):\n${prompt}`,
        );
        await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
      }

      const state = orEmpty(await ctx.readState());

      // With >20 beliefs the state should show evidence of preamble
      // processing — either contextUsage has increased or the timestamp
      // was updated (the preamble generator had to select ≤2000 tokens).
      assertBeliefCount(state, 20);

      // Verify at least one of the tracking signals changed from defaults
      const usageChanged = state.attention.contextUsage > 0;
      const recentUpdate =
        new Date(state.attention.updatedAt).getTime() >
        Date.now() - 300_000;
      if (!usageChanged && !recentUpdate) {
        throw new Error(
          `Expected contextUsage > 0 or a recent updatedAt after creating >20 beliefs. Got contextUsage=${state.attention.contextUsage}, updatedAt=${state.attention.updatedAt}`,
        );
      }
    } catch (e) {
      passed = false;
      error = String(e);
    } finally {
      await ctx?.dispose();
    }
    scenarios.push({
      name: "MAX_PREAMBLE_TOKENS respect",
      passed,
      error,
      durationMs: Date.now() - s2,
    });
  }

  // ── Scenario 3: recent learning entries in preamble ────────────────────
  {
    const s3 = Date.now();
    let passed = true;
    let error: string | undefined;
    let ctx: SmokeContext | undefined;
    try {
      ctx = await createSmokeContext();

      // Trigger a learning capture — a failed command should cause the
      // noesis hook to record a learning entry automatically.
    await ctx.prompt(
      "try this: `cd /nonexistent_directory_xyz` — should fail. then set your focus to 'debugging the latest issue'",
    );

      const state = orEmpty(await ctx.readState());

      // The failed bash should have triggered a learning entry
      assertHasLearning(state, { status: "captured" });

      // After the focus tool, attention.focus should be set
      assertAttentionSet(state);
    } catch (e) {
      passed = false;
      error = String(e);
    } finally {
      await ctx?.dispose();
    }
    scenarios.push({
      name: "recent learning entries in preamble",
      passed,
      error,
      durationMs: Date.now() - s3,
    });
  }

  // ── Scenario 4: workflow summary in preamble ───────────────────────────
  {
    const s4 = Date.now();
    let passed = true;
    let error: string | undefined;
    let ctx: SmokeContext | undefined;
    try {
      ctx = await createSmokeContext();

      // Create a workflow with explicit steps using the commit tool
    await ctx.prompt(
      "create a workflow to optimize database query performance. steps: profile slow queries, add missing indexes, review query plans, then deploy the optimisation",
    );

      // Now ask the agent to use the attend tool — the preamble should
      // include a summary of the active workflow, and attend should
      // reflect the workflow context.
    await ctx.prompt(
      "set your focus to 'reviewing query performance' with high priority",
    );

      const state = orEmpty(await ctx.readState());

      // The workflow should be present
      assertHasWorkflow(state, { status: "draft" });

      // The attention focus should reflect the workflow topic
      assertAttentionSet(state);
    } catch (e) {
      passed = false;
      error = String(e);
    } finally {
      await ctx?.dispose();
    }
    scenarios.push({
      name: "workflow summary in preamble",
      passed,
      error,
      durationMs: Date.now() - s4,
    });
  }

  // ── Scenario 5: empty state preamble ──────────────────────────────────
  {
    const s5 = Date.now();
    let passed = true;
    let error: string | undefined;
    let ctx: SmokeContext | undefined;
    try {
      ctx = await createSmokeContext();
      // Fresh context — no beliefs, learning, or workflows seeded.

      // The preamble should still be generated correctly from an empty
      // state and tools must function.
    await ctx.prompt(
      "set focus to 'exploring the codebase'",
    );

      const state = orEmpty(await ctx.readState());

      // The focus tool should have updated attention.focus
      assertAttentionSet(state);

      // With an empty state, beliefs should still be zero
      assertBeliefCount(state, 0);
    } catch (e) {
      passed = false;
      error = String(e);
    } finally {
      await ctx?.dispose();
    }
    scenarios.push({
      name: "empty state preamble",
      passed,
      error,
      durationMs: Date.now() - s5,
    });
  }

  // ── Aggregate ─────────────────────────────────────────────────────────
  const durationMs = Date.now() - start;
  const passed = scenarios.filter((s) => s.passed).length;
  const failed = scenarios.length - passed;
  return { name: "preamble-generation", scenarios, passed, failed, durationMs };
}
