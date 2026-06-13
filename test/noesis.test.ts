import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import activate from "../src/index.js";
import { createInitCommandHandler } from "../src/commands/init-command.js";
import { addFact } from "../src/domains/belief/belief-domain.js";
import { evictLearning } from "../src/domains/learning/eviction-strategy.js";
import { rankLearning } from "../src/domains/learning/ranking-strategy.js";
import { StateManager } from "../src/infrastructure/state-manager.js";
import { loadState, saveState, statePath } from "../src/infrastructure/filesystem-store.js";
import { buildPreamble } from "../src/rendering/preamble-builder.js";
import { EMPTY_STATE } from "../src/schema.js";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "omp-noesis-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("EMPTY_STATE", () => {
  it("returns a fully initialized bounded state", () => {
    const state = EMPTY_STATE();

    expect(state.version).toBe(1);
    expect(state.attention).toMatchObject({
      focus: "",
      graphQueries: [],
      files: [],
      contextUsage: 0,
    });
    expect(state.commitment.workflow.status).toBe("draft");
    expect(state.learning.summary).toEqual({
      successCount: 0,
      failureCount: 0,
      resolvedCount: 0,
    });
  });
});

describe("filesystem store", () => {
  it("roundtrips persisted state and strips transient graph findings", () => {
    const root = makeRoot();
    const state = EMPTY_STATE();

    state.attention.focus = "Trace graph-backed failure";
    (state.attention as typeof state.attention & { graphFindings?: unknown[] }).graphFindings = [
      { nodeName: "StateManager", rawSnippet: "mutate()", confidenceLabel: "EXTRACTED" },
    ];
    state.belief.facts.push({
      id: "bf-1",
      content: "State persists on non-attention mutations",
      confidence: 0.95,
      source: "execution",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "active",
      tags: ["state"],
    });

    saveState(root, state);

    const raw = JSON.parse(readFileSync(statePath(root), "utf-8")) as {
      attention: Record<string, unknown>;
    };
    expect(raw.attention.graphFindings).toBeUndefined();

    const loaded = loadState(root);
    expect(loaded.attention.focus).toBe("Trace graph-backed failure");
    expect(loaded.belief.facts).toHaveLength(1);
  });
});

describe("state manager", () => {
  it("defers attention-only writes until checkpoint", () => {
    const root = makeRoot();
    const state = new StateManager(root);

    state.mutate((draft) => {
      draft.attention.focus = "Narrow the failing path";
    });

    expect(existsSync(statePath(root))).toBe(false);

    state.checkpointAttention();

    expect(existsSync(statePath(root))).toBe(true);
    expect(loadState(root).attention.focus).toBe("Narrow the failing path");
  });

  it("persists durable mutations immediately", () => {
    const root = makeRoot();
    const state = new StateManager(root);

    state.mutate((draft) => {
      draft.learning.failures.push({
        id: "le-1",
        description: "tool_result parser crashed",
        toolName: "noesis_attend",
        capturedAt: "2026-01-01T00:00:00.000Z",
      });
      draft.learning.summary.failureCount = 1;
    });

    expect(existsSync(statePath(root))).toBe(true);
    expect(loadState(root).learning.summary.failureCount).toBe(1);
  });
});

describe("belief revision", () => {
  it("links superseded beliefs to the final replacement id", () => {
    const state = EMPTY_STATE();
    const first = addFact(state, {
      type: "fact",
      content: "Parser path uses YAML",
      confidence: 0.85,
      source: "execution",
      tags: ["parser"],
    });

    const second = addFact(state, {
      type: "fact",
      content: "Parser path uses zod",
      confidence: 0.95,
      source: "execution",
      tags: ["parser"],
      contradictsIds: [first.created.id],
    });

    expect(first.created.status).toBe("superseded");
    expect(first.created.supersededBy).toBe(second.created.id);
    expect(state.belief.facts.at(-1)?.id).toBe(second.created.id);
  });
});

describe("learning ranking and eviction", () => {
  it("prefers resolved failures in the active skill scope", () => {
    const ranked = rankLearning(
      [
        { id: "a", description: "old success", toolName: "bash", capturedAt: "1" },
        { id: "b", description: "scoped failure", toolName: "bash", capturedAt: "2", skillScope: "ts", rootCause: "bad input", fix: "validate" },
        { id: "c", description: "other scope failure", toolName: "bash", capturedAt: "3", skillScope: "py", rootCause: "boom" },
      ],
      "ts",
    );

    expect(ranked[0]?.id).toBe("b");
  });

  it("evicts lower-value successes before failures", () => {
    const kept = evictLearning(
      [
        { id: "success", description: "plain success", toolName: "bash", capturedAt: "1" },
        { id: "failure", description: "diagnosed failure", toolName: "bash", capturedAt: "2", rootCause: "x", fix: "y" },
      ],
      1,
    );

    expect(kept).toHaveLength(1);
    expect(kept[0]?.id).toBe("failure");
  });
});

describe("preamble builder", () => {
  it("renders transient graph findings from attention state", () => {
    const state = EMPTY_STATE();
    (state.attention as typeof state.attention & { graphFindings?: unknown[] }).graphFindings = [
      { nodeName: "GraphifyClient", rawSnippet: "detectCapability()" },
    ];

    const preamble = buildPreamble(state, {
      capability: "FULL",
      learningRanked: [],
      staleNotes: [],
      projectName: "omp-noesis",
    });

    expect(preamble).toContain("[Graph]");
    expect(preamble).toContain("GraphifyClient");
  });

  it("drops learning before work when trimming to budget", () => {
    const state = EMPTY_STATE();
    state.commitment.workflow.goal = "Keep the current debugging plan visible";
    state.commitment.workflow.steps = [
      { id: "s1", description: "Inspect failing hook", status: "active" },
      { id: "s2", description: "Patch extension contract", status: "pending" },
    ];

    const noisyNotes = Array.from({ length: 80 }, (_, i) => ({
      beliefId: `bf-${i}`,
      originalConfidence: 0.95,
      adjustedConfidence: 0.75,
      message: `Stale belief ${i} ${"x".repeat(120)}`,
    }));

    const preamble = buildPreamble(state, {
      capability: "STALE",
      learningRanked: [
        { id: "l1", description: "A".repeat(300), toolName: "bash", capturedAt: "1", rootCause: "r", fix: "f" },
      ],
      staleNotes: noisyNotes,
      projectName: "omp-noesis",
    });

    expect(preamble).toContain("[Work] Keep the current debugging plan visible");
    expect(preamble).not.toContain("[Learning]");
  });
});

describe("extension activation", () => {
  it("registers zod-backed tools and the init command", () => {
    const tools: Array<{ name: string; parameters: { safeParse: (value: unknown) => { success: boolean } } }> = [];
    const commands: string[] = [];
    const hooks: string[] = [];

    activate({
      cwd: makeRoot(),
      registerTool(tool) {
        tools.push(tool as (typeof tools)[number]);
      },
      registerCommand(name) {
        commands.push(name);
      },
      on(event) {
        hooks.push(event);
      },
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      "noesis_attend",
      "noesis_believe",
      "noesis_infer",
      "noesis_commit",
    ]);
    expect(tools[0]?.parameters.safeParse({ focus: "Investigate state" }).success).toBe(true);
    expect(commands).toContain("noesis:init");
    expect(hooks).toEqual(
      expect.arrayContaining(["context", "session.compacting", "session_compact", "tool_result", "before_agent_start"]),
    );
  });
});

describe("noesis init command", () => {
  it("creates YAML project-local config when missing", async () => {
    const root = makeRoot();
    const handler = createInitCommandHandler();
    const notifications: string[] = [];

    await handler("", {
      cwd: root,
      ui: {
        notify(message) {
          notifications.push(message);
        },
      },
    });

    const projectConfig = join(root, ".omp", "config.yml");
    expect(existsSync(projectConfig)).toBe(true);
    expect(existsSync(join(root, ".omp", "agent", "config.yml"))).toBe(false);

    const written = readFileSync(projectConfig, "utf-8");
    expect(written).toContain("compaction:");
    expect(written).toContain('  strategy: "context-full"');
    expect(written).toContain("  thresholdTokens: 160000");
    expect(written).not.toContain("reserveTokens");
    expect(written).not.toContain("keepRecentTokens");
    expect(written).not.toContain("idleThresholdTokens");
    expect(written).not.toContain("{");
    expect(notifications[0]).toContain("Created project OMP config");
    expect(notifications[0]).toContain("Restart OMP or start a new session");
  });

  it("updates existing project config without touching nested agent config", async () => {
    const root = makeRoot();
    const projectConfig = join(root, ".omp", "config.yml");
    const nestedAgentConfig = join(root, ".omp", "agent", "config.yml");
    const handler = createInitCommandHandler();

    mkdirSync(dirname(projectConfig), { recursive: true });
    mkdirSync(dirname(nestedAgentConfig), { recursive: true });
    writeFileSync(
      projectConfig,
      JSON.stringify({
        compaction: {
          reserveTokens: 1000,
          keepRecentTokens: 5000,
          idleThresholdTokens: 999999,
        },
        skills: {
          enabled: true,
        },
      }, null, 2),
    );
    writeFileSync(
      nestedAgentConfig,
      JSON.stringify({ shouldStayUntouched: true }, null, 2),
    );

    const notifications: string[] = [];
    await handler("", {
      cwd: root,
      ui: {
        notify(message) {
          notifications.push(message);
        },
      },
    });

    const written = readFileSync(projectConfig, "utf-8");
    expect(written).toContain("compaction:");
    expect(written).not.toContain("reserveTokens");
    expect(written).not.toContain("keepRecentTokens");
    expect(written).toContain('  strategy: "context-full"');
    expect(written).toContain("  thresholdTokens: 160000");
    expect(written).not.toContain("idleThresholdTokens");
    expect(written).toContain("skills:");
    expect(written).toContain("  enabled: true");
    expect(existsSync(`${projectConfig}.noesis-backup`)).toBe(true);
    expect(notifications[0]).toContain("Restart OMP or start a new session");
    expect(JSON.parse(readFileSync(nestedAgentConfig, "utf-8"))).toEqual({
      shouldStayUntouched: true,
    });
  });
});
