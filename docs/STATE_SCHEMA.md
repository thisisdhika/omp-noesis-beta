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
  confidence: number;      // 0.0 - 1.0; capped at 0.75 when hydrated from OMP
  originalConfidence?: number;  // Preserved from OMP memory for roundtrip fidelity
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
| Parse | Extracts `content`, `confidence`, `originalConfidence`, `tags`, `source` from structured context strings |
| Dedup | Content-hash comparison (`sha256(0-128) → 16-char hex`) against existing state.json entries |
| Cap | Active confidence capped at `Math.min(confidence, 0.75)`; original `confidence` preserved as `originalConfidence` for roundtrip fidelity — OMP entries are supplements |
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

**Optimistic Concurrency Control:** When creating a `UnitOfWork`, the current `lastPersisted` timestamp is captured. On `commit()`, the captured timestamp is compared to the on-disk `lastPersisted` — if another writer committed in the meantime, the transaction is rejected with a `"Transaction conflict"` error. This check is performed both before and after the internal write lock to prevent stale overwrites.

  ```
  createUnitOfWork()
    → clone state, capture originalLastPersisted
  commit()
    → assert originalLastPersisted === current in-memory lastPersisted  (1st guard)
    → acquire write lock
    → assert originalLastPersisted === current in-memory lastPersisted  (2nd guard, under lock)
    → writeAtomic() → update in-memory state
  ```

**Conflict Recovery:** The caller receives a `"Transaction conflict"` error. The stale `UnitOfWork` is discarded — the caller must open a fresh `UnitOfWork` from current state and retry. No partial writes or data corruption occurs; the in-memory state is never overwritten by a rejected transaction.

## Security Note: Local File Permissions

The cognitive state is stored as plain JSON at `.omp/noesis/state.json` on the local filesystem. Noesis relies on **restrictive local file permissions** rather than at-rest encryption for confidentiality:

- The `.omp/noesis/` directory is created with `0700` permissions (owner-only access)
- The `state.json` file is written with `0600` permissions (owner-only read/write)
- Atomic write protocol (temp → fsync → rename) prevents partial reads by concurrent processes
- Optimistic Concurrency Control prevents cross-process write conflicts

**Threat model:**

| Threat | Mitigation | Residual Risk |
|---|---|---|
| Same-user process reads state.json without Noesis API | `0600` file permissions block other users but not same-user processes | State is accessible to any process running under the same UID (including malicious co-tenants or compromised tools) |
| Unauthorized filesystem access (root or physical) | No protection | State content is plaintext — no encryption key management is provided |
| Accidental exposure via backup/CI artifact | Not addressed | Repo excludes `.omp/` via `.gitignore` but users must ensure backups and CI ignore the path |
| Tampering by same-user process | OCC detects cross-process write conflicts on commit | Read-path does not authenticate the source — a same-user process can blindly overwrite state.json |

> **Design choice:** At-rest encryption is intentionally out of scope for v1. The state file lives in the project directory alongside source code, where local file permissions are the standard security boundary. Encryption would require key management that exceeds the threat model of a developer-local agent cognitive layer. If deployment requires confidentiality on shared file systems (e.g., NFS, CI runners), pipe state through a encrypted volume or enclose the project directory in a FUSE-backed encrypted container.
