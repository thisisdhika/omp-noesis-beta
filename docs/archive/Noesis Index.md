> **⚠ STALE NOTICE — v1.0.0, archived**
> This document is from v1.0.0 (2026-06-15). The memory architecture has since
> been updated: the current v1.0.1 uses OMP memory as the cross-session
> durability channel, with state.json as authoritative, rather than the earlier
> mnemo-pi/local model. See the current version at [Noesis Index.md](../../Noesis%20Index.md)
> (root) and [.omp/RULES.md](../../.omp/RULES.md) for current operating rules.
>

# Noesis Dashboard

Welcome to your Noesis cognitive state dashboard. This file is your window into what the AI assistant has learned, decided, and is tracking in this project.

## Quick Links

| Link | Purpose |
|------|---------|
| [State File](.omp/noesis/state.json) | Raw cognitive state (beliefs, decisions, learning, attention, commitments) |
| [Configuration](.omp/config.yml) | Noesis runtime settings |
| [RULES.md](.omp/RULES.md) | AI assistant operating rules |
| [Graph Knowledge Map](graphify-out/index.md) | Full knowledge graph index |

## Cognitive Layers

### Beliefs
What the assistant knows about this project - facts, decisions, and domain knowledge that persist across sessions.

### Attention
What the assistant is currently focused on - recent queries, active context windows, and priority areas.

### Learning
What the assistant has learned from experience - debugging insights, patterns, and validation results.

### Commitments
Active goals, promises, and intentions that the assistant is tracking and working toward.

## Vault Operations

The assistant maintains durable memory through:
- **mnemopi** — Primary cross-session memory (auto-managed)
- **local** — Local file-based fallback
- **obsidian** — Human-readable projection (this vault)

## Tips

1. Review beliefs periodically to ensure accuracy
2. Clear outdated information through state compaction
3. Use the knowledge graph for codebase-wide reasoning
4. Dashboard auto-updates at session start
