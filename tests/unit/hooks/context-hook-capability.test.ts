"use strict";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createMockPi, toExtensionAPI, type MockPi } from "../../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { createTempDir } from "../../helpers/temp-dir.js";
import { registerContextHook } from "../../../src/hooks/context-hook.js";
import { writeFileSync, mkdirSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { buildPreamble } from "../../../src/rendering/preamble-builder.js";
import { EMPTY_STATE } from "../../../src/shared/schema.js";
import type { RenderContext } from "../../../src/shared/schema.js";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Create a minimal graphify-out/graph.json with optional stale mtime. */
function createGraphFile(root: string, staleHours = 0): void {
  const graphDir = join(root, "graphify-out");
  mkdirSync(graphDir, { recursive: true });
  const graphPath = join(graphDir, "graph.json");
  writeFileSync(graphPath, JSON.stringify({ version: 1 }));
  if (staleHours > 0) {
    const past = new Date(Date.now() - staleHours * 60 * 60 * 1000);
    utimesSync(graphPath, past, past);
  }
}

/** Ensure .omp/noesis dir exists under root so state manager can init. */
function ensureStateDir(root: string): void {
  mkdirSync(join(root, ".omp", "noesis"), { recursive: true });
}

/**
 * Extract preamble text from a context event handler result.
 * Returns empty string when the result does not have the expected shape.
 */
function extractPreambleText(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  if (!("messages" in raw)) return "";
  const msgs = raw.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) return "";
  const first = msgs[0];
  if (!first || typeof first !== "object") return "";
  if (!("content" in first)) return "";
  const content = first.content;
  if (!Array.isArray(content) || content.length === 0) return "";
  const c = content[0];
  if (!c || typeof c !== "object") return "";
  if (!("text" in c) || typeof c.text !== "string") return "";
  return c.text;
}

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

let pi: MockPi;
let runtime: NoesisRuntime;
let root: string;
let cleanupRoot: () => void;

beforeEach(async () => {
  const td = createTempDir();
  root = td.path;
  cleanupRoot = td.cleanup;
  ensureStateDir(root);

  pi = createMockPi();
  runtime = await createRuntime(toExtensionAPI(pi), root);
  registerContextHook(toExtensionAPI(pi), runtime);
});

afterEach(() => {
  cleanupRoot();
});

// --------------------------------------------------------------------------
// Tests — context capability refresh with real graph files
// --------------------------------------------------------------------------

describe("context capability refresh", () => {
  it("re-detects graph capability when graph state changes between turns", async () => {
    // Start with no graph → preamble shows NO_GRAPH
    const handler = pi._getHooks("context")[0]!;
    const result1 = await handler({
      messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "turn one" }] }],
    });
    const preamble1 = extractPreambleText(result1);
    expect(preamble1).toContain("[Noesis: NO_GRAPH");

    // Create a fresh graph → preamble shows FULL
    createGraphFile(root);
    const result2 = await handler({
      messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "turn two" }] }],
    });
    const preamble2 = extractPreambleText(result2);
    expect(preamble2).toContain("[Noesis: FULL");
  });
});

// --------------------------------------------------------------------------
describe("stale graph freshness in preamble", () => {
  it("renders STALE preamble text with stale hours", () => {
    const renderContext: RenderContext = {
      capabilityLevel: "STALE",
      contextHookFired: true,
      graphFreshness: {
        isStale: true,
        staleHours: 30,
      },
    };
    const preamble = buildPreamble(EMPTY_STATE, renderContext);

    expect(preamble).toContain("[Noesis: STALE — graph");
    expect(preamble).toContain("30h stale, review needed]");
  });

  it("renders NO_GRAPH when no graph file exists", () => {
    // No graph file → detectCapability returns NO_GRAPH
    const handler = pi._getHooks("context")[0]!;
    const result = await handler({
      messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "test" }] }],
    });
    const preambleText = extractPreambleText(result);
    expect(preambleText).toContain("[Noesis: NO_GRAPH — graph not built]");
  });
});
    // The exact hour number may vary ±1 depending on execution timing
    expect(preambleText).toMatch(/graph\s+(29|30|31)h\s+stale/);
  });

  it("renders NO_GRAPH when no graph file exists", async () => {
    // No graph file created → detectCapability returns NO_GRAPH
    const handler = pi._getHooks("context")[0]!;
    const result = await handler({
      messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "test" }] }],
    });
    const preambleText = extractPreambleText(result);

    expect(preambleText).toContain("[Noesis: NO_GRAPH — graph not built]");
  });
});
