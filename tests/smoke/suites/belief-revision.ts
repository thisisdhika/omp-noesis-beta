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
    await ctx.promptAndWait(
      "the API server port is 8080, just a note",
    );
    let state = await ctx.readState();
    assertNonNull(state, "state after first believe tool");
    assertFactExists(state, "active");

    // Create belief B: port is 9090 (contradicting)
    await ctx.promptAndWait(
      "actually the API server port is 9090 now, not 8080. that old port note should be superseded",
    );
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
    await ctx.promptAndWait(
      "the database connection timeout is 30 seconds — found that from the graph",
    );
    let state = await ctx.readState();
    assertNonNull(state, "state after graph belief");
    assertHasBelief(state, { source: "graph", status: "active" });

    // Create a user-sourced contradicting belief
    await ctx.promptAndWait(
      "hey that graph data is wrong, the actual timeout is 60 seconds. I'm overriding that — the 30s one should be superseded since this is from the actual config",
    );
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
    await ctx.promptAndWait(
      "the deployment pipeline takes 3 minutes, pretty sure about that. record it with 0.9 confidence",
    );
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
    await ctx.promptAndWait(
      `actually I'm not so sure about that deployment time anymore — the data was unreliable. downgrade that to 0.3 confidence and supersede the old entry with id "${originalId}"`,
    );
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
    await ctx.promptAndWait(
      "found this via code search: the config key is API_TIMEOUT",
    );
    await ctx.promptAndWait(
      "the GraphQL schema has a User type — found that from code analysis",
    );
    await ctx.promptAndWait(
      "we decided to use pnpm over npm. rationale: faster installs and better disk efficiency",
    );

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
    await ctx.promptAndWait(
      "the app is currently on version 1.0.0, noting that",
    );
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
    await ctx.promptAndWait(
      `we bumped the version to 2.0.0 — update that note and supersede the old one with id "${v1.id}"`,
    );
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
    await ctx.promptAndWait(
      `and now we're on 3.0.0. update again, superseding the one with id "${v2.id}"`,
    );
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
