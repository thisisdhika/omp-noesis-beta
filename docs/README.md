# omp-noesis Documentation

> **Version:** 1.0.0 | **Updated:** 2026-06-24

Noesis adds structured attention, beliefs, inference, commitment, and learning layers to Oh My Pi agents. This directory contains the canonical reference docs.

## Reading Order

New to Noesis? Read in this order:

1. **ARCHITECTURE.md** — High-level design, module map, dependency flow
2. **STATE_SCHEMA.md** — Exact shape of `.omp/noesis/state.json`
3. **BELIEF_REVISION.md** — AGM-based belief revision rules
4. **BOUNDARY_MATRIX.md** — What Noesis owns vs. OMP vs. Graphify
5. **GRAPHIFY_CONTRACT.md** — Graphify integration, CLI, MCP, retrieval-before-read
6. **OBSIDIAN_CONTRACT.md** — Optional vault projection
7. **TESTING_STRATEGY.md** — Three-layer testing philosophy and patterns

## Quick Reference

| Doc | What it covers | Read when… |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System context, modules, data flow, error recovery | Starting development or debugging |
| [STATE_SCHEMA.md](STATE_SCHEMA.md) | JSON schema for all cognitive layers | Adding a new tool, hook, or persistence feature |
| [BELIEF_REVISION.md](BELIEF_REVISION.md) | AGM postulates, supersession, confidence rules | Understanding how beliefs evolve |
| [BOUNDARY_MATRIX.md](BOUNDARY_MATRIX.md) | Ownership rules between OMP/Noesis/Graphify/Obsidian | Making architectural decisions |
| [GRAPHIFY_CONTRACT.md](GRAPHIFY_CONTRACT.md) | Graphify CLI, MCP, stale penalty, error handling | Working with graph queries or perception |
| [OBSIDIAN_CONTRACT.md](OBSIDIAN_CONTRACT.md) | Vault projection, triggers, backend detection | Configuring human-readable export |
| [TESTING_STRATEGY.md](TESTING_STRATEGY.md) | Unit / integration / behavioral test patterns | Writing or maintaining tests |

## Archive

Previous versions of these docs live in [docs/archive/](archive/).
