"use strict";

import { mock, describe, it, expect, beforeEach } from "bun:test";
import { createMockPi, toExtensionAPI, type MockPi } from "../../helpers/mock-pi.js";
import { cleanPersistedState } from "../../helpers/fixtures.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";

const lifecycleCalls: Array<{
  projectRoot: string;
  options: Record<string, unknown> | undefined;
}> = [];

/** Startup step call order tracking for stale-state resilience tests. */
const startupSteps: string[] = [];
let resolveStartupDone: (() => void) | undefined;
let startupDone: Promise<void> = Promise.resolve();
/** Simulate a one-time transaction conflict on the hydrate step (retry succeeds). */
let simulateConflictOnce = false;
/** Simulate a persistent transaction conflict on the hydrate step (both attempts fail). */
let simulateConflictAlways = false;

function resetStartupTracking(): void {
  startupSteps.length = 0;
  startupDone = new Promise<void>(resolve => { resolveStartupDone = resolve; });
  simulateConflictOnce = false;
  simulateConflictAlways = false;
}

mock.module("../../../src/infrastructure/graphify-client.js", () => ({
  tryLifecycleGraphUpdate: async (
    projectRoot: string,
    _stateManager: unknown,
    options?: Record<string, unknown>,
  ) => {
    lifecycleCalls.push({ projectRoot, options });
    startupSteps.push("graph");
    return true;
  },
}));

mock.module("../../../src/application/use-cases/hydrate-from-memory.js", () => ({
  HydrateFromMemoryUseCase: class {
    uow: { commit: () => Promise<void> };
    constructor(uow: { commit: () => Promise<void> }) {
      this.uow = uow;
    }
    async execute(_runtime: NoesisRuntime) {
      if (simulateConflictAlways) {
        throw new Error("Transaction conflict: state.json was modified by another process since last load.");
      }
      if (simulateConflictOnce) {
        simulateConflictOnce = false;
        throw new Error("Transaction conflict: state.json was modified by another process since last load.");
      }
      await this.uow.commit();
      startupSteps.push("hydrate");
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
      await this.uow.commit();
      startupSteps.push("reconcile");
      resolveStartupDone?.();
      return { revisionCount: 0, orphanedCount: 0, delta: null };
    }
  },
}));

import { registerSessionStartHook } from "../../../src/hooks/session-start-hook.js";
import { registerSessionShutdownHook } from "../../../src/hooks/session-shutdown-hook.js";
import { registerTurnEndHook } from "../../../src/hooks/turn-end-hook.js";

let pi: MockPi;
let runtime: NoesisRuntime;

beforeEach(async () => {
  cleanPersistedState();
  lifecycleCalls.length = 0;
  resetStartupTracking();
  pi = createMockPi();
  runtime = await createRuntime(toExtensionAPI(pi));
});

describe("lifecycle graph refresh hooks", () => {
  it("session_start triggers a background refresh with rebuild on missing graph", async () => {
    registerSessionStartHook(toExtensionAPI(pi), runtime);

    const handler = pi._getHooks("session_start")[0]!;
    await handler({});
    await startupDone;

    expect(lifecycleCalls).toHaveLength(1);
    expect(lifecycleCalls[0]!.options).toEqual({
      allowFreshGraph: false,
      fullRebuildOnNoGraph: true,
      timeout: 120000,
    });
  });

  it("session_shutdown refreshes stale graphs without requiring auto-update", async () => {
    registerSessionShutdownHook(toExtensionAPI(pi), runtime);

    const handler = pi._getHooks("session_shutdown")[0]!;
    await handler({});

    expect(lifecycleCalls).toHaveLength(1);
    expect(lifecycleCalls[0]!.options).toEqual({
      requireAutoUpdate: false,
      requireStale: true,
    });
  });

  it("turn_end refreshes stale graphs after cleanup", async () => {
    registerTurnEndHook(toExtensionAPI(pi), runtime);

    const handler = pi._getHooks("turn_end")[0]!;
    await handler({});

    expect(lifecycleCalls).toHaveLength(1);
    expect(lifecycleCalls[0]!.options).toEqual({
      requireStale: true,
    });
  });
});


describe("startup stale-state resilience", () => {
  it("retries hydrate step once on transaction conflict and completes all steps in order", async () => {
    simulateConflictOnce = true;
    registerSessionStartHook(toExtensionAPI(pi), runtime);
    const handler = pi._getHooks("session_start")[0]!;

    await handler({});
    await startupDone;

    // All three steps run in order despite the one-time conflict on hydrate
    expect(startupSteps).toEqual(["graph", "hydrate", "reconcile"]);
  });

  it("isolates a persistently-conflicting hydrate step so graph and reconcile still run", async () => {
    simulateConflictAlways = true;
    registerSessionStartHook(toExtensionAPI(pi), runtime);
    const handler = pi._getHooks("session_start")[0]!;

    await handler({});
    await startupDone;

    // Hydrate is skipped after 2 failed conflict-retry attempts;
    // graph and reconcile still complete
    expect(startupSteps).toEqual(["graph", "reconcile"]);
  });
});