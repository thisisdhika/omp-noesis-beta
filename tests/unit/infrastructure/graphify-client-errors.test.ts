"use strict";

/**
 * Error-path tests for graphify-client that require module mocking.
 *
 * These tests simulate failure in imported module functions that would
 * otherwise never throw in normal environments (stat always succeeds on
 * existing files; parseQueryOutput returns [] instead of throwing).
 *
 * Module mocks are registered via `mock.module` BEFORE the module is
 * imported (Bun's test runner processes mock.module before resolving
 * module imports, even when it appears later in source text).
 *
 * The tests are isolated to this file via bun --isolate so mocking
 * does not affect other test files.
 */

import { mock, describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { createTempDir } from "../../helpers/temp-dir.js";

// ============================================================================
// Module mocks — registered before imports to ensure graphify-client
// picks up the mocked implementations during module resolution.
// ============================================================================

/** Make stat throw so we can exercise detectCapability's catch block. */
mock.module("node:fs/promises", () => ({
  stat: async () => {
    throw new Error("simulated stat failure");
  },
}));

/** Make parseQueryOutput throw so we can exercise query's catch block. */
mock.module("../../../src/infrastructure/graphify-parser.js", () => ({
  parseQueryOutput: () => {
    throw new Error("simulated parser failure");
  },
}));

// ============================================================================
// Imports — resolved AFTER mock.module is processed by Bun's test runner
// ============================================================================

import {
  detectCapability,
  query,
} from "../../../src/infrastructure/graphify-client.js";

// ============================================================================
// Types
// ============================================================================

interface TempDir {
  path: string;
  cleanup(): void;
}

// ============================================================================
// Helpers
// ============================================================================

function createGraphFile(root: string): void {
  const graphDir = join(root, "graphify-out");
  mkdirSync(graphDir, { recursive: true });
  writeFileSync(join(graphDir, "graph.json"), JSON.stringify({ version: 1 }));
}

// ============================================================================
// Fixtures
// ============================================================================

let tempDir: TempDir;

beforeEach(() => {
  tempDir = createTempDir();
});

afterEach(() => {
  tempDir.cleanup();
});

// ============================================================================
// Tests — detectCapability catch block (line 68)
// ============================================================================

describe("detectCapability error handling", () => {
  it("returns STALE when stat fails via catch block", async () => {
    // Create graph file so we pass validateGraphPath, then the mocked
    // stat throws, which is caught by the catch block returning "STALE".
    createGraphFile(tempDir.path);
    const result = await detectCapability(tempDir.path);
    expect(result).toBe("STALE");
  });
});

// ============================================================================
// Tests — query catch block (lines 128-129)
// ============================================================================

describe("query error handling", () => {
  it("returns error result when parseQueryOutput throws", async () => {
    // Create graph file so query proceeds to the try block, spawn
    // succeeds (CLI is installed), then the mocked parseQueryOutput
    // throws → caught by catch block → error result.
    createGraphFile(tempDir.path);
    const result = await query(tempDir.path, "test question");
    expect(result.findings).toEqual([]);
    expect(result.error).toBe("simulated parser failure");
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});
