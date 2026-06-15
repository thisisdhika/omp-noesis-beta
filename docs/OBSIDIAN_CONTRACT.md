# omp-noesis: Obsidian Projection Contract

> **Version:** 0.1.0  
> **Date:** 2026-06-15  
> **Status:** Finalized

## 1. Optionality Rule

> **If Obsidian disappears, noesis still works.**

Noesis must never:
- Require an Obsidian vault to operate
- Fail or degrade without Obsidian
- Block any runtime path on Obsidian availability

## 2. What Gets Projected

### 2.1 Decisions

**File**: `Noesis/noesis-decision-{id}.md`

```yaml
---
kind: decision
projectPath: /path/to/project
id: a1b2c3d4
pushedAt: 2026-06-15T14:00:00Z
metadata:
  status: active
  source: agent-oracle
---
```

**Body**: Decision content text.

### 2.2 Learning Entries

**File**: `Noesis/noesis-learning-{id}.md`

```yaml
---
kind: learning
projectPath: /path/to/project
id: a1b2c3d4
pushedAt: 2026-06-15T14:15:00Z
metadata:
  description: "..."
  rootCause: "..."
  fix: "..."
---
```

### 2.3 Belief and Pattern Artifacts

**File**: `Noesis/noesis-belief-{id}.md` or `Noesis/noesis-pattern-{id}.md`

Minimal frontmatter identical to decisions and learning.

## 3. Vault Structure

```
<vault-root>/
└── Noesis/
    ├── noesis-decision-{id}.md
    ├── noesis-learning-{id}.md
    ├── noesis-belief-{id}.md
    └── noesis-pattern-{id}.md
```

## 4. Projection Triggers

| Trigger | What gets projected |
|---|---|
| Turn end (eviction) | Evicted beliefs, decisions, hypotheses, learning |
| Session compaction | Same as turn end + VaultRetry flush |
| VaultRetry flush | Previously failed pushes |

## 5. Error Handling

| Scenario | Behavior |
|---|---|
| Vault path doesn't exist | Buffer to VaultRetry, log |
| Vault path not writable | Buffer to VaultRetry, log |
| Disk full | Buffer to VaultRetry, log |
| Frontmatter parse error | Skip artifact, continue others |

## 6. What Noesis Never Does

- Read from the Obsidian vault during runtime
- Require Obsidian for correctness
- Create its own note editor or viewer
- Index or search the vault (Obsidian has built-in search)
- Auto-sync continuously
- Replace Graphify's `--obsidian` export
- Build a custom graph view

## 7. Relationship to Mnemopi and Hindsight

| System | Role | Format | Direction |
|---|---|---|---|
| **Mnemopi** | Cross-session long-term memory | SQLite / internal | Read/write |
| **Hindsight** | Session reflection | Internal | Read/write |
| **Noesis Obsidian** | Human-reviewable projection | Markdown vault | Write-only |

## 8. Configuration

```jsonc
// .omp/config.yml
{
  "noesis": {
    "vault": {
      "backend": "obsidian",  // noop | local | obsidian | mnemopi | hindsight
      "obsidianVaultPath": ".obsidian/noesis/"
    }
  }
}
```

## 9. Design Rules

1. Projection is write-only. Noesis never reads from the vault for cognition.
2. Projection is best-effort. Failures are logged, never propagated.
3. Never runtime-critical. Removing the vault must not affect agent behavior.
4. One-way enrichment. Noesis → vault. Never vault → noesis.
5. Human surface, not agent surface. The vault is for review, not for reasoning.
6. Complement Graphify, don't compete. Graphify owns code structure; noesis adds cognition.
