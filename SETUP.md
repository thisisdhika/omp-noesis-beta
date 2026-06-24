# Setup Guide

## Prerequisites

- **Bun** >= 1.3.0 ([install](https://bun.sh))
- **Oh My Pi** >= 15.6.0
- **Graphify** >= 0.3.0 (core dependency; without it noesis runs in degraded mode)
- **Python** >= 3.10 (for Graphify)
- **Ollama** (optional but highly recommended for local processing)


## Installation

### Step 1: Install Graphify

**Option A: Ollama — Local or Cloud (Free)**

```bash
uv tool install "graphifyy[ollama]"
```

Then choose how to run models:

**Local (requires GPU or good CPU):**
```bash
ollama pull qwen2.5-coder:7b

export OLLAMA_MODEL="qwen2.5-coder:7b"        # Graphify's Ollama backend reads OLLAMA_MODEL, not GRAPHIFY_LLM_MODEL
```

To use a different local model, swap the model name in both `ollama pull` and `OLLAMA_MODEL`.

**Ollama Cloud (no GPU needed, free tier available):**

Cloud models run on Ollama's NVIDIA GPUs — no local pulling needed. Sign in with `ollama signin`, then set your env vars (make sure to include the API key for omp-noesis auto-detection):
```bash
ollama signin

export OLLAMA_API_KEY="ol-..."              # required — enables omp-noesis auto-detection
export OLLAMA_MODEL="minimax-m3:cloud"
```

**Important:** Ollama backend reads `OLLAMA_MODEL`, not `GRAPHIFY_LLM_MODEL`. That env var only works for OpenAI/Anthropic/Gemini backends.

Get your API key by running `ollama signin` or visit [ollama.com/settings](https://ollama.com/settings/keys).

**Note: omp-noesis auto-detects your Graphify backend.** If `OLLAMA_API_KEY` or `OLLAMA_HOST` is set, it passes `--backend ollama` automatically to all Graphify builds and updates. Otherwise it assumes a paid cloud API provider (Graphify auto-detects from your API keys). You don't need to configure anything.

If running Graphify standalone (outside noesis), pass the flag explicitly:
```bash
graphify . --backend ollama --max-concurrency 1
```
`--max-concurrency 1` is recommended for local Ollama; cloud can use a higher value.

**Option B: Standard Cloud APIs**
```bash
uv tool install graphifyy
```

Then configure your preferred LLM provider via environment variables:

```bash
export OPENAI_API_KEY="sk-..."
export GRAPHIFY_LLM_MODEL="gpt-4o"
```

**Anthropic:**
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export GRAPHIFY_LLM_MODEL="claude-sonnet-4-20250514"

```

Add these to your `~/.zshrc` or `~/.bashrc`.



Verify installation:
```bash
graphify --version  # Should show v0.3.x+
```


### Step 2: Install Noesis Extension

```bash
omp install omp-noesis
```

This installs the extension into `~/.omp/plugins/` and registers it for all OMP sessions.

> **Local development**: To load from a local clone instead, use `omp --extension ./path/to/omp-noesis/src/index.ts`.

### Step 3: Initialize Noesis

Run this command inside an active OMP session after the extension is loaded:

```bash
/noesis:init
```

This creates:
- `.omp/noesis/` directory
- `.omp/noesis/state.json` with initial empty cognitive state

> The init command also creates `.omp/config.yml` with recommended compaction settings (enabled, strategy: context-full, thresholdTokens: 160000). Existing config is deep-merged — your non-compaction keys are preserved.

### Step 4: Verify

```bash
# Check extension health
omp doctor

# Verify state file exists
ls .omp/noesis/state.json

# Verify graph was built
ls graphify-out/graph.json
```

## Configuration

Noesis uses a project-level `.omp/config.yml` for compaction settings. The `/noesis:init` command creates or updates this file with recommended defaults.

**Default compaction settings:**
```yaml
compaction:
  enabled: true
  strategy: context-full
  autoContinue: true
  thresholdTokens: 160000
```

Vault backend selection is automatic via heuristic detection (see [vault-detector.ts](src/vault/vault-detector.ts)):
- `.obsidian/` directory exists → `"obsidian"`
- `MEMORY.md` file exists → `"local"`
- `.omp/mnemopi.db` file exists → `"mnemopi"`
- Otherwise → `"none"` (NoopVaultStore)

## Optional: Obsidian Vault

```bash
# 1. Create or point to an existing Obsidian vault
mkdir -p .obsidian/noesis/

# 2. Projected artifacts will appear at:
# .obsidian/noesis/decision/{id}.md
# .obsidian/noesis/learning/{id}.md
# .obsidian/noesis/belief/{id}.md
# .obsidian/noesis/pattern/{id}.md
# .obsidian/noesis/session/{id}.md
```

Vault backend is detected automatically when `.obsidian/` exists. No manual config change needed.

## Optional: Mnemopi Vault (SQLite)

Mnemopi is a separate OMP plugin (`@oh-my-pi/mnemopi`) that provides an agentic memory backend.

```bash
# Install the Mnemopi plugin
omp install @oh-my-pi/mnemopi
```

Alternatively, add to `.omp/config.yml`:

```yaml
extensions:
  - @oh-my-pi/mnemopi
```

Mnemopi backend is detected automatically when `.omp/mnemopi.db` exists.

## Next Steps

1. Start an OMP session
2. The extension loads automatically from `~/.omp/plugins/` — no manual config needed
3. The Noesis system prompt is injected via the before_agent_start hook (always present). The cognitive preamble (beliefs, workflow, learning) appears in the LLM context each turn.
4. Use `noesis_attend`, `noesis_believe`, `noesis_commit`, `noesis_infer`, and `noesis_state_inspect` as needed

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for diagnostics.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design details.
