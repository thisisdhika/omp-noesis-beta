# omp-noesis: Cognitive State Schema

> **Version:** 0.1.0  
> **Date:** 2026-06-15  
> **Status:** Finalized

## 1. Purpose

Defines the exact shape of `.omp/noesis/state.json`. This is the contract between all modules, tools, hooks, and the persistence layer.

## 2. Top-Level Shape

```typescript
interface NoesisState {
  version: number;           // Schema version (1)
  lastPersisted: string;     // ISO 8601
  attention: AttentionLayer;
  belief: BeliefLayer;
  inference: InferenceLayer;
  commitment: CommitmentLayer;
  learning: LearningLayer;
}
```

## 3. Attention Layer (Ephemeral)

```typescript
interface AttentionLayer {
  focus: string;             // Max 200 chars
  priority: "critical" | "high" | "normal" | "low";
  graphQueries: string[];      // Max 5
  files: string[];            // Max 10
  graphFindings: GraphFinding[]; // Ephemeral, cleared after render
  contextUsage: number;       // Token estimate
  updatedAt: string;           // ISO 8601
}

interface GraphFinding {
  query: string;
  nodes: string[];
  relations: string[];
  confidence: "EXTRACTED" | "INFERRED" | "AMBIGUOUS";
  inferredConfidence?: number; // 0.55 | 0.65 | 0.75 | 0.85 | 0.95
  community?: string;
  godNodes?: string[];
  surprisingConnections?: string[];
  rawOutput?: string;          // Unparseable portion
  timestamp: string;           // ISO 8601
}
```

## 4. Belief Layer (Durable)

### 4.1 Facts

```typescript
interface BeliefFact {
  id: string;                 // "bf-{uuid}"
  content: string;            // The proposition
  confidence: number;         // 0.0 - 1.0
  source: "graph" | "execution" | "user" | "inference";
  createdAt: string;          // ISO 8601
  updatedAt: string;          // ISO 8601
  status: "active" | "superseded" | "archived";
  supersededBy?: string;      // BeliefFact.id
  tags?: string[];            // Max 5
  communityScope?: string;    // From Graphify community
  evidence?: string;          // Max 500 chars
}
```

### 4.2 Decisions

```typescript
interface BeliefDecision {
  id: string;                 // "bd-{uuid}"
  content: string;            // What was decided
  rationale: string;          // Why
  alternatives?: string[];      // Rejected options, max 3
  source: "graph" | "execution" | "user" | "inference";
  createdAt: string;
  updatedAt: string;
  status: "active" | "superseded" | "archived";
  supersededBy?: string;      // BeliefDecision.id
  tags?: string[];
}
```

### 4.3 Confidence Thresholds

| Range | Classification | Preamble | Survivor |
|---|---|---|---|
| 0.75 - 1.00 | Active | Eligible | Eligible |
| 0.50 - 0.74 | Low-confidence | Counted only | Not eligible |
| 0.00 - 0.49 | Not promoted | Hidden | Not eligible |

### 4.4 Graphify Confidence Mapping

| Graphify | Noesis | Stale Penalty | Result |
|---|---|---|---|
| EXTRACTED | 1.0 | 0.0 | 1.0 |
| INFERRED 0.95 | 0.95 | -0.10 | 0.85 |
| INFERRED 0.85 | 0.85 | -0.10 | 0.75 |
| INFERRED 0.75 | 0.75 | -0.10 | 0.65 |
| INFERRED 0.65 | 0.65 | -0.10 | 0.55 |
| INFERRED 0.55 | 0.55 | 0.00 | 0.55 |
| AMBIGUOUS | Never promoted | — | Not converted |

## 5. Inference Layer (Intermediate)

```typescript
interface InferenceLayer {
  hypotheses: Hypothesis[];
  reasoning: ReasoningStep[];
}

interface Hypothesis {
  id: string;                 // "hy-{uuid}"
  content: string;
  status: "testing" | "confirmed" | "refuted" | "abandoned";
  evidence?: string;
  relatedBeliefId?: string;   // Auto-populated if promoted
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

interface ReasoningStep {
  id: string;                 // "rs-{uuid}"
  content: string;
  relatesTo?: string;         // Hypothesis.id | BeliefFact.id | BeliefDecision.id
  createdAt: string;
}
```

### 5.1 Status Transitions

```
testing → confirmed   (evidence supported)
testing → refuted     (evidence contradicted)
testing → abandoned   (no longer relevant)
```

## 6. Commitment Layer (Actionable)

```typescript
interface CommitmentLayer {
  workflow: Workflow;
  actions: PlannedAction[];
}

interface Workflow {
  id: string;                 // "wf-{uuid}"
  goal: string;
  status: "draft" | "active" | "done" | "abandoned";
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

interface WorkflowStep {
  id: string;                 // "ws-{uuid}"
  description: string;
  status: "pending" | "active" | "done" | "skipped";
  dependsOn?: string[];       // WorkflowStep.id[]
  verification?: string;      // Command to verify
  createdAt: string;
  updatedAt: string;
}

interface PlannedAction {
  id: string;                 // "pa-{uuid}"
  content: string;
  priority: "critical" | "high" | "normal" | "low";
  createdAt: string;
}
```

### 6.1 Workflow Status Lifecycle

```
draft → active → done | abandoned
```

When a new workflow becomes active, the previous active workflow is auto-archived.

### 6.2 Step Status Lifecycle

```
pending → active → done | skipped
```

## 7. Learning Layer (Experiential)

```typescript
interface LearningLayer {
  successes: LearningEntry[];
  failures: LearningEntry[];
  summary: LearningSummary;
}

interface LearningEntry {
  id: string;                 // "le-{uuid}"
  description: string;         // Max 500 chars
  rootCause?: string;          // Max 1000 chars
  fix?: string;               // Max 1000 chars
  skillScope?: string;         // Domain tag
  toolName?: string;           // Tool that produced result
  status: "captured" | "diagnosed" | "resolved";
  capturedAt: string;
  resolvedAt?: string;
  impact?: number;            // 0-1, agent-assigned
}

interface LearningSummary {
  successCount: number;
  failureCount: number;
  resolvedCount: number;
  diagnosedCount: number;
}
```

### 7.1 Ranking Formula

```
rank = recency × taskRelevance × failureMultiplier × resolvedFixMultiplier
```

- `recency`: 1.0 base, decays 0.2 per older sibling
- `taskRelevance`: 1.0 same domain, 0.5 different, 0.0 unrelated
- `failureMultiplier`: 2.0 (failure), 1.0 (success)
- `resolvedFixMultiplier`: 2.0 (rootCause + fix), 1.0 (not resolved)

### 7.2 Survivor Caps

| Category | Cap |
|---|---|
| Focus | 2 sentences |
| Workflow | 3 items (goal + current + next) |
| Active decisions | 5 |
| Active beliefs (≥0.75) | 10 |
| Unresolved hypotheses | 3 |
| Learning entries | 3 |
| Learning counters | Always |
| State file pointer | 1 |

## 8. Persistence Contract

### 8.1 File Location
```
.omp/noesis/state.json
```

### 8.2 Atomic Write Protocol
```
1. Serialize to JSON
2. Write to .omp/noesis/state.json.tmp.{pid}
3. fsync the temp file
4. Rename to .omp/noesis/state.json
```

### 8.3 Read Protocol
```
1. If file doesn't exist → return EMPTY_STATE
2. Read and parse JSON
3. Validate with Zod
4. If malformed → throw with path and reason
5. If version mismatch → run migration
6. Return validated state
```

## 9. Schema Versioning

```typescript
const CURRENT_VERSION = 1;
```

Migration functions are sequential and composable: `v0→v1`, `v1→v2`, etc.
Failed migration works on a copy, never corrupts the original.

## 10. Empty State

```typescript
const EMPTY_STATE: NoesisState = {
  version: 1,
  lastPersisted: new Date().toISOString(),
  attention: { focus: "", priority: "normal", graphQueries: [], files: [], graphFindings: [], contextUsage: 0, updatedAt: new Date().toISOString() },
  belief: { facts: [], decisions: [] },
  inference: { hypotheses: [], reasoning: [] },
  commitment: { workflow: { id: generateId("wf"), goal: "", status: "draft", steps: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, actions: [] },
  learning: { successes: [], failures: [], summary: { successCount: 0, failureCount: 0, resolvedCount: 0, diagnosedCount: 0 } },
};
```
