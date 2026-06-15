"use strict";

/**
 * Learning Loop Smoke Suite
 *
 * Tests the learning lifecycle: capture from tool failures, diagnosis,
 * escalation, ranking, dedup, and full captured → diagnosed → resolved
 * progression.
 */

import { createSmokeContext } from "../harness.ts";
import { assertHasLearning, assertLearningCount, AssertionError } from "../assertions.ts";
import { PROMPT_TIMEOUT_MS } from "../config.ts";
import type { SuiteResult, ScenarioResult } from "../reporter.ts";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

export async function runLearningLoop(): Promise<SuiteResult> {
  const scenarios: ScenarioResult[] = [];
  const start = Date.now();

  // 1: failed bash captures learning
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();
      await ctx.prompt('Run a command that will fail: "bash -c exit 1" using the bash tool.');
      await ctx.waitForTool("bash", PROMPT_TIMEOUT_MS);
      const state = await ctx.readState();
      if (!state) throw new AssertionError("state file not found after prompt");
      assertHasLearning(state, { status: "captured" });
      scenarios.push({ name: "failed bash captures learning", passed: true, durationMs: Date.now() - s });
    } catch (e) {
      scenarios.push({ name: "failed bash captures learning", passed: false, error: String(e), durationMs: Date.now() - s });
    } finally {
      await ctx?.dispose();
    }
  }

  // 2: bug diagnosis from error output
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();
      await ctx.prompt(
        [
          'Run the failing Node.js command: node -e "throw new Error(\'DB timeout after 30s\')" using bash.',
          'Then use the believe tool with type "learning" to diagnose the failure:',
          'provide a rootCause of "Database connection pool exhausted"',
          'and a fix of "Increase pool size and add retry logic".',
        ].join(" "),
      );
      await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
      const state = await ctx.readState();
      if (!state) throw new AssertionError("state file not found after prompt");
      const all = [...state.learning.failures, ...state.learning.successes];
      const diagnosed = all.find((e) => e.rootCause);
      if (!diagnosed) {
        throw new AssertionError(
          `expected learning entry with rootCause field populated, found ${all.length} entries: ${all.map((e) => `${e.id}(${e.status})`).join(", ")}`,
        );
      }
      scenarios.push({ name: "bug diagnosis from error output", passed: true, durationMs: Date.now() - s });
    } catch (e) {
      scenarios.push({ name: "bug diagnosis from error output", passed: false, error: String(e), durationMs: Date.now() - s });
    } finally {
      await ctx?.dispose();
    }
  }

  // 3: escalation pattern — triggered captured learning → believe(l earning) with rootCause
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();

      // Trigger a tool error so a learning entry is auto-captured
      await ctx.prompt('Run a failing command: node -e "throw new Error(\'tool bug: parser crash\')" using bash.');
      await ctx.waitForTool("bash", PROMPT_TIMEOUT_MS);
      // Ensure state has the captured entry
      const stateAfterCapture = await ctx.readState();
      if (!stateAfterCapture) throw new AssertionError("state file not found after capture prompt");
      assertHasLearning(stateAfterCapture, { status: "captured" });

      // Now escalate/diagnose the captured entry via believe type "learning"
      await ctx.prompt(
        [
          'Use the recall tool with query "relevant_learning" to find the recent learning entry,',
          'then use the believe tool with type "learning" to diagnose the failure:',
          'provide its learningId, a rootCause of "Null pointer in parser dispatch",',
          'and a fix of "Add null check before dispatch".',
        ].join(" "),
      );
      await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
      const state = await ctx.readState();
      if (!state) throw new AssertionError("state file not found after escalation prompt");
      assertHasLearning(state, { status: "diagnosed" });
      scenarios.push({ name: "escalation pattern", passed: true, durationMs: Date.now() - s });
    } catch (e) {
      scenarios.push({ name: "escalation pattern", passed: false, error: String(e), durationMs: Date.now() - s });
    } finally {
      await ctx?.dispose();
    }
  }

  // 4: ranking by impact — multiple failures → recall ranked → verify entries
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();
      await ctx.prompt(
        [
          'Run three different failing commands to create multiple learning entries:',
          'first "bash -c exit 1",',
          'then node -e "throw new Error(\'critical failure\')",',
          'then "bash -c \'exit 2\'".',
          'Finally use the recall tool with query "relevant_learning" to query the ranked learning entries.',
        ].join(" "),
      );
      await ctx.waitForTool("noesis_recall", PROMPT_TIMEOUT_MS);
      const state = await ctx.readState();
      if (!state) throw new AssertionError("state file not found after prompt");
      // At least one learning entry should exist from the three failures
      assertLearningCount(state, 1);
      // Check that we actually got multiple distinct entries (no single dedup swallowed everything)
      const all = [...state.learning.failures, ...state.learning.successes];
      const unique = new Set(all.map((e) => e.id));
      if (unique.size < 2) {
        throw new AssertionError(
          `expected at least 2 distinct learning entries for ranking, found ${unique.size}: ${Array.from(unique).join(", ")}`,
        );
      }
      scenarios.push({ name: "ranking by impact", passed: true, durationMs: Date.now() - s });
    } catch (e) {
      scenarios.push({ name: "ranking by impact", passed: false, error: String(e), durationMs: Date.now() - s });
    } finally {
      await ctx?.dispose();
    }
  }

  // 5: dedup prevention — same failure pattern twice → only one learning entry
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();
      await ctx.prompt(
        'Run the exact same failing command twice to trigger learning capture: first "bash -c exit 1", then "bash -c exit 1" again.',
      );
      // Wait for the first bash tool execution end; the prompt will have run both
      await ctx.waitForTool("bash", PROMPT_TIMEOUT_MS);
      const state = await ctx.readState();
      if (!state) throw new AssertionError("state file not found after prompt");
      assertLearningCount(state, 1);
      scenarios.push({ name: "dedup prevention", passed: true, durationMs: Date.now() - s });
    } catch (e) {
      scenarios.push({ name: "dedup prevention", passed: false, error: String(e), durationMs: Date.now() - s });
    } finally {
      await ctx?.dispose();
    }
  }

  // 6: lifecycle progression — captured → diagnosed → resolved
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();

      // Step 1: trigger a failure to capture a learning entry
      await ctx.prompt('Run "bash -c exit 1" using bash to trigger a learning capture.');
      await ctx.waitForTool("bash", PROMPT_TIMEOUT_MS);
      let state = await ctx.readState();
      if (!state) throw new AssertionError("state file not found after capture prompt");
      assertHasLearning(state, { status: "captured" });

      // Step 2: diagnose the captured entry (captured → diagnosed)
      await ctx.prompt(
        [
          'Use the recall tool with query "relevant_learning" to find the captured learning entry,',
          'then use the believe tool with type "learning" to diagnose it:',
          'provide a rootCause of "Script returned non-zero exit code"',
          'and a fix of "Handle exit codes properly with error checking".',
        ].join(" "),
      );
      await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
      state = await ctx.readState();
      if (!state) throw new AssertionError("state file not found after diagnose prompt");
      assertHasLearning(state, { status: "diagnosed" });

      // Step 3: resolve the diagnosed entry (diagnosed → resolved).
      // Use believe type "learning" again with a fix to mark it resolved.
      await ctx.prompt(
        [
          'Use the recall tool to find the diagnosed learning entry,',
          'then use the believe tool with type "learning" to mark it as resolved:',
          'provide the learningId and fix of "Exit code check implemented".',
        ].join(" "),
      );
      await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
      state = await ctx.readState();
      if (!state) throw new AssertionError("state file not found after resolve prompt");
      assertHasLearning(state, { status: "resolved" });

      scenarios.push({ name: "lifecycle progression", passed: true, durationMs: Date.now() - s });
    } catch (e) {
      scenarios.push({ name: "lifecycle progression", passed: false, error: String(e), durationMs: Date.now() - s });
    } finally {
      await ctx?.dispose();
    }
  }

  return {
    name: "learning-loop",
    scenarios,
    passed: scenarios.filter((s) => s.passed).length,
    failed: scenarios.filter((s) => !s.passed).length,
    durationMs: Date.now() - start,
  };
}
