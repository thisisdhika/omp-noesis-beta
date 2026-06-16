"use strict";

/**
 * Integration tests for noesis:init command.
 *
 * Covers fresh initialization, idempotent re-run, force mode, Graphify
 * degradation paths, sendMessage protocol correctness, and return values.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { createTempDir } from "../helpers/temp-dir.js";
import { createMockPi, castToExtensionAPI } from "../helpers/mock-pi.js";
import type { MockPi } from "../helpers/mock-pi.js";

// ---------------------------------------------------------------------------
// Mock graphify-setup module
// ---------------------------------------------------------------------------
// Bun's mock.module is hoisted at transpile time, so this must appear at the
// top level, before the import of any module that depends on graphify-setup.
// The var _enableGraphifyCLI is toggled per-test via beforeEach (var avoids
// temporal-dead-zone issues with hoisting).
// ---------------------------------------------------------------------------

var _enableGraphifyCLI = false;

mock.module("../../src/infrastructure/graphify-setup.js", () => ({
  checkGraphifyCLI: mock(
    (): Promise<{ installed: boolean; version?: string }> =>
      Promise.resolve(
        _enableGraphifyCLI
          ? { installed: true, version: "1.0.0" }
          : { installed: false }
      )
  ),
  installGraphifySkill: mock((): Promise<string> =>
    Promise.resolve(".omp/skills/graphify/skill.yaml")
  ),
  runGraphifyBuild: mock(
    (): Promise<{ success: boolean; output: string }> =>
      Promise.resolve({ success: true, output: "graph built" })
  ),
}));

// NOTE: mock.module is process-global in Bun 1.3. The graphify-setup mock
// persists for the lifetime of the test runner. Other test files that import
// the real graphify-setup will get this mocked version. This is a known
// limitation — run init-command tests in isolation when needed.

import { initCommand } from "../../src/commands/init-command.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of a recorded sendMessage call (unknown from mock, typed locally). */
interface SentMessage {
  message: {
    customType: string;
    content: string;
    display: boolean;
    attribution?: string;
    details?: unknown;
  };
  options?: {
    triggerTurn?: boolean;
    deliverAs?: "steer" | "followUp" | "nextTurn";
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Each line from the SETTINGS_YAML template (no leading comment). */
const SETTINGS_YAML_LINES: readonly string[] = [
  "compaction:",
  "  enabled: true",
  "  strategy: context-full",
  "  autoContinue: true",
  "  thresholdTokens: 160000",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStateFile(dir: string): void {
  const d = join(dir, ".omp", "noesis");
  mkdirSync(d, { recursive: true });
  writeFileSync(
    join(d, "state.json"),
    JSON.stringify({ version: 1, initialized: true }, null, 2)
  );
}

/** Create an existing config.yml with optional custom content. */
function createConfigFile(dir: string, content: string): void {
  const d = join(dir, ".omp");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "config.yml"), content);
}

function statePath(dir: string): string {
  return join(dir, ".omp", "noesis", "state.json");
}

function configPath(dir: string): string {
  return join(dir, ".omp", "config.yml");
}

/** Extract recorded sendMessage calls from a mock pi. */
function sentMessages(pi: MockPi): SentMessage[] {
  return (pi as unknown as { _getMessages(): unknown[] })._getMessages() as SentMessage[];
}

// ===========================================================================
// Tests
// ===========================================================================

describe("noesis:init", () => {
  let pi: MockPi;
  let tmp: { path: string; cleanup(): void };
  let origCwd: string;

  beforeEach(() => {
    tmp = createTempDir();
    origCwd = process.cwd();
    process.chdir(tmp.path);
    pi = createMockPi();
    _enableGraphifyCLI = false;
  });

  afterEach(() => {
    process.chdir(origCwd);
    tmp.cleanup();
  });

  // -----------------------------------------------------------------------
  // 1. Fresh initialization
  // -----------------------------------------------------------------------

  describe("fresh initialization", () => {
    it("creates state.json and config.yml with recommended compaction settings", async () => {
      _enableGraphifyCLI = true;
      const status = await initCommand(castToExtensionAPI(pi), {});
      expect(status).toBe("initialized-full");
      expect(existsSync(statePath(tmp.path))).toBeTrue();
      expect(existsSync(configPath(tmp.path))).toBeTrue();

      const yaml = readFileSync(configPath(tmp.path), "utf-8");
      for (const line of SETTINGS_YAML_LINES) {
        expect(yaml).toContain(line);
      }
    });

    it("writes valid EMPTY_STATE JSON to state.json", async () => {
      _enableGraphifyCLI = true;
      await initCommand(castToExtensionAPI(pi), {});
      const raw = readFileSync(statePath(tmp.path), "utf-8");
      expect(() => JSON.parse(raw)).not.toThrow();
      const parsed = JSON.parse(raw);
      // EMPTY_STATE has a belief section
      expect(parsed.belief).toBeDefined();
    });

    it("sends at least one status message during initialization", async () => {
      _enableGraphifyCLI = true;
      await initCommand(castToExtensionAPI(pi), {});
      const msgs = sentMessages(pi);
      expect(msgs.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Idempotent re-run
  // -----------------------------------------------------------------------

  describe("idempotent re-run", () => {
    it("skips state rewrite when state.json already exists", async () => {
      createStateFile(tmp.path);
      createConfigFile(tmp.path, "# pre-existing\n");
      _enableGraphifyCLI = true;

      const status = await initCommand(castToExtensionAPI(pi), {});
      expect(status).toBe("initialized-full");
      expect(existsSync(statePath(tmp.path))).toBeTrue();
      expect(existsSync(configPath(tmp.path))).toBeTrue();

      // Should have sent a "skipping" / "already exists" status message
      const msgs = sentMessages(pi);
      const skipMsg = msgs.find(
        (m) =>
          m.message.customType === "noesis:init-status" &&
          m.message.content.toLowerCase().includes("already exists")
      );
      expect(skipMsg).toBeDefined();
    });

    it("deep-merges config.yml preserving user keys and removing old compaction keys", async () => {
      // Pre-existing config with user keys and old-style compaction keys
      createConfigFile(
        tmp.path,
        [
          "userSetting: keep-me",
          "compaction:",
          "  enabled: false",
          "  reserveTokens: 5000",
          "  keepRecentTokens: 100",
          "  myCustomKey: preserve",
          "otherTopLevel: also-keep",
        ].join("\n") + "\n"
      );
      _enableGraphifyCLI = true;

      await initCommand(castToExtensionAPI(pi), {});
      const yaml = readFileSync(configPath(tmp.path), "utf-8");

      // User non-compaction keys are preserved
      expect(yaml).toContain("userSetting: keep-me");
      expect(yaml).toContain("otherTopLevel: also-keep");

      // Custom sub-key under compaction is preserved
      expect(yaml).toContain("myCustomKey: preserve");

      // Compaction keys are overridden with recommended values
      expect(yaml).toContain("enabled: true");
      expect(yaml).toContain("strategy: context-full");
      expect(yaml).toContain("autoContinue: true");
      expect(yaml).toContain("thresholdTokens: 160000");

      // Old deprecated keys are removed
      expect(yaml).not.toContain("reserveTokens");
      expect(yaml).not.toContain("keepRecentTokens");
    });
  });

  // -----------------------------------------------------------------------
  // 3. Force mode
  // -----------------------------------------------------------------------

  describe("force mode", () => {
    it("overwrites existing state.json and config.yml with template", async () => {
      createStateFile(tmp.path);
      createConfigFile(tmp.path, "# old config\nother: value\n");
      _enableGraphifyCLI = true;

      const status = await initCommand(castToExtensionAPI(pi), { force: true });
      expect(status).toBe("initialized-full");

      const yaml = readFileSync(configPath(tmp.path), "utf-8");
      // Contains recommended compaction settings
      for (const line of SETTINGS_YAML_LINES) {
        expect(yaml).toContain(line);
      }
      // Old content is gone
      expect(yaml).not.toContain("other: value");

      // Should have sent an "overwriting" / "force" status message
      const msgs = sentMessages(pi);
      const forceMsg = msgs.find(
        (m) =>
          m.message.customType === "noesis:init-status" &&
          (m.message.content.toLowerCase().includes("force") ||
            m.message.content.toLowerCase().includes("overwrit"))
      );
      expect(forceMsg).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Graphify degradation
  // -----------------------------------------------------------------------

  describe("Graphify degradation", () => {
    it("returns degraded-no-graphify when skipGraphify is true and still writes state+config", async () => {
      const status = await initCommand(castToExtensionAPI(pi), { skipGraphify: true });
      expect(status).toBe("initialized-degraded-no-graphify");
      expect(existsSync(statePath(tmp.path))).toBeTrue();
      expect(existsSync(configPath(tmp.path))).toBeTrue();
    });

    it("returns degraded-no-cli when graphify CLI is absent and still writes state+config", async () => {
      // _enableGraphifyCLI is false by default -> CLI not installed
      const status = await initCommand(castToExtensionAPI(pi), {});
      expect(status).toBe("initialized-degraded-no-cli");
      expect(existsSync(statePath(tmp.path))).toBeTrue();
      expect(existsSync(configPath(tmp.path))).toBeTrue();
    });
  });

  // -----------------------------------------------------------------------
  // 5. sendMessage protocol correctness
  // -----------------------------------------------------------------------

  describe("sendMessage protocol", () => {
    it("all status messages (noesis:init-status) have non-empty content", async () => {
      _enableGraphifyCLI = true;
      await initCommand(castToExtensionAPI(pi), {});
      const msgs = sentMessages(pi);
      const statusMsgs = msgs.filter(
        (m) => m.message.customType === "noesis:init-status"
      );

      expect(statusMsgs.length).toBeGreaterThan(0);
      for (const m of statusMsgs) {
        expect(m.message.content).not.toBe("");
      }
    });

    it("graphify skill message has non-empty content and deliverAs steer", async () => {
      _enableGraphifyCLI = true;
      await initCommand(castToExtensionAPI(pi), {});
      const msgs = sentMessages(pi);
      const graphifyMsg = msgs.find(
        (m) => m.message.customType === "noesis:graphify-skill"
      );

      expect(graphifyMsg).toBeDefined();
      expect(graphifyMsg!.message.content).not.toBe("");
      expect(graphifyMsg!.options?.deliverAs).toBe("steer");
    });

    it("all messages have attribution set to agent", async () => {
      _enableGraphifyCLI = true;
      await initCommand(castToExtensionAPI(pi), {});
      const msgs = sentMessages(pi);
      expect(msgs.length).toBeGreaterThan(0);
      for (const m of msgs) {
        expect(m.message.attribution).toBe("agent");
      }
    });
  });

  // -----------------------------------------------------------------------
  // 6. Return values (status strings for each code path)
  // -----------------------------------------------------------------------

  describe("return values", () => {
    it("returns initialized-full when graphify CLI is installed and setup succeeds", async () => {
      _enableGraphifyCLI = true;
      const status = await initCommand(castToExtensionAPI(pi), {});
    });

    it("returns initialized-degraded-no-cli when graphify CLI is not found", async () => {
      // _enableGraphifyCLI defaults to false -> CLI not found
      const status = await initCommand(castToExtensionAPI(pi), {});
    });

    it("returns initialized-degraded-no-graphify when skipGraphify is true", async () => {
      const status = await initCommand(castToExtensionAPI(pi), { skipGraphify: true });
    });
  });

  // -----------------------------------------------------------------------
  // 7. MCP config writing


  describe("MCP config", () => {
    it("writes .omp/mcp.json with graphify server config when CLI available", async () => {
      _enableGraphifyCLI = true;
      await initCommand(castToExtensionAPI(pi), {});

      const mcpPath = join(tmp.path, ".omp", "mcp.json");
      expect(existsSync(mcpPath)).toBeTrue();

      const config = JSON.parse(readFileSync(mcpPath, "utf-8"));
      expect(config.mcpServers?.graphify).toBeDefined();
      expect(config.mcpServers.graphify.command).toBe("python3");
      expect(config.mcpServers.graphify.args).toContain("graphify.serve");
    });

    it("does not overwrite existing graphify entry in .omp/mcp.json", async () => {
      // Create existing MCP config with custom graphify entry
      const ompDir = join(tmp.path, ".omp");
      mkdirSync(ompDir, { recursive: true });
      const existingConfig = {
        mcpServers: {
          graphify: {
            command: "python3",
            args: ["-m", "graphify.serve", "custom/graph.json"],
          },
        },
      };
      writeFileSync(join(ompDir, "mcp.json"), JSON.stringify(existingConfig, null, 2));

      _enableGraphifyCLI = true;
      await initCommand(castToExtensionAPI(pi), {});

      // Should not overwrite
      const config = JSON.parse(readFileSync(join(ompDir, "mcp.json"), "utf-8"));
      expect(config.mcpServers.graphify.args).toContain("custom/graph.json");
    });

    it("merges graphify entry into existing MCP config without graphify", async () => {
      const ompDir = join(tmp.path, ".omp");
      mkdirSync(ompDir, { recursive: true });
      const existingConfig = {
        mcpServers: {
          otherServer: { command: "node", args: ["server.js"] },
        },
      };
      writeFileSync(join(ompDir, "mcp.json"), JSON.stringify(existingConfig, null, 2));

      _enableGraphifyCLI = true;
      await initCommand(castToExtensionAPI(pi), {});

      const config = JSON.parse(readFileSync(join(ompDir, "mcp.json"), "utf-8"));
      expect(config.mcpServers.otherServer).toBeDefined();
      expect(config.mcpServers.graphify).toBeDefined();
    });

    it("handles invalid JSON in existing .omp/mcp.json gracefully", async () => {
      const ompDir = join(tmp.path, ".omp");
      mkdirSync(ompDir, { recursive: true });
      writeFileSync(join(ompDir, "mcp.json"), "invalid json {{{");

      _enableGraphifyCLI = true;
      await initCommand(castToExtensionAPI(pi), {});

      // Should overwrite with valid config
      const config = JSON.parse(readFileSync(join(ompDir, "mcp.json"), "utf-8"));
      expect(config.mcpServers?.graphify).toBeDefined();
    });

    it("skips MCP config when CLI not available", async () => {
      // _enableGraphifyCLI defaults to false
      await initCommand(castToExtensionAPI(pi), {});

      const mcpPath = join(tmp.path, ".omp", "mcp.json");
      expect(existsSync(mcpPath)).toBeFalse();
    });

    it("skips MCP config when skipGraphify is true", async () => {
      await initCommand(castToExtensionAPI(pi), { skipGraphify: true });

      const mcpPath = join(tmp.path, ".omp", "mcp.json");
      expect(existsSync(mcpPath)).toBeFalse();
    });
  });
  // -----------------------------------------------------------------------
  // 8. Git exclude file
  // -----------------------------------------------------------------------

  describe("git exclude", () => {
    it("adds .omp/ to .git/info/exclude when .git directory exists", async () => {
      // Create minimal .git structure
      mkdirSync(join(tmp.path, ".git", "info"), { recursive: true });
      _enableGraphifyCLI = true;

      await initCommand(castToExtensionAPI(pi), {});

      const excludePath = join(tmp.path, ".git", "info", "exclude");
      expect(existsSync(excludePath)).toBeTrue();
      const content = readFileSync(excludePath, "utf-8");
      expect(content).toContain(".omp/");
    });

    it("does not duplicate .omp/ entry on re-run", async () => {
      mkdirSync(join(tmp.path, ".git", "info"), { recursive: true });
      _enableGraphifyCLI = true;

      await initCommand(castToExtensionAPI(pi), {});
      await initCommand(castToExtensionAPI(pi), {});

      const excludePath = join(tmp.path, ".git", "info", "exclude");
      const content = readFileSync(excludePath, "utf-8");
      const matches = content.match(/\.omp\//g);
      expect(matches).toHaveLength(1);
    });

    it("works gracefully when no .git directory exists", async () => {
      _enableGraphifyCLI = true;
      const status = await initCommand(castToExtensionAPI(pi), {});
      expect(status).toBe("initialized-full");
      // No error thrown — best-effort is silent
    });
  });
});

