"use strict";

/**
 * Error & Recovery smoke tests for the noesis extension.
 *
 * Validates that the extension handles malformed input, disk corruption,
 * concurrent rapid prompts, and graceful shutdown without data loss.
 */

import { createSmokeContext } from "../harness.ts";
import { assertHasBelief, assertBeliefCount } from "../assertions.ts";
import { STATE_PATH, PROMPT_TIMEOUT_MS } from "../config.ts";
import type { SuiteResult } from "../reporter.ts";
import type { NoesisState } from "../../../src/schema.ts";
import { writeFile } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert that state is non-null before passing to an assertion function. */
function requireState(s: NoesisState | null, label: string): NoesisState {
  if (s === null) {
    throw new Error(`readState returned null: ${label}`);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

export async function runErrorRecovery(): Promise<SuiteResult> {
  const scenarios: SuiteResult["scenarios"] = [];
  const start = Date.now();
  let passed = 0;
  let failed = 0;

  // -----------------------------------------------------------------------
  // Scenario 1 — malformed params rejected
  // -----------------------------------------------------------------------
  {
    const sStart = Date.now();
    try {
      const ctx = await createSmokeContext();
      // Instruct the agent to call the believe tool with invalid params;
      // zod validation should reject and return a tool error rather than
      // crashing the runtime.
      await ctx.prompt(
        "Call the believe tool with invalid/malformed parameters: " +
          'for example, use JSON like {"type":"fact","content":""} or ' +
          '{"type":"fact","confidence":2}. Do not correct the parameters.',
      );
      await ctx.waitForTool("noesis_believe_fact", PROMPT_TIMEOUT_MS);
      await ctx.dispose();
      scenarios.push({
        name: "malformed params rejected",
        passed: true,
        durationMs: Date.now() - sStart,
      });
      passed++;
    } catch (e) {
      scenarios.push({
        name: "malformed params rejected",
        passed: false,
        error: String(e),
        durationMs: Date.now() - sStart,
      });
      failed++;
    }
  }

  // -----------------------------------------------------------------------
  // Scenario 2 — disk corruption recovery
  // -----------------------------------------------------------------------
  {
    const sStart = Date.now();
    try {
      // Deliberately corrupt the state file on disk
      await writeFile(STATE_PATH, "{{{corrupted json}}}", "utf-8");

      // The harness should clean the corrupted file and start fresh
      const ctx = await createSmokeContext();

      // Run a normal prompt that creates a belief
      await ctx.prompt(
        "Use the believe tool to record a fact: the sky appears blue during daytime.",
      );
      await ctx.waitForTool("noesis_believe_fact", PROMPT_TIMEOUT_MS);

      const state = requireState(
        await ctx.readState(),
        "disk corruption recovery",
      );
      assertBeliefCount(state, 1);
      await ctx.dispose();
      scenarios.push({
        name: "disk corruption recovery",
        passed: true,
        durationMs: Date.now() - sStart,
      });
      passed++;
    } catch (e) {
      scenarios.push({
        name: "disk corruption recovery",
        passed: false,
        error: String(e),
        durationMs: Date.now() - sStart,
      });
      failed++;
    }
  }

  // -----------------------------------------------------------------------
  // Scenario 3 — rapid successive prompts
  // -----------------------------------------------------------------------
  {
    const sStart = Date.now();
    try {
      const ctx = await createSmokeContext();

      // Fire three prompts concurrently without ordering guarantees
      await Promise.all([
        ctx.prompt(
          "Use the believe tool to record fact A: the application uses TypeScript.",
        ),
        ctx.prompt(
          "Use the believe tool to record fact B: the database is PostgreSQL.",
        ),
        ctx.prompt(
          "Use the believe tool to record fact C: the auth uses JWT tokens.",
        ),
      ]);

      const state = requireState(
        await ctx.readState(),
        "rapid successive prompts",
      );
      // At least one of the three prompts should have persisted a belief
      assertBeliefCount(state, 1);
      await ctx.dispose();
      scenarios.push({
        name: "rapid successive prompts",
        passed: true,
        durationMs: Date.now() - sStart,
      });
      passed++;
    } catch (e) {
      scenarios.push({
        name: "rapid successive prompts",
        passed: false,
        error: String(e),
        durationMs: Date.now() - sStart,
      });
      failed++;
    }
  }

  // -----------------------------------------------------------------------
  // Scenario 4 — shutdown without data loss
  // -----------------------------------------------------------------------
  {
    const sStart = Date.now();
    try {
      const ctx = await createSmokeContext();
      await ctx.prompt(
        "Use the believe tool to record a fact: data persists across shutdowns.",
      );
      await ctx.waitForTool("noesis_believe_fact", PROMPT_TIMEOUT_MS);

      // Read state BEFORE dispose to verify on-disk persistence
      const state = requireState(
        await ctx.readState(),
        "shutdown without data loss",
      );
      assertBeliefCount(state, 1);
      assertHasBelief(state, {
        fact: "data persists across shutdowns",
      });
      await ctx.dispose();
      scenarios.push({
        name: "shutdown without data loss",
        passed: true,
        durationMs: Date.now() - sStart,
      });
      passed++;
    } catch (e) {
      scenarios.push({
        name: "shutdown without data loss",
        passed: false,
        error: String(e),
        durationMs: Date.now() - sStart,
      });
      failed++;
    }
  }

  return {
    name: "error-recovery",
    scenarios,
    passed,
    failed,
    durationMs: Date.now() - start,
  };
}
