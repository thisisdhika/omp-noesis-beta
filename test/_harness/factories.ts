import type {
  NoesisState,
  BeliefFact,
  BeliefDecision,
  Hypothesis,
  LearningEntry,
  WorkflowStep,
  Workflow,
} from "../../src/schema.js";
import { EMPTY_STATE } from "../../src/schema.js";
import { nowISO } from "../../src/shared/time.js";

/** Short random id for test fixtures. */
function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------
// Entity factories
// ---------------------------------------------------------------------------

export function makeFact(overrides?: Partial<BeliefFact>): BeliefFact {
  return {
    id: `bf-${shortId()}`,
    content: "test fact",
    confidence: 0.95,
    source: "execution",
    status: "active",
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

export function makeDecision(overrides?: Partial<BeliefDecision>): BeliefDecision {
  return {
    id: `bd-${shortId()}`,
    content: "test decision",
    rationale: "test rationale",
    source: "execution",
    status: "active",
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

export function makeHypothesis(overrides?: Partial<Hypothesis>): Hypothesis {
  return {
    id: `hy-${shortId()}`,
    content: "test hypothesis",
    status: "testing",
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

export function makeLearningEntry(overrides?: Partial<LearningEntry>): LearningEntry {
  return {
    id: `le-${shortId()}`,
    description: "test learning",
    capturedAt: nowISO(),
    ...overrides,
  };
}

export function makeWorkflowStep(overrides?: Partial<WorkflowStep>): WorkflowStep {
  return {
    id: `ws-${shortId()}`,
    description: "test step",
    status: "pending",
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

export function makeWorkflow(overrides?: Partial<Workflow>): Workflow {
  return {
    goal: "test workflow",
    status: "draft",
    steps: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// State factories
// ---------------------------------------------------------------------------

export function makeState(overrides?: Partial<NoesisState>): NoesisState {
  return { ...EMPTY_STATE(), ...overrides };
}

export function makeStateWithFacts(facts: BeliefFact[]): NoesisState {
  return makeState({ belief: { facts: [...facts], decisions: [] } });
}

export function makeStateWithDecisions(decisions: BeliefDecision[]): NoesisState {
  return makeState({ belief: { facts: [], decisions: [...decisions] } });
}

export function makeStateWithHypotheses(hypotheses: Hypothesis[]): NoesisState {
  return makeState({ inference: { hypotheses: [...hypotheses], reasoning: [] } });
}
