# Obsidian Projection Contract

> **Version:** 1.0.0 | **Updated:** 2026-06-24

## Optionality Rule

> If Obsidian disappears, Noesis still works.

Noesis must never:
- Require an Obsidian vault to operate
- Fail or degrade without Obsidian
- Block any runtime path on Obsidian availability

## What Gets Projected

| Artifact | Path | Format |
|---|---|---|
| Decisions | `.obsidian/noesis/decision/{id}.md` | Frontmatter + body |
| Learning entries | `.obsidian/noesis/learning/{id}.md` | Frontmatter + body |
| Belief artifacts | `.obsidian/noesis/belief/{id}.md` | Frontmatter + body |

### Vault Structure

```
<vault-root>/.obsidian/noesis/
  ├── _INDEX.md          (Dataview queries, generated on flush)
  ├── decision/
  ├── learning/
  └── belief/
```

## Projection Triggers

| Trigger | What gets projected |
|---|---|
| Turn end (`turn-end-hook`) | Retry buffer flush |
| New artifact push | Individual decision/learning/belief/pattern |
| `VaultRetry.flush()` | Previously failed pushes |

Compaction does NOT project to vault. Only direct tool calls and turn-end retry flushing write to vault paths.

## Error Handling

| Scenario | Behavior |
|---|---|
| Path doesn't exist | Buffer to VaultRetry, log |
| Path not writable | Buffer to VaultRetry, log |
| Disk full | Buffer to VaultRetry, log |
| Frontmatter parse error | Skip artifact, continue others |

## What Noesis Never Does

- Read from Obsidian vault for cognition (vault reads use memory backends — Mnemopi/Local — never Obsidian)
- Require Obsidian for correctness
- Create its own note editor or viewer
- Auto-sync continuously
- Replace Graphify's `--obsidian` export

## Relationship to Mnemopi

| System | Role | Direction |
|---|---|---|
| **Mnemopi** | Cross-session long-term memory (SQLite) | Read/write |
| **Noesis Obsidian** | Human-reviewable projection (Markdown) | Write-only |

`CompositeVaultStore` bridges both: pushed artifacts go to both stores in parallel; reads come exclusively from the memory backend.

## Auto-Detection

At startup, `vault-detector.ts` resolves backends:

- **Memory backend** (priority): mnemopi (`.omp/mnemopi.db`) > local (`MEMORY.md`) > none
- **Projection backend**: obsidian (`.obsidian/`) or none
- When both exist, `CompositeVaultStore` combines them; otherwise single backend used; `NoopVaultStore` is the fallback

## Design Rules

1. Projection is write-only — Noesis never reads vault for cognition
2. Best-effort — failures logged, never propagated
3. Never runtime-critical — removing vault doesn't affect behavior
4. One-way enrichment: Noesis → vault, never reverse
5. Human surface, not agent surface
6. Graphify owns code structure; Noesis adds cognition
