"use strict";

import { mock, describe, it, expect, beforeEach } from "bun:test";
import { createMockPi, toExtensionAPI, type MockPi } from "../../helpers/mock-pi.js";
import { cleanPersistedState } from "../../helpers/fixtures.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";

const capabilityCalls: string[] = [];

mock.module("../../../src/infrastructure/graphify-client.js", () => ({
  detectCapability: async (projectRoot: string) => {
    capabilityCalls.push(projectRoot);
    return capabilityCalls.length === 1 ? "NO_GRAPH" : "FULL";
  },
}));

import { registerContextHook } from "../../../src/hooks/context-hook.js";

let pi: MockPi;
let runtime: NoesisRuntime;

beforeEach(async () => {
  cleanPersistedState();
  capabilityCalls.length = 0;
  pi = createMockPi();
  runtime = await createRuntime(toExtensionAPI(pi));
  registerContextHook(toExtensionAPI(pi), runtime);
});

describe("context capability refresh", () => {
  it("re-detects graph capability on every context event", async () => {
    const handler = pi._getHooks("context")[0]!;

    await handler({ messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "one" }] }] });
    await handler({ messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "two" }] }] });

    expect(capabilityCalls).toHaveLength(2);
  });
});
