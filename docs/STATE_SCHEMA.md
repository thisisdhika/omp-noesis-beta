# Cognitive State Schema

> **Version:** 1.0.1 | **Updated:** 2026-06-24

Defines the exact shape of `.omp/noesis/state.json` — the contract between all modules, tools, hooks, and the persistence layer.

## Top-Level Shape

```
interface NoesisState {
  version: number;          // Schema version (1)
  lastPersisted: string;    // ISO 8601
  attention: AttentionLayer;
  belief: BeliefLayer;
  inference: InferenceLayer;
  commitment: CommitmentLayer;
  learning: LearningLayer;
}
```

## Attention Layer (Ephemeral)

```
interface AttentionLayer {
  focus: string;               // ≤200 chars
  priority: "critical"|"high"|"normal"|"low";
  graphQueries: string[];       // ≤5
  files: string[];              // ≤10
  graphFindings: GraphFinding[];// Cleared after render
  pendingEvidence: PendingEvidenceEntry[]; // Auto-decays 3 turns
  updatedAt: string;
}

interface GraphFinding {
  query: string;
  nodes: string[];
  relations: string[];
  confidence: "EXTRACTED"|"INFERRED"|"AMBIGUOUS";
  inferredConfidence?: number;  // 0.55 | 0.65 | 0.75 | 0.85 | 0.95
  community?: string;
  godNodes?: string[];
  surprisingConnections?: string[];
  rawOutput?: string;
  timestamp: string;
}
```

## Belief Layer (Durable)

### Facts

```
interface BeliefFact {
  id: string;              // "bf-{uuid}"
  content: string;         // The proposition
  confidence: number;      // 0.0 - 1.0
  source: "graph"|"execution"|"user"|"inference"|"omp-memory"|"obsidian-import";
  createdAt: string;
  updatedAt: string;
  status: "active"|"superseded"|"archived";
  supersededBy?: string;
  tags?: string[];          // ≤5
  communityScope?: string;
  evidence?: string;        // ≤500 chars
}
```

### Decisions

```
interface BeliefDecision {
  id: string;              // "bd-{uuid}"
  content: string;
  rationale: string;
  alternatives?: string[];  // ≤3
  source: "graph"|"execution"|"user"|"inference"|"omp-memory"|"obsidian-import";
  createdAt: string;
  updatedAt: string;
  status: "active"|"superseded"|"archived";
  supersededBy?: string;
  tags?: string[];
}
```

### Confidence Thresholds

| Range | Classification | Preamble | Survivor |
|---|---|---|---|
| 0.75–1.00 | Active | Eligible | Eligible |
| 0.50–0.74 | Low-confidence | Counted only | Not eligible |
| 0.00–0.49 | Not promoted | Hidden | Not eligible |

### Graphify Confidence Mapping

Graphify labels → numeric values via `mapGraphConfidence()`:

| Graphify Label | Base Value | Stale (-0.10) |
|---|---|---|
| EXTRACTED | 1.00 | 1.00 (no penalty) |
| INFERRED 0.95 | 0.95 | 0.85 |
| INFERRED 0.85 | 0.85 | 0.75 |
| INFERRED 0.75 | 0.75 | 0.65 |
| INFERRED 0.65 | 0.65 | 0.55 |
| INFERRED 0.55 | 0.55 | 0.55 (floored) |
| AMBIGUOUS | 0.55 | Never promoted |

Stale penalty is -0.10, floored at 0.55. Applied at belief-commit time when the graph is stale (>720h since source newer than graph).

## Inference Layer (Intermediate)

```
interface InferenceLayer {
  hypotheses: Hypothesis[];
  reasoning: ReasoningStep[];
}
```

Hypothesis status transitions: `testing → confirmed | refuted | abandoned`

## Commitment Layer (Actionable)

```
interface CommitmentLayer {
  workflow: Workflow;
  actions: PlannedAction[];
}
```

Workflow lifecycle: `draft → active → done | abandoned`
Step lifecycle: `pending → active → done | skipped`

## Learning Layer (Experiential)

```
interface LearningLayer {
  successes: LearningEntry[];
  failures: LearningEntry[];
  summary: LearningSummary;
}
```

Ranking formula: `rank = recency × taskRelevance × failureMultiplier × resolvedFixMultiplier`

### Survivor Caps

| Category | Cap |
|---|---|
| Focus | 2 sentences (200 chars) |
| Workflow | Goal + current + next step (3 items) |
| Active decisions | 5 |
| Active beliefs (≥0.75) | 10 |
| Graph queries | 5 |
| Files | 10 |
| Unresolved hypotheses | 3 |
| Workflow steps | 20 |
| Actions | 50 |
| Learning entries (stored) | 100 |
| Learning (preamble) | 3 (top-ranked) |

## OMP Memory Hydration

At session start, `HydrateFromMemoryUseCase` queries OMP memory for cross-session durability:

| Step | Description |
|---|---|
| Query | Searches OMP memory for `[noesis/belief]` and `[noesis/decision]` prefixed entries |
| Parse | Extracts `content`, `confidence`, `tags`, `source` from structured context strings |
| Dedup | Content-hash comparison (`sha256(0-128) → 16-char hex`) against existing state.json entries |
| Cap | Imported confidence capped at `Math.min(confidence, 0.75)` — OMP entries are supplements |
| Source | Imported entries receive `source: "omp-memory"` |
| Commit | Batch commit via `UnitOfWork`; zero hydrated entries → no write |

### Deduplication

`contentHash()` hashes the first 128 chars of content. An entry is skipped when its hash already exists in the current belief layer (facts or decisions).

### Graceful Degradation

| Condition | Behavior |
|---|---|
| OMP memory backend unavailable | Returns `{ imported: 0, skipped: 0, status: { backend: "off" } }` — no-op |
| No matching entries found | Returns `{ imported: 0, skipped: 0 }` — no-op |
| Parse failure on entry | Increments `skipped`, continues to next entry |
| Dedup hit (hash already exists) | Increments `skipped`, continues |

## Persistence Contract

**File:** `.omp/noesis/state.json`

**Atomic write protocol:** serialize → write `.tmp.{pid}` → fsync → rename

**Read protocol:** file missing → `EMPTY_STATE` | parse error → rebuild | I/O error → rethrow
