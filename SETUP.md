# Setup Guide

## Prerequisites

- **Bun** >= 1.3.0 ([install](https://bun.sh))
- **Oh My Pi** >= 15.6.0
- **Graphify** >= 8.2.0 (`pip install graphify`)
- **Python** >= 3.10 (for Graphify)

## Installation

### Step 1: Install Graphify

```bash
pip install graphify
graphify --version  # Should show v8.2.0+
```

### Step 2: Install Noesis Extension

```bash
cd your-project/
bun add @omp-noesis/extension
```

### Step 3: Initialize Noesis

```bash
/noesis:init
```

This creates:
- `.omp/noesis/` directory
- `.omp/config.yml` with noesis settings

### Step 4: Build Codebase Graph

```bash
graphify .
```

This creates `graphify-out/graph.json` — the perception substrate.

### Step 5: Verify

```bash
omp --check-extensions
```

Expected output:
```
noesis [loaded] capability: FULL
  Graphify: v8.2.0
  Graph: fresh (built 2026-06-15T10:00:00Z)
  State: .omp/noesis/state.json (empty)
  Vault: NoopVaultStore (no vault configured)
```

## Configuration

### `.omp/config.yml`

```yaml
compaction:
  strategy: "context-full"
  autoContinue: true
  reserveTokens: 16384
  keepRecentTokens: 20000
  idleThresholdTokens: 200000

noesis:
  enabled: true
  graphify:
    autoUpdate: true
    staleThresholdHours: 24
  learning:
    maxEntries: 100
    autoCaptureFailures: true
  preamble:
    maxTokens: 2000
    includeGraphEvidence: true
    includeLowConfidenceCount: true
  vault:
    backend: "noop"  # noop | local | obsidian | mnemopi | hindsight
    obsidianVaultPath: ".obsidian/noesis/"
```

## Optional: Obsidian Vault

```bash
# 1. Create or point to an existing Obsidian vault
mkdir -p .obsidian/noesis/

# 2. Update config
# .omp/config.yml:
#   vault:
#     backend: "obsidian"
#     obsidianVaultPath: ".obsidian/noesis/"

# 3. Projected artifacts will appear at:
# .obsidian/noesis/noesis-decision-*.md
# .obsidian/noesis/noesis-learning-*.md
```

## Optional: Mnemopi Vault (SQLite)

```bash
# .omp/config.yml:
#   vault:
#     backend: "mnemopi"
# Creates: .omp/noesis/mnemopi.sqlite
```

## Next Steps

1. Start an OMP session
2. The agent will automatically load the `noesis` skill
3. The cognitive preamble will appear in the first LLM call
4. Use `noesis_attend`, `noesis_believe`, `noesis_commit`, etc. as needed

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
