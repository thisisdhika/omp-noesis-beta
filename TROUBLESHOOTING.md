# Troubleshooting Runbook

## Diagnostic Commands

```bash
# Force compaction with noesis survivors
/compact preserve noesis

# Check state file integrity
bun -e "JSON.parse(await Bun.file('.omp/noesis/state.json').text())"

# Check state.json location
ls -la .omp/noesis/state.json
```

> The following commands do NOT exist and are not planned: `omp noesis status`, `omp noesis preamble --dry-run`, `omp noesis validate-state`, `omp noesis reset`. State inspection is done via `noesis_state_inspect` tool during an active session.

## Symptom Matrix

| Symptom | Likely Cause | Quick Fix | Deep Fix |
|---|---|---|---|
| "Preamble missing beliefs" | Beliefs below 0.75 threshold | Lower `minConfidence` in `noesis_state_inspect` call | Verify beliefs have correct confidence or archive low-confidence entries |
| "Graph may be stale" | Source files newer than graph | `graphify . --update` | Enable `autoUpdate: true` |
| Agent repeats mistakes | Learning not captured | Check `noesis_state_inspect` for learning | Ensure `autoCaptureFailures: true` |
| State file corrupted | Disk write interrupted | Remove state.json to recreate fresh state (learning/workflow lost) | `.omp/noesis/state.json` is the sole persistence authority; `preserveData.noesis` is a compaction cache, not a recoverable backup |
| Double preamble | Hook precedence bug | Restart session | Check `contextHookFired` flag |
| Vault not writing | Path not writable | Check permissions | Switch to `backend: "noop"` |
| Agent never uses noesis | System prompt hook not firing | Check `before_agent_start` hook registration in extension logs | Verify extension loaded via `omp doctor` |
| Preamble too large | Too many high-confidence beliefs | Archive old beliefs | Reduce `maxTokens` |
| Graphify queries timeout | Large codebase or slow LLM | Increase timeout | Use `graphify . --update` more frequently |

## Log Locations

| Log | Location |
|---|---|
| OMP extension logs | `.omp/logs/extensions.log` |
| Noesis state changes | `.omp/noesis/state.json` (diff in git) |
| Vault retry buffer | `.omp/noesis/vault-retry.json` |
| Graphify output | `graphify-out/GRAPH_REPORT.md` |

## Common Errors

### Error: "Noesis state file malformed"

```bash
# Check JSON validity
bun -e "JSON.parse(await Bun.file('.omp/noesis/state.json').text())"

# If invalid, remove state.json to recreate fresh state (learning/workflow will be lost)
rm .omp/noesis/state.json && /noesis:init
```

### Error: "Graphify query failed with exit code 1"

```bash
# Check graph exists
ls graphify-out/graph.json

# Rebuild if missing
graphify .

# Check Graphify version
graphify --version
```

### Error: "Vault push failed, enqueued to retry"

```bash
# Check vault path
ls .obsidian/noesis/decision/ .obsidian/noesis/learning/  # or your configured path

# Check permissions
touch .obsidian/noesis/test && rm .obsidian/noesis/test

# Check retry buffer
cat .omp/noesis/vault-retry.json
```

## Performance Issues

| Issue | Metric | Threshold | Action |
|---|---|---|---|
| Preamble too large | Token count | > 2000 | Trim active beliefs |
| State file too large | File size | > 100 KB | Archive old beliefs |
| Graphify slow | Query time | > 30s | Use MCP path or increase timeout |
| Vault flush slow | Flush time | > 5s | Disable auto-flush |

## Getting Help

1. Check [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design details
2. Check [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) for test examples
3. Open an issue at https://github.com/omp-noesis/extension
4. Include: relevant log excerpts, reproduction steps, output of `ls -la .omp/noesis/`
