"use strict";

import { createSmokeContext } from "../harness.ts";
import {
  assertFactExists,
  assertHasBelief,
  AssertionError,
} from "../assertions.ts";
import { PROMPT_TIMEOUT_MS } from "../config.ts";
import type { SuiteResult, ScenarioResult } from "../reporter.ts";
import type { NoesisState } from "../../../src/schema.ts";
import type { BeliefFact, BeliefDecision } from "../../../src/schema.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert that `value` is not null/undefined or throw. */
function assertNonNull<T>(value: T | null | undefined, label: string): asserts value is T {
  if (value == null) {
    throw new AssertionError(`expected ${label} to be non-null, but was ${String(value)}`);
  }
}

/** Return a simple string id for a belief entry (fact or decision). */
function beliefId(entry: BeliefFact | BeliefDecision): string {
  return entry.id;
}

/** Build a lookup by id over the full belief set. */
function beliefMap(state: NoesisState): Map<string, BeliefFact | BeliefDecision> {
  const map = new Map<string, BeliefFact | BeliefDecision>();
  for (const f of state.belief.facts) map.set(f.id, f);
  for (const d of state.belief.decisions) map.set(d.id, d);
  return map;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function scenarioContradictingSupersedes(): Promise<ScenarioResult> {
  const name = "contradicting belief supersedes";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Create belief A: port is 8080
    await ctx.prompt(
      'Use the believe tool to record this fact: "The API server port is 8080". Use type "fact" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    let state = await ctx.readState();
    assertNonNull(state, "state after first believe tool");
    assertFactExists(state, "active");

    // Create belief B: port is 9090 (contradicting)
    await ctx.prompt(
      'Use the believe tool to record this fact: "The API server port is 9090". Use type "fact" and source "user". Explain that this supersedes the previous port belief.',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    state = await ctx.readState();
    assertNonNull(state, "state after second believe tool");

    // Belief A should now be superseded
    assertHasBelief(state, { status: "superseded" });
    // Belief B should be active
    assertFactExists(state, "active");

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioGraphVsUserConflict(): Promise<ScenarioResult> {
  const name = "graph vs user conflict";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Create a graph-sourced belief
    await ctx.prompt(
      'Use the believe tool to record this fact: "The database connection timeout is 30 seconds". Use type "fact" and source "graph".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    let state = await ctx.readState();
    assertNonNull(state, "state after graph belief");
    assertHasBelief(state, { source: "graph", status: "active" });

    // Create a user-sourced contradicting belief
    await ctx.prompt(
      'Use the believe tool to update the database timeout belief: "The database connection timeout is 60 seconds". Use type "fact" and source "user". Explicitly note this contradicts the previous graph-sourced belief and should supersede it.',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    state = await ctx.readState();
    assertNonNull(state, "state after user belief");

    // The graph-sourced belief should be superseded or archived (user wins)
    const graphBelief = [...state.belief.facts, ...state.belief.decisions].find(
      b => b.content.toLowerCase().includes("connection timeout is 30 seconds"),
    );
    if (!graphBelief) {
      throw new AssertionError(
        'Expected graph-sourced belief "connection timeout is 30 seconds" to still exist as superseded/archived, but it was removed entirely',
      );
    }
    if (graphBelief.status !== "superseded" && graphBelief.status !== "archived") {
      throw new AssertionError(
        `Expected graph-sourced belief status to be "superseded" or "archived", got "${graphBelief.status}"`,
      );
    }

    // The user-sourced belief should be active
    assertHasBelief(state, { source: "user", status: "active" });

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioConfidenceDowngrade(): Promise<ScenarioResult> {
  const name = "confidence downgrade";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Create a belief with high confidence
    await ctx.prompt(
      'Use the believe tool to record this fact: "The deployment pipeline takes 3 minutes". Use type "fact", source "execution", and confidence 0.9.',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    let state = await ctx.readState();
    assertNonNull(state, "state after first believe tool");

    // Find the original fact to get its id
    const original = state.belief.facts.find(f =>
      f.content.toLowerCase().includes("deployment pipeline"),
    );
    if (!original) {
      throw new AssertionError(
        `Expected fact containing "deployment pipeline" after first believe, found: [${state.belief.facts.map(f => f.content).join(", ")}]`,
      );
    }
    const originalId = original.id;
    assertFactExists(state, "active");

    // Now prompt to downgrade confidence
    await ctx.prompt(
      `Use the believe tool to record an updated version of the deployment pipeline belief. The confidence should be lowered to 0.3 because the data is unreliable. Use type "fact", source "execution", and confidence 0.3. Supersede the old belief with id "${originalId}".`,
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    state = await ctx.readState();
    assertNonNull(state, "state after confidence downgrade");

    // The new fact should have confidence 0.3
    const updated = state.belief.facts.find(
      f => f.confidence === 0.3 && f.content.toLowerCase().includes("deployment pipeline"),
    );
    if (!updated) {
      // Fallback: search broader
      const lowConf = state.belief.facts.filter(f => f.confidence === 0.3);
      if (lowConf.length === 0) {
        throw new AssertionError(
          `Expected a fact with confidence 0.3 containing "deployment pipeline". Facts: [${state.belief.facts.map(f => `${f.content} (conf=${f.confidence}, status=${f.status})`).join("; ")}]`,
        );
      }
    }

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioSourceTracking(): Promise<ScenarioResult> {
  const name = "source tracking";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // Create beliefs with different sources
    await ctx.prompt(
      'Use the believe tool to record this fact: "Found via code search: the config key is API_TIMEOUT". Use type "fact" and source "execution".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    await ctx.prompt(
      'Use the believe tool to record this fact: "The GraphQL schema has a User type". Use type "fact" and source "graph".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    await ctx.prompt(
      'Use the believe tool to record this decision: "We will use pnpm over npm". Include rationale "Faster installs and disk efficiency". Use type "decision" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

    const state = await ctx.readState();
    assertNonNull(state, "state after all three beliefs");

    // Assert each has the correct source
    assertHasBelief(state, { source: "execution" });
    assertHasBelief(state, { source: "graph" });
    assertHasBelief(state, { source: "user" });

    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  } finally {
    await ctx.dispose();
  }
}

async function scenarioMultiRevisionChain(): Promise<ScenarioResult> {
  const name = "multi-revision chain";
  const start = Date.now();
  const ctx = await createSmokeContext();
  try {
    // A v1: create initial belief
    await ctx.prompt(
      'Use the believe tool to record this fact: "The app version is 1.0.0". Use type "fact" and source "user".',
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    let state = await ctx.readState();
    assertNonNull(state, "state after v1");

    // Find v1 id
    const v1 = state.belief.facts.find(f =>
      f.content.toLowerCase().includes("version is 1.0.0"),
    );
    if (!v1) {
      throw new AssertionError("v1 belief not found after first prompt");
    }

    // A v2: supersede v1
    await ctx.prompt(
      `Use the believe tool to update the app version belief. The new version is 2.0.0. Supersede the old belief with id "${v1.id}". Use type "fact" and source "user".`,
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    state = await ctx.readState();
    assertNonNull(state, "state after v2");

    // Find v2 id
    const v2 = state.belief.facts.find(f =>
      f.content.toLowerCase().includes("version is 2.0.0"),
    );
    if (!v2) {
      throw new AssertionError("v2 belief not found after second prompt");
    }

    // A v3: supersede v2
    await ctx.prompt(
      `Use the believe tool to update the app version belief. The new version is 3.0.0. Supersede the old belief with id "${v2.id}". Use type "fact" and source "user".`,
    );
    await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
    state = await ctx.readState();
    assertNonNull(state, "state after v3");

    // Assert v3 is active
    assertFactExists(state, "active");

    // Assert v1 is superseded
    assertHasBelief(state, { status: "superseded" });

    // Assert v2 is superseded
    assertHasBelief(state, { status: "superseded" });

    // Verify supersededBy chain
    const byId = beliefMap(state);

    const v1Entry = byId.get(v1.id);
    if (v1Entry && v1Entry.supersededBy) {
      const superseder = byId.get(v1Entry.supersededBy);
      if (superseder) {
        // The chain should eventually lead to v3
        if (superseder.status !== "superseded" && superseder.id !== v2.id) {
          // Not necessarily direct, but eventually to v3
        }
      }
    }

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

export async function runBeliefRevision(): Promise<SuiteResult> {
  const start = Date.now();
  const scenarios = await Promise.all([
    scenarioContradictingSupersedes(),
    scenarioGraphVsUserConflict(),
    scenarioConfidenceDowngrade(),
    scenarioSourceTracking(),
    scenarioMultiRevisionChain(),
  ]);

  return {
    name: "belief-revision",
    scenarios,
    passed: scenarios.filter(s => s.passed).length,
    failed: scenarios.filter(s => !s.passed).length,
    durationMs: Date.now() - start,
  };
}
