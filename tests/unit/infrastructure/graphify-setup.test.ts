"use strict";

/**
 * Unit tests for graphify-setup — skill installation and build invocation.
 *
 * Mocks globalThis.fetch for installGraphifySkill tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { installGraphifySkill, runGraphifyBuild } from "../../../src/infrastructure/graphify-setup.js";
import { createTempDir } from "../../helpers/temp-dir.js";

// ============================================================================
// Helpers
// ============================================================================

interface TempDir {
  path: string;
  cleanup(): void;
}

let tempDir: TempDir;

beforeEach(() => {
  tempDir = createTempDir();
});

afterEach(() => {
  tempDir.cleanup();
});

// ============================================================================
// Tests — installGraphifySkill
// ============================================================================

describe("installGraphifySkill", () => {
  const SKILL_CONTENT = "# Graphify Skill\n\nA test skill.";
  const SKILL_URL = "https://raw.githubusercontent.com/safishamsi/graphify/HEAD/graphify/skill.md";

  it("should download skill file and write it to .omp/skills/graphify/SKILL.md", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL) => {
      expect(url.toString()).toBe(SKILL_URL);
      return new Response(SKILL_CONTENT, { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    try {
      const result = await installGraphifySkill(tempDir.path);
      const expectedPath = join(tempDir.path, ".omp", "skills", "graphify", "SKILL.md");
      expect(result).toBe(expectedPath);
      expect(existsSync(expectedPath)).toBeTrue();
      const content = await Bun.file(expectedPath).text();
      expect(content).toBe(SKILL_CONTENT);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should create the skill directory if it does not exist", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(SKILL_CONTENT, { status: 200 })) as unknown as typeof globalThis.fetch;

    try {
      const skillDir = join(tempDir.path, ".omp", "skills", "graphify");
      expect(existsSync(skillDir)).toBeFalse();

      await installGraphifySkill(tempDir.path);

      expect(existsSync(skillDir)).toBeTrue();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should throw when fetch response is not OK", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("Not Found", { status: 404, statusText: "Not Found" })) as unknown as typeof globalThis.fetch;

    try {
      await expect(installGraphifySkill(tempDir.path)).rejects.toThrow(
        /Failed to download Graphify skill: 404 Not Found/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should re-throw when fetch itself fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("Network failure");
    }) as unknown as typeof globalThis.fetch;

    try {
      await expect(installGraphifySkill(tempDir.path)).rejects.toThrow("Network failure");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================================================
// Tests — runGraphifyBuild
// ============================================================================

describe("runGraphifyBuild", () => {
  it("should return success:false with error message when spawn fails", async () => {
    // Use a non-existent project root to force Bun.spawn to fail
    const result = await runGraphifyBuild(join(tempDir.path, "nonexistent"));
    expect(result.success).toBeFalse();
    expect(typeof result.output).toBe("string");
    expect(result.output.length).toBeGreaterThan(0);
  });
});
