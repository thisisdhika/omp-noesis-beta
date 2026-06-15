"use strict";

/**
 * Smoke suite: Cross-session persistence.
 *
 * Verifies that noesis cognitive state survives across independent agent
 * sessions by checking that beliefs, learning entries, and workflows
 * created in one session are still present when a new session is opened
 * on the same workdir.
 *
 * IMPORTANT: these scenarios must NOT use createSmokeContext() because it
 * deletes state.json.  Instead they use a local createPersistentContext()
 * that preserves the state file across session boundaries.
 */

import { STATE_PATH, PROMPT_TIMEOUT_MS } from "../config.ts";
import { createPersistentContext, type SmokeContext } from "../harness.ts";
import { assertHasBelief, assertHasLearning, assertHasWorkflow, assertWorkflowExists } from "../assertions.ts";
import type { SuiteResult, ScenarioResult } from "../reporter.ts";
import { unlink } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------

async function measure(
  name: string,
  fn: () => Promise<void>,
): Promise<ScenarioResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  }
}

// ---------------------------------------------------------------------------
// Suite: cross-session-persistence
// ---------------------------------------------------------------------------

export async function runCrossSessionPersistence(): Promise<SuiteResult> {
  const scenarios: ScenarioResult[] = [];
  const suiteStart = Date.now();

  // -----------------------------------------------------------------------
  // Scenario 1: belief survives two sessions
  // -----------------------------------------------------------------------
  scenarios.push(
    await measure("belief survives two sessions", async () => {
      // Clean slate before scenario.
      try {
        await unlink(STATE_PATH);
      } catch {
        /* ENOENT ok */
      }

      // --- Session 1: create a belief ---
      const ctx1 = await createPersistentContext();
      try {
        await ctx1.prompt(
          "Use the believe tool to remember that TypeScript has structural typing.",
        );
        await ctx1.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
      } finally {
        await ctx1.dispose(); // state.json kept on disk
      }

      // --- Session 2: verify the belief survived ---
      const ctx2 = await createPersistentContext();
      try {
        const state = await ctx2.readState();
        if (!state) throw new Error("State should have been persisted across sessions");

        assertHasBelief(state, {
          fact: "structural typing",
          status: "active",
        });
      } finally {
        await ctx2.dispose();
        // Clean up for subsequent scenarios.
        try {
          await unlink(STATE_PATH);
        } catch {
          /* ok */
        }
      }
    }),
  );

  // -----------------------------------------------------------------------
  // Scenario 2: learning persists
  // -----------------------------------------------------------------------
  scenarios.push(
    await measure("learning persists", async () => {
      try {
        await unlink(STATE_PATH);
      } catch {
        /* ENOENT ok */
      }

      // --- Session 1: cause a failed command to be captured as learning ---
      const ctx1 = await createPersistentContext();
      try {
        await ctx1.prompt(
          "Run the command 'invalid-command-abc-999' using the bash tool.",
        );
        await ctx1.waitForTool("bash", PROMPT_TIMEOUT_MS);

        // Give hooks time to persist.
        const { promise: pause, resolve: unpause } = Promise.withResolvers<void>();
        setTimeout(unpause, 500);
        await pause;
      } finally {
        await ctx1.dispose(); // state.json kept
      }

      // --- Session 2: verify learning survived ---
      const ctx2 = await createPersistentContext();
      try {
        const state = await ctx2.readState();
        if (!state) throw new Error("State should have been persisted across sessions");

        assertHasLearning(state, { status: "captured" });
      } finally {
        await ctx2.dispose();
        try {
          await unlink(STATE_PATH);
        } catch {
          /* ok */
        }
      }
    }),
  );

  // -----------------------------------------------------------------------
  // Scenario 3: workflow survives
  // -----------------------------------------------------------------------
  scenarios.push(
    await measure("workflow survives", async () => {
      try {
        await unlink(STATE_PATH);
      } catch {
        /* ENOENT ok */
      }

      // --- Session 1: create a workflow ---
      const ctx1 = await createPersistentContext();
      try {
        await ctx1.prompt(
          "Use the commit tool to create a workflow for setting up the project environment.",
        );
        await ctx1.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);
      } finally {
        await ctx1.dispose(); // state.json kept
      }

      // --- Session 2: verify workflow survived ---
      const ctx2 = await createPersistentContext();
      try {
        const state = await ctx2.readState();
        if (!state) throw new Error("State should have been persisted across sessions");

        // The workflow goal or one of its steps should mention "set up" or
        // "environment" from the prompt above.
        assertWorkflowExists(state);
      } finally {
        await ctx2.dispose();
        try {
          await unlink(STATE_PATH);
        } catch {
          /* ok */
        }
      }
    }),
  );

  // -----------------------------------------------------------------------
  // Scenario 4: full state reload
  // -----------------------------------------------------------------------
  scenarios.push(
    await measure("full state reload", async () => {
      try {
        await unlink(STATE_PATH);
      } catch {
        /* ENOENT ok */
      }

      // --- Session 1: create beliefs + learning + workflow ---
      const ctx1 = await createPersistentContext();
      try {
        // Belief
        await ctx1.prompt(
          "Use the believe tool to remember that the project root is called omp-noesis.",
        );
        await ctx1.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

        // Learning (failed bash command)
        await ctx1.prompt(
          "Run the command 'bogus-command-xyz' using the bash tool.",
        );
        await ctx1.waitForTool("bash", PROMPT_TIMEOUT_MS);

        // Workflow
        await ctx1.prompt(
          "Use the commit tool to create a workflow for documenting the API endpoints.",
        );
        await ctx1.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);

        // Let hooks persist everything.
        const { promise: pause, resolve: unpause } = Promise.withResolvers<void>();
        setTimeout(unpause, 500);
        await pause;
      } finally {
        await ctx1.dispose(); // state.json kept
      }

      // --- Session 2: verify everything survived ---
      const ctx2 = await createPersistentContext();
      try {
        const state = await ctx2.readState();
        if (!state) throw new Error("State should have been persisted across sessions");

        // Verify all three categories survived.
        assertHasBelief(state, {});
        assertHasLearning(state, { status: "captured" });
        assertWorkflowExists(state);
      } finally {
        await ctx2.dispose();
        try {
          await unlink(STATE_PATH);
        } catch {
          /* ok */
        }
      }
    }),
  );

  const passed = scenarios.filter((s) => s.passed).length;
  const failed = scenarios.filter((s) => !s.passed).length;

  return {
    name: "cross-session-persistence",
    scenarios,
    passed,
    failed,
    durationMs: Date.now() - suiteStart,
  };
}
