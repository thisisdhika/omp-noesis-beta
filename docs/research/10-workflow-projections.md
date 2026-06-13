# Workflow Projections — Full Research

> Source: Academic papers, industry patterns, and pi-catalyst analysis (2025-2026)
> Compiled: 2026-06-12

---

## 1. What is a Workflow Projection?

A workflow projection is a living document that renders the agent's cognitive state as a structured artifact. It is not a separate DSL or a deterministic workflow engine — it is a **projection** of the agent's commitment layer into a human-readable and machine-readable format.

### Key properties

- **Living**: The document updates as the agent's state changes
- **Structured**: The document has a fixed format that can be parsed and rendered
- **Durable**: The document survives compaction and session transitions
- **Reviewable**: The document can be reviewed by humans (in PRs, in dashboards)
- **Diffable**: The document can be diffed to show what changed

---

## 2. The "Ultra-Skills Workflow" Concept

The "ultra-skills workflow" is not a workflow engine. It is a workflow **projection** — a structured rendering of the agent's cognitive state that captures:

1. **The plan**: What steps are needed to achieve the goal
2. **The beliefs**: What the agent knows about the codebase and the problem
3. **The decisions**: What choices have been made and why
4. **The learning**: What has been learned from execution (successes and failures)

### Why "ultra"

The "ultra" in ultra-skills means:
- **Ultra quality**: Every element of the workflow is grounded in evidence (beliefs from Graphify, decisions from reasoning, learning from execution)
- **Ultra context**: The workflow is enriched with cognitive state that no other workflow system has
- **Ultra durability**: The workflow survives compaction, session switches, and process restarts
- **Ultra evolvability**: The workflow learns and improves through the learning loop

---

## 3. pi-catalyst-beta: Archived Workflow System

**Source**: ../Archive/pi-catalyst-beta

pi-catalyst-beta is an archived workflow system that provides reference patterns for noesis.

### Core concepts

- **Plan**: A structured document with goals, steps, and verification
- **PlanSlice**: A single step in the plan with validation and commit strategy
- **Workflow**: A reactant-driven execution engine
- **Hub**: A persistent state file (`hub.json`) that tracks workflow progress

### State model

```ts
type PlanSlice = {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "done" | "failed";
  dependsOn: string[];
  validation: ValidationCommand[];
  commitConfig: CommitConfig;
};

type Plan = {
  goal: string;
  slices: PlanSlice[];
  status: "draft" | "active" | "done" | "failed";
};
```

### Workflow configuration

```ts
type WorkflowConfig = {
  reactants: string[];
  reactantTypes: string[];
  validation: ValidationCommand[];
  commit: CommitConfig;
};
```

### Key patterns to reuse

1. **Plan DAG**: Plan → PlanSlice → ValidationCommand → CommitConfig
2. **Hub persistence**: `hub.json` tracks workflow progress across sessions
3. **Atomic writes**: Temp file + rename for state persistence
4. **Graph integration**: Graphify adapter wrapping CLI

### Key gaps

1. **Incomplete workflow engine**: The workflow engine is not fully implemented
2. **Missing graphify CLI in PATH**: The graphify CLI is not always available
3. **No learning loop**: The system does not learn from execution
4. **No cognitive state**: The system does not track beliefs, decisions, or learning

---

## 4. GraSP: Graph-Structured Skill Compositions

**Paper**: arxiv.org/abs/2604.17870

GraSP introduces an executable skill-graph architecture for LLM agents.

### DAG compilation

GraSP compiles retrieved skills into a typed directed acyclic graph (DAG) where nodes are skill invocations and edges encode explicit precondition–effect dependencies.

### Verified execution

GraSP traverses the DAG topologically, checks pre/postconditions at each node, and locally patches failures via typed repair operators.

### Key insight

The workflow is not a linear sequence of steps — it is a graph of skills with dependencies. This is the "ultra-skills workflow" pattern: graph-compiled, dependency-aware, locally repairable.

---

## 5. OMP Orchestration

**Source**: GitHub releases, @oh-my-pi/swarm-extension

### `orchestrate` keyword (v15.6.0)

- Mirrors `ultrathink`
- Activates multi-phase parallel-subagent orchestration
- Word-bounded and case-insensitive

### @oh-my-pi/swarm-extension

- YAML-defined DAG swarms
- Pipeline/sequential/parallel execution modes
- Dependency resolution via `waits_for` and `reports_to`
- Topological wave execution

### PR #1559: Workflow tool

- First-party `workflow` tool in `packages/coding-agent`
- Sandboxed JS scripts via `node:vm` + AST validation
- Lightweight subagents via `createAgentSession`

---

## 6. Ultra-Skills Workflow Patterns (2026)

### ultracode-skill (PabloNAX)

Codex-first dynamic workflow with three modes:
- **Direct**: Small, clear edits with minimal files
- **Workflow**: Multi-step tasks with plan, orchestration, state, packets, results, integration, final-report
- **Delegated**: Independent native agents with integration and verification

Artifacts:
- `plan.md`: The plan
- `orchestration.md`: The orchestration strategy
- `state.json`: The current state
- `packets/`: Individual task packets
- `results/`: Execution results
- `integration.md`: Integration strategy
- `final-report.md`: Final report

### ultra-plan-skill (Dawn-Inator)

5-phase multi-module architecture planning:
1. Project probe
2. Parallel research
3. Decomposition
4. Document (global plan + per-module plans)
5. Execution decision
6. Optional execution (module-by-module via subagents)

### ultra-goal (Azure99)

Phase-based unattended orchestration:
- Launch 2 sub-agents for initial plans
- Orchestrator mediates to final implementation plan
- 1 sub-agent executes with self-tests
- 2–3 sub-agents review for cross-checks
- Orchestrator decides if phase passes acceptance
- On pass, commit; on fail, rework

### Dynamic Workflows (Claude Code v2.1.154+)

JavaScript workflows managing subagents in background:
- `agent()`, `parallel()`, `pipeline()`, `phase()`
- Structured output schemas
- Cancellation-aware fanout

---

## 7. Workflow-as-Projection Pattern

The workflow-as-projection pattern renders the agent's cognitive state as a living Markdown document.

### Properties

- **Not a DSL**: The workflow is not a separate language or engine
- **Not a DAG**: The workflow is not a graph of skills (that's GraSP)
- **Not a pipeline**: The workflow is not a linear sequence of steps
- **A projection**: The workflow is a rendering of the agent's commitment layer

### What it captures

1. **The plan**: `commitment.workflow.steps` — what steps are needed
2. **The beliefs**: `belief.facts` with confidence ≥ 0.5 — what the agent knows
3. **The decisions**: `belief.decisions` with status "active" — what choices have been made
4. **The learning**: `learning.successes` + `learning.failures` — what has been learned

### Why it's "ultra"

The workflow projection is "ultra" because it includes cognitive state that no other workflow system has:
- **Beliefs from Graphify**: The agent's understanding of the codebase, grounded in the knowledge graph
- **Decisions from reasoning**: The agent's architectural choices, with rationale and alternatives
- **Learning from execution**: The agent's accumulated experience, with failure patterns and fixes

### Rendering

```ts
export function renderWorkflowDocument(state: NoesisState): string {
  const wf = state.commitment.workflow;
  return `# Workflow: ${wf.goal}

## Status: ${wf.status}

## Steps
${wf.steps.map(s => `- [${s.status}] ${s.title} (depends: ${s.dependsOn.join(", ")})`).join("\n")}

## Beliefs Active
${state.belief.facts.filter(f => f.confidence >= 0.5).map(f => `- ${f.content}`).join("\n")}

## Decisions Made
${state.belief.decisions.filter(d => d.status === "active").map(d => `- ${d.rationale}`).join("\n")}

## Learning
- Successes: ${state.learning.successes.length}
- Failures: ${state.learning.failures.length} (resolved: ${state.learning.failures.filter(f => f.fix).length})
`;
}
```

---

## 8. Living Documents

A living document is a document that updates automatically as the underlying state changes.

### Properties

- **Auto-updating**: The document regenerates when the state changes
- **Version-controlled**: The document can be committed to git for history
- **Reviewable**: The document can be reviewed in PRs
- **Diffable**: The document can be diffed to show what changed

### Why living documents matter

In traditional software engineering, documentation is static and gets outdated. In agentic engineering, documentation should be living — it should update automatically as the agent's understanding evolves.

### Noesis as a living document engine

Noesis renders the cognitive state as a living Markdown document. Every time the agent updates its beliefs, decisions, or learning, the document regenerates. This creates a persistent, reviewable artifact that captures the agent's cognitive evolution.

---

## 9. Cognitive State as Artifacts

The cognitive state is not just context — it is an artifact that can be:
- **Read**: The agent reads its cognitive state via the preamble
- **Written**: The agent writes to its cognitive state via the tools
- **Diffed**: The cognitive state can be diffed to show what changed
- **Reviewed**: The cognitive state can be reviewed by humans
- **Versioned**: The cognitive state can be committed to git for history
- **Shared**: The cognitive state can be shared across agents via the filesystem

### Artifacts vs. context

Context is ephemeral — it exists only in the current conversation. Artifacts are durable — they persist across sessions, compactions, and process restarts.

Noesis turns the agent's cognitive state from ephemeral context into durable artifacts.

---

## Implications for omp-noesis

1. **Workflow as projection, not engine**: Noesis does not implement a workflow engine. It renders the commitment layer as a living Markdown document. The agent updates the commitment layer via `noesis_commit`, and the document regenerates.

2. **GraSP-inspired dependencies**: The workflow steps have `dependsOn` fields that encode dependencies. The `findNextRunnableStep` function resolves these dependencies topologically.

3. **pi-catalyst patterns**: Noesis reuses pi-catalyst's plan DAG, hub persistence, and atomic write patterns. It does NOT reuse pi-catalyst's workflow engine (which was incomplete).

4. **Living document**: The workflow document is a living artifact that updates automatically. It can be committed to git for history and reviewed in PRs.

5. **Cognitive state as artifact**: The `.omp/noesis/state.json` file is a durable artifact that persists across sessions. It can be read, written, diffed, reviewed, versioned, and shared.

6. **Ultra = cognitive enrichment**: The workflow is "ultra" because it includes beliefs, decisions, and learning — not just a plan. This is what distinguishes it from traditional workflow systems.

7. **Not another orchestrator**: Noesis works WITH OMP's orchestration primitives, not instead of them. The cognitive state informs orchestration decisions but does not replace them.
