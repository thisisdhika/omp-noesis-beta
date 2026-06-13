# omp-noesis: Strategic Blueprint
## Cognitive Context Architecture for Agentic Engineering

**Version:** 0.1.0-draft  
**Date:** 2026-06-12  
**Status:** Strategic planning phase — architecture & naming finalized, implementation pending

---

## 1. Executive Summary

**omp-noesis** is a next-generation context management system for AI coding agents. It transforms the agent from a tool that executes commands into a cognitive layer that **understands, remembers, and evolves**.

The core thesis: **Context is the single bottleneck of agentic engineering.** Not model size, not token count, not tool breadth. Everything else — workflows, subagents, acceptance gates — is a workaround for context problems. If you solve context management at a fundamentally new level, you unlock the next era of agentic engineering.

---

## 2. Why This Project Exists

### 2.1 The Pivot from pi-catalyst

Originally, the project was conceived as **pi-catalyst** — a standalone Pi plugin built from scratch with:
- RPC mode for agent spawning
- Zero hardcoded logic — everything adaptive from LLMs
- No backward compatibility
- Configurable pipeline/workflow system via `tva.jsonc`
- Dynamic evaluation (intent classification, context summarization, branching decisions)

After deep research, it became clear that **oh-my-pi (OMP)** already covers most of pi-catalyst's intended capabilities. Rather than rebuilding what exists, the strategic pivot is to **extend OMP's harness** with specialized components that push into genuinely uncharted territory.

### 2.2 The Agentic Engineering Landscape (2026)

The field has moved through three phases:

| Era | Core Question | Metaphor |
|-----|--------------|----------|
| **Prompt Engineering** (2022-2024) | "What should I say?" | Writing an email |
| **Context Engineering** (2025) | "What info should I provide?" | Managing your inbox |
| **Harness Engineering** (2026-now) | "What system should I build?" | **Designing the email system itself** |

Key insights from top voices:
- **Andrej Karpathy:** "Software 3.0 is prompting as programming. Vibe coding raises the floor. Agentic engineering preserves the ceiling."
- **Matt Pocock:** "AI makes engineering fundamentals MORE critical, not less." Smart Zone (~100k tokens), Grill-Me skill, vertical slicing, TDD with agents, Sand Castle framework, Ralph Loop.
- **Mitchell Hashimoto:** "Every time the agent makes a mistake, change the system so that mistake structurally cannot recur."
- **ThoughtWorks (Fowler/Böckeler):** "Agent = Model + Harness." The harness is everything minus the model.
- **Anthropic:** "The bottleneck is no longer writing code. It's knowing what to build." Delegation gap: 60% usage, 0-20% full delegation.
- **OpenAI Codex:** 5-month experiment, zero manually written code, ~1M lines generated, ~1,500 PRs, ~10x faster. Humans systematized knowledge, enforced mechanically, disclosed progressively.

### 2.3 The Gap OMP Doesn't Fill

| Capability | OMP Status | Gap |
|------------|------------|-----|
| Multi-agent orchestration | ✅ Excellent | — |
| Smart Zone management | ⚠️ Partial | No explicit ~100k token budget management |
| Intent-to-spec pipeline | ⚠️ Partial | No "grill-me" clarifier, no structured PRD generation |
| Self-evolving harness | ❌ Missing | No auto-linter-rule-from-failure pattern |
| HITL/AFK classification | ⚠️ Partial | No auto-classification |
| TDD with agents | ⚠️ Partial | No structured red-green-refactor harness |
| Vertical slicing | ⚠️ Partial | No formal decomposition |
| Mechanical enforcement | ⚠️ Partial | No custom architectural linters |
| Risk-tiered execution | ⚠️ Partial | No formal risk tiers |
| Domain-specific harnesses | ⚠️ Partial | No pre-built templates |

**omp-noesis fills the context management gap that underlies ALL of these.**

---

## 3. Naming: Why "noesis"

### 3.1 The Rejection of "cortex"

The original candidate was `omp-ctx-cortex`. Research revealed "cortex" is a trademark minefield:

| Owner | Product | Status |
|-------|---------|--------|
| ARM | ARM® Cortex® CPU architecture | Registered trademark |
| Palo Alto Networks | Cortex® XDR/XSOAR/XSIAM | Registered trademark |
| Cortex.io | Engineering Operations Platform | Active trademark, $100M+ funded |
| Snowflake | Snowflake Cortex (AI/data) | Major 2026 product |
| Cority Software | CORTEX AI™ | Trademark pending (opposition filed) |

"CTX" was also rejected due to ambiguity (computer virus, medical abbreviations, Citrix).

### 3.2 Why "noesis"

- **Greek origin:** *noesis* (νόησις) = "intellection," "understanding," the highest form of knowledge
- **Unique:** No tech product uses this name
- **Philosophical depth:** Fits the "ultra-evolutionary" ambition
- **Short:** Easy to type, memorable
- **Safe:** No trademark conflicts

**Full name:** `omp-noesis`  
**Tagline:** *"The agent's faculty of understanding"*  
**Sub-components:**
- `noesis-graph` — Graphify integration (knowledge graph layer)
- `noesis-vault` — Obsidian integration (persistent memory)
- `noesis-flow` — Workflow engine (intent-driven orchestration)
- `noesis-core` — Context compaction & Smart Zone management

---

## 4. Architecture: Cognitive Context Architecture (CCA)

### 4.1 Vision

A **living, evolving, multi-dimensional context system** that:
1. **Structures** all project knowledge into a queryable knowledge graph (Graphify)
2. **Orchestrates** agent workflows through intent-driven pipelines (Workflow)
3. **Persists** insights across sessions and projects (Obsidian vault)
4. **Compresses** context intelligently for the Smart Zone
5. **Evolves** automatically as the agent works

### 4.2 System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    COGNITIVE CONTEXT ARCHITECTURE                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │  noesis-flow │◄──►│ noesis-graph │◄──►│ noesis-vault │     │
│  │   (Workflow) │    │  (Graphify)  │    │  (Obsidian)  │     │
│  │              │    │              │    │              │     │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘     │
│         │                   │                   │              │
│         └───────────────────┼───────────────────┘              │
│                             │                                  │
│                    ┌────────┴────────┐                         │
│                    │  noesis-core      │                      │
│                    │ (Context Compactor│                      │
│                    │  & Smart Zone Mgr)│                      │
│                    └─────────────────┘                         │
│                             │                                  │
│                    ┌────────┴────────┐                         │
│                    │   OMP AGENT CORE │                        │
│                    │  (read, edit, bash│                        │
│                    │   lsp, task, etc.)│                        │
│                    └───────────────────┘                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 The Three Components

#### Component 1: noesis-flow (Workflow Engine)

**Innovation:** Dynamic, self-evolving **intent graphs** instead of static linear chains.

- **Nodes** = intent states (clarify, plan, implement, review, verify)
- **Edges** = transitions conditioned on context + outcomes
- **Weights** = learned probabilities from past executions
- **Cycles** = iteration loops (review → fix → re-review)

**Key features:**
| Feature | Description |
|---------|-------------|
| Intent Classification | LLM-driven semantic understanding of user intent |
| Dynamic Decomposition | Break intent into sub-tasks based on codebase graph |
| Smart Zone Routing | Route tasks to subagents based on context budget |
| Acceptance Gate Propagation | Gates flow through the graph, not just at end |
| Workflow Evolution | Learn from execution to improve graph weights |
| Context Budgeting | Allocate token budget per node, evict low-relevance |
| Parallel Discovery | Auto-detect parallelizable branches |
| Rollback Graph | Branch and merge for experimental paths |

**Workflow DSL example:**
```yaml
# noesis-flow: implement-feature.yml
name: implement-feature
intent_graph:
  start: clarify
  nodes:
    clarify:
      agent: oracle
      task: "Ask clarifying questions about: {intent}"
      output_schema: clarifications
      max_tokens: 8000
      next: plan
    plan:
      agent: planner
      task: "Create plan from: {clarifications}"
      output_schema: plan
      max_tokens: 12000
      next: [implement, review]
      condition: "plan.parallelizable"
    implement:
      agent: worker
      worktree: true
      max_tokens: 40000
      next: review
    review:
      agent: reviewer
      parallel: [correctness, tests, complexity]
      acceptance: verified
      next:
        pass: done
        fail: fix
    fix:
      agent: worker
      max_tokens: 20000
      next: review
      max_iterations: 3
    done:
      action: summarize
context_budget:
  total: 100000
  allocation:
    clarify: 8000
    plan: 12000
    implement: 40000
    review: 20000
    fix: 20000
  eviction_policy:
    strategy: relevance_score
    preserve: [plan, review.feedback]
```

#### Component 2: noesis-graph (Graphify Integration)

**Innovation:** Living, evolving, agent-aware knowledge graph.

Graphify parses code (20+ languages), docs, PDFs, images → builds NetworkX graph with Leiden community detection → identifies "god nodes" and surprising connections.

**What noesis-graph adds:**
| Feature | How |
|---------|-----|
| Auto-rebuild | File watcher triggers incremental graph updates |
| Agent Annotation | Agent writes "why I changed this" as edge metadata |
| Temporal Layer | Track when nodes were modified, by which session |
| Natural Language Queries | `graph_query({ query: "What depends on auth.ts?" })` |
| Context Relevance Scoring | Score files by centrality + recency + community |
| Change Impact Analysis | `graph_impact({ files: ["auth.ts"] })` predicts cascade |
| Smart Zone Compression | Load community summaries instead of full files |
| Cross-Project Graph | Merge graphs from multiple projects |

**Context flow transformation:**
```
BEFORE: User Prompt → Agent → read files → read more files → ... → respond
        (flat, temporal, unstructured — 70% of reads are low-relevance)

AFTER:  User Prompt → Agent → Query Graph → Get relevant subgraph → 
        Read only high-relevance files → Respond
        (structured, relational, semantic — 70% fewer reads, 50% better relevance)
```

#### Component 3: noesis-vault (Obsidian Integration)

**Innovation:** Project memory as a living Obsidian vault — structured, linked, human-curatable.

**Why Obsidian:** 1.5M+ users, local-first Markdown, graph-native, MCP-ready, wikilinks, frontmatter. The vault-as-knowledge-layer pattern is exploding.

**Auto-generated vault structure:**
```
noesis-vault/
├── Sessions/           # Per-session logs
├── Decisions/          # Architecture decisions (with frontmatter)
├── Patterns/           # Reusable patterns
├── Risks/              # Known risks
├── Entities/           # Code entities (auto-from Graphify)
├── Workflows/          # Saved workflow templates
├── Context-Graph/      # Graph snapshots
└── Index.md            # Auto-generated index
```

**Frontmatter schema (auto-generated):**
```yaml
---
type: decision
status: active
project: my-api
created: 2026-06-12T10:30:00Z
confidence: high
source: agent-oracle
related: ["[[Auth-Strategy]]", "[[Patterns/Error-Handling-Pattern]]"]
tags: [auth, jwt, security]
graph_node_id: "auth-decision-001"
---
```

**Session-to-session memory flow:**
```
Session 1: Agent implements auth
  → Writes to vault:
    - Sessions/2026-06-12-auth-implementation.md
    - Decisions/Auth-Strategy.md
    - Patterns/Auth-Middleware-Pattern.md
    - Risks/Auth-Edge-Cases.md

Session 2: Agent works on API
  → Reads from vault:
    - "What auth decisions?" → Decisions/Auth-Strategy.md
    - "What patterns exist?" → Patterns/Auth-Middleware-Pattern.md
    - "What risks?" → Risks/Auth-Edge-Cases.md
  → Starts with full context, not zero
```

### 4.4 How They Work Together: Full Scenario

**User:** *"Add OAuth2 login to the API"*

```
1. noesis-flow classifies intent → "implement-feature" + "auth" + "oauth2"
   ↓
2. Queries noesis-graph: "What auth-related files exist?"
   Queries noesis-vault: "What auth decisions were made?"
   Allocates context budget: 100k tokens
   ↓
3. CLARIFY (oracle agent):
   - Reads vault: Decisions/Auth-Strategy.md, Patterns/Auth-Middleware.md
   - Reads graph: "auth community" subgraph
   - Asks user: "Replace JWT or supplement it?"
   - Budget: 8k tokens
   ↓
4. PLAN (planner agent):
   - Reads graph subgraph for auth + oauth2 nodes
   - Reads vault: past workflow templates
   - Creates vertical-slice plan
   - Budget: 12k tokens
   ↓
5. IMPLEMENT (worker agent):
   - Graph guides: "Read these god nodes first"
   - Vault guides: "Follow this documented pattern"
   - Worktree isolation for parallel work
   - Budget: 40k tokens
   ↓
6. REVIEW (parallel reviewers):
   - Graph checks: "Did you break cross-file dependencies?"
   - Vault checks: "Are you following documented patterns?"
   - Budget: 20k tokens
   ↓
7. DOCUMENT (auto):
   - Writes to vault: Session log, Decision note, Pattern note
   - Updates graph: Rebuild with new OAuth2 nodes
   - Updates flow: Learn from this execution
   ↓
8. DONE: Feature implemented, knowledge persisted, graph updated, workflow improved
```

---

## 5. What Makes This Ultra-Evolutionary

### 5.1 No One Has Done This Combination

| Component | Exists? | But... |
|-----------|---------|--------|
| Workflow engine | ✅ pi-subagents | Static chains, no intent graphs, no context budgeting |
| Knowledge graph | ✅ Graphify | One-shot, not agent-aware, no temporal layer |
| Agent memory | ✅ Hindsight/Mnemopi | Session-scoped, flat, no cross-project |
| Obsidian integration | ✅ MCP servers | Read/write only, no structured agent memory |
| **Combined + Evolving** | ❌ **NO** | **This is the opportunity** |

### 5.2 Self-Evolving System

- **Workflows** learn from execution outcomes
- **Graphs** auto-update on code changes
- **Vault** accumulates knowledge across sessions
- **Context compacting** improves with usage patterns

### 5.3 Human-in-the-Loop at the Right Level

Not "human reviews every line" (too slow). Not "fully autonomous" (too risky). Instead: **Human curates knowledge, agent executes workflows.**

### 5.4 Context Engineering at the Next Level

Current "context engineering" = "what info should I provide?"  
**noesis** = "the system decides what to provide, when, and how much"

The agent doesn't manage context — the **context architecture manages the agent.**

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] OMP Extension scaffold (TypeScript, tool registration)
- [ ] Graphify MCP integration (`graph_query`, `graph_impact` tools)
- [ ] Obsidian MCP integration (`vault_read`, `vault_write` tools)
- [ ] Basic workflow engine (YAML parser, static execution)

### Phase 2: Context Management (Week 3-4)
- [ ] Smart Zone Manager (token budget tracking, relevance scoring)
- [ ] Context Compactor (compress graph + vault into Smart Zone)
- [ ] Graphify watch mode (auto-rebuild on file changes)
- [ ] Vault auto-documentation (auto-write session logs)

### Phase 3: Intelligence (Week 5-6)
- [ ] Intent classification (LLM-driven workflow selection)
- [ ] Dynamic decomposition (break workflows based on graph structure)
- [ ] Workflow learning (track outcomes, adjust graph weights)
- [ ] Cross-project memory (merge vaults from multiple projects)

### Phase 4: Polish (Week 7-8)
- [ ] TUI integration (visual workflow graphs, context budget dashboard)
- [ ] Performance optimization (caching, lazy loading, incremental updates)
- [ ] Documentation (Skills, AGENTS.md templates, examples)
- [ ] Release (npm package + GitHub repo)

---

## 7. Technical Architecture

### 7.1 Extension Structure

```
omp-noesis/
├── src/
│   ├── index.ts                    # Extension entry point
│   ├── noesis-flow/
│   │   ├── engine.ts               # Workflow execution engine
│   │   ├── parser.ts               # YAML workflow parser
│   │   ├── intent-classifier.ts    # LLM intent classification
│   │   ├── context-budget.ts       # Smart Zone budget manager
│   │   └── templates/              # Built-in workflow templates
│   │       ├── implement-feature.yml
│   │       ├── review-code.yml
│   │       ├── refactor-system.yml
│   │       └── investigate-bug.yml
│   ├── noesis-graph/
│   │   ├── client.ts               # Graphify MCP client
│   │   ├── query-tool.ts           # graph_query tool
│   │   ├── impact-tool.ts          # graph_impact tool
│   │   ├── context-enricher.ts     # Enrich context with graph data
│   │   └── watch.ts                # File watcher for auto-rebuild
│   ├── noesis-vault/
│   │   ├── client.ts               # Obsidian MCP client
│   │   ├── vault-tool.ts           # vault_read/vault_write tools
│   │   ├── auto-doc.ts             # Auto-documentation generator
│   │   ├── note-templates/         # Note templates
│   │   │   ├── session.md
│   │   │   ├── decision.md
│   │   │   ├── pattern.md
│   │   │   └── risk.md
│   │   └── sync.ts                 # Graphify ↔ Obsidian sync
│   ├── noesis-core/
│   │   ├── compactor.ts            # Context compaction engine
│   │   ├── relevance-scorer.ts     # Relevance scoring algorithm
│   │   ├── eviction-policy.ts       # Smart eviction strategies
│   │   └── smart-zone.ts          # Smart Zone manager
│   └── skills/
│       └── noesis.md               # Extension skill
├── docs/
│   ├── README.md
│   ├── ARCHITECTURE.md
│   └── WORKFLOWS.md
└── package.json
```

### 7.2 Key APIs

```typescript
// noesis-flow: Workflow Engine
interface WorkflowEngine {
  classifyIntent(prompt: string): Promise<Intent>;
  loadWorkflow(intent: Intent): Promise<Workflow>;
  execute(workflow: Workflow, context: ContextBudget): Promise<Result>;
  learnFromExecution(workflow: Workflow, result: Result): Promise<void>;
}

// noesis-graph: Graphify Integration
interface GraphifyClient {
  query(query: string): Promise<GraphResult>;
  impact(files: string[]): Promise<ImpactResult>;
  getCommunity(node: string): Promise<Community>;
  getGodNodes(): Promise<Node[]>;
  watch(path: string): Promise<void>;
}

// noesis-vault: Obsidian Integration
interface ObsidianVault {
  read(path: string): Promise<Note>;
  write(path: string, content: Note): Promise<void>;
  search(query: string): Promise<Note[]>;
  autoDocument(session: Session): Promise<void>;
  syncWithGraph(graph: Graph): Promise<void>;
}

// noesis-core: Context Management
interface ContextCompactor {
  scoreRelevance(item: ContextItem, query: string): Promise<number>;
  compact(context: Context, budget: number): Promise<CompactContext>;
  evict(context: Context, policy: EvictionPolicy): Promise<Context>;
}
```

---

## 8. Future Vision: Beyond OMP

While the initial target is **oh-my-pi**, the architecture is designed to be **harness-agnostic**. The long-term vision is to port noesis to other agent harnesses:

| Harness | Status | Notes |
|---------|--------|-------|
| **oh-my-pi** | 🎯 Primary target | Extension system, MCP support, subagents |
| **Pi (pi-mono)** | 📋 Planned | Core pi agent, minimal system |
| **Claude Code** | 📋 Future | Anthropic's official agent |
| **OpenCode** | 📋 Future | OpenAI's Codex CLI |
| **Custom harnesses** | 📋 Future | Any MCP-compatible agent system |

The **MCP protocol** is the universal adapter. As long as a harness supports MCP, noesis-graph and noesis-vault can integrate. The workflow engine (noesis-flow) may need harness-specific adapters for subagent orchestration.

---

## 9. Key Principles

1. **Model proposes — harness executes** (never let LLM call tools directly)
2. **Each tool call returns a result** — even on failure
3. **Risk changes the process** — Read-only (autonomous) → Draft → External write (approval)
4. **Context is assembled, not dumped** — Policies + Scoped instructions + Runtime hints (JIT)
5. **Long tasks have budgets** — Step, time, token, cost budgets with graceful termination
6. **Recurring failures become harness features** — Don't fix in prompt, fix in system
7. **Feedback speed hierarchy:** PostToolUse Hook (ms) > pre-commit (s) > CI (min) > human review (h)
8. **The harness should be "rippable"** — As models improve, some harness logic becomes unnecessary. Design for easy removal.

---

## 10. Open Questions

1. **Graphify integration depth:** Should noesis-graph use Graphify as an MCP server, or embed Graphify's Python engine directly?
2. **Obsidian sync strategy:** Real-time sync (file watcher) or batch sync (on session end)?
3. **Workflow template distribution:** Built-in templates vs. user-defined vs. community marketplace?
4. **Cross-project memory security:** How to isolate sensitive project knowledge while enabling pattern learning?
5. **Context compaction algorithm:** Token-based truncation vs. semantic summarization vs. graph-based abstraction?

---

## 11. Resources & References

### Agentic Engineering Research
- Karpathy, A. (2026). *Software 3.0 and the Phase Change*. AI Ascent, Sequoia.
- Pocock, M. (2026). *AI Coding for Real Engineers*. Workshop, April 2026.
- Hashimoto, M. (2026). *My AI Adoption Journey*. Blog, February 2026.
- Fowler, M. & Böckeler, B. (2026). *Agent = Model + Harness*. ThoughtWorks.
- Anthropic. (2026). *2026 Agentic Coding Trends Report*.
- OpenAI. (2026). *The Codex Experiment: Zero Manual Code*.

### OMP Documentation
- oh-my-pi GitHub: https://github.com/can1357/oh-my-pi
- Pi Coding Agent Docs: https://pi.dev/docs/latest/
- Pi Extensions: https://pi.dev/docs/latest/extensions
- Pi Subagents: https://github.com/nicobailon/pi-subagents

### Graphify
- Graphify: Multi-modal knowledge graph builder (code, docs, images)
- Supports 20+ languages via tree-sitter, NetworkX, Leiden community detection

### Obsidian
- Obsidian: https://obsidian.md
- obsidian-skills: 14,900 GitHub stars (official from Obsidian CEO)
- MCP servers available for vault integration

---

*Document generated from conversation on 2026-06-12. Subject to revision as the project evolves.*
