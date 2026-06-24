# omp-noesis

> **Version:** 1.0.1  
> **Runtime:** Bun 1.3+  
> **Platform:** Oh My Pi (OMP) v15.6.0+

A cognitive layer for Oh My Pi. Noesis extends OMP with structured attention, beliefs, and context discipline — making agents not just capable, but effective with finite context.

## What is Noesis?

Noesis adds a structured, durable, and formally principled cognitive layer to OMP:

- **Structured Beliefs** — AGM-compliant belief revision with audit trails
- **Graph-Grounded Perception** — Codebase evidence via Graphify integration (core dependency). Install via `uv tool install graphifyy` with your preferred LLM backend — Ollama (local or cloud), OpenAI, or Anthropic. See [SETUP.md](SETUP.md) for provider-specific instructions. Autonomous lifecycle keeps the graph fresh during session start, agent queries, and session shutdown — no external cron, no MCP server.
- **Compaction Survival** — Typed cognitive state survives OMP compaction
- **Learning Loops** — Failure → root cause → fix → prevention
- **Obsidian Projection** — Human-readable artifact export (optional, not runtime-critical)
- **Smart-Zone Protection** — ≤2000-token bounded preamble

## Quick Start

```bash
# 1. Prerequisites
bun --version        # >= 1.3.0
omp --version        # >= 15.6.0

# 2. Install noesis
omp install omp-noesis

# 3. Initialize in your project
/noesis:init

# 4. Verify
omp doctor
ls .omp/noesis/state.json
ls .omp/config.yml
```

## Architecture

```
┌─────────────────────────────────────────┐
│              Oh My Pi                   │
│  ┌─────────┐         ┌─────────┐  │
│  │  Hooks   │         │ Tools   │  │
│  └────┬────┘         └────┬────┘  │
│           omp-noesis v1.0.1             │
        │                   │        
┌───────▼───────────────────▼───────┐
│           omp-noesis v1.0.1             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│  │Attention│ │ Belief  │ │Inference│     │
│  └─────────┘ └─────────┘ └─────────┘     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│  │Commitment│ │ Learning│ │  Vault  │     │
│  └─────────┘ └─────────┘ └─────────┘     │
└─────────────────────────────────────────┘
```

## Documentation

| Document | Purpose |
|---|---|
| [SETUP.md](SETUP.md) | Installation and configuration guide |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Diagnostic runbook |
| [docs/README.md](docs/README.md) | Docs index with reading order |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture specification |
| [docs/STATE_SCHEMA.md](docs/STATE_SCHEMA.md) | Cognitive state schema |
| [docs/BELIEF_REVISION.md](docs/BELIEF_REVISION.md) | AGM belief revision model |
| [docs/BOUNDARY_MATRIX.md](docs/BOUNDARY_MATRIX.md) | System ownership matrix |
| [docs/GRAPHIFY_CONTRACT.md](docs/GRAPHIFY_CONTRACT.md) | Graphify integration contract |
| [docs/OBSIDIAN_CONTRACT.md](docs/OBSIDIAN_CONTRACT.md) | Projection contract |
| [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) | Testing methodology |
## License

MIT © Dhika Putra Ardana
