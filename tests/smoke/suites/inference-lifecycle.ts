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
      "hey I'm wondering if the memory leak is from unclosed database connections — add that as a hypothesis so we can track it",
    );
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
      "I think the memory leak might be caused by unclosed database connections. add that as a hypothesis",
    );
    let state = await ctx.readState();
    assertNonNull(state, "state after add_hypothesis");
    if (state.inference.hypotheses.length < 1) {
      throw new AssertionError("expected at least one hypothesis after first prompt");
    }

    // Now confirm it — the agent should use the hypothesis id from its own context
    await ctx.prompt(
      "so I checked the heap dump and found 47 unclosed connections. that pretty much confirms it — update the memory leak hypothesis to confirmed with that as evidence",
    );
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
      "I've got a theory — the high CPU might be from excessive GC. add it as a hypothesis so we can test it",
    );
    let state = await ctx.readState();
    assertNonNull(state, "state after add_hypothesis");
    if (state.inference.hypotheses.length < 1) {
      throw new AssertionError("expected at least one hypothesis after first prompt");
    }

    // Now refute it
    await ctx.prompt(
      "ran heap profiling and GC pauses are under 20ms which is totally normal. so high CPU isn't from GC — lets refute that hypothesis and note the evidence",
    );
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
      "I suspect the API latency might be from slow DNS resolution. capture that as a hypothesis",
    );
    let state = await ctx.readState();
    assertNonNull(state, "state after add_hypothesis");
    if (state.inference.hypotheses.length < 1) {
      throw new AssertionError("expected at least one hypothesis after first prompt");
    }

    // Now abandon it
    await ctx.prompt(
      "actually we checked and DNS is fine, the latency is from something else. abandon the DNS hypothesis for now",
    );
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
      "looking at the logs, the auth service starts before the DB service. pretty sure it's a race condition — auth.init() calls db.connect() before the DB is ready. log that as a reasoning step with relatesTo 'auth-startup-race'",
    );
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
      "I think the payment service is failing because of a timeout in the external gateway call. add that as a hypothesis",
    );
    let state = await ctx.readState();
    assertNonNull(state, "state after add_hypothesis");
    if (state.inference.hypotheses.length < 1) {
      throw new AssertionError("expected at least one hypothesis after first prompt");
    }

    // Confirm it — this should auto-promote to a belief with source "inference"
    await ctx.prompt(
      "confirmed — the gateway timeout threshold is 5s but external calls average 7s. update the payment service hypothesis to confirmed with that evidence",
    );
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
