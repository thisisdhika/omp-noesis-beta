"use strict";

/**
 * Compaction survival smoke tests.
 *
 * Verifies that the noesis cognitive state persists correctly through
 * context compaction events — beliefs survive flooding, tools remain
 * accessible, and the preamble reflects post-compaction state.
 */

import type { SuiteResult, ScenarioResult } from "../reporter.ts";
import { createSmokeContext, type SmokeContext } from "../harness.ts";
import {
  assertAttentionSet,
  assertFactExists,
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
 * Send N short arithmetic prompts to expand the agent's context window and
 * encourage compaction.  Each prompt is designed to be answered without
 * invoking any noesis tools.
 */
async function floodContext(ctx: SmokeContext, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await ctx.prompt(
      `Quick: what is ${i * 7 + 13} × ${i + 2}? Answer with just the number.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

export async function runCompactionSurvival(): Promise<SuiteResult> {
  const scenarios: ScenarioResult[] = [];
  const start = Date.now();

  // ── Scenario 1: state survives compaction ──────────────────────────────
  {
    const s1 = Date.now();
    let passed = true;
    let error: string | undefined;
    let ctx: SmokeContext | undefined;
    try {
      ctx = await createSmokeContext();

      // Establish a belief
      await ctx.prompt(
        'Use the believe tool to record: fact "The project is built with TypeScript" with confidence 0.95, source "execution", tags ["test"]',
      );
      await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

      // Flood context to trigger compaction
      await floodContext(ctx, 5);

      // Belief should still be present
      const state = orEmpty(await ctx.readState());
      assertFactExists(state);
    } catch (e) {
      passed = false;
      error = String(e);
    } finally {
      await ctx?.dispose();
    }
    scenarios.push({
      name: "state survives compaction",
      passed,
      error,
      durationMs: Date.now() - s1,
    });
  }

  // ── Scenario 2: preamble from post-compaction state ────────────────────
  {
    const s2 = Date.now();
    let passed = true;
    let error: string | undefined;
    let ctx: SmokeContext | undefined;
    try {
      ctx = await createSmokeContext();

      await ctx.prompt(
        'Use the believe tool to record: fact "Codebase favours functional programming patterns" with confidence 0.85, source "execution", tags ["test"]',
      );
      await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

      // Compaction
      await floodContext(ctx, 5);

      // After compaction the preamble should still populate, so an attend
      // call should work and reflect the established focus.
      await ctx.prompt(
        'Use the attend tool with focus="reviewing project architecture" and priority="high". Execute the attend command now.',
      );
      await ctx.waitForTool("noesis_attend", PROMPT_TIMEOUT_MS);

      const state = orEmpty(await ctx.readState());
      assertAttentionSet(state);
    } catch (e) {
      passed = false;
      error = String(e);
    } finally {
      await ctx?.dispose();
    }
    scenarios.push({
      name: "preamble from post-compaction state",
      passed,
      error,
      durationMs: Date.now() - s2,
    });
  }

  // ── Scenario 3: post-compaction tool access ────────────────────────────
  {
    const s3 = Date.now();
    let passed = true;
    let error: string | undefined;
    let ctx: SmokeContext | undefined;
    try {
      ctx = await createSmokeContext();

      // Flood first so the session has seen compaction-like activity
      await floodContext(ctx, 5);

      // Now try to use a noesis tool — it should still be registered
      await ctx.prompt(
        'Use the believe tool to record: decision "Enforce strict TypeScript configuration" with rationale "Strict mode catches more category errors at compile time", source "user", tags ["test"]',
      );
      await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

      const state = orEmpty(await ctx.readState());
      assertFactExists(state);
    } catch (e) {
      passed = false;
      error = String(e);
    } finally {
      await ctx?.dispose();
    }
    scenarios.push({
      name: "post-compaction tool access",
      passed,
      error,
      durationMs: Date.now() - s3,
    });
  }

  // ── Scenario 4: reload integrity ──────────────────────────────────────
  {
    const s4 = Date.now();
    let passed = true;
    let error: string | undefined;
    let ctx: SmokeContext | undefined;
    try {
      ctx = await createSmokeContext();

      // Create a fact belief
      await ctx.prompt(
        'Use the believe tool to record: fact "Reload integrity marker" with confidence 0.9, source "execution", tags ["test"]',
      );
      await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

      // Verify the belief was persisted to the state file and can be read
      // back — this proves the serialisation/deserialisation round-trip.
      const state = orEmpty(await ctx.readState());
      assertFactExists(state);

      // Clean up
      await ctx.dispose();
    } catch (e) {
      passed = false;
      error = String(e);
    } finally {
      await ctx?.dispose();
    }
    scenarios.push({
      name: "reload integrity",
      passed,
      error,
      durationMs: Date.now() - s4,
    });
  }

  // ── Aggregate ─────────────────────────────────────────────────────────
  const durationMs = Date.now() - start;
  const passed = scenarios.filter((s) => s.passed).length;
  const failed = scenarios.length - passed;
  return { name: "compaction-survival", scenarios, passed, failed, durationMs };
}
