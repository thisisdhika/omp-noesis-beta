# Setup Guide

## Prerequisites

- **Bun** >= 1.3.0 ([install](https://bun.sh))
- **Oh My Pi** >= 15.6.0
- **Graphify** >= 0.3.0 (`uv tool install "graphifyy[ollama]"` or `pip install "graphifyy[ollama]"`)
- **Python** >= 3.10 (for Graphify)
- **Ollama** (optional but highly recommended for local processing)


## Installation

### Step 1: Install Graphify

**Option A: 100% Private & Free via Ollama (Recommended)**
1. Install [Ollama](https://ollama.com/) and ensure the service is running.
2. Pull the required embedding and code models:
   ```bash
   ollama pull nomic-embed-text
   ollama pull qwen2.5-coder:7b
   ```
3. Install the Graphify Ollama bundle (note the package name is `graphifyy`):
   ```bash
   uv tool install "graphifyy[ollama]"
   ```
4. Set environment variables to point Graphify to your Ollama models (add these to your `~/.zshrc` or `~/.bashrc`):
   ```bash
   export GRAPHIFY_EMBEDDING_MODEL="nomic-embed-text"
   export GRAPHIFY_LLM_MODEL="qwen2.5-coder:7b"
   # If running Ollama on a different host/port, set:
   # export OLLAMA_HOST="http://127.0.0.1:11434"
   ```

**Option B: Standard Cloud APIs**
```bash
uv tool install graphifyy
```

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
4. Use `noesis_attend`, `noesis_focus`, `noesis_believe`, `noesis_commit`, `noesis_infer`, `noesis_recall`, and `noesis_vault_search` as needed

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
