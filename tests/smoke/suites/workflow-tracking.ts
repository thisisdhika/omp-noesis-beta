"use strict";

/**
 * Workflow Tracking Smoke Suite
 *
 * Tests the full workflow lifecycle: creation, step progression, abandonment,
 * multi-item isolation within the commitment layer, metadata extraction, and
 * recall queries.
 */

import { createSmokeContext } from "../harness.ts";
import { assertHasWorkflow, assertWorkflowExists, AssertionError } from "../assertions.ts";
import { PROMPT_TIMEOUT_MS } from "../config.ts";
import type { SuiteResult, ScenarioResult } from "../reporter.ts";
import type { NoesisState } from "../../../src/schema.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect all step statuses as a map keyed by description. */
function stepStatuses(state: NoesisState): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of state.commitment.workflow.steps) {
    map[s.description] = s.status;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

export async function runWorkflowTracking(): Promise<SuiteResult> {
  const scenarios: ScenarioResult[] = [];
  const start = Date.now();

  // 1: draft workflow creation via commit extend_workflow
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();
      await ctx.prompt(
        [
          'Use the commit tool in "extend_workflow" mode to create a workflow with',
          'goal "Build auth module" and steps ["Design schema", "Implement login", "Write tests"].',
          'Leave the status as default draft.',
        ].join(" "),
      );
      await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);
      const state = await ctx.readState();
      if (!state) throw new AssertionError("state file not found after prompt");
      assertHasWorkflow(state, { status: "draft" });
      scenarios.push({ name: "draft workflow creation", passed: true, durationMs: Date.now() - s });
    } catch (e) {
      scenarios.push({ name: "draft workflow creation", passed: false, error: String(e), durationMs: Date.now() - s });
    } finally {
      await ctx?.dispose();
    }
  }

  // 2: step progression — mark step active then done
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();

      // Create a workflow with steps
      await ctx.prompt(
        'Use the commit tool in "extend_workflow" mode to create a workflow with goal "Deploy pipeline" and steps ["Setup CI", "Run tests", "Deploy"].',
      );
      await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);

      // Mark the first step as active
      await ctx.prompt(
        'Use the commit tool in "update_step" mode to mark step "Setup CI" as active.',
      );
      await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);

      // Mark the first step as done
      await ctx.prompt(
        'Use the commit tool in "update_step" mode to mark step "Setup CI" as done.',
      );
      await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);

      const state = await ctx.readState();
      if (!state) throw new AssertionError("state file not found after progression");
      const statuses = stepStatuses(state);
      if (statuses["Setup CI"] !== "done") {
        throw new AssertionError(`expected step "Setup CI" status "done", found "${statuses["Setup CI"]}"`);
      }

      scenarios.push({ name: "step progression", passed: true, durationMs: Date.now() - s });
    } catch (e) {
      scenarios.push({ name: "step progression", passed: false, error: String(e), durationMs: Date.now() - s });
    } finally {
      await ctx?.dispose();
    }
  }

  // 3: abandon step — mark a step as skipped
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();

      // Create a workflow with several steps
      await ctx.prompt(
        'Use the commit tool in "extend_workflow" mode to create a workflow with goal "Refactor module" and steps ["Audit code", "Rewrite core", "Update tests"].',
      );
      await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);

      // Skip the middle step
      await ctx.prompt(
        'Use the commit tool in "update_step" mode to mark step "Rewrite core" as skipped.',
      );
      await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);

      const state = await ctx.readState();
      if (!state) throw new AssertionError("state file not found after abandon");
      const statuses = stepStatuses(state);
      if (statuses["Rewrite core"] !== "skipped") {
        throw new AssertionError(
          `expected step "Rewrite core" status "skipped", found "${statuses["Rewrite core"]}"`,
        );
      }

      scenarios.push({ name: "abandon step", passed: true, durationMs: Date.now() - s });
    } catch (e) {
      scenarios.push({ name: "abandon step", passed: false, error: String(e), durationMs: Date.now() - s });
    } finally {
      await ctx?.dispose();
    }
  }

  // 4: multi-workflow isolation — workflow + planned actions coexist independently
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();

      // Create a workflow
      await ctx.prompt(
        'Use the commit tool in "extend_workflow" mode to create a workflow with goal "Payment integration" and steps ["API design", "Implement"].',
      );
      await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);

      // Add planned actions
      await ctx.prompt(
        'Use the commit tool in "add_action" mode to add a planned action "Research PCI compliance" with priority "high". Then add another action "Review third-party SDK" with priority "normal".',
      );
      await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);

      const state = await ctx.readState();
      if (!state) throw new AssertionError("state file not found after multi-workflow");
      // Verify the workflow exists with its goal
      assertWorkflowExists(state);
      // Verify independently-tracked actions exist
      if (state.commitment.actions.length < 2) {
        throw new AssertionError(
          `expected at least 2 planned actions, found ${state.commitment.actions.length}`,
        );
      }

      scenarios.push({ name: "multi-workflow isolation", passed: true, durationMs: Date.now() - s });
    } catch (e) {
      scenarios.push({ name: "multi-workflow isolation", passed: false, error: String(e), durationMs: Date.now() - s });
    } finally {
      await ctx?.dispose();
    }
  }

  // 5: metadata extraction — action with explicit priority
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();
      await ctx.prompt(
        'Use the commit tool in "add_action" mode to add a planned action "Fix login timeout bug" with priority "critical".',
      );
      await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);
      const state = await ctx.readState();
      if (!state) throw new AssertionError("state file not found after prompt");
      if (state.commitment.actions.length === 0) {
        throw new AssertionError("expected at least one planned action in state");
      }
      const action = state.commitment.actions.find((a) => a.content.includes("Fix login timeout bug"));
      if (!action) {
        throw new AssertionError(
          `expected action with content containing "Fix login timeout bug", found: [${state.commitment.actions.map((a) => JSON.stringify(a.content)).join(", ")}]`,
        );
      }
      if (action.priority !== "critical") {
        throw new AssertionError(
          `expected action priority "critical", found "${action.priority}" for action "${action.content}"`,
        );
      }
      scenarios.push({ name: "metadata extraction", passed: true, durationMs: Date.now() - s });
    } catch (e) {
      scenarios.push({ name: "metadata extraction", passed: false, error: String(e), durationMs: Date.now() - s });
    } finally {
      await ctx?.dispose();
    }
  }

  // 6: recall workflow — prompt agent to use recall for workflow status
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();

      // First create a workflow so there is something to recall
      await ctx.prompt(
        'Use the commit tool in "extend_workflow" mode to create a workflow with goal "Notification service" and steps ["Setup queue", "Send emails"].',
      );
      await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);

      // Now ask the agent to recall the workflow
      await ctx.prompt('Use the recall tool with query "current_workflow" to show me the current workflow status.');
      await ctx.waitForTool("noesis_recall", PROMPT_TIMEOUT_MS);

      scenarios.push({ name: "recall workflow", passed: true, durationMs: Date.now() - s });
    } catch (e) {
      scenarios.push({ name: "recall workflow", passed: false, error: String(e), durationMs: Date.now() - s });
    } finally {
      await ctx?.dispose();
    }
  }

  return {
    name: "workflow-tracking",
    scenarios,
    passed: scenarios.filter((s) => s.passed).length,
    failed: scenarios.filter((s) => !s.passed).length,
    durationMs: Date.now() - start,
  };
}
