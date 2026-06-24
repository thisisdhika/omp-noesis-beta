"use strict";

/**
 * Tests for Rec 6: Typed Lesson Schema.
 * Covers schema validation, lesson retrieval, prevention gating, and auto-apply.
 */

import { describe, it, expect } from "bun:test";
import {
  LearningEntrySchema,
  LessonTriggerSchema,
  LessonDiagnosisSchema,
  LessonInterventionSchema,
  LessonPreventionSchema,
  type LearningEntry,
} from "../../../src/domains/learning/schema.js";
import { matchSituation, shouldApply } from "../../../src/domains/learning/lesson-retrieval.js";
import { ApplyLessonUseCase } from "../../../src/application/use-cases/apply-lesson.js";
import type { IUnitOfWork } from "../../../src/infrastructure/unit-of-work.js";

// ---------------------------------------------------------------------------
// Minimal mock repositories
// ---------------------------------------------------------------------------
class MockBeliefRepo {
  facts: Array<Record<string, unknown>> = [];
  decisions: Array<Record<string, unknown>> = [];
  addFact(fact: Record<string, unknown>) { this.facts.push(fact); }
  addDecision(d: Record<string, unknown>) { this.decisions.push(d); }
  findFactById(id: string) { return this.facts.find((f: Record<string, unknown>) => f.id === id); }
  findDecisionById(id: string) { return this.decisions.find((d: Record<string, unknown>) => d.id === id); }
  getAllFacts() { return this.facts; }
  getAllDecisions() { return this.decisions; }
  setFacts(facts: Array<Record<string, unknown>>) { this.facts = facts; }
  setDecisions(decisions: Array<Record<string, unknown>>) { this.decisions = decisions; }
  updateFact(id: string, updates: Record<string, unknown>) {
    const f = this.facts.find((f: Record<string, unknown>) => f.id === id);
    if (f) Object.assign(f, updates);
  }
  updateDecision(id: string, updates: Record<string, unknown>) {
    const d = this.decisions.find((d: Record<string, unknown>) => d.id === id);
    if (d) Object.assign(d, updates);
  }
}

class MockInferenceRepo {
  hypotheses: Array<Record<string, unknown>> = [];
  reasoningSteps: Array<Record<string, unknown>> = [];
  addHypothesis(h: Record<string, unknown>) { this.hypotheses.push(h); }
  getAllHypotheses() { return this.hypotheses; }
  addReasoningStep(step: Record<string, unknown>) { this.reasoningSteps.push(step); }
  findHypothesisById(id: string) { return this.hypotheses.find(h => (h as any).id === id); }
  getAllReasoningSteps() { return this.reasoningSteps; }
  updateHypothesis(id: string, updates: Record<string, unknown>) {
    const h = this.hypotheses.find(h => (h as any).id === id);
    if (h) Object.assign(h, updates);
  }
  setHypotheses(hypotheses: Array<Record<string, unknown>>) { this.hypotheses = hypotheses; }
}

class MockAttentionRepo {
  get() { return { focus: "", priority: "normal" as const, graphQueries: [], files: [], graphFindings: [], pendingEvidence: [], updatedAt: "" }; }
  set(_a: any) {}
  update(_u: any) {}
}

class MockCommitmentRepo {
  getWorkflow() { return { goal: "", steps: [] }; }
  setWorkflow(_w: any) {}
  getActions() { return []; }
  addAction(_a: any) {}
  setActions(_a: any) {}
}

class MockLearningRepo {
  successes: Array<Record<string, unknown>> = [];
  failures: Array<Record<string, unknown>> = [];
  getSuccesses() { return this.successes; }
  getFailures() { return this.failures; }
  getSummary() { return { successCount: 0, failureCount: 0, resolvedCount: 0 }; }
  addSuccess(e: any) { this.successes.push(e); }
  addFailure(e: any) { this.failures.push(e); }
  updateSummary(_s: any) {}
  updateSuccess(_id: string, _u: any) {}
  updateFailure(_id: string, _u: any) {}
  setSuccesses(e: any) { this.successes = e; }
  setFailures(e: any) { this.failures = e; }
}
// ponytail: mock repos don't fully implement repo interfaces — cast at callsites
class MockUnitOfWork {
  readonly attention = new MockAttentionRepo();
  readonly belief = new MockBeliefRepo();
  readonly inference = new MockInferenceRepo();
  readonly commitment = new MockCommitmentRepo();
  readonly learning = new MockLearningRepo();
  committed = false;
  async commit() { this.committed = true; }
  rollback() { this.committed = false; }
}

const ts = () => new Date().toISOString();

// Helper to build a minimal valid LearningEntry
function makeEntry(overrides: Partial<LearningEntry>): LearningEntry {
  return LearningEntrySchema.parse({
    id: "le-test-" + Math.random().toString(36).slice(2, 8),
    description: "test",
    status: "captured",
    capturedAt: ts(),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------
describe("Lesson schema validation", () => {
  it("accepts a minimal learning entry without lesson fields", () => {
    const entry = {
      id: "le-abc-123",
      description: "Failed to parse structured output",
      status: "captured" as const,
      capturedAt: ts(),
    };
    const result = LearningEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it("accepts trigger, diagnosis, intervention, prevention, retrievalKeys", () => {
    const entry = {
      id: "le-abc-456",
      description: "Learned to validate tool params",
      status: "captured" as const,
      capturedAt: ts(),
      trigger: { pattern: "tool X returns malformed JSON", toolName: "some-tool" },
      diagnosis: { rootCause: "Missing JSON schema validation", graphNodes: ["node-1"] },
      intervention: { fix: "Add JSON schema validation", confidence: 0.85 },
      prevention: { beliefStatement: "Always validate JSON output before parsing", autoApplied: true },
      retrievalKeys: ["json-validation", "tool-output"],
    };
    const result = LearningEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it("rejects trigger.pattern exceeding 200 chars", () => {
    const result = LessonTriggerSchema.safeParse({ pattern: "x".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("rejects diagnosis.rootCause exceeding 1000 chars", () => {
    const result = LessonDiagnosisSchema.safeParse({ rootCause: "x".repeat(1001) });
    expect(result.success).toBe(false);
  });

  it("rejects intervention.confidence out of [0,1] range", () => {
    const over = LessonInterventionSchema.safeParse({ fix: "fix it", confidence: 1.5 });
    const under = LessonInterventionSchema.safeParse({ fix: "fix it", confidence: -0.1 });
    expect(over.success).toBe(false);
    expect(under.success).toBe(false);
  });

  it("defaults prevention.autoApplied to false", () => {
    const result = LessonPreventionSchema.parse({
      beliefStatement: "Some belief",
    });
    expect(result.autoApplied).toBe(false);
  });

  it("rejects more than 5 retrievalKeys", () => {
    const entry = {
      id: "le-abc-789",
      description: "test",
      status: "captured" as const,
      capturedAt: ts(),
      retrievalKeys: ["a", "b", "c", "d", "e", "f"],
    };
    const result = LearningEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchSituation
// ---------------------------------------------------------------------------
describe("matchSituation", () => {
  it("returns lessons that share retrieval keys with current keys", () => {
    const lessons = [
      makeEntry({ retrievalKeys: ["json", "parse"] }),
      makeEntry({ retrievalKeys: ["auth", "token"] }),
      makeEntry({ retrievalKeys: ["json"] }),
    ];
    const result = matchSituation(lessons, ["json", "auth"]);
    expect(result).toHaveLength(3);
  });

  it("returns empty array when no keys match", () => {
    const lessons = [makeEntry({ retrievalKeys: ["json"] })];
    const result = matchSituation(lessons, ["css"]);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty currentKeys", () => {
    const lessons = [makeEntry({ retrievalKeys: ["json"] })];
    expect(matchSituation(lessons, [])).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const lessons = [makeEntry({ retrievalKeys: ["JSON"] })];
    const result = matchSituation(lessons, ["json"]);
    expect(result).toHaveLength(1);
  });

  it("sorts by matched-key count descending", () => {
    const lessons = [
      makeEntry({ retrievalKeys: ["json"] }),
      makeEntry({ retrievalKeys: ["json", "parse"] }),
    ];
    const result = matchSituation(lessons, ["json", "parse"]);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe(lessons[1]!.id);
  });

  it("handles lessons without retrievalKeys gracefully", () => {
    const lessons = [makeEntry({})];
    const result = matchSituation(lessons, ["json"]);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// shouldApply
// ---------------------------------------------------------------------------
describe("shouldApply", () => {
  it("returns true when autoApplied and confidence >= 0.7", () => {
    expect(shouldApply({ beliefStatement: "test", autoApplied: true, confidence: 0.7 })).toBe(true);
    expect(shouldApply({ beliefStatement: "test", autoApplied: true, confidence: 0.85 })).toBe(true);
  });

  it("returns false when autoApplied is false even with high confidence", () => {
    expect(shouldApply({ beliefStatement: "test", autoApplied: false, confidence: 0.9 })).toBe(false);
  });

  it("returns false when confidence < 0.7 even if autoApplied", () => {
    expect(shouldApply({ beliefStatement: "test", autoApplied: true, confidence: 0.69 })).toBe(false);
  });

  it("returns false when both conditions fail", () => {
    expect(shouldApply({ beliefStatement: "test", autoApplied: false, confidence: 0.5 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ApplyLessonUseCase
// ---------------------------------------------------------------------------
describe("ApplyLessonUseCase", () => {
  it("creates a belief fact when prevention should apply", async () => {
    const uow = new MockUnitOfWork();
    const useCase = new ApplyLessonUseCase(uow as unknown as IUnitOfWork);
    const lesson = makeEntry({
      status: "resolved",
      intervention: { fix: "fix it", confidence: 0.85 },
      prevention: { beliefStatement: "Always validate input", autoApplied: true },
    });
    const result = await useCase.execute({ lesson });
    expect(result.applied).toBe(true);
    expect(result.factId).toBeTruthy();
    const facts = (uow.belief as MockBeliefRepo).facts;
    expect(facts).toHaveLength(1);
    expect(facts[0]!.content).toBe("Always validate input");
    expect(facts[0]!.source).toBe("inference");
    expect(facts[0]!.epistemicStatus).toBe("probable");
  });

  it("does not create belief when prevention is missing", async () => {
    const uow = new MockUnitOfWork();
    const useCase = new ApplyLessonUseCase(uow as unknown as IUnitOfWork);
    const lesson = makeEntry({});
    const result = await useCase.execute({ lesson });
    expect(result.applied).toBe(false);
    expect(result.factId).toBeNull();
    expect((uow.belief as MockBeliefRepo).facts).toHaveLength(0);
  });

  it("does not create belief when shouldApply returns false", async () => {
    const uow = new MockUnitOfWork();
    const useCase = new ApplyLessonUseCase(uow as unknown as IUnitOfWork);
    const lesson = makeEntry({
      status: "resolved",
      intervention: { fix: "fix it", confidence: 0.5 },
      prevention: { beliefStatement: "Do something", autoApplied: true },
    });
    const result = await useCase.execute({ lesson });
    expect(result.applied).toBe(false);
    expect(result.factId).toBeNull();
    expect((uow.belief as MockBeliefRepo).facts).toHaveLength(0);
  });
});
