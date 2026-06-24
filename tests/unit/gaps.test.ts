import { describe, it, expect, mock } from "bun:test";
import { join } from "node:path";
import { writeFileSync, mkdirSync, utimesSync } from "node:fs";
import { deepClone, deepMergeDefaults } from "../../src/shared/clone.js";
import { EMPTY_STATE, NoesisStateSchema, CURRENT_VERSION } from "../../src/shared/schema.js";
import { StateManager } from "../../src/infrastructure/state-manager.js";
import { createTempDir } from "../helpers/temp-dir.js";
import { resolveFocus } from "../../src/rendering/focus-resolver.js";
import { ObsidianVaultStore } from "../../src/vault/obsidian-vault-store.js";
import { AddPlannedActionUseCase } from "../../src/application/use-cases/add-planned-action.js";
import { ExtendWorkflowUseCase } from "../../src/application/use-cases/extend-workflow.js";
import { EndTurnCleanupUseCase } from "../../src/application/use-cases/end-turn-cleanup.js";
import { query } from "../../src/infrastructure/graphify-client.js";
import { parseQueryOutput } from "../../src/infrastructure/graphify-parser.js";
import { ConfirmHypothesisUseCase } from "../../src/application/use-cases/confirm-hypothesis.js";
import { UpdateWorkflowStepUseCase } from "../../src/application/use-cases/update-workflow-step.js";
import { CAPS } from "../../src/shared/schema-base.js";

describe("Milestone 6 Adversarial Gaps Test Suite", () => {

  // Gap 1.1: Reference Leak in deepMergeDefaults
  it("Gap 1.1: should not mutate defaults when missing keys are populated and mutated", () => {
    const defaults = {
      version: 1,
      learning: {
        successes: [],
        failures: [],
        summary: { resolvedCount: 0, totalCount: 0 }
      }
    };
    const loaded = { version: 1 };
    const merged = deepMergeDefaults(defaults as any, loaded as any);
    
    // Mutate the merged object's learning.successes
    merged.learning.successes.push({ id: "le-1", description: "mutated" } as any);
    expect(defaults.learning.successes).toHaveLength(0);
  });

  // Gap 1.2: Post-Commit Mutation Leak in UnitOfWork
  it("Gap 1.2: should prevent post-commit mutations from bypassing transactions", async () => {
    const tempDir = createTempDir();
    try {
      const sm = new StateManager(tempDir.path);
      await sm.initialize();

      const uow = sm.createUnitOfWork();
      const wf = uow.commitment.getWorkflow();
      wf.goal = "Original Goal";
      await uow.commit();

      // Mutate wf AFTER commit
      try {
        wf.goal = "Mutated Goal Post-Commit";
      } catch (e) {
        // May throw TypeError if frozen, which is acceptable
      }
      expect(sm.read().commitment.workflow.goal).toBe("Original Goal");
    } finally {
      tempDir.cleanup();
    }
  });

  // Gap 1.3: Focus Resolver Status Check Omission
  it("Gap 1.3: should return fallback focus when workflow is done or abandoned", () => {
    const state = deepClone(EMPTY_STATE);
    state.attention.focus = "";
    state.commitment.workflow.goal = "Completed Goal";
    state.commitment.workflow.status = "done";
    expect(resolveFocus(state)).toBe("Investigate the current task");

    const state2 = deepClone(EMPTY_STATE);
    state2.attention.focus = "";
    state2.commitment.workflow.goal = "Abandoned Goal";
    state2.commitment.workflow.status = "abandoned";
    expect(resolveFocus(state2)).toBe("Investigate the current task");
  });

  // Gap 1.4: Obsidian Vault Store - Pull Sorting Omission
  it("Gap 1.4: should pull artifacts sorted by modification time (newest first)", async () => {
    const tempDir = createTempDir();
    try {
      mkdirSync(join(tempDir.path, ".obsidian"));
      mkdirSync(join(tempDir.path, ".obsidian/noesis/belief"), { recursive: true });
      const store = new ObsidianVaultStore(tempDir.path);
      
      const writeWithMtime = (id: string, ageSeconds: number) => {
        const path = join(tempDir.path, ".obsidian/noesis/belief", `${id}.md`);
        const content = `---\nkind: belief\nid: ${id}\npushedAt: ${new Date().toISOString()}\nprojectPath: ${tempDir.path}\n---\ncontent`;
        writeFileSync(path, content);
        const mtime = (Date.now() - ageSeconds * 1000) / 1000;
        utimesSync(path, mtime, mtime);
      };

      writeWithMtime("bf-old", 300);
      writeWithMtime("bf-newest", 10);
      writeWithMtime("bf-medium", 100);

      const pullResult = await store.pull("belief", 3);
      const ids = pullResult.artifacts.map(a => a.id);
      expect(ids).toEqual(["bf-newest", "bf-medium", "bf-old"]);
    } finally {
      tempDir.cleanup();
    }
  });

  // Gap 1.5: Obsidian Vault Store - Case-Sensitive Search
  it("Gap 1.5: should perform case-insensitive search", async () => {
    const tempDir = createTempDir();
    try {
      mkdirSync(join(tempDir.path, ".obsidian"));
      mkdirSync(join(tempDir.path, ".obsidian/noesis/belief"), { recursive: true });
      const store = new ObsidianVaultStore(tempDir.path);
      
      const path = join(tempDir.path, ".obsidian/noesis/belief/bf-1.md");
      const content = `---\nkind: belief\nid: bf-1\npushedAt: ${new Date().toISOString()}\nprojectPath: ${tempDir.path}\n---\nTarget CamelCase Content`;
      writeFileSync(path, content);

      const results = await store.search("camelcase", "belief");
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe("bf-1");
    } finally {
      tempDir.cleanup();
    }
  });

  // Gap 1.6: Obsidian Vault Store - YAML Frontmatter Newline Corruption
  it("Gap 1.6: should support metadata string values containing newlines without corruption", async () => {
    const tempDir = createTempDir();
    try {
      mkdirSync(join(tempDir.path, ".obsidian"));
      mkdirSync(join(tempDir.path, ".obsidian/noesis/belief"), { recursive: true });
      const store = new ObsidianVaultStore(tempDir.path);
      
      const artifact = {
        kind: "belief" as const,
        id: "bf-newline",
        pushedAt: new Date().toISOString(),
        projectPath: tempDir.path,
        metadata: {
          error: "line1\nline2"
        },
        content: "content"
      };

      await store.push(artifact);

      const pullResult = await store.pull("belief");
      expect(pullResult.artifacts).toHaveLength(1);
      expect(pullResult.artifacts[0]!.metadata?.error).toBe("line1\nline2");
    } finally {
      tempDir.cleanup();
    }
  });

  // Gap 1.7: Silent Truncation in Commitments Use Cases (AddPlannedAction, ExtendWorkflow)
  it("Gap 1.7: should throw an error when adding planned action exceeds capacity limits", async () => {
    const tempDir = createTempDir();
    try {
      const sm = new StateManager(tempDir.path);
      await sm.initialize();

      await sm.mutate((state) => {
        for (let i = 0; i < CAPS.actions; i++) {
          state.commitment.actions.push({
            id: `pa-${i}`,
            content: `Action ${i}`,
            priority: "normal",
            createdAt: new Date().toISOString(),
          });
        }
      });

      const uow = sm.createUnitOfWork();
      const useCase = new AddPlannedActionUseCase(uow);
      await expect(useCase.execute({ content: "Overflow Action" })).rejects.toThrow();
    } finally {
      tempDir.cleanup();
    }
  });

  it("Gap 1.7: should throw an error when extending workflow step exceeds capacity limits", async () => {
    const tempDir = createTempDir();
    try {
      const sm = new StateManager(tempDir.path);
      await sm.initialize();

      await sm.mutate((state) => {
        state.commitment.workflow.goal = "Initial goal";
        for (let i = 0; i < CAPS.workflowSteps; i++) {
          state.commitment.workflow.steps.push({
            id: `ws-${i}`,
            description: `Step ${i}`,
            status: "pending",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      });

      const uow = sm.createUnitOfWork();
      const useCase = new ExtendWorkflowUseCase(uow);
      await expect(useCase.execute({ steps: [{ description: "Overflow Step" }] })).rejects.toThrow();
    } finally {
      tempDir.cleanup();
    }
  });

  // Gap 1.8: Eviction Discrepancy in Learning Turn Cleanup
  it("Gap 1.8: should evict the oldest learning entries instead of the newest during end-turn cleanup", async () => {
    const tempDir = createTempDir();
    try {
      const sm = new StateManager(tempDir.path);
      await sm.initialize();

      await sm.mutate((state) => {
        for (let i = 0; i <= CAPS.learningEntries; i++) {
          state.learning.successes.push({
            id: `le-success-${i}`,
            description: `Success ${i}`,
            status: "captured",
            capturedAt: new Date(Date.now() + i * 1000).toISOString(),
          });
        }
      });

      const uow = sm.createUnitOfWork();
      const useCase = new EndTurnCleanupUseCase(uow);
      await useCase.execute();

      const successes = sm.read().learning.successes;
      expect(successes).toHaveLength(CAPS.learningEntries);
      
      const hasOldest = successes.some(e => e.id === "le-success-0");
      const hasNewest = successes.some(e => e.id === `le-success-${CAPS.learningEntries}`);
      expect(hasOldest).toBe(false);
      expect(hasNewest).toBe(true);
    } finally {
      tempDir.cleanup();
    }
  });

  // Gap 1.9: Stale Eviction using updatedAt instead of createdAt
  it("Gap 1.9: should evict stale facts based on updatedAt instead of createdAt", async () => {
    const tempDir = createTempDir();
    try {
      const sm = new StateManager(tempDir.path);
      await sm.initialize();

      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      const nowStr = new Date().toISOString();

      await sm.mutate((state) => {
        state.belief.facts.push({
          id: "bf-stale-but-updated",
          content: "Active fact recently archived",
          confidence: 0.9,
          source: "user",
          createdAt: thirtyOneDaysAgo,
          updatedAt: nowStr,
          status: "archived",
          epistemicStatus: "speculative" as const,
          reviewRequired: false,
          scope: "local" as const,
          revision: 0,
        });
      });

      const uow = sm.createUnitOfWork();
      const useCase = new EndTurnCleanupUseCase(uow);
      await useCase.execute();

      const facts = sm.read().belief.facts;
      expect(facts.some(f => f.id === "bf-stale-but-updated")).toBe(true);
    } finally {
      tempDir.cleanup();
    }
  });

  // Gap 1.10: Graphify Client Silent Failure Swallowing
  it("Gap 1.10: should populate error field when graphify query exit code is non-zero", async () => {
    const tempDir = createTempDir();
    try {
      // validateGraphPath looks for graphify-out/graph.json (not .omp/skills/graphify/)
      mkdirSync(join(tempDir.path, "graphify-out"), { recursive: true });
      writeFileSync(join(tempDir.path, "graphify-out", "graph.json"), "{}");

      const originalSpawn = Bun.spawn;
      Bun.spawn = mock(() => ({
        stdout: new ReadableStream({ start(c) { c.close(); } }),
        stderr: new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode("Graphify crashed: connection timeout"));
            c.close();
          }
        }),
        exited: Promise.resolve(1)
      })) as any;

      try {
        const result = await query(tempDir.path, "test question");
        expect(result.error).toBeDefined();
        expect(result.error).toContain("Graphify crashed");
      } finally {
        Bun.spawn = originalSpawn;
      }
    } finally {
      tempDir.cleanup();
    }
  });

  // Gap 1.11: Graphify Parser Legacy Links Key Gap
  it("Gap 1.11: should fallback to legacy links key when edges and relations key are absent", () => {
    const raw = JSON.stringify({
      results: [
        {
          query: "test query",
          nodes: ["A", "B"],
          links: ["A→B"],
          confidence: "EXTRACTED"
        }
      ]
    });

    const findings = parseQueryOutput(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.relations).toEqual(["A→B"]);
  });

  // Gap 1.12: Compaction Recovery Gap
  it("Gap 1.12: should load from preserveData[\"omp-noesis\"] if the state file does not exist", async () => {
    const tempDir = createTempDir();
    try {
      const sm = new StateManager(tempDir.path);
      const snapshot = deepClone(EMPTY_STATE);
      snapshot.attention.focus = "compacted focus";
      
      // Initialize with preserveData.noesis and state file not existing
      await sm.initialize({ "omp-noesis": snapshot });
      
      expect(sm.read().attention.focus).toBe("compacted focus");
    } finally {
      tempDir.cleanup();
    }
  });


  // Gap 1.14: Unhandled JSON Parse Corruption in checkpointAttention
  it("Gap 1.14: should handle disk read syntax errors gracefully during checkpointing", async () => {
    const tempDir = createTempDir();
    try {
      const sm = new StateManager(tempDir.path);
      await sm.initialize();

      // Corrupt state file
      writeFileSync(join(tempDir.path, ".omp", "noesis", "state.json"), "{ corrupt json");
      await expect(sm.checkpointAttention()).resolves.toBeUndefined();
    } finally {
      tempDir.cleanup();
    }
  });

  // Gap 1.15: Missing Schema Validation on StateManager.initialize()
  it("Gap 1.15: should fallback to EMPTY_STATE or repair when loaded state is invalid schema", async () => {
    const tempDir = createTempDir();
    try {
      const statePath = join(tempDir.path, ".omp", "noesis", "state.json");
      mkdirSync(join(tempDir.path, ".omp/noesis"), { recursive: true });
      writeFileSync(statePath, JSON.stringify({
        version: 1,
        attention: { priority: "invalid-priority-value" }
      }));

      const sm = new StateManager(tempDir.path);
      await sm.initialize();

      // Should fall back to EMPTY_STATE so priority is valid
      expect(sm.read().attention.priority).toBe("normal");
    } finally {
      tempDir.cleanup();
    }
  });

  // Gap 1.16: Loss of Hypothesis Metadata on Auto-Promotion
  it("Gap 1.16: should preserve tags and evidence when hypothesis is auto-promoted", async () => {
    const tempDir = createTempDir();
    try {
      const sm = new StateManager(tempDir.path);
      await sm.initialize();

      await sm.mutate((state) => {
        state.inference.hypotheses.push({
          id: "hy-1",
          content: "Target Hypothesis Content",
          status: "testing",
          evidence: "Strong Evidence",
          tags: ["m6-tag"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });

      const uow = sm.createUnitOfWork();
      const useCase = new ConfirmHypothesisUseCase(uow);
      const result = await useCase.execute({ id: "hy-1", autoPromote: true });

      expect(result.beliefFactId).toBeDefined();
      const fact = sm.read().belief.facts.find(f => f.id === result.beliefFactId);
      expect(fact).toBeDefined();
      expect(fact!.tags).toContain("m6-tag");
      expect(fact!.evidence).toBe("Strong Evidence");
    } finally {
      tempDir.cleanup();
    }
  });

  // Gap 1.17: No-op Workflow Cycle Detection
  it("Gap 1.17: should throw an error if circular dependency is found in workflow", async () => {
    const tempDir = createTempDir();
    try {
      const sm = new StateManager(tempDir.path);
      await sm.initialize();

      await sm.mutate((state) => {
        state.commitment.workflow.goal = "goal";
        state.commitment.workflow.steps.push({
          id: "ws-1",
          description: "Step 1",
          status: "done", // was done, will be pending
          dependsOn: ["ws-2"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, {
          id: "ws-2",
          description: "Step 2",
          status: "pending",
          dependsOn: ["ws-1"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });

      const uow = sm.createUnitOfWork();
      const useCase = new UpdateWorkflowStepUseCase(uow);
      await expect(useCase.execute({ stepId: "ws-1", status: "pending" })).rejects.toThrow();
    } finally {
      tempDir.cleanup();
    }
  });

});
