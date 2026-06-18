"use strict";

/**
 * Unit tests for context-hook.ts — baseline hook registration and
 * hasMcpGraphify edge cases.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { unlinkSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createMockPi, toExtensionAPI } from "../../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { registerContextHook } from "../../../src/hooks/context-hook.js";
import { cleanPersistedState } from "../../helpers/fixtures.js";
import type { MockPi } from "../../helpers/mock-pi.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let pi: MockPi;
let runtime: NoesisRuntime;

beforeEach(async () => {
  cleanPersistedState();
  pi = createMockPi();
  runtime = await createRuntime(toExtensionAPI(pi));
  registerContextHook(toExtensionAPI(pi), runtime);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerContextHook", () => {
  it("registers a context event handler", () => {
    const hooks = pi._getHooks("context");
    expect(hooks).toHaveLength(1);
    expect(typeof hooks[0]).toBe("function");
  });

  it("prepends preamble message to events", async () => {
    const handler = pi._getHooks("context")[0]!;
    const event = {
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    };
    const result = (await handler(event)) as {
      messages: Array<{
        role: string;
        content: Array<{ type: string; text: string }>;
      }>;
    };

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]!.role).toBe("user");
    expect(result.messages[0]!.content[0]!.text).toContain("Noesis");
    expect(result.messages[1]!.content[0]!.text).toBe("hello");
  });

  it("returns false from hasMcpGraphify when mcp.json has invalid JSON", async () => {
    // Create .omp/mcp.json with corrupt JSON to trigger catch in hasMcpGraphify
    const ompDir = join(runtime.projectRoot, ".omp");
    mkdirSync(ompDir, { recursive: true });
    const mcpPath = join(ompDir, "mcp.json");
    writeFileSync(mcpPath, "{ invalid json content !!! }");

    try {
      const handler = pi._getHooks("context")[0]!;
      const event = {
        messages: [{ role: "user", content: [{ type: "text", text: "test" }] }],
      };
      const result = (await handler(event)) as {
        messages: Array<{
          role: string;
          content: Array<{ type: string; text: string }>;
        }>;
      };

      // Test should succeed even with corrupt mcp.json (catch returns false gracefully)
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]!.content[0]!.text).toContain("Noesis");
      // With corrupt JSON, hasMcpGraphify returns false, so no MCP tool hints
      expect(result.messages[0]!.content[0]!.text).not.toContain(
        "mcp__graphify__query_graph",
      );
    } finally {
      // Clean up mcp.json
      try {
        if (existsSync(mcpPath)) unlinkSync(mcpPath);
      } catch {
        // best-effort cleanup
      }
    }
  });
});
