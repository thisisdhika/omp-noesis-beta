"use strict";

import { createSmokeContext } from "../harness.ts";
import {
  assertHasBelief,
  assertFactExists,
  AssertionError,
} from "../assertions.ts";
import { PROMPT_TIMEOUT_MS } from "../config.ts";
import type { SuiteResult, ScenarioResult } from "../reporter.ts";
import type { NoesisState } from "../../../src/schema.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert that `value` is not null/undefined or throw. */
function assertNonNull<T>(value: T | null | undefined, label: string): asserts value is T {
  if (value == null) {
    throw new AssertionError(`expected ${label} to be non-null, but was ${String(value)}`);
  }
}

/**
 * Assert that at least one hypothesis whose content contains `substr`
 * (case-insensitive) has the given `status`.
 */
function assertHasHypothesis(state: NoesisState, substr: string, status: string): void {
  const match = state.inference.hypotheses.find(
    h => h.content.toLowerCase().includes(substr.toLowerCase()) && h.status === status,
  );
  if (match) return;

  const parts: string[] = ["expected hypothesis with"];
  parts.push(` content containing "${substr}"`);
  parts.push(` status "${status}"`);

  throw new AssertionError(
    `${parts.join(",").replace(/^,/, "").trim()}, found ${state.inference.hypotheses.length} hypotheses: [` +
    state.inference.hypotheses.map(h => `"${h.content}" (${h.status})`).join(", ") +
    "]",
  );
}

/**
 * Assert that at least one reasoning step whose content contains `substr`
 * (case-insensitive) exists.
 */
function assertHasReasoning(state: NoesisState, substr: string): void {
  const match = state.inference.reasoning.find(
    r => r.content.toLowerCase().includes(substr.toLowerCase()),
  );
  if (match) return;

  throw new AssertionError(
    `expected reasoning step with content containing "${substr}", ` +
    `found ${state.inference.reasoning.length} steps: [` +
    state.inference.reasoning.map(r => `"${r.content}"`).join(", ") +
    "]",
  );
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function scenarioAddHypothesis(): Promise<ScenarioResult> {
  const name = "add hypothesis";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    await ctx.prompt(
      'Use the infer tool with action="add_hypothesis" to record: "The memory leak is caused by unclosed database connections".',
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);
    const state = await ctx.readState();
    assertNonNull(state, "state after add_hypothesis");

    if (state.inference.hypotheses.length < 1) {
      throw new AssertionError("expected at least one hypothesis, but found none");
    }
    assertHasHypothesis(state, "memory leak", "testing");

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioConfirmHypothesis(): Promise<ScenarioResult> {
  const name = "confirm hypothesis";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // First, create a hypothesis
    await ctx.prompt(
      'Use the infer tool with action="add_hypothesis" to record: "The memory leak is caused by unclosed database connections".',
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);
    let state = await ctx.readState();
    assertNonNull(state, "state after add_hypothesis");
    if (state.inference.hypotheses.length < 1) {
      throw new AssertionError("expected at least one hypothesis after first prompt");
    }

    // Now confirm it — the agent should use the hypothesis id from its own context
    await ctx.prompt(
      'Use the infer tool with action="update_hypothesis" to confirm the memory leak hypothesis. Set status="confirmed" and evidence="Found 47 unclosed connections in heap dump". Update the hypothesis with the id from the first call.',
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);
    state = await ctx.readState();
    assertNonNull(state, "state after update_hypothesis");

    // Verify hypothesis status
    const hy = state.inference.hypotheses.find(h =>
      h.content.toLowerCase().includes("memory leak"),
    );
    if (!hy) {
      throw new AssertionError("expected the memory leak hypothesis to exist");
    }
    if (hy.status !== "confirmed") {
      throw new AssertionError(`expected hypothesis status "confirmed", got "${hy.status}"`);
    }
    if (!hy.evidence || !hy.evidence.includes("unclosed connections")) {
      throw new AssertionError(
        `expected evidence containing "unclosed connections", got "${hy.evidence}"`,
      );
    }

    // Verify auto-promote created a belief fact
    assertFactExists(state);

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioRefuteHypothesis(): Promise<ScenarioResult> {
  const name = "refute hypothesis";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // First, create a hypothesis
    await ctx.prompt(
      'Use the infer tool with action="add_hypothesis" to record: "The high CPU usage is caused by excessive garbage collection".',
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);
    let state = await ctx.readState();
    assertNonNull(state, "state after add_hypothesis");
    if (state.inference.hypotheses.length < 1) {
      throw new AssertionError("expected at least one hypothesis after first prompt");
    }

    // Now refute it
    await ctx.prompt(
      'Use the infer tool with action="update_hypothesis" to refute the hypothesis about garbage collection. Set status="refuted" and evidence="Heap profiling shows GC pauses are under 20ms, well within normal range". Update the hypothesis with the id from the first call.',
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);
    state = await ctx.readState();
    assertNonNull(state, "state after update_hypothesis");

    const hy = state.inference.hypotheses.find(h =>
      h.content.toLowerCase().includes("garbage collection"),
    );
    if (!hy) {
      throw new AssertionError("expected the garbage collection hypothesis to exist");
    }
    if (hy.status !== "refuted") {
      throw new AssertionError(
        `expected hypothesis status "refuted", got "${hy.status}"`,
      );
    }

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioAbandonHypothesis(): Promise<ScenarioResult> {
  const name = "abandon hypothesis";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // First, create a hypothesis
    await ctx.prompt(
      'Use the infer tool with action="add_hypothesis" to record: "The API latency is caused by slow DNS resolution".',
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);
    let state = await ctx.readState();
    assertNonNull(state, "state after add_hypothesis");
    if (state.inference.hypotheses.length < 1) {
      throw new AssertionError("expected at least one hypothesis after first prompt");
    }

    // Now abandon it
    await ctx.prompt(
      'Use the infer tool with action="update_hypothesis" to abandon the DNS hypothesis. Set status="abandoned". Update the hypothesis with the id from the first call.',
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);
    state = await ctx.readState();
    assertNonNull(state, "state after update_hypothesis");

    const hy = state.inference.hypotheses.find(h =>
      h.content.toLowerCase().includes("dns"),
    );
    if (!hy) {
      throw new AssertionError("expected the DNS hypothesis to exist");
    }
    if (hy.status !== "abandoned") {
      throw new AssertionError(
        `expected hypothesis status "abandoned", got "${hy.status}"`,
      );
    }

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioAddReasoning(): Promise<ScenarioResult> {
  const name = "add reasoning step";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    await ctx.prompt(
      'Use the infer tool with action="add_reasoning" to record: content="The logs show the auth service starts before the DB service" and reasoning="Race condition: auth.init() calls db.connect() before DB is ready". Use relatesTo="auth-startup-race".',
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);
    const state = await ctx.readState();
    assertNonNull(state, "state after add_reasoning");

    if (state.inference.reasoning.length < 1) {
      throw new AssertionError("expected at least one reasoning step, but found none");
    }
    assertHasReasoning(state, "auth service starts");

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioInferenceChainToBelief(): Promise<ScenarioResult> {
  const name = "inference chain to belief";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Create a hypothesis
    await ctx.prompt(
      'Use the infer tool with action="add_hypothesis" to record: "The payment service fails due to a timeout in the external gateway call".',
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);
    let state = await ctx.readState();
    assertNonNull(state, "state after add_hypothesis");
    if (state.inference.hypotheses.length < 1) {
      throw new AssertionError("expected at least one hypothesis after first prompt");
    }

    // Confirm it — this should auto-promote to a belief with source "inference"
    await ctx.prompt(
      'Use the infer tool with action="update_hypothesis" to confirm the payment service hypothesis. Set status="confirmed" and evidence="Gateway timeout threshold is 5s but external calls average 7s". Update the hypothesis with the id from the first call.',
    );
    await ctx.waitForTool("noesis_infer", PROMPT_TIMEOUT_MS);
    state = await ctx.readState();
    assertNonNull(state, "state after update_hypothesis");

    // Verify hypothesis is confirmed
    const hy = state.inference.hypotheses.find(h =>
      h.content.toLowerCase().includes("payment service"),
    );
    if (!hy) {
      throw new AssertionError("expected the payment service hypothesis to exist");
    }
    if (hy.status !== "confirmed") {
      throw new AssertionError(
        `expected hypothesis status "confirmed", got "${hy.status}"`,
      );
    }

    // Verify auto-promote created a belief fact with the "inference" source
    assertHasBelief(state, { source: "inference" });

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

export async function runInferenceLifecycle(): Promise<SuiteResult> {
  const start = Date.now();
  const scenarios = await Promise.all([
    scenarioAddHypothesis(),
    scenarioConfirmHypothesis(),
    scenarioRefuteHypothesis(),
    scenarioAbandonHypothesis(),
    scenarioAddReasoning(),
    scenarioInferenceChainToBelief(),
  ]);

  return {
    name: "inference-lifecycle",
    scenarios,
    passed: scenarios.filter(s => s.passed).length,
    failed: scenarios.filter(s => !s.passed).length,
    durationMs: Date.now() - start,
  };
}
