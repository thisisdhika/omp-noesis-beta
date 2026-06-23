"use strict";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { StateManager } from "../../../src/infrastructure/state-manager.js";
import { createTempDir } from "../../helpers/temp-dir.js";
import { now } from "../../../src/shared/time.js";
import { type IUnitOfWork } from "../../../src/infrastructure/unit-of-work.js";
import { sampleFact, sampleDecision, sampleLearning } from "../../helpers/fixtures.js";

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

// ---------------------------------------------------------------------------
// AttentionRepository edge coverage
// ---------------------------------------------------------------------------

describe("AttentionRepository Edge Cases", () => {
  let sm: StateManager;
  let uow: IUnitOfWork;

  beforeEach(async () => {
    sm = new StateManager(tempDir.path);
    await sm.initialize();
    uow = sm.createUnitOfWork();
  });

  it("get() returns a shallow copy — mutating the returned object does not affect the segment", () => {
    const snap = uow.attention.get();
    snap.focus = "mutated";
    snap.priority = "high" as any;
    expect(uow.attention.get().focus).not.toBe("mutated");
    expect(uow.attention.get().priority).toBe("normal");
  });

  it("update() with partial fields only touches the provided fields", () => {
    const before = uow.attention.get();
    uow.attention.update({ priority: "high" as any });
    const after = uow.attention.get();
    expect(after.priority).toBe("high");
    expect(after.focus).toBe(before.focus);
    expect(after.files).toEqual(before.files);
  });

  it("update() copies array fields to prevent external mutation", () => {
    const files = ["a.ts"];
    uow.attention.update({ files });
    files.push("b.ts");
    expect(uow.attention.get().files).toEqual(["a.ts"]);
  });

  it("update() without updatedAt auto-sets the timestamp to now()", () => {
    const before = uow.attention.get().updatedAt;
    uow.attention.update({ focus: "new" });
    expect(uow.attention.get().updatedAt).not.toBe(before);
  });

  it("update() with explicit updatedAt preserves the given value", () => {
    const explicit = "2025-01-01T00:00:00.000Z";
    uow.attention.update({ focus: "new", updatedAt: explicit });
    expect(uow.attention.get().updatedAt).toBe(explicit);
  });
});

// ---------------------------------------------------------------------------
// BeliefRepository edge coverage
// ---------------------------------------------------------------------------

describe("BeliefRepository Edge Cases", () => {
  let sm: StateManager;
  let uow: IUnitOfWork;

  beforeEach(async () => {
    sm = new StateManager(tempDir.path);
    await sm.initialize();
    uow = sm.createUnitOfWork();
  });

  it("setFacts replaces all existing facts", () => {
    uow.belief.addFact(sampleFact({ id: "bf-test-set-1" }));
    expect(uow.belief.getAllFacts()).toHaveLength(1);
    uow.belief.setFacts([sampleFact({ id: "bf-test-set-2" })]);
    expect(uow.belief.getAllFacts()).toHaveLength(1);
    expect(uow.belief.getAllFacts()[0]!.id).toBe("bf-test-set-2");
  });

  it("setFacts copies the provided array to prevent external mutation", () => {
    const src = [sampleFact({ id: "bf-test-copy" })];
    uow.belief.setFacts(src);
    src.push(sampleFact({ id: "bf-test-extra" }));
    expect(uow.belief.getAllFacts()).toHaveLength(1);
  });

  it("setDecisions replaces all existing decisions", () => {
    uow.belief.addDecision(sampleDecision({ id: "bd-test-set-1" }));
    uow.belief.setDecisions([]);
    expect(uow.belief.getAllDecisions()).toHaveLength(0);
  });

  it("updateFact on a non-existent id is a no-op", () => {
    uow.belief.updateFact("bf-missing", { content: "updated" });
    expect(uow.belief.findFactById("bf-missing")).toBeUndefined();
  });

  it("updateDecision on a non-existent id is a no-op", () => {
    uow.belief.updateDecision("bd-missing", { content: "updated" });
    expect(uow.belief.findDecisionById("bd-missing")).toBeUndefined();
  });

  it("findFactById returns undefined for a missing id", () => {
    expect(uow.belief.findFactById("bf-nonexistent")).toBeUndefined();
  });

  it("findDecisionById returns undefined for a missing id", () => {
    expect(uow.belief.findDecisionById("bd-nonexistent")).toBeUndefined();
  });

  it("getAllFacts returns a copy isolated from the segment", () => {
    uow.belief.addFact(sampleFact({ id: "bf-test-copy" }));
    const facts = uow.belief.getAllFacts();
    facts.push(sampleFact({ id: "bf-test-extra" }));
    expect(uow.belief.getAllFacts()).toHaveLength(1);
  });

  it("getAllDecisions returns a copy isolated from the segment", () => {
    uow.belief.addDecision(sampleDecision({ id: "bd-test-copy" }));
    const decisions = uow.belief.getAllDecisions();
    decisions.push(sampleDecision({ id: "bd-test-extra" }));
    expect(uow.belief.getAllDecisions()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// LearningRepository edge coverage
// ---------------------------------------------------------------------------

describe("LearningRepository Edge Cases", () => {
  let sm: StateManager;
  let uow: IUnitOfWork;

  beforeEach(async () => {
    sm = new StateManager(tempDir.path);
    await sm.initialize();
    uow = sm.createUnitOfWork();
  });

  it("setSuccesses replaces all existing successes", () => {
    uow.learning.addSuccess(sampleLearning({ id: "le-s-set-1" }));
    uow.learning.setSuccesses([]);
    expect(uow.learning.getSuccesses()).toHaveLength(0);
  });

  it("setFailures replaces all existing failures", () => {
    uow.learning.addFailure(sampleLearning({ id: "le-f-set-1" }));
    uow.learning.setFailures([sampleLearning({ id: "le-f-set-2" })]);
    expect(uow.learning.getFailures()).toHaveLength(1);
    expect(uow.learning.getFailures()[0]!.id).toBe("le-f-set-2");
  });

  it("setFailures copies the provided array to prevent external mutation", () => {
    const src = [sampleLearning({ id: "le-f-copy-1" })];
    uow.learning.setFailures(src);
    src.push(sampleLearning({ id: "le-f-copy-2" }));
    expect(uow.learning.getFailures()).toHaveLength(1);
  });

  it("updateSuccess on a non-existent id is a no-op", () => {
    uow.learning.updateSuccess("le-missing", { description: "updated" });
    expect(uow.learning.getSuccesses()).toHaveLength(0);
  });

  it("updateSuccess on an existing id updates the entry", () => {
    uow.learning.addSuccess(sampleLearning({ id: "le-s-upd" }));
    uow.learning.updateSuccess("le-s-upd", { description: "updated desc" });
    expect(uow.learning.getSuccesses()[0]!.description).toBe("updated desc");
  });

  it("updateFailure on a non-existent id is a no-op", () => {
    uow.learning.addFailure(sampleLearning({ id: "le-f-upd-1" }));
    uow.learning.updateFailure("le-f-missing", { description: "updated" });
    expect(uow.learning.getFailures()[0]!.description).toBe("Test learning entry");
  });

  it("getSummary returns a copy isolated from the segment", () => {
    const summary = uow.learning.getSummary();
    summary.successCount = 99;
    expect(uow.learning.getSummary().successCount).toBe(0);
  });
});
