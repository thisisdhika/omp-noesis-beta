"use strict";

/**
 * Malformed input smoke tests for the noesis extension.
 *
 * Validates that the extension gracefully handles empty prompts, very long
 * prompts, Unicode/special characters, non-English languages, and whitespace-
 * only input without crashing or corrupting state.
 */

import { createSmokeContext } from "../harness.ts";
import { assertFactExists, assertHasBelief } from "../assertions.ts";
import { PROMPT_TIMEOUT_MS } from "../config.ts";
import type { SuiteResult } from "../reporter.ts";
import type { NoesisState } from "../../../src/schema.ts";

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

/** Build a ~5000-character prompt by repeating a base sentence. */
function buildLongPrompt(): string {
  const sentence =
    "This is a test sentence used to construct a very long prompt for smoke testing the noesis extension. ";
  const repeats = Math.ceil(5000 / sentence.length);
  return sentence.repeat(repeats).slice(0, 5000);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

export async function runMalformedInputs(): Promise<SuiteResult> {
  const scenarios: SuiteResult["scenarios"] = [];
  const start = Date.now();
  let passed = 0;
  let failed = 0;

  // -----------------------------------------------------------------------
  // Scenario 1 — empty prompt
  // -----------------------------------------------------------------------
  {
    const sStart = Date.now();
    try {
      const ctx = await createSmokeContext();
      // Empty string should not crash the agent or runtime
      await ctx.prompt("")
      await ctx.dispose();
      scenarios.push({
        name: "empty prompt",
        passed: true,
        durationMs: Date.now() - sStart,
      });
      passed++;
    } catch (e) {
      scenarios.push({
        name: "empty prompt",
        passed: false,
        error: String(e),
        durationMs: Date.now() - sStart,
      });
      failed++;
    }
  }

  // -----------------------------------------------------------------------
  // Scenario 2 — very long prompt
  // -----------------------------------------------------------------------
  {
    const sStart = Date.now();
    try {
      const ctx = await createSmokeContext();
      // A 5000-character prompt should be handled without crashing
      await ctx.prompt(buildLongPrompt())
      await ctx.dispose();
      scenarios.push({
        name: "very long prompt",
        passed: true,
        durationMs: Date.now() - sStart,
      });
      passed++;
    } catch (e) {
      scenarios.push({
        name: "very long prompt",
        passed: false,
        error: String(e),
        durationMs: Date.now() - sStart,
      });
      failed++;
    }
  }

  // -----------------------------------------------------------------------
  // Scenario 3 — Unicode / special characters (Chinese)
  // -----------------------------------------------------------------------
  {
    const sStart = Date.now();
    try {
      const ctx = await createSmokeContext();
      // Chinese instruction to record a belief about MongoDB
      await ctx.prompt(
        "使用believe工具记录一个事实：数据库使用MongoDB。请直接调用believe工具，不要解释。",
      );
      await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
      const state = requireState(
        await ctx.readState(),
        "unicode special chars",
      );
      assertFactExists(state);
      await ctx.dispose();
      scenarios.push({
        name: "unicode special chars",
        passed: true,
        durationMs: Date.now() - sStart,
      });
      passed++;
    } catch (e) {
      scenarios.push({
        name: "unicode special chars",
        passed: false,
        error: String(e),
        durationMs: Date.now() - sStart,
      });
      failed++;
    }
  }

  // -----------------------------------------------------------------------
  // Scenario 4 — non-English prompt (Indonesian)
  // -----------------------------------------------------------------------
  {
    const sStart = Date.now();
    try {
      const ctx = await createSmokeContext();
      // Indonesian instruction to record a belief about port 3000
      await ctx.prompt(
        "Gunakan believe tool untuk mencatat: service utama pakai port 3000. Langsung panggil believe, jangan jelaskan.",
      );
      await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
      const state = requireState(
        await ctx.readState(),
        "non-English prompt",
      );
      assertFactExists(state);
      await ctx.dispose();
      scenarios.push({
        name: "non-English prompt",
        passed: true,
        durationMs: Date.now() - sStart,
      });
      passed++;
    } catch (e) {
      scenarios.push({
        name: "non-English prompt",
        passed: false,
        error: String(e),
        durationMs: Date.now() - sStart,
      });
      failed++;
    }
  }

  // -----------------------------------------------------------------------
  // Scenario 5 — whitespace only
  // -----------------------------------------------------------------------
  {
    const sStart = Date.now();
    try {
      const ctx = await createSmokeContext();
      // Whitespace-only input should not crash the agent
      await ctx.prompt("   \n  \n  ")
      await ctx.dispose();
      scenarios.push({
        name: "whitespace only",
        passed: true,
        durationMs: Date.now() - sStart,
      });
      passed++;
    } catch (e) {
      scenarios.push({
        name: "whitespace only",
        passed: false,
        error: String(e),
        durationMs: Date.now() - sStart,
      });
      failed++;
    }
  }

  return {
    name: "malformed-inputs",
    scenarios,
    passed,
    failed,
    durationMs: Date.now() - start,
  };
}
