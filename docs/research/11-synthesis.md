# Synthesis: How All Research Connects to omp-noesis

> Source: All research documents in this directory
> Compiled: 2026-06-12

---

## The Core Thesis

**Context is the single bottleneck of agentic engineering. Not model size, not token count, not tool breadth. Everything else — workflows, subagents, acceptance gates — is a workaround for context problems. The agent doesn't manage context — the context architecture manages the agent.**

This thesis is supported by:
- Anthropic's context engineering research
- LangChain's four strategies (write, select, compress, isolate)
- ACC's Compressed Cognitive State
- CraniMem's gated dual-store memory
- Perplexity's skill quality focus

---

## How Each Research Area Maps to Noesis

### 1. Cognitive Architectures → Noesis State Model

| Architecture | Noesis Mapping |
|---|---|
| CraniMem dual-store | Attention (episodic) + Belief (semantic) |
| CraniMem attentional gating | `tool_result` hook filters what enters belief layer |
| ACC Compressed Cognitive State | `.omp/noesis/state.json` — bounded, schema-constrained |
| ACC separation of recall/commitment | Graph findings ≠ committed beliefs |
| Kumiho two-tier memory | Active beliefs + archived beliefs |
| MNEMA memory-native persistence | Cognitive state IS the agent's identity |
| GWA cognitive tick | Each turn = one cognitive cycle |
| AutoAgent elastic memory | Learning entries are compressed and consolidated |
| DCPM memory-as-cognition | The agent's memory system is responsible for understanding |

### 2. Agent Skills → Noesis Skills

| Skill Framework | Noesis Mapping |
|---|---|
| Perplexity Zen of Skills | Ultra-skills: maximum signal per token, gotchas are highest-value |
| SkillsBench +16.2pp | Curated skills outperform self-generated; noesis focuses on quality |
| GraSP DAG compilation | Workflow steps have `dependsOn` — graph-compiled, not linear |
| MUSE-Autoskill skill-level memory | Each skill has its own learning entries |
| SkillPyramid hierarchy | Progressive disclosure: index → load → runtime |
| CoEvoSkills verify-refine | Learning loop: capture → analyze → believe → apply |
| Matt Pocock grill-with-docs | Alignment before execution; cognitive preamble provides alignment |

### 3. Context Management → Noesis Hooks

| Context Pattern | Noesis Mapping |
|---|---|
| Anthropic write/select/compress/isolate | Write: persist state. Select: attentional gating. Compress: 2000-token budget. Isolate: cognitive state separate from transcript. |
| LangChain four strategies | All four implemented via hooks and state management |
| Claude Cookbook compaction | `session.compacting` hook injects `<noesis-state>` |
| Claude Cookbook tool-result clearing | `tool_result` hook filters significant events only |
| Claude Cookbook memory | `.omp/noesis/state.json` — filesystem-backed persistence |
| LangChain Deep Agents filesystem | State survives compaction, session switches, process restarts |
| Context Engineering Handbook progressive | Three tiers: attention → belief → inference/learning |

### 4. Graphify Labs → Noesis Perception

| Graphify Feature | Noesis Mapping |
|---|---|
| `graphify query` | `noesis_attend` runs queries and incorporates findings into belief layer |
| `graphify update .` | Incremental graph updates keep perception fresh |
| `graphify --version` | Status detection: installed, version, graph freshness |
| Community detection | Communities map to architectural domains |
| Confidence labels | EXTRACTED/INFERRED/AMBIGUOUS → belief confidence levels |
| Obsidian export | Optional: export cognitive state + graph for human review |
| Global graph | Cross-project knowledge for multi-repo workflows |
| `graphify pi install` | Integration point for OMP/Noesis |

### 5. OMP Platform → Noesis Integration

| OMP Feature | Noesis Mapping |
|---|---|
| ExtensionAPI | `pi.registerTool` for 4 tools, `pi.on` for 4 hooks |
| `session.compacting` hook | Load-bearing: inject `<noesis-state>` + `preserveData` |
| `context` hook | Inject cognitive preamble into every LLM call |
| `tool_result` hook | Capture failures and significant successes |
| `before_agent_start` hook | Ensure preamble is visible even if context hook is bypassed |
| `customType: "handoff"` | Pattern for persisting structured state across sessions |
| Skills system | Noesis ships as a skill alongside the extension |
| `orchestrate` keyword | Works WITH noesis, not instead of it |
| `@oh-my-pi/swarm-extension` | Cognitive state informs orchestration decisions |
| Mnemopi | Noesis complements Mnemopi; session-scoped vs. cross-session |
| Compaction strategies | `session.compacting` hook works with all strategies |

### 6. Ultra-Skills Quality → Noesis Design Principles

| Quality Attribute | Noesis Implementation |
|---|---|
| Maximum signal per token | 2000-token preamble budget; every element earns its place |
| Gotchas are highest-value | Learning entries capture failure patterns; highest-signal content |
| Progressive disclosure | Three tiers: attention → belief → inference/learning |
| Description is routing trigger | Cognitive preamble tells the agent what to focus on |
| Evals before the Skill | Verification steps in workflow; test-driven development |
| Hub-and-spoke structure | `SKILL.md` hub + `scripts/`, `references/`, `assets/` spokes |
| Gotchas flywheel | Learning loop: failure → capture → analyze → believe → apply |
| Cross-model consistency | Noesis works with any model; cognitive state is model-agnostic |
| Curated, not generated | Beliefs are curated through verification, not auto-generated |
| Action at a distance awareness | Belief revision handles contradictions formally |

### 7. Learning Loops → Noesis Learning Layer

| Learning Framework | Noesis Mapping |
|---|---|
| SAGE sequential rollout | Skills carry forward what they learned from previous tasks |
| CoEvoSkills verify-refine | Learning entries are verified through execution |
| MUSE-Autoskill skill-level memory | Each skill has its own learning entries |
| Perplexity gotchas flywheel | Failures become gotchas; gotchas improve skills |
| Claude Cookbook structured notes | Agent writes notes to itself via `noesis_believe` |
| DCPM memory-as-cognition | Learning is cognition, not storage |

### 8. Belief Revision → Noesis Belief Layer

| Belief Revision Framework | Noesis Mapping |
|---|---|
| AGM K*2–K*6 | Formal belief revision when contradictions are found |
| Kumiho two-tier | Active beliefs + archived beliefs |
| Epica behavioral contracts | Beliefs organized by type (fact/decision) with confidence |
| XTrace provenance | Every belief has source, timestamp, and revision history |
| ACC separation of recall/commitment | Graph findings ≠ committed beliefs |
| CraniMem attentional gating | Not every tool result deserves a belief |

### 9. Memory Architectures → Noesis Persistence

| Memory Architecture | Noesis Mapping |
|---|---|
| CraniMem dual-store | Episodic (session) + Semantic (cross-session) |
| MNEMA memory-native | Cognitive state IS the agent's identity |
| ACC bounded state | 2000-token budget; eviction policies |
| MAGMA multi-relational | Graphify provides semantic/temporal/causal/entity views |
| Hierarchical Memory Theory | Three-tier: attention → belief → inference/learning |
| MUSE-Autoskill per-skill memory | Learning entries tagged with skill context |
| fcontext cross-agent | State file can be shared across agents |

### 10. Workflow Projections → Noesis Workflow Layer

| Workflow Pattern | Noesis Mapping |
|---|---|
| pi-catalyst Plan DAG | Workflow steps with `dependsOn` |
| GraSP DAG compilation | Dependencies are resolved topologically |
| ultracode-skill artifacts | Workflow document captures plan + state + results |
| ultra-plan-skill phases | Workflow has status lifecycle (draft → active → done) |
| Living documents | Workflow document auto-updates when state changes |
| Cognitive state as artifacts | `.omp/noesis/state.json` is a durable artifact |

---

## The Noesis Architecture in One Picture

```
┌─────────────────────────────────────────────────────────────────┐
│                         OMP Core                                │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Hooks    │  │ Compaction│  │ Session  │  │    Tools     │  │
│  └────┬─────┘  └─────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │              │              │               │           │
├───────┼──────────────┼──────────────┼───────────────┼───────────┤
│       │              │              │               │           │
│  ┌────▼──────────────▼──────────────▼───────────────▼────────┐  │
│  │                    omp-noesis                             │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │                  index.ts (entry)                    │  │  │
│  │  │  - registerTool(noesis_attend)                      │  │  │
│  │  │  - registerTool(noesis_believe)                     │  │  │
│  │  │  - registerTool(noesis_infer)                       │  │  │
│  │  │  - registerTool(noesis_commit)                      │  │  │
│  │  │  - on("context")                                    │  │  │
│  │  │  - on("session.compacting")                         │  │  │
│  │  │  - on("tool_result")                                │  │  │
│  │  │  - on("before_agent_start")                         │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │  │
│  │  │  Cognition   │  │  Perception  │  │   Learning   │    │  │
│  │  │  Layer       │  │  Layer       │  │   Layer      │    │  │
│  │  │              │  │              │  │              │    │  │
│  │  │ - schema.ts  │  │ - percept.ts │  │ - loop.ts    │    │  │
│  │  │ - preamble   │  │ - status.ts  │  │ - patterns   │    │  │
│  │  │ - survivors  │  │              │  │              │    │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │  │
│  │         │                 │                 │            │  │
│  │  ┌──────▼─────────────────▼─────────────────▼─────────┐  │  │
│  │  │              Persistence Layer                       │  │  │
│  │  │  - store.ts (atomic write)                          │  │  │
│  │  │  - migration.ts (schema versioning)                 │  │  │
│  │  │  - .omp/noesis/state.json                           │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              Workflow Layer                          │  │  │
│  │  │  - render.ts (living document)                      │  │  │
│  │  │  - engine.ts (dependency resolution)                │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                         External                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Graphify CLI │  │  .omp/noesis/│  │  Obsidian (optional) │  │
│  │ (perception) │  │  (state)     │  │  (export)            │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Four Hooks as the Entire Integration Surface

Noesis integrates with OMP through exactly four hooks. This is the entire integration surface — no core modifications, no custom compaction, no replacement of existing primitives.

### Hook 1: `context`

**Purpose**: Inject cognitive preamble into every LLM call.

**What it does**: Loads the noesis state from disk, builds a ≤2000-token Markdown preamble, and prepends it as a user-role message to the LLM context.

**Why it matters**: The agent always sees its cognitive state — what it's focused on, what it believes, what it's decided, what it's learned. This is the "context architecture manages the agent" principle in action.

### Hook 2: `session.compacting`

**Purpose**: Preserve structured state across compaction.

**What it does**: Loads the noesis state, extracts the survivor subset (active beliefs, active workflow, unresolved hypotheses, recent learning), and injects it into the compaction context as `<noesis-state>` tags. Also stores the full state in `preserveData.noesis`.

**Why it matters**: This is the load-bearing hook. Without it, compaction would destroy the agent's cognitive state. With it, the agent has continuity of self across compaction boundaries.

### Hook 3: `tool_result`

**Purpose**: Capture execution feedback for learning.

**What it does**: Intercepts every tool execution. If the tool failed, captures the failure unconditionally. If the tool succeeded and the result is significant (test pass, build success), captures the success.

**Why it matters**: This is the observation step of the learning loop. Without it, the agent would repeat the same mistakes. With it, the agent accumulates experience.

### Hook 4: `before_agent_start`

**Purpose**: Ensure cognitive state is visible even if the context hook is bypassed.

**What it does**: Loads the noesis state, builds the preamble, and injects it as a custom message with `customType: "noesis-preamble"`.

**Why it matters**: This is a safety net. If the context hook is bypassed (e.g., during handoff), the agent still sees its cognitive state.

---

## The Four Tools as the Agent's Cognitive Interface

Noesis exposes exactly four tools. This is the entire tool surface — minimal, focused, and complete.

### Tool 1: `noesis_attend`

**Purpose**: Update the attention layer (what the agent is focused on).

**What it does**: Updates `state.attention` with the current focus, graph queries, and files. If graph queries are provided, runs Graphify perception and incorporates findings into the belief layer.

**Why it matters**: This is how the agent tells noesis what it's working on. The attention layer is the most ephemeral — it changes every turn.

### Tool 2: `noesis_believe`

**Purpose**: Add or update a belief (fact or decision).

**What it does**: Adds a fact to `state.belief.facts` or a decision to `state.belief.decisions`. Handles supersession when a new belief contradicts an existing one.

**Why it matters**: This is how the agent records what it knows. The belief layer is the most durable — beliefs persist across sessions.

### Tool 3: `noesis_infer`

**Purpose**: Add or update a hypothesis or reasoning step.

**What it does**: Adds a hypothesis to `state.inference.hypotheses` or a reasoning step to `state.inference.reasoning`. Handles status updates (testing → confirmed/refuted/abandoned).

**Why it matters**: This is how the agent records its reasoning. The inference layer is intermediate — hypotheses are tested and resolved.

### Tool 4: `noesis_commit`

**Purpose**: Update workflow or action commitment.

**What it does**: Updates `state.commitment.workflow` with goal, status, and steps. Or adds an action to `state.commitment.actions`.

**Why it matters**: This is how the agent records what it's doing. The commitment layer is the most actionable — it drives the workflow projection.

---

## What Makes Noesis "Ultra Evolutionary"

Noesis is not another orchestrator, workflow DSL, or memory system. It is a **cognitive substrate** that makes the agent's cognitive state first-class, structured, and durable.

### 1. Context architecture manages the agent

The agent doesn't manage its context — noesis does. The cognitive preamble ensures the agent always has the right context at the right time.

### 2. Cognitive state survives compaction

The `session.compacting` hook preserves structured state across compaction boundaries. The agent has continuity of self.

### 3. Learning loop from execution

The `tool_result` hook captures failures and successes. The agent accumulates experience and learns from its mistakes.

### 4. Graph-grounded beliefs

Graphify provides the perception layer. The agent's beliefs are grounded in codebase reality, not hallucinated.

### 5. Workflow as cognitive projection

The workflow is not a separate DSL — it is a rendering of the agent's commitment layer, enriched with beliefs, decisions, and learning.

### 6. Skills enhanced by cognitive state

Every skill is "ultra" because it has access to the agent's cognitive state. A skill that knows the agent's beliefs, decisions, and learning is more effective than one that doesn't.

### 7. Belief revision with formal guarantees

AGM-compliant belief revision ensures consistency. Contradictions are handled formally, not by appending.

### 8. Bounded, auditable state

The 2000-token budget forces compression. Every belief has provenance. The state is inspectable, diffable, and reviewable.

---

## The Research Gap Noesis Fills

Existing systems address pieces of the problem:
- **CraniMem/Kumiho/MNEMA**: Cognitive memory architectures (but no OMP integration)
- **SAGE/CoEvoSkills/MUSE-Autoskill**: Self-evolving skills (but no cognitive state)
- **LangChain/Anthropic**: Context engineering patterns (but no structured cognitive state)
- **OMP orchestrate/swarm**: Multi-agent orchestration (but no cognitive substrate)
- **Graphify**: Codebase knowledge graph (but no cognitive integration)
- **Perplexity**: Skill quality patterns (but no learning loop)

Noesis fills the gap by integrating ALL of these into a single cognitive substrate that:
1. Makes the agent's cognitive state first-class and durable
2. Survives compaction through hook-based injection
3. Learns from execution through the learning loop
4. Grounds beliefs in codebase reality through Graphify
5. Projects the workflow as a living document
6. Enhances skills with cognitive context
7. Implements formal belief revision
8. Maintains bounded, auditable state

This is what makes noesis "ultra evolutionary" — not a single innovation, but the integration of all these innovations into a coherent cognitive substrate.
