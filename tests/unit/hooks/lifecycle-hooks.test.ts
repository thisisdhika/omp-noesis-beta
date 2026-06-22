"use strict";

import { mock, describe, it, expect, beforeEach } from "bun:test";
import { createMockPi, toExtensionAPI, type MockPi } from "../../helpers/mock-pi.js";
import { cleanPersistedState } from "../../helpers/fixtures.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";

const lifecycleCalls: Array<{
  projectRoot: string;
  options: Record<string, unknown> | undefined;
}> = [];

mock.module("../../../src/infrastructure/graphify-client.js", () => ({
  tryLifecycleGraphUpdate: async (
    projectRoot: string,
    _stateManager: unknown,
    options?: Record<string, unknown>,
  ) => {
    lifecycleCalls.push({ projectRoot, options });
    return true;
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
  pi = createMockPi();
  runtime = await createRuntime(toExtensionAPI(pi));
});

describe("lifecycle graph refresh hooks", () => {
  it("session_start triggers a background refresh with rebuild on missing graph", async () => {
    registerSessionStartHook(toExtensionAPI(pi), runtime);

    const handler = pi._getHooks("session_start")[0]!;
    await handler({});

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
