# omp-noesis: Obsidian Projection Contract

> Version: 1.0
> Date: 2026-06-12
> Status: Aligned

---

## 1. Purpose

This document defines how noesis optionally projects cognitive state into an Obsidian vault for human review.

It answers:
- What gets projected?
- Where in the vault does it go?
- How does it stay truly optional?
- How does it relate to Graphify's built-in Obsidian export?

---

## 2. The Optionality Rule

Obsidian is optional. This is a hard rule from the PRD and boundary matrix:

> **If Obsidian disappears, noesis still works.**

Noesis must never:
- Require an Obsidian vault to operate
- Fail or degrade without Obsidian
- Block any runtime path on Obsidian availability
- Reference Obsidian paths in the cognitive preamble by default

The projection is a one-way export: noesis → vault. Noesis never reads from the vault as part of its runtime cognition.

---

## 3. What Gets Projected

Noesis projects four categories of cognitive content. All are optional and independently configurable.

### 3.1 Decisions

Each active decision becomes a Markdown note.

**File**: `Decisions/<slug>.md`

**Frontmatter**:
```yaml
---
type: decision
status: active
confidence: high
source: agent-oracle
project: <detected-from-cwd>
created: 2026-06-12T10:30:00Z
updated: 2026-06-12T14:00:00Z
tags: [auth, jwt, security]
aliases: ["JWT over sessions decision"]
---
```

**Body**:
```markdown
# <decision.content>

## Rationale
<decision.rationale>

## Alternatives Considered
- <alt1>
- <alt2>

## Related
- [[<related-decision>]]
```

Superseded decisions get `status: superseded` and a wikilink to the superseding decision. Archived decisions get `status: archived`.

### 3.2 Learning entries

Each resolved failure becomes a Markdown note.

**File**: `Learning/<slug>.md`

**Frontmatter**:
```yaml
---
type: learning
category: failure
resolved: true
skill_scope: auth
tool: bash
captured: 2026-06-12T14:15:00Z
tags: [auth, test-failure, dependency]
---
```

**Body**:
```markdown
# <learning.description>

## Root Cause
<learning.rootCause>

## Fix
<learning.fix>

## Captured
<learning.capturedAt>
```

Success patterns can optionally be projected as `category: success`.

### 3.3 State snapshots

A periodic summary of the full cognitive state for archival review.

**File**: `Sessions/<timestamp>-session.md`

**Frontmatter**:
```yaml
---
type: session
created: 2026-06-12T14:30:00Z
beliefs_active: 12
decisions_active: 3
hypotheses_unresolved: 1
learning_failures: 5
learning_resolved: 4
---
```

**Body**:
```markdown
# Session: <timestamp>

## Focus
<attention.focus>

## Active Beliefs
- <belief 1> (confidence: 0.95, source: graph)
- <belief 2> (confidence: 0.85, source: execution)
...

## Active Decisions
- [[decision-1]]: <summary>
- [[decision-2]]: <summary>

## Unresolved Hypotheses
- <hypothesis content>

## Learning Summary
- Successes: <N> | Failures: <N> (resolved: <N>)
```

### 3.4 Index

An auto-generated index note that links to all projected content.

**File**: `Index.md`

```markdown
# Noesis Cognitive Index

> Generated: <timestamp>
> Project: <cwd-basename>

## Active Decisions
- [[Decisions/use-jwt-over-sessions]]: Use JWT over session cookies
- [[Decisions/http-only-cookies]]: Store JWTs in HTTP-only cookies

## Recent Learning
- [[Learning/missing-jsonwebtoken]]: JWT module not found

## Sessions
- [[Sessions/2026-06-12T143000Z-session]]
```

---

## 4. Vault Structure

```
<vault-root>/
├── Index.md                   # Auto-generated index
├── Decisions/                 # One note per decision
│   └── <slug>.md
├── Learning/                  # One note per resolved failure
│   └── <slug>.md
└── Sessions/                  # Periodic state snapshots
    └── <timestamp>-session.md
```

The vault root defaults to `.obsidian/noesis/` within the project directory. It can be configured to point at any existing Obsidian vault.

Noesis never creates a vault from scratch — the developer points it at an existing vault or accepts the default location.

---

## 5. Graphify Integration

Graphify already has built-in Obsidian export:

```bash
graphify . --obsidian
```

This creates code-structure notes in the vault (one note per code entity, with edges as wikilinks). Noesis and Graphify projections are complementary:

| Layer | Who projects | Content |
|---|---|---|
| Code structure | Graphify (`--obsidian`) | Entities, relations, communities |
| Cognitive state | Noesis | Decisions, learning, session summaries |

The two projections live in the same vault and cross-link via wikilinks when they share tags or relate to the same entities.

Noesis does not duplicate Graphify's export — it adds the cognitive layer that Graphify does not have.

---

## 6. Projection Triggers

Projection is never continuous. It happens on explicit triggers only:

| Trigger | What gets projected |
|---|---|
| `noesis_commit` with new/updated decision | Decision note (create or update) |
| `noesis_believe` resolving a learning entry | Learning note (create or update) |
| Session end / compaction | Session snapshot (create) |
| Explicit command: `/noesis-project` | Full projection (decisions + learning + index) |

### Anti-triggers
- Every turn: too noisy, Obsidian is for review not live tracking
- On belief changes only: beliefs alone don't warrant separate notes
- Automatically: projection is always opt-in at the trigger level

---

## 7. Format Conventions

### Wikilinks
All cross-references use Obsidian wikilinks (`[[Note Name]]`).

Examples:
- Decision → related decision: `[[use-jwt-over-sessions]]`
- Learning → related decision: `[[use-jwt-over-sessions]]`
- Index → projected note: `[[Decisions/use-jwt-over-sessions]]`

Wikilink resolution follows Obsidian's shortest-unique-path algorithm.

### Tags
All notes carry tags from their source state:
- Decisions: tags from `BeliefDecision.tags`
- Learning: `skillScope` as a tag + `toolName` as a tag
- Sessions: no custom tags

### Slug generation
File slugs are derived from content: lowercased, non-alphanumeric → hyphens, max 48 characters.

Example: `"Use JWT over session cookies"` → `use-jwt-over-session-cookies.md`

---

## 8. Error Handling

Projection errors must never affect runtime cognition.

| Scenario | Behavior |
|---|---|
| Vault path doesn't exist | Skip projection, log warning |
| Vault path not writable | Skip projection, log warning |
| Disk full | Skip projection, log warning |
| Frontmatter parse error | Skip that note, continue others |

Noesis never retries a failed projection. Projection is best-effort.

---

## 9. What Noesis Never Does

| Anti-pattern | Why |
|---|---|
| Read from the Obsidian vault during runtime | Obsidian is output-only; Mnemopi/Hindsight handle memory |
| Require Obsidian for correctness | Hard rule from PRD and boundary matrix |
| Create its own note editor or viewer | Obsidian already does this |
| Index or search the vault | Obsidian has built-in search and graph view |
| Auto-sync continuously | Projection is triggered, not streaming |
| Replace Graphify's `--obsidian` export | Graphify owns code structure; noesis adds cognition |
| Build a custom graph view | Obsidian's graph view already handles wikilink graphs |

---

## 10. Relationship to Mnemopi and Hindsight

Noesis's Obsidian projection is distinct from OMP's memory systems:

| System | Role | Format | Direction |
|---|---|---|---|
| **Mnemopi** | Cross-session long-term memory | SQLite / internal | Read/write at runtime |
| **Hindsight** | Session reflection and summaries | Internal | Read/write at runtime |
| **Noesis Obsidian** | Human-reviewable cognitive projection | Markdown vault | Write-only export |

Noesis does not compete with Mnemopi or Hindsight. It provides a different surface: human-readable, linkable, browsable, curated. Mnemopi is for the agent; Obsidian projection is for the human.

---

## 11. Configuration

```jsonc
// .omp/noesis/config.json (future)
{
  "obsidian": {
    "enabled": false,           // default: off
    "vaultPath": ".obsidian/noesis/",  // or path to existing vault
    "projectDecisions": true,
    "projectLearning": true,
    "projectSessions": true,
    "autoIndex": true
  }
}
```

All options default to off. The developer opts in.

---

## 12. Design Rules

1. **Projection is write-only.** Noesis never reads from the vault for cognition.
2. **Projection is best-effort.** Failures are logged, never propagated.
3. **Never runtime-critical.** Removing the vault must not affect agent behavior.
4. **One-way enrichment.** Noesis → vault. Never vault → noesis.
5. **Human surface, not agent surface.** The vault is for review, not for reasoning.
6. **Complement Graphify, don't compete.** Graphify owns code structure; noesis adds cognition.

---

## 13. References

Internal grounding:
- `docs/PRD.md` (§4.2: Obsidian optional, §12.5: projection layer)
- `docs/boundary-matrix.md` (§6.4: Obsidian owns optional reflection)
- `docs/cognitive-state-schema.md` (BeliefDecision, LearningEntry)
- `docs/research/04-graphify-labs.md` (§6: Obsidian export)
- `docs/stale/omp-noesis-strategic-blueprint.md` (noesis-vault concept, frontmatter schema)

External grounding:
- Obsidian: https://obsidian.md/
- Obsidian help (data storage): https://obsidian.md/help/data-storage
- Graphify Obsidian export: https://github.com/safishamsi/graphify
- llm-wiki (AI-maintained Obsidian wiki): https://github.com/enduserlab/llm-wiki
- obra/knowledge-graph (Obsidian vault as graph): https://github.com/obra/knowledge-graph
