# omp-noesis: Cognitive State Schema

> Version: 1.0
> Date: 2026-06-12
> Status: Aligned

---

## 1. Purpose

This document defines the exact shape of the noesis cognitive state.

It is the schema that `.omp/noesis/state.json`, the cognitive preamble, the compaction survivor set, the four cognitive tools, and the four OMP hooks all depend on.

The cognitive preamble is constructed from this schema's fields, bounded to **≤2000 tokens** as defined by the context management model (§14.6).
---

## 2. Schema Philosophy

Noesis treats its cognitive state as:

- **structured, not prose** — a typed object, not a conversation transcript
- **bounded, not boundless** — cap-driven, not unbounded accumulation
- **versioned, not ad-hoc** — `version` field with migration path
- **auditable, not opaque** — provenance and status on every meaningful entry
- **model-agnostic, not model-tied** — state shape is independent of which LLM processes it

This is grounded in:
- ACC: Compressed Cognitive State as the sole persistent internal representation
- MNEMA: memory as the agent's primary persistence, LLM as reasoning layer over it
- Kumiho: two-tier active/archive with provenance and versioning
- Google ADK: explicit state machine with atomic writes, not transcript replay

---

## 3. Top-Level Shape

```typescript
interface NoesisState {
  /** Schema version for migration. */
  version: number;

  /** When this state was last persisted. */
  lastPersisted: string; // ISO 8601

  /** What the agent is currently focused on. */
  attention: AttentionLayer;

  /** What the agent knows with confidence. */
  belief: BeliefLayer;

  /** What the agent is reasoning about. */
  inference: InferenceLayer;

  /** What the agent has decided to do. */
  commitment: CommitmentLayer;

  /** What the agent has learned from execution. */
  learning: LearningLayer;
}
```

---

## 4. Attention Layer

The most ephemeral layer. Changes every turn. Carries no history.

```typescript
interface AttentionLayer {
  /** One-sentence summary of current goal. Max 200 characters. */
  focus: string;

  /** Graphify queries to run for structural grounding. */
  graphQueries: string[]; // max 5

  /** Files actively being worked on. */
  files: string[]; // max 10

  /** Approximate context window usage in tokens (estimate). */
  contextUsage: number;

  /** When the attention was last updated (ISO 8601). */
  updatedAt: string;
}
```

### Design notes
- The full Attention layer is never a survivor candidate — it is rebuilt each turn.
- However, the `focus` string is projected as a survivor item (2 sentences) to orient the agent after compaction. The rest of the layer is ephemeral.
---
## 5. Belief Layer

The most durable layer. Persists across compaction, sessions, and resets. Subject to AGM belief revision.

```typescript
interface BeliefLayer {
  /** Known facts with confidence and provenance. */
  facts: BeliefFact[];

  /** Decisions made with rationale. */
  decisions: BeliefDecision[];
}

// --- Facts ---

interface BeliefFact {
  /** Stable identifier. Generated on creation. */
  id: string; // e.g. "bf-uuid"

  /** What the agent believes (the proposition). */
  content: string;

  /** Confidence level: 0.0 (none) to 1.0 (certain). */
  confidence: number;

  /** Where the belief came from. */
  source: BeliefSource;

  /** ISO 8601. */
  createdAt: string;

  /** ISO 8601. Updated on revision or status change. */
  updatedAt: string;

  /** Current lifecycle status. */
  status: "active" | "superseded" | "archived";

  /** If superseded, which belief replaced this one. */
  supersededBy?: string; // BeliefFact.id

  /** 
   * Optional tags for scoping (e.g. "auth", "database", "performance").
   * Used for domain-based relevance filtering.
   */
  tags?: string[];

  /** 
   * Architectural community label from Graphify, if the belief
   * was derived from graph evidence within a specific community.
   */
  communityScope?: string;
}

type BeliefSource = "graph" | "execution" | "user" | "inference";

// --- Decisions ---

interface BeliefDecision {
  /** Stable identifier. */
  id: string; // e.g. "bd-uuid"

  /** What was decided. */
  content: string;

  /** Why this decision was made. */
  rationale: string;

  /** What alternatives were considered and rejected. */
  alternatives?: string[];

  /** Where the decision came from. */
  source: BeliefSource;

  /** ISO 8601. */
  createdAt: string;

  /** ISO 8601. */
  updatedAt: string;

  /** Current lifecycle status. */
  status: "active" | "superseded" | "archived";

  /** If superseded. */
  supersededBy?: string; // BeliefDecision.id

  /** Scope tags. */
  tags?: string[];
}
```

### Confidence thresholds (aligned with context-management-model §14.1)

| Confidence range | Classification | Behavior |
|---|---|---|
| 0.75 – 1.00 | Active | Preamble-eligible, survivor-eligible |
| 0.50 – 0.74 | Low-confidence | Stored, surfaced only when task-relevant |
| 0.00 – 0.49 | Not promoted | Evidence not converted to belief |

### Graphify confidence → noesis confidence mapping (aligned with boundary-matrix §8)

| Graphify label | Noesis confidence |
|---|---|
| EXTRACTED | 1.0 |
| INFERRED 0.95 | 0.95 |
| INFERRED 0.85 | 0.85 |
| INFERRED 0.75 | 0.75 |
| INFERRED 0.65 | 0.65 |
| INFERRED 0.55 | 0.55 |
| AMBIGUOUS | never promoted |

### Survivor caps (aligned with context-management-model §14.2)
- Active facts (≥0.75, status `active`): max 10 in survivor set
- Active decisions (status `active`): max 5 in survivor set

### AGM revision rules (for implementation in belief revision model)
- Beliefs are never deleted — they are superseded or archived.
- When a new fact contradicts an existing active fact, the old fact's status becomes `superseded` and its `supersededBy` points to the new fact.
- Archived beliefs are kept for provenance and audit; never exposed in preamble.

---

## 6. Inference Layer

Intermediate between attention and belief. Hypotheses are tested; reasoning is recorded.

```typescript
interface InferenceLayer {
  /** Hypotheses being tested. */
  hypotheses: Hypothesis[];

  /** Reasoning steps recorded for auditability. */
  reasoning: ReasoningStep[];
}

interface Hypothesis {
  /** Stable identifier. */
  id: string; // e.g. "hy-uuid"

  /** The hypothesis being tested. */
  content: string;

  /** Current testing status. */
  status: "testing" | "confirmed" | "refuted" | "abandoned";

  /** What evidence supports or refutes the hypothesis. */
  evidence?: string;

  /** ISO 8601. */
  createdAt: string;

  /** ISO 8601. */
  updatedAt: string;
}

interface ReasoningStep {
  /** Stable identifier. */
  id: string; // e.g. "rs-uuid"

  /** What reasoning was performed. */
  content: string;

  /** Which hypothesis or belief this reasoning relates to. */
  relatesTo?: string; // Hypothesis.id or BeliefFact.id or BeliefDecision.id

  /** ISO 8601. */
  createdAt: string;
}
```

### Survivor caps
- Unresolved hypotheses (status `testing`): max 3 in survivor set
- Reasoning steps are not included in the survivor set by default; they are recoverable from the state file.

### Status transitions
```
testing → confirmed   (evidence supported)
testing → refuted     (evidence contradicted)
testing → abandoned   (no longer relevant)
```

---

## 7. Commitment Layer

What the agent has decided to do. The workflow lives here.

```typescript
interface CommitmentLayer {
  /** Current workflow projection. */
  workflow: Workflow;

  /** Individual action items outside the workflow. */
  actions: PlannedAction[];
}

interface Workflow {
  /** Human-readable goal. */
  goal: string;

  /** Current lifecycle status. */
  status: "draft" | "active" | "done" | "abandoned";

  /** Ordered steps with dependencies and verification. */
  steps: WorkflowStep[];

  /** ISO 8601. */
  createdAt: string;

  /** ISO 8601. */
  updatedAt: string;
}

interface WorkflowStep {
  /** Stable identifier. Generated on creation. */
  id: string; // e.g. "ws-uuid"

  /** What needs to be done. */
  description: string;

  /** Current step status. */
  status: "pending" | "active" | "done" | "skipped";

  /** Step IDs that must be completed before this one. */
  dependsOn?: string[]; // WorkflowStep.id[]

  /** Command to run to verify this step is complete (e.g. 'bun test'). */
  verification?: string;

  /** ISO 8601. */
  createdAt: string;

  /** ISO 8601. */
  updatedAt: string;
}

interface PlannedAction {
  /** Stable identifier. */
  id: string; // e.g. "pa-uuid"

  /** What action is planned. */
  content: string;

  /** ISO 8601. */
  createdAt: string;
}
```

### Survivor caps
- Workflow: goal + current step + 1 next step preserved in survivor set
- Full workflow steps are recoverable from the state file

---

## 8. Learning Layer

What the agent has learned from execution. Persistent across sessions.

```typescript
interface LearningLayer {
  /** Successful patterns the agent has observed. */
  successes: LearningEntry[];

  /** Failure patterns with root cause and fix. */
  failures: LearningEntry[];

  /** Summary counters for preamble display. */
  summary: LearningSummary;
}

interface LearningEntry {
  /** Stable identifier. */
  id: string; // e.g. "le-uuid"

  /** What happened. Truncated to 500 chars for failures. */
  description: string;

  /** The root cause (for failures). */
  rootCause?: string;

  /** The fix that resolved it (for failures). */
  fix?: string;

  /** What skill or domain this learning applies to. */
  skillScope?: string;

  /** Which tool produced the result (e.g. "bash", "lsp"). */
  toolName?: string;

  /** ISO 8601. */
  capturedAt: string;
}

interface LearningSummary {
  /** Total success entries. */
  successCount: number;

  /** Total failure entries. */
  failureCount: number;

  /** Failures that have been resolved (rootCause + fix populated). */
  resolvedCount: number;
}
```
### Ranking formula (aligned with context-management-model §14.3)

For preamble inclusion, learning entries are ranked by:

```
rank = recency × taskRelevance × failureMultiplier × resolvedFixMultiplier
```

Where:
- `recency`: 1.0 base, decays 0.2 per older sibling
- `taskRelevance`: 1.0 same domain, 0.5 different, 0.0 unrelated (matched via `skillScope`)
- `failureMultiplier`: 2.0 (failure entry), 1.0 (success entry)
- `resolvedFixMultiplier`: 2.0 (both `rootCause` and `fix` populated), 1.0 (not yet resolved)


### Survivor caps
- Learning entries: max 3 highest-ranked in survivor set
- Learning summary counters always included in survivor set

### Survivor injection meta-item

A pointer to `.omp/noesis/state.json` is included in every survivor injection (not stored in the state itself — added at injection time by the `session.compacting` hook handler) so the agent can recover the full state after compaction.
---

## 9. Persistence Contract

### File location
```
.omp/noesis/state.json
```


### Atomic write protocol

```
1. Serialize NoesisState to JSON
2. Write to .omp/noesis/state.json.tmp.<pid>
3. fsync the temp file
4. Rename to .omp/noesis/state.json (atomic on same filesystem)
```

### Read protocol

```
1. If .omp/noesis/state.json does not exist → return empty state
2. Read and parse JSON
3. Validate against schema (via zod at runtime)
4. If malformed or failed validation → throw with file path and reason
5. If version mismatch → run migration (see §10)
6. Return validated NoesisState
```
### Constraints
- Zero runtime dependencies on `@oh-my-pi/*` packages (OMP extension sandbox constraint).
- JSON serialization only. No binary formats.
- No network calls. Filesystem only.
- No async I/O that can corrupt state during concurrent writes.

---

## 10. Schema Versioning

```typescript
/** Current schema version. Bump on breaking changes. */
const CURRENT_VERSION = 1;
```

### Migration contract
- The state file carries a `version` field.
- On read, if `version < CURRENT_VERSION`, run the migration function for that version gap.
- Migration functions are sequential and composable: `v0→v1`, then `v1→v2`, etc.
- Failed migration must not corrupt the original file. Work on a copy, rename on success.

### Version 1
The initial schema as defined in this document.

---

## 11. Empty State

When no state file exists, noesis returns this default:

```typescript
const EMPTY_STATE: NoesisState = {
  version: 1,
  lastPersisted: new Date().toISOString(),
  attention: {
    focus: "",
    graphQueries: [],
    files: [],
    contextUsage: 0,
    updatedAt: new Date().toISOString(),
  },
  belief: {
    facts: [],
    decisions: [],
  },
  inference: {
    hypotheses: [],
    reasoning: [],
  },
  commitment: {
    workflow: {
      goal: "",
      status: "draft",
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    actions: [],
  },
  learning: {
    successes: [],
    failures: [],
    summary: { successCount: 0, failureCount: 0, resolvedCount: 0 },
  },
};
```

---

## 12. Integration Points

This schema is consumed and mutated by:

| Component | Read | Write |
|---|---|---|
| `noesis_attend` tool | Attention, Belief | Attention, Belief (via Graphify) |
| `noesis_believe` tool | Belief | Belief facts/decisions |
| `noesis_infer` tool | Inference | Hypotheses, reasoning |
| `noesis_commit` tool | Commitment | Workflow, actions |
| `context` hook | All layers (preamble construction) | None |
| `session.compacting` hook | All layers (survivor selection) | None (injects into OMP, not state file) |
| `tool_result` hook | None | Learning layer |
| `before_agent_start` hook | All layers (preamble) | None |

---

## 13. Off-Limits

The following are intentionally excluded from this schema:

- **Transcript history** — belongs to OMP, not noesis
- **Raw tool outputs** — processed into learning/beliefs, then discarded
- **Full file contents** — file paths only; contents belong to the filesystem
- **LLM-specific metadata** — model-agnostic by design
- **Orchestration graph** — belongs to OMP's `orchestrate`/swarm
- **General long-term memory** — belongs to Mnemopi/Hindsight
- **Obsidian vault metadata** — belongs to the optional projection layer

---

## 14. Design Rules

1. **Structure over prose.** Every cognitive object has typed fields, not free-text blobs.
2. **Provenance on every belief.** Source, timestamp, and revision history are mandatory.
3. **Never delete, only supersede or archive.** Beliefs and decisions carry audit trails.
4. **Cap-driven, not unbounded.** Every collection has a max size in the survivor set.
5. **Model-agnostic.** The schema does not assume any specific LLM, context window, or provider.
6. **Filesystem-only persistence.** No databases, no network, no cloud.
7. **Atomic writes.** Temp file + rename; no partial state on disk.

---

## 15. References

Internal grounding:
- `docs/PRD.md`
- `docs/boundary-matrix.md`
- `docs/context-management-model.md`
- `docs/research/01-cognitive-architectures.md` (ACC, CraniMem, Kumiho, MNEMA, Epica)
- `docs/research/08-belief-revision.md` (AGM postulates, Kumiho two-tier, Epica contracts)
- `docs/research/09-memory-architectures.md` (dual-store, bounded state, consolidation)

External grounding:
- ACC paper (Compressed Cognitive State): https://arxiv.org/pdf/2601.11653
- Kumiho (graph-native belief revision): https://arxiv.org/pdf/2603.17244
- Epica (typed belief stores): https://github.com/angelnicolasc/epica
- Google ADK (durable state machine): https://developers.googleblog.com/en/build-long-running-ai-agents-that-pause-resume-and-never-lose-context-with-adk/
- MindedJS (Zod agent memory): https://docs.minded.com/sdk/memory
