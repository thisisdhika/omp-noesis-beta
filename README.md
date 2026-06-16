# omp-noesis

> **Version:** 0.1.0  
> **Runtime:** Bun 1.3+  
> **Platform:** Oh My Pi (OMP) v15.6.0+

The world's first enterprise-grade cognitive substrate for agentic engineering. Noesis transforms Oh My Pi from an execution harness into a self-aware, learning-capable agent system.

## What is Noesis?

Noesis adds a structured, durable, and formally principled cognitive layer to OMP:

- **Structured Beliefs** — AGM-compliant belief revision with audit trails
- **Graph-Grounded Perception** — Codebase evidence via Graphify integration
- **Compaction Survival** — Typed cognitive state survives OMP compaction
- **Learning Loops** — Failure → root cause → fix → prevention
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
└───────┼───────────────────┼───────┘
        │                   │        
┌───────▼───────────────────▼───────┐
│           omp-noesis v0.1.0             │
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
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full architecture specification |
| [docs/STATE_SCHEMA.md](docs/STATE_SCHEMA.md) | Cognitive state schema |
| [docs/BELIEF_REVISION.md](docs/BELIEF_REVISION.md) | AGM belief revision model |
| [docs/BOUNDARY_MATRIX.md](docs/BOUNDARY_MATRIX.md) | System ownership matrix |
| [docs/GRAPHIFY_CONTRACT.md](docs/GRAPHIFY_CONTRACT.md) | Graphify integration contract |
| [docs/OBSIDIAN_CONTRACT.md](docs/OBSIDIAN_CONTRACT.md) | Projection contract |
| [docs/GRAPHIFY_DEEP_DIVE.md](docs/GRAPHIFY_DEEP_DIVE.md) | Graphify integration deep dive |
| [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) | Testing methodology |

## License

MIT © Dhika Putra Ardana
