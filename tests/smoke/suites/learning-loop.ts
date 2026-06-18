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
    await ctx.prompt(
      "try this and see what happens: `exit 1` in bash",
    );
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
      "ok so I ran `node -e \"throw new Error('DB timeout after 30s')\"` and it crashed as expected. the root cause is the database connection pool being exhausted — we need to increase the pool size and add retry logic. can you log that as a learning entry?",
    );
      await ctx.waitForTool("noesis_believe_fact", PROMPT_TIMEOUT_MS);
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
    await ctx.prompt(
      "run this failing command real quick: `node -e \"throw new Error('tool bug: parser crash')\"`",
    );
      await ctx.waitForTool("bash", PROMPT_TIMEOUT_MS);
      // Ensure state has the captured entry
      const stateAfterCapture = await ctx.readState();
      if (!stateAfterCapture) throw new AssertionError("state file not found after capture prompt");
      assertHasLearning(stateAfterCapture, { status: "captured" });

      // Now escalate/diagnose the captured entry via believe type "learning"
    await ctx.prompt(
      "find the recent learning entry from that parser crash and diagnose it. root cause is a null pointer in the parser dispatch — needs a null check before dispatch. record that with the believe tool as a learning type",
    );
      await ctx.waitForTool("noesis_believe_fact", PROMPT_TIMEOUT_MS);
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
      "lets run a few different failing commands to stress the learning system a bit. first `exit 1`, then throw a node error `node -e \"throw new Error('critical failure')\"`, then `exit 2`. then pull up what we learned from all of them",
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
      "run the same failing command twice: `exit 1` in bash, then `exit 1` again. wanna see if the system deduplicates",
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
    await ctx.prompt(
      "trigger a learning entry by running a failing command: `exit 1`",
    );
      await ctx.waitForTool("bash", PROMPT_TIMEOUT_MS);
      let state = await ctx.readState();
      if (!state) throw new AssertionError("state file not found after capture prompt");
      assertHasLearning(state, { status: "captured" });

      // Step 2: diagnose the captured entry (captured → diagnosed)
    await ctx.prompt(
      "find the learning entry from that failed command and diagnose it. root cause is the script returned non-zero exit code — fix is to handle exit codes properly with error checking",
    );
      await ctx.waitForTool("noesis_believe_fact", PROMPT_TIMEOUT_MS);
      state = await ctx.readState();
      if (!state) throw new AssertionError("state file not found after diagnose prompt");
      assertHasLearning(state, { status: "diagnosed" });

      // Step 3: resolve the diagnosed entry (diagnosed → resolved).
      // Use believe type "learning" again with a fix to mark it resolved.
    await ctx.prompt(
      "alright we implemented the fix for that exit code issue. find the diagnosed learning entry and mark it as resolved — the fix is 'Exit code check implemented'.",
    );
      await ctx.waitForTool("noesis_believe_fact", PROMPT_TIMEOUT_MS);
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
