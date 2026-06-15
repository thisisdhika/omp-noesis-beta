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

**File**: `.obsidian/noesis/decision/{id}.md`

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

**File**: `.obsidian/noesis/learning/{id}.md`
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

**File**: `.obsidian/noesis/belief/{id}.md` or `.obsidian/noesis/decision/{id}.md`

## 3. Vault Structure

```
<vault-root>/
└── .obsidian/
    └── noesis/
        ├── decision/
        │   └── {id}.md
        ├── learning/
        │   └── {id}.md
        ├── belief/
        │   └── {id}.md
        └── <kind>/
            └── {id}.md
```

## 4. Projection Triggers

| Trigger | What gets projected |
|---|---|
| Turn end (turn-end-hook) | Vault flush of the retry buffer (previously-failed pushes). |
| New artifact push | Individual decision, learning, belief, or pattern pushed to vault. |
| VaultRetry flush | Previously failed pushes (triggered by turn-end-hook calling vaultStore.flush()). |

> **Compaction does NOT project to vault.** The compaction hook stores its cognitive survivor state in `preserveData.noesis` (see [ARCHITECTURE.md](ARCHITECTURE.md)), not in the Obsidian vault. Only direct tool calls (e.g. `noesis_believe`) and turn-end retry flushing write to vault paths.

## 5. Error Handling

| Scenario | Behavior |
|---|---|
| Vault path doesn't exist | Buffer to VaultRetry, log |
| Vault path not writable | Buffer to VaultRetry, log |
| Disk full | Buffer to VaultRetry, log |
| Frontmatter parse error | Skip artifact, continue others |

## 6. What Noesis Never Does

- Read from the Obsidian vault during runtime for cognition (pull/search methods exist for `noesis_vault_search` but are optional and separate from core cognition)
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
