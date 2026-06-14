import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";
import { loadState, statePath } from "../../src/infrastructure/filesystem-store.js";
import { StateManager } from "../../src/infrastructure/state-manager.js";
import { CURRENT_VERSION } from "../../src/schema.js";

describe("Scenario F: Dependency degradation", () => {
  let ctx: TestContext & { cleanup: () => void };
  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => {
    ctx.cleanup();
  });

  it("activation succeeds without Graphify", () => {
    // createTestContext() already calls activate() without a real Graphify binary.
    // If we get here, activation did not throw.
    expect(ctx.extension).toBeDefined();
    expect(ctx.extension.tools.size).toBeGreaterThan(0);
  });

  it("registers all 6 tools after activation", () => {
    const expectedTools = [
      "noesis_attend",
      "noesis_believe",
      "noesis_infer",
      "noesis_commit",
      "noesis_focus",
      "noesis_vault_search",
    ];

    expect(ctx.extension.tools.size).toBe(6);

    for (const name of expectedTools) {
      expect(ctx.extension.tools.has(name), `Missing tool: ${name}`).toBe(true);
    }
  });

  it("noesis_attend works without graph findings", async () => {
    const result = await ctx.extension.invokeTool("noesis_attend", {
      focus: "test degradation scenario",
      files: [],
      graphQueries: [],
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
  });

  it("corrupt state file produces valid state via recovery", () => {
    // First create the state file via a mutation
    ctx.state.mutate((s) => {
      s.attention.focus = "pre-corrupt";
    });
    ctx.state.checkpointAttention();

    const sp = statePath(ctx.workDir);
    writeFileSync(sp, "{{{ not json }}}", "utf-8");

    const recovered = loadState(ctx.workDir);
    expect(recovered).toBeDefined();
    expect(recovered.version).toBe(CURRENT_VERSION);
  });

  it("missing .omp directory is auto-created by StateManager", () => {
    const nestedDir = join(ctx.workDir, "fresh-project");
    mkdirSync(nestedDir, { recursive: true });

    // StateManager should handle missing .omp dir gracefully
    const sm = new StateManager(nestedDir);
    const state = sm.read();
    expect(state).toBeDefined();
    expect(state.version).toBe(CURRENT_VERSION);

    // A durable write should succeed and create the directory tree
    sm.mutate((s) => {
      s.belief.facts.push({
        id: "bf-test",
        content: "test fact in fresh dir",
        confidence: 0.9,
        source: "execution",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    expect(statePath(nestedDir)).toContain(".omp/noesis/state.json");
    // loadState should now find the persisted file
    const persisted = loadState(nestedDir);
    expect(persisted.belief.facts).toHaveLength(1);
    expect(persisted.belief.facts[0]!.content).toBe("test fact in fresh dir");

    rmSync(nestedDir, { recursive: true, force: true });
  });
});
