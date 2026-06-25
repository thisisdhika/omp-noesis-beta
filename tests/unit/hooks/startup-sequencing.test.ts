"use strict";

/**
 * omp-noesis: Startup Sequencing Regression Test
 * Version: 1.0.0
 *
 * Verifies that session-start hook steps (graph health, hydration,
 * reconcile) run serially, and that transaction conflict retry works.
 *
 * @module tests/unit/hooks/startup-sequencing
 */

import { mock, describe, it, expect, beforeEach } from "bun:test";
import { createMockPi, toExtensionAPI, type MockPi } from "../../helpers/mock-pi.js";
import { cleanPersistedState } from "../../helpers/fixtures.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";

// ============================================================================
// Module-level mocks — MUST be declared before the imports they shadow.
// These replace the actual graphify client and use-case modules so the
// test can track call ordering without side effects.
// ============================================================================

const callOrder: string[] = [];

// Resolver for a promise that fires when the last startup step completes.
// Tests await this instead of wall-clock timers.
let resolveStartupComplete: (() => void) | undefined;
let startupComplete: Promise<void>;

function makeStartupPromise(): void {
  startupComplete = new Promise<void>((resolve) => {
    resolveStartupComplete = resolve;
  });
}

mock.module("../../../src/infrastructure/graphify-client.js", () => ({
  tryLifecycleGraphUpdate: async () => {
    callOrder.push("graph");
    return true;
  },
}));

// Track whether use-case commits encountered transaction conflicts.
let hydrateConflictError: Error | null = null;
let reconcileConflictError: Error | null = null;

function resetConflictTrackers(): void {
  hydrateConflictError = null;
  reconcileConflictError = null;
}

mock.module("../../../src/application/use-cases/hydrate-from-memory.js", () => ({
  HydrateFromMemoryUseCase: class {
    uow: { commit: () => Promise<void> };
    constructor(uow: { commit: () => Promise<void> }) {
      this.uow = uow;
    }
    async execute(_runtime: NoesisRuntime) {
      try {
        await this.uow.commit();
      } catch (err: unknown) {
        hydrateConflictError = err instanceof Error ? err : new Error(String(err));
        throw err;
      }
      callOrder.push("hydrate");
      return { imported: 0, skipped: 0, status: { backend: "test", searchable: true, writable: true } };
    }
  },
}));

mock.module("../../../src/application/use-cases/reconcile-with-graph.js", () => ({
  ReconcileWithGraphUseCase: class {
    uow: { commit: () => Promise<void> };
    constructor(uow: { commit: () => Promise<void> }) {
      this.uow = uow;
    }
    async execute(_runtime: NoesisRuntime) {
      try {
        await this.uow.commit();
      } catch (err: unknown) {
        reconcileConflictError = err instanceof Error ? err : new Error(String(err));
        throw err;
      }
      callOrder.push("reconcile");
      resolveStartupComplete?.();
      return { revisionCount: 0, orphanedCount: 0, delta: null };
    }
  },
}));

// ============================================================================
// Import under test — MUST come AFTER mock.module declarations
// ============================================================================

import * as sessionStartHook from "../../../src/hooks/session-start-hook.js";

// ============================================================================
// Setup
// ============================================================================

let pi: MockPi;
let runtime: NoesisRuntime;

beforeEach(async () => {
  cleanPersistedState();
  callOrder.length = 0;
  resetConflictTrackers();
  makeStartupPromise();
  pi = createMockPi();
  runtime = await createRuntime(toExtensionAPI(pi));
});

// ============================================================================
// Tests
// ============================================================================

describe("startup sequencing", () => {
  it("serializes graph update, hydration, and reconcile in order", async () => {
    sessionStartHook.registerSessionStartHook(toExtensionAPI(pi), runtime);
    const handler = pi._getHooks("session_start")[0]!;

    await handler({});
    await startupComplete;

    expect(callOrder).toEqual(["graph", "hydrate", "reconcile"]);
  });

  it("completes all steps without transaction conflict", async () => {
    sessionStartHook.registerSessionStartHook(toExtensionAPI(pi), runtime);
    const handler = pi._getHooks("session_start")[0]!;

    await handler({});
    await startupComplete;

    expect(hydrateConflictError).toBeNull();
    expect(reconcileConflictError).toBeNull();
  });
});

// ============================================================================
// withConflictRetry unit tests
// ============================================================================

describe("withConflictRetry", () => {
  it("retries once on transaction conflict and returns result", async () => {
    let attempts = 0;
    const result = await sessionStartHook.withConflictRetry(
      "test",
      async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error("Transaction conflict: state.json was modified by another process since last load.");
        }
        return 42;
      },
      async () => {},
    );
    expect(attempts).toBe(2);
    expect(result).toBe(42);
  });

  it("returns undefined when both attempts conflict", async () => {
    let invalidateCalled = false;
    const result = await sessionStartHook.withConflictRetry(
      "test",
      async () => {
        throw new Error("Transaction conflict: state.json was modified by another process since last load.");
      },
      async () => {
        invalidateCalled = true;
      },
    );
    expect(invalidateCalled).toBe(true);
    expect(result).toBeUndefined();
  });

  it("returns undefined on non-conflict error", async () => {
    let invalidateCalled = false;
    const result = await sessionStartHook.withConflictRetry(
      "test",
      async () => {
        throw new Error("Something else broke");
      },
      async () => {
        invalidateCalled = true;
      },
    );
    expect(invalidateCalled).toBe(false);
    expect(result).toBeUndefined();
  });

  it("returns result on first success", async () => {
    const result = await sessionStartHook.withConflictRetry(
      "test",
      async () => "ok",
      async () => { throw new Error("should not be called"); },
    );
    expect(result).toBe("ok");
  });

  it("does not retry on non-transaction error", async () => {
    let attempts = 0;
    await sessionStartHook.withConflictRetry(
      "test",
      async () => {
        attempts++;
        throw new Error("Disk failure");
      },
      async () => {},
    );
    expect(attempts).toBe(1);
  });
});
