import { describe, it, expect } from "bun:test";
import { ResolveLearningUseCase } from "../../../src/application/use-cases/resolve-learning.js";
import { ConfirmHypothesisUseCase } from "../../../src/application/use-cases/confirm-hypothesis.js";
import { AddBeliefFactUseCase } from "../../../src/application/use-cases/add-belief-fact.js";
import { AttendUseCase } from "../../../src/application/use-cases/attend.js";
import { EndTurnCleanupUseCase } from "../../../src/application/use-cases/end-turn-cleanup.js";
import type { IUnitOfWork } from "../../../src/infrastructure/unit-of-work.js";
import { CAPS } from "../../../src/shared/schema-base.js";

class MockAttentionRepository {
  private data: any = {
    focus: "",
    priority: "normal",
    graphQueries: [],
    files: [],
    graphFindings: [],
    pendingEvidence: [],
    updatedAt: new Date().toISOString(),
  };
  get() {
    return this.data;
  }
  set(attention: any) {
    this.data = attention;
  }
  update(updates: any) {
    this.data = { ...this.data, ...updates };
  }
}

class MockBeliefRepository {
  facts: any[] = [];
  decisions: any[] = [];
  addFact(fact: any) {
    this.facts.push(fact);
  }
  addDecision(decision: any) {
    this.decisions.push(decision);
  }
  findFactById(id: string) {
    return this.facts.find((f) => f.id === id);
  }
  findDecisionById(id: string) {
    return this.decisions.find((d) => d.id === id);
  }
  getAllFacts() {
    return this.facts;
  }
  getAllDecisions() {
    return this.decisions;
  }
  updateFact(id: string, updates: any) {
    const fact = this.findFactById(id);
    if (fact) Object.assign(fact, updates);
  }
  updateDecision(id: string, updates: any) {
    const dec = this.findDecisionById(id);
    if (dec) Object.assign(dec, updates);
  }
  setFacts(facts: any[]) {
    this.facts = facts;
  }
  setDecisions(decisions: any[]) {
    this.decisions = decisions;
  }
}

class MockInferenceRepository {
  hypotheses: any[] = [];
  steps: any[] = [];
  addHypothesis(hypothesis: any) {
    this.hypotheses.push(hypothesis);
  }
  addReasoningStep(step: any) {
    this.steps.push(step);
  }
  findHypothesisById(id: string) {
    return this.hypotheses.find((h) => h.id === id);
  }
  getAllHypotheses() {
    return this.hypotheses;
  }
  getAllReasoningSteps() {
    return this.steps;
  }
  updateHypothesis(id: string, updates: any) {
    const hyp = this.findHypothesisById(id);
    if (hyp) Object.assign(hyp, updates);
  }
  setHypotheses(hypotheses: any[]) {
    this.hypotheses = hypotheses;
  }
}

class MockCommitmentRepository {
  workflow: any = {
    id: "wf-1",
    goal: "",
    status: "draft",
    steps: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  actions: any[] = [];
  getWorkflow() {
    return this.workflow;
  }
  setWorkflow(workflow: any) {
    this.workflow = workflow;
  }
  getActions() {
    return this.actions;
  }
  addAction(action: any) {
    this.actions.push(action);
  }
  setActions(actions: any[]) {
    this.actions = actions;
  }
}

class MockLearningRepository {
  successes: any[] = [];
  failures: any[] = [];
  summary: any = { successCount: 0, failureCount: 0, resolvedCount: 0, diagnosedCount: 0 };
  getSuccesses() {
    return this.successes;
  }
  getFailures() {
    return this.failures;
  }
  getSummary() {
    return this.summary;
  }
  addSuccess(entry: any) {
    this.successes.push(entry);
  }
  addFailure(entry: any) {
    this.failures.push(entry);
  }
  updateSummary(summary: any) {
    this.summary = summary;
  }
  updateSuccess(id: string, updates: any) {
    const entry = this.successes.find((e) => e.id === id);
    if (entry) Object.assign(entry, updates);
  }
  updateFailure(id: string, updates: any) {
    const entry = this.failures.find((e) => e.id === id);
    if (entry) Object.assign(entry, updates);
  }
  setSuccesses(entries: any[]) {
    this.successes = entries;
  }
  setFailures(entries: any[]) {
    this.failures = entries;
  }
}

class MockUnitOfWork implements IUnitOfWork {
  attention = new MockAttentionRepository();
  belief = new MockBeliefRepository();
  inference = new MockInferenceRepository();
  commitment = new MockCommitmentRepository();
  learning = new MockLearningRepository();
  committed = false;
  async commit() {
    this.committed = true;
  }
  rollback() {}
}

describe("ResolveLearningUseCase", () => {
  it("resolves success learning entry and creates belief fact", async () => {
    const uow = new MockUnitOfWork();
    uow.learning.addSuccess({
      id: "le-1",
      description: "Successfully run build",
      status: "captured",
      capturedAt: new Date().toISOString(),
    });

    const useCase = new ResolveLearningUseCase(uow);
    const factId = await useCase.execute({
      learningId: "le-1",
      rootCause: "missing build config resolved",
      fix: "added config file",
    });

    expect(factId).toBeDefined();
    expect(uow.learning.getSuccesses()[0].status).toBe("resolved");
    expect(uow.learning.getSummary().resolvedCount).toBe(1);

    const fact = uow.belief.findFactById(factId);
    expect(fact).toBeDefined();
    expect(fact!.content).toContain("Successfully run build");
    expect(fact!.content).toContain("Root cause: missing build config resolved");
    expect(fact!.content).toContain("Fix: added config file");
    expect(fact!.confidence).toBe(0.85);
    expect(uow.committed).toBe(true);
  });

  it("throws error if entry is not found", async () => {
    const uow = new MockUnitOfWork();
    const useCase = new ResolveLearningUseCase(uow);
    expect(useCase.execute({ learningId: "le-invalid", rootCause: "", fix: "" })).rejects.toThrow(
      "Learning entry not found: le-invalid",
    );
  });
});

describe("ConfirmHypothesisUseCase", () => {
  it("confirms hypothesis and auto-promotes it to a belief fact by default", async () => {
    const uow = new MockUnitOfWork();
    uow.inference.addHypothesis({
      id: "hy-1",
      content: "Node is faster than Deno",
      status: "testing",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const useCase = new ConfirmHypothesisUseCase(uow);
    const result = await useCase.execute({ id: "hy-1" });

    expect(result.hypothesisId).toBe("hy-1");
    expect(result.beliefFactId).toBeDefined();
    expect(uow.inference.findHypothesisById("hy-1")!.status).toBe("confirmed");
    expect(uow.inference.findHypothesisById("hy-1")!.relatedBeliefId).toBe(result.beliefFactId);

    const fact = uow.belief.findFactById(result.beliefFactId!);
    expect(fact).toBeDefined();
    expect(fact!.content).toBe("Node is faster than Deno");
    expect(fact!.confidence).toBe(0.85);
    expect(uow.committed).toBe(true);
  });

  it("confirms hypothesis but does not auto-promote if autoPromote is false", async () => {
    const uow = new MockUnitOfWork();
    uow.inference.addHypothesis({
      id: "hy-1",
      content: "Node is faster than Deno",
      status: "testing",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const useCase = new ConfirmHypothesisUseCase(uow);
    const result = await useCase.execute({ id: "hy-1", autoPromote: false });

    expect(result.hypothesisId).toBe("hy-1");
    expect(result.beliefFactId).toBeUndefined();
    expect(uow.inference.findHypothesisById("hy-1")!.status).toBe("confirmed");
    expect(uow.inference.findHypothesisById("hy-1")!.relatedBeliefId).toBeUndefined();
    expect(uow.belief.getAllFacts()).toHaveLength(0);
    expect(uow.committed).toBe(true);
  });
});

describe("AddBeliefFactUseCase", () => {
  it("adds belief fact and handles AGM contradictions", async () => {
    const uow = new MockUnitOfWork();
    uow.belief.addFact({
      id: "bf-1",
      content: "Initial statement",
      confidence: 0.9,
      source: "user",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
    });
    uow.inference.addHypothesis({
      id: "hy-1",
      content: "Dependent hyp",
      status: "testing",
      relatedBeliefId: "bf-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const useCase = new AddBeliefFactUseCase(uow);
    const result = await useCase.execute({
      content: "New contradiction statement",
      confidence: 0.95,
      source: "user",
      contradicts: ["bf-1"],
    });

    expect(result.factId).toBeDefined();
    expect(result.contestedWarnings).toHaveLength(1);
    expect(result.contestedWarnings[0]).toContain("Initial statement");

    const oldFact = uow.belief.findFactById("bf-1");
    expect(oldFact!.status).toBe("superseded");
    expect(oldFact!.supersededBy).toBe(result.factId);

    const newFact = uow.belief.findFactById(result.factId);
    expect(newFact).toBeDefined();
    expect(newFact!.content).toBe("New contradiction statement");
    expect(newFact!.confidence).toBe(0.95);
    expect(uow.committed).toBe(true);
  });
});

describe("AttendUseCase", () => {
  it("updates focus and files in attention layer", async () => {
    const uow = new MockUnitOfWork();
    const useCase = new AttendUseCase(uow);
    await useCase.execute({
      focus: "New cognitive focus",
      priority: "high",
      files: ["src/index.ts"],
    });

    const att = uow.attention.get();
    expect(att.focus).toBe("New cognitive focus");
    expect(att.priority).toBe("high");
    expect(att.files).toEqual(["src/index.ts"]);
    expect(uow.committed).toBe(true);
  });
});

describe("EndTurnCleanupUseCase", () => {
  it("evicts stale items and limits capacities", async () => {
    const uow = new MockUnitOfWork();
    
    // Add expired/stale belief fact (stale threshold is 720 hours)
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setHours(thirtyOneDaysAgo.getHours() - 744); // 31 days ago
    
    uow.belief.addFact({
      id: "bf-stale",
      content: "Stale fact",
      confidence: 0.8,
      source: "user",
      createdAt: thirtyOneDaysAgo.toISOString(),
      updatedAt: thirtyOneDaysAgo.toISOString(),
      status: "archived",
    });

    // Add normal active fact
    uow.belief.addFact({
      id: "bf-active",
      content: "Active fact",
      confidence: 0.8,
      source: "user",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
    });

    // Enforce limits: create more successes than CAPS.learningEntries limit (which is 100)
    for (let i = 0; i < CAPS.learningEntries + 10; i++) {
      uow.learning.addSuccess({
        id: `le-success-${i}`,
        description: `Success ${i}`,
        status: "captured",
        capturedAt: new Date().toISOString(),
      });
    }

    const useCase = new EndTurnCleanupUseCase(uow);
    const cleanupResult = await useCase.execute();

    expect(cleanupResult.evictedCount).toBeGreaterThan(0);
    expect(uow.belief.findFactById("bf-stale")).toBeUndefined();
    expect(uow.belief.findFactById("bf-active")).toBeDefined();
    expect(uow.learning.getSuccesses()).toHaveLength(CAPS.learningEntries);
    expect(uow.committed).toBe(true);
  });
});
