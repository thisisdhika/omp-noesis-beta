> **⚠ STALE NOTICE — Major version gap (v0.3 → current v1.0.1)**
> This QA prompt targets omp-noesis v0.3 and is severely outdated. The tool API,
> parameter schemas, command surface, and memory architecture have been
> fundamentally redesigned since then. Current v1.0.1 has:
> • 8 canonical tools (+7 aliases), not 6
> • 8 hooks, not 5
> • 6 slash commands (noesis:init, noesis:debug, noesis:token-profile, noesis:review, noesis:sandbox, noesis:federate)
> • OMP memory bridge (cross-session durability channel)
> • State schema with epistemicStatus, originalConfidence, omp-memory sources
> • Split noesis_believe_fact / noesis_believe_decision (was single noesis_believe)
> • Redesigned commit, infer, state-inspect parameter schemas
>
> Do NOT use this document for testing current behavior. See the current docs at `docs/`.
>

# omp-noesis v0.3 — Full Feature QA Prompt

> Hand this document to a QA agent to perform comprehensive end-to-end testing of the omp-noesis v0.3 extension.

---

## Goal

Fully validate every feature of omp-noesis v0.3: graph lifecycle, tools, hooks, cognitive subsystems, schema integrity, error handling, and documentation accuracy.

No mock or stub — test against a real `omp` session in a throwaway project directory (assumes `/noesis:init` already run).

---

## Test Suite

### 1. Background Graph Lifecycle (Hooks)

| # | Test | Expected Result |
|---|------|----------------|
| 1.1 | Start an OMP session in project without graph | session_start hook fires, full build triggered (fire-and-forget) |
| 1.2 | Wait for build to complete, check graph.json | File exists, valid |
| 1.3 | Start a second session immediately | session_start hook fires, rate-limited (skipped) |
| 1.4 | Modify a source file, end an OMP turn | turn_end hook fires, incremental update triggered |
| 1.5 | End the OMP session | session_shutdown hook fires, final update (fire-and-forget) |
| 1.6 | Verify all three hooks are non-blocking | Session not delayed by any hook |
| 1.7 | Disable `autoUpdate: false` in config, verify turn_end skips | No graph update on turn end |
| 1.8 | Set `maxUpdateInterval: 1` (minute), verify faster updates allowed | Updates respect new interval |
| 1.9 | Remove all cloud API keys from env, verify build uses `--backend ollama` | Build succeeds with Ollama (no `--backend` error) |
| 1.10 | Set `OPENAI_API_KEY` env var, verify build skips `--backend ollama` | Build uses no backend flag (Graphify auto-detects) |

### 2. Attend Tool

| # | Test | Expected Result |
|---|------|----------------|
| 2.1 | Run `noesis_attend query="test"` without graph | Degrades gracefully, returns error message (no crash) |
| 2.2 | Build graph, run `noesis_attend query="what is the project structure?"` | Returns findings from source files |
| 2.3 | Run `noesis_attend query="..." ensureFresh=true` with stale graph | Triggers update before query |
| 2.4 | Run `noesis_attend query="..." ensureFresh=true` twice rapidly | Second call rate-limited, skips update, still queries existing graph |
| 2.5 | Run `noesis_attend query="..."` with Graphify not installed | Returns graceful error, no stack trace |
| 2.6 | Run `noesis_attend` with empty/missing query | Validation error, clear message |

### 3. Believe Tool

| # | Test | Expected Result |
|---|------|----------------|
| 3.1 | `noesis_believe fact="The sky is blue" source=observation confidence=0.95` | Belief added to state |
| 3.2 | Inspect state, verify belief present | `beliefs` array has new entry |
| 3.3 | Add conflicting belief with lower confidence | Lower confidence revision recorded |
| 3.4 | Add conflicting belief with higher confidence | Higher confidence replaces (AGM revision) |
| 3.5 | Add belief with confidence < 0.5 | Rejected (below threshold) |
| 3.6 | Add belief with missing `source` | Validation error |
| 3.7 | Add belief with empty `fact` | Validation error |

### 4. Commit Tool

| # | Test | Expected Result |
|---|------|----------------|
| 4.1 | `noesis_commit action="Review auth module" deadline="2026-07-01"` | Commitment added to state |
| 4.2 | Verify state has commitment entry | `commitments` array updated |
| 4.3 | Add commitment with past deadline | Warning or rejected |
| 4.4 | Add commitment with missing `action` | Validation error |

### 5. Infer Tool

| # | Test | Expected Result |
|---|------|----------------|
| 5.1 | `noesis_infer premise="All humans are mortal" premise="Socrates is human"` | Inference generated |
| 5.2 | Verify inference stored in state | `inferences` array updated |
| 5.3 | Run inference with empty premises | Validation error |

### 6. State Inspect Tool

| # | Test | Expected Result |
|---|------|----------------|
| 6.1 | `noesis_state_inspect domain="attention"` | Returns attention state |
| 6.2 | `noesis_state_inspect domain="beliefs"` | Returns beliefs |
| 6.3 | `noesis_state_inspect domain="commitments"` | Returns commitments |
| 6.4 | `noesis_state_inspect domain="inferences"` | Returns inferences |
| 6.5 | `noesis_state_inspect domain="learning"` | Returns learning entries |
| 6.6 | `noesis_state_inspect domain="workflows"` | Returns workflows |
| 6.7 | `noesis_state_inspect` (no domain filter) | Returns full state summary |
| 6.8 | `noesis_state_inspect domain="invalid"` | Graceful error |

### 7. Schema Integrity

| # | Test | Expected Result |
|---|------|----------------|
| 7.1 | Validate state.json against `NoesisStateSchema` | All fields match |
| 7.2 | Check `_lastGraphUpdate` is ISO datetime or undefined | Valid format |
| 7.3 | Check `_noesisConfig` matches config.yml | Keys align |
| 7.4 | Add an unknown field to state.json, load extension | Field stripped or ignored (Zod strips unknown) |
| 7.5 | Corrupt state.json (invalid JSON), start session | Graceful recovery to `EMPTY_STATE` |

### 8. Compaction Survival

| # | Test | Expected Result |
|---|------|----------------|
| 8.1 | Run `/compact preserve noesis` | Compaction succeeds |
| 8.2 | Verify beliefs, commitments, learning survive compaction | All present in new state |
| 8.3 | Verify `_lastGraphUpdate` survives compaction | Timestamp preserved |

### 9. Context Preamble

| # | Test | Expected Result |
|---|------|----------------|
| 9.1 | Start session with beliefs present | Preamble includes belief section |
| 9.2 | Start session with no beliefs | Preamble omits belief section |
| 9.3 | Start session with active commitment | Preamble includes commitment section |
| 9.4 | Verify preamble ≤ 2000 tokens | Preamble within budget |
| 9.5 | Verify preamble includes learning entries | Learning section present if entries exist |

### 10. Vault Backend

| # | Test | Expected Result |
|---|------|----------------|
| 10.1 | No `.obsidian/` or `.omp/mnemopi.db` → backend is `"none"` | Vault operations are no-ops |
| 10.2 | Create `.obsidian/` directory, restart → backend is `"obsidian"` | Default Obsidian write path exists |
| 10.3 | Use `noesis_believe` with Obsidian backend | Belief artifact written to `.obsidian/noesis/belief/` |
| 10.4 | Check retry queue on write failure | Entry queued in `.omp/noesis/vault-retry.json` |

### 11. Error Paths & Resilience

| # | Test | Expected Result |
|---|------|----------------|
| 11.1 | Start session with no Graphify installed | DEGRADED mode, no crash, tools degrade gracefully |
| 11.2 | Run `noesis_attend` in DEGRADED mode | Clear error: "Graphify not available" |
| 11.3 | Start session with empty `.omp/` directory | Falls back to defaults, no crash |
| 11.4 | Remove `.omp/config.yml` | Default config used |
| 11.5 | State file locked by another process | Graceful read error, recovery |
| 11.6 | Run all tools in sequence rapidly | No race conditions, no state corruption |
| 11.7 | Trigger compaction during active tool use | Compaction does not corrupt state |

### 12. Dead Code & Redundancy

| # | Test | Expected Result |
|---|------|----------------|
| 12.1 | Search for `GraphMeta` in `src/` | 0 occurrences (removed in v0.3) |
| 12.2 | Search for `hasMcpGraphify` in entire project | 0 occurrences |
| 12.3 | Search for `buildMcpSection` in entire project | 0 occurrences |
| 12.4 | Search for `mcp__graphify` in entire project | 0 occurrences |
| 12.5 | Verify no `import` of removed symbols remains | All unused imports already cleaned |

### 13. Configuration Options

| # | Test | Expected Result |
|---|------|----------------|
| 13.1 | Set `noesis.graphify.autoUpdate: false` in config.yml | No automatic updates on turn end |
| 13.2 | Set `noesis.graphify.updateOnAttend: false` | `ensureFresh` on attend tool is ignored |
| 13.3 | Set `noesis.graphify.maxUpdateInterval: 30` | Rate limit uses 30 minutes |
| 13.4 | Omit entire `noesis.graphify` section from config | Defaults used (autoUpdate=true, interval=15) |

### 14. Documentation Accuracy

| # | Test | Expected Result |
|---|------|----------------|
| 14.1 | README.md mentions v1.0.0, while docs may still reference historical v0.1.0 in comparison notes | Current release line is 1.0.0; historical refs are explicit |
| 14.2 | README.md mentions Graphify with CLI only, no MCP server | MCP not referenced |
| 14.3 | SETUP.md covers all three provider options (Ollama, OpenAI, Anthropic) | Each has install cmd + env vars |
| 14.4 | SETUP.md /noesis:init steps match actual init behavior | No stale instructions |
| 14.5 | docs/GRAPHIFY_DEEP_DIVE.md has autonomous lifecycle section | Session start, turn end, shutdown documented |
| 14.6 | docs/GRAPHIFY_BEST_PRACTICES_AUDIT.md has CLI detection / auto-update | No MCP references |
| 14.7 | docs/TESTING_STRATEGY.md has lifecycle test scenarios | MCP test section replaced |
| 14.8 | TROUBLESHOOTING.md references `autoUpdate: true` not MCP | No stale MCP workarounds |

---

## Success Criteria

All 14 sections complete with:
- **No crashes** (unhandled exceptions, segfaults, hangs)
- **No silent failures** (operations that fail without error message)
- **No stale references** (MCP, old version numbers, removed APIs)
- **Graceful degradation** on every error path
- **Schema integrity** maintained through all operations

## Reporting

For each test, report:
- **PASS** / **FAIL** / **SKIP** (with reason for skip)
- Any unexpected behavior, even if not strictly a failure
- Stack traces for all failures
- Timestamp of each test run
