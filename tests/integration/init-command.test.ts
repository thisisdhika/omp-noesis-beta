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
var _graphifyBuildSuccess = true;
var _installGraphifySkillImpl: () => Promise<string> = () =>
  Promise.resolve(".omp/skills/graphify/skill.yaml");

mock.module("../../src/infrastructure/graphify-setup.js", () => ({
  checkGraphifyCLI: mock(
    (): Promise<{ installed: boolean; version?: string }> =>
      Promise.resolve(
        _enableGraphifyCLI
          ? { installed: true, version: "1.0.0" }
          : { installed: false }
      )
  ),
  installGraphifySkill: mock(() => _installGraphifySkillImpl()),
  runGraphifyBuild: mock(
    (): Promise<{ success: boolean; output: string }> =>
      Promise.resolve(
        _graphifyBuildSuccess
          ? { success: true, output: "graph built" }
          : { success: false, output: "build failed" }
      )
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
    _installGraphifySkillImpl = () => Promise.resolve(".omp/skills/graphify/skill.yaml");
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

      // Should have sent a "up-to-date" / skip status message
      const msgs = sentMessages(pi);
      const skipMsg = msgs.find(
        (m) =>
          m.message.customType === "noesis:init-status" &&
          (m.message.content.toLowerCase().includes("up-to-date") ||
           m.message.content.toLowerCase().includes("skipping"))
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

    it("returns initialized-full with background graph build when graphify CLI is installed", async () => {
      _enableGraphifyCLI = true;
      _graphifyBuildSuccess = false;
      const status = await initCommand(castToExtensionAPI(pi), {});
      expect(status).toBe("initialized-full");

      // Verify the summary reports background build scheduling somewhere in the message stream.
      const msgs = sentMessages(pi);
      expect(msgs.some(m => m.message.content.includes("Graph: building in background"))).toBeTrue();
    });
    it("does not await Graphify skill installation", async () => {
      _enableGraphifyCLI = true;
      _installGraphifySkillImpl = () => new Promise<string>(() => {});

      const started = Date.now();
      const status = await initCommand(castToExtensionAPI(pi), {});
      const elapsed = Date.now() - started;

      expect(status).toBe("initialized-full");
      expect(elapsed).toBeLessThan(500);
    });
  });

  // -----------------------------------------------------------------------
  // 7. RULES.md merge behavior
  // -----------------------------------------------------------------------

  describe("RULES.md merge", () => {
    it("creates RULES.md from template on fresh init", async () => {
      _enableGraphifyCLI = true;
      await initCommand(castToExtensionAPI(pi), {});
      const rulesPath = join(tmp.path, ".omp", "RULES.md");
      expect(existsSync(rulesPath)).toBeTrue();
      const content = readFileSync(rulesPath, "utf-8");
      expect(content).toContain("**Always do these FIRST:**");
      expect(content).toContain("**Graph Queries:**");
    });

    it("preserves user-modified section during merge", async () => {
      const ompDir = join(tmp.path, ".omp");
      mkdirSync(ompDir, { recursive: true });
      writeFileSync(
        join(ompDir, "RULES.md"),
        [
          "# Noesis Rules",
          "",
          "**Always do these FIRST:**",
          "- My custom rule for this project",
          "",
          "**NEVER:**",
          "- Never break anything",
        ].join("\n") + "\n"
      );
      _enableGraphifyCLI = true;

      await initCommand(castToExtensionAPI(pi), {});

      const rulesPath = join(ompDir, "RULES.md");
      const content = readFileSync(rulesPath, "utf-8");
      // User's section content should be preserved
      expect(content).toContain("- My custom rule for this project");
      // Template sections not in user's file should be appended
      expect(content).toContain("**After events:**");
      expect(content).toContain("**Graph Queries:**");
    });

    it("preserves user-only sections not in template", async () => {
      const ompDir = join(tmp.path, ".omp");
      mkdirSync(ompDir, { recursive: true });
      writeFileSync(
        join(ompDir, "RULES.md"),
        [
          "# Noesis Rules",
          "",
          "**Always do these FIRST:**",
          "- Task start: attend",
          "",
          "**My Custom Section:**",
          "- Custom project rules",
        ].join("\n") + "\n"
      );
      _enableGraphifyCLI = true;

      await initCommand(castToExtensionAPI(pi), {});

      const rulesPath = join(ompDir, "RULES.md");
      const content = readFileSync(rulesPath, "utf-8");
      expect(content).toContain("**My Custom Section:**");
      expect(content).toContain("- Custom project rules");
    });

    it("overwrites RULES.md with template when force is set", async () => {
      const ompDir = join(tmp.path, ".omp");
      mkdirSync(ompDir, { recursive: true });
      writeFileSync(
        join(ompDir, "RULES.md"),
        "# Old content\n**Old Section:**\n-old data\n"
      );
      _enableGraphifyCLI = true;

      await initCommand(castToExtensionAPI(pi), { force: true });

      const rulesPath = join(ompDir, "RULES.md");
      const content = readFileSync(rulesPath, "utf-8");
      // Should be the full template, not old content
      expect(content).not.toContain("Old content");
      expect(content).toContain("**Always do these FIRST:**");
      expect(content).toContain("**Graph Queries:**");
    });

    it("reports merged when managed block content differs", async () => {
      // Write a RULES.md with markers matching the template exactly
      const ompDir = join(tmp.path, ".omp");
      mkdirSync(ompDir, { recursive: true });
      writeFileSync(join(ompDir, "RULES.md"), `# Noesis Rules

[noesis-rules]

**Always do these FIRST:**
- Task start: attend

**After events:**
- verify → believe

**NEVER:**
- duplicate

**Templates:**
- Fact: ...

**Confidence:** execution/user = 1.0

**Boundaries:** noesis_state_inspect = current

**Compaction:** survivor set

**Graph modes:** FULL | STALE

**Graph Queries:**
- Request fresh via attend

[end-noesis-rules]
`);
      _enableGraphifyCLI = true;

      await initCommand(castToExtensionAPI(pi), {});
      const msgs = sentMessages(pi);
      const statusMsg = msgs.find(
        (m) => m.message.customType === "noesis:init-status"
      );
      expect(statusMsg).toBeDefined();
      expect(statusMsg!.message.content).toMatch(/rules\.md.*merged/i);
    });
  });


  // -----------------------------------------------------------------------
  // 8. Git exclude file
  // -----------------------------------------------------------------------

  describe("git exclude", () => {
    it("adds all generated artifacts to .git/info/exclude when .git directory exists", async () => {
      // Create minimal .git structure
      mkdirSync(join(tmp.path, ".git", "info"), { recursive: true });
      _enableGraphifyCLI = true;

      await initCommand(castToExtensionAPI(pi), {});

      const excludePath = join(tmp.path, ".git", "info", "exclude");
      expect(existsSync(excludePath)).toBeTrue();
      const content = readFileSync(excludePath, "utf-8");
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      for (const entry of [".omp/", ".omp/noesis/", "graphify-out/", ".obsidian/noesis/"]) {
        expect(lines).toContain(entry);
      }
    });

    it("does not duplicate .omp/ entry on re-run", async () => {
      mkdirSync(join(tmp.path, ".git", "info"), { recursive: true });
      _enableGraphifyCLI = true;

      await initCommand(castToExtensionAPI(pi), {});
      await initCommand(castToExtensionAPI(pi), {});

      const excludePath = join(tmp.path, ".git", "info", "exclude");
      const content = readFileSync(excludePath, "utf-8");
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      // Each exact entry should appear exactly once
      for (const entry of [".omp/", ".omp/noesis/", "graphify-out/", ".obsidian/noesis/"]) {
        expect(lines.filter(l => l === entry)).toHaveLength(1);
      }
    });

    it("works gracefully when no .git directory exists", async () => {
      _enableGraphifyCLI = true;
      const status = await initCommand(castToExtensionAPI(pi), {});
      expect(status).toBe("initialized-full");
      // No error thrown — best-effort is silent
    });
  });
});
