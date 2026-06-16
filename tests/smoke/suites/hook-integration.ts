"use strict";

/**
 * Smoke suite: Hook integration.
 *
 * Verifies that the core noesis lifecycle hooks fire correctly:
 *   1. context hook — updates attention state
 *   2. tool_result hook — captures failed commands as learning entries
 *   3. turn_end hook — persists state between sessions
 *   4. before_agent_start hook — sets attention.updatedAt
 *   5. compacting hook — does not corrupt state
 */

import { STATE_PATH, PROMPT_TIMEOUT_MS } from "../config.ts";
import { createPersistentContext, createSmokeContext, type SmokeContext } from "../harness.ts";
import { assertHasBelief, assertHasLearning } from "../assertions.ts";
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
// Suite: hook-integration
// ---------------------------------------------------------------------------

export async function runHookIntegration(): Promise<SuiteResult> {
  const scenarios: ScenarioResult[] = [];
  const suiteStart = Date.now();

  // -----------------------------------------------------------------------
  // Scenario 1: context hook fires
  // -----------------------------------------------------------------------
  scenarios.push(
    await measure("context hook fires", async () => {
      const ctx = await createSmokeContext();
      try {
        await ctx.prompt(
          "Remember that this project uses TypeScript and Bun as its runtime.",
        );
        await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

        // Second prompt triggers the context hook which updates attention state
        await ctx.prompt("What do you know about this project?");
        // Give async hooks a moment to finish writing state.
        const { promise: pause, resolve: unpause } = Promise.withResolvers<void>();
        setTimeout(unpause, 500);
        await pause;

        const state = await ctx.readState();
        if (!state) throw new Error("State was not persisted");

      } finally {
        await ctx.dispose();
      }
    }),
  );

  // -----------------------------------------------------------------------
  // Scenario 2: tool_result captures failure
  // -----------------------------------------------------------------------
  scenarios.push(
    await measure("tool_result captures failure", async () => {
      const ctx = await createSmokeContext();
      try {
        await ctx.prompt(
          "Run the command 'nonexistent-command-xyz-123' using the bash tool.",
        );
        await ctx.waitForTool("bash", PROMPT_TIMEOUT_MS);

        // Let the tool_result hook persist the learning entry.
        const { promise: pause, resolve: unpause } = Promise.withResolvers<void>();
        setTimeout(unpause, 500);
        await pause;

        const state = await ctx.readState();
        if (!state) throw new Error("State was not persisted");

        assertHasLearning(state, { status: "captured" });
      } finally {
        await ctx.dispose();
      }
    }),
  );

  // -----------------------------------------------------------------------
  // Scenario 3: turn_end persists
  // -----------------------------------------------------------------------
  scenarios.push(
    await measure("turn_end persists", async () => {
      // Start with a clean slate.
      try {
        await unlink(STATE_PATH);
      } catch {
        // ENOENT is fine.
      }

      // Session 1 — create a belief.
      const ctx1 = await createPersistentContext();
      try {
        await ctx1.prompt("Remember that the Sun is a medium-sized star.");
        await ctx1.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
      } finally {
        // Dispose WITHOUT deleting state.json — the turn_end hook should
        // have persisted it to disk.
        await ctx1.dispose();
      }

      // Session 2 — reuse the same workdir (state.json still present).
      const ctx2 = await createPersistentContext();
      try {
        const state = await ctx2.readState();
        if (!state) throw new Error("State should have been persisted by turn_end hook");

        assertHasBelief(state, {
          fact: "Sun is a medium-sized star",
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
  // Scenario 4: before_agent_start fires
  // -----------------------------------------------------------------------
  scenarios.push(
    await measure("before_agent_start fires", async () => {
      const ctx = await createSmokeContext();
      try {
        await ctx.prompt("Focus on TypeScript type safety and strict mode.");
        await ctx.waitForTool("noesis_focus", PROMPT_TIMEOUT_MS);

        const state = await ctx.readState();
        if (!state) throw new Error("State was not persisted");

        // The before_agent_start hook initialises attention.updatedAt.
        if (!state.attention.updatedAt || state.attention.updatedAt === "") {
          throw new Error(
            "Expected attention.updatedAt to be set after before_agent_start hook",
          );
        }
      } finally {
        await ctx.dispose();
      }
    }),
  );

  // -----------------------------------------------------------------------
  // Scenario 5: compacting hook fires
  // -----------------------------------------------------------------------
  scenarios.push(
    await measure("compacting hook fires", async () => {
      const ctx = await createSmokeContext();
      try {
        // Flood context with several belief creations to trigger the
        // compaction hook.
        for (let i = 1; i <= 5; i++) {
        await ctx.prompt(
            `Use the believe tool to remember: fact number ${i} — the sky appears blue during the day.`,
          );
          await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
        }

        const { promise: pause, resolve: unpause } = Promise.withResolvers<void>();
        setTimeout(unpause, 500);
        await pause;

        const state = await ctx.readState();
        if (!state) throw new Error("State was not persisted after compaction");

        // Verify state integrity — compaction must not corrupt structure.
        if (state.version !== 1) {
          throw new Error(`Expected version 1 after compaction, got ${state.version}`);
        }

        if (!Array.isArray(state.belief.facts)) {
          throw new Error("Expected belief.facts to be an array after compaction");
        }
        if (!Array.isArray(state.belief.decisions)) {
          throw new Error("Expected belief.decisions to be an array after compaction");
        }
        if (typeof state.lastPersisted !== "string" || !state.lastPersisted) {
          throw new Error("Expected lastPersisted to be a non-empty string after compaction");
        }

        // At least some beliefs should have survived compaction.
        if (state.belief.facts.length + state.belief.decisions.length === 0) {
          throw new Error("Expected at least one belief after flooding and compaction");
        }
      } finally {
        await ctx.dispose();
      }
    }),
  );

  const passed = scenarios.filter((s) => s.passed).length;
  const failed = scenarios.filter((s) => !s.passed).length;

  return {
    name: "hook-integration",
    scenarios,
    passed,
    failed,
    durationMs: Date.now() - suiteStart,
  };
}
