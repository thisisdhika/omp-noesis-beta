"use strict";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { StateManager } from "../../../src/infrastructure/state-manager.js";
import { createTempDir } from "../../helpers/temp-dir.js";
import { now } from "../../../src/shared/time.js";

interface TempDir {
  path: string;
  cleanup(): void;
}

function statePath(root: string): string {
  return join(root, ".omp", "noesis", "state.json");
}

let tempDir: TempDir;

beforeEach(() => {
  tempDir = createTempDir();
});

afterEach(() => {
  tempDir.cleanup();
});

describe("StateManager Transactional Mutations", () => {
  it("should rollback memory and disk states if mutation function throws an error", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    const originalState = sm.read();
    const originalFocus = originalState.attention.focus;

    let thrown = false;
    try {
      await sm.mutate((state) => {
        state.attention.focus = "temporary focus change";
        throw new Error("Simulated mutation error");
      });
    } catch (err: any) {
      if (err.message === "Simulated mutation error") {
        thrown = true;
      }
    }

    expect(thrown).toBe(true);

    // Verify memory state is rolled back / untouched
    expect(sm.read().attention.focus).toBe(originalFocus);

    // Verify disk state is untouched
    const onDisk = await Bun.file(statePath(tempDir.path)).json();
    expect(onDisk.attention.focus).toBe(originalFocus);
  });

  it("should rollback memory and disk states if validation fails during mutation", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    const originalState = sm.read();
    const originalFocus = originalState.attention.focus;

    let thrown = false;
    try {
      await sm.mutate((state) => {
        // Set invalid priority value that violates Zod schema
        state.attention.priority = "invalid_priority_value" as any;
      });
    } catch (err) {
      thrown = true;
    }

    expect(thrown).toBe(true);

    // Verify memory state is untouched
    expect(sm.read().attention.priority).toBe("normal");

    // Verify disk state is untouched
    const onDisk = await Bun.file(statePath(tempDir.path)).json();
    expect(onDisk.attention.priority).toBe("normal");
  });
});

describe("UnitOfWork", () => {
  it("should commit changes across all 5 repositories to memory and disk on commit", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    const uow = sm.createUnitOfWork();

    // 1. Attention Repository
    uow.attention.update({ focus: "new attention focus" });

    // 2. Belief Repository
    const testFact = {
      id: "bf-test-1",
      content: "test belief content",
      confidence: 0.9,
      source: "user" as const,
      createdAt: now(),
      updatedAt: now(),
      status: "active" as const,
    };
    uow.belief.addFact(testFact);

    // 3. Commitment Repository
    uow.commitment.setWorkflow({
      id: "wf-test-1",
      goal: "achieve unit tests pass",
      status: "active",
      steps: [],
      createdAt: now(),
      updatedAt: now(),
    });

    // 4. Inference Repository
    uow.inference.addHypothesis({
      id: "hy-test-1",
      content: "test hypothesis content",
      status: "testing",
      createdAt: now(),
      updatedAt: now(),
    });

    // 5. Learning Repository
    uow.learning.addSuccess({
      id: "le-success-1",
      description: "successful test execution",
      status: "resolved",
      capturedAt: now(),
    });

    // Commit Unit of Work
    await uow.commit();

    // Verify in-memory state
    const state = sm.read();
    expect(state.attention.focus).toBe("new attention focus");
    expect(state.belief.facts).toHaveLength(1);
    expect(state.belief.facts[0]!.id).toBe("bf-test-1");
    expect(state.commitment.workflow.goal).toBe("achieve unit tests pass");
    expect(state.inference.hypotheses).toHaveLength(1);
    expect(state.learning.successes).toHaveLength(1);

    // Verify disk state
    const onDisk = await Bun.file(statePath(tempDir.path)).json();
    expect(onDisk.attention.focus).toBe("new attention focus");
    expect(onDisk.belief.facts[0].id).toBe("bf-test-1");
    expect(onDisk.commitment.workflow.goal).toBe("achieve unit tests pass");
    expect(onDisk.inference.hypotheses[0].id).toBe("hy-test-1");
    expect(onDisk.learning.successes[0].id).toBe("le-success-1");
  });

  it("should discard changes and leave memory and disk states untouched on rollback", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    const originalState = sm.read();
    const uow = sm.createUnitOfWork();

    uow.attention.update({ focus: "should not persist" });
    uow.belief.addFact({
      id: "bf-test-2",
      content: "should not persist fact",
      confidence: 0.8,
      source: "user",
      createdAt: now(),
      updatedAt: now(),
      status: "active",
    });

    uow.rollback();

    // Verify memory state is untouched
    expect(sm.read().attention.focus).toBe(originalState.attention.focus);
    expect(sm.read().belief.facts).toHaveLength(0);

    // Verify disk state is untouched
    const onDisk = await Bun.file(statePath(tempDir.path)).json();
    expect(onDisk.attention.focus).toBe(originalState.attention.focus);
    expect(onDisk.belief.facts).toHaveLength(0);
  });

  it("should throw an error when attempting to commit or rollback a completed UnitOfWork", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    const uow = sm.createUnitOfWork();
    await uow.commit();

    expect(uow.commit()).rejects.toThrow();
    expect(() => uow.rollback()).toThrow();

    const uow2 = sm.createUnitOfWork();
    uow2.rollback();

    expect(uow2.commit()).rejects.toThrow();
    expect(() => uow2.rollback()).toThrow();
  });

  it("should detect concurrency conflicts and reject commit if state was modified concurrently", async () => {
    const sm = new StateManager(tempDir.path);
    await sm.initialize();

    // Open two concurrent Units of Work
    const uow1 = sm.createUnitOfWork();
    const uow2 = sm.createUnitOfWork();

    // Modify and commit uow1
    uow1.attention.update({ focus: "uow1 focus" });
    await uow1.commit();

    // Verify uow1 committed successfully
    expect(sm.read().attention.focus).toBe("uow1 focus");

    // Modify uow2 and attempt to commit — should fail due to outdated lastPersisted
    uow2.attention.update({ focus: "uow2 focus" });

    let thrown = false;
    try {
      await uow2.commit();
    } catch (err: any) {
      if (err.message.includes("Transaction conflict")) {
        thrown = true;
      }
    }

    expect(thrown).toBe(true);

    // Verify state remains at uow1 focus
    expect(sm.read().attention.focus).toBe("uow1 focus");

    // Verify disk state remains at uow1 focus
    const onDisk = await Bun.file(statePath(tempDir.path)).json();
    expect(onDisk.attention.focus).toBe("uow1 focus");
  });
});
