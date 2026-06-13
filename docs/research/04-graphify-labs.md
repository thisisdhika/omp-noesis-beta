# Graphify Labs — Full Research

> Source: Official documentation, GitHub repository, and product pages (2025-2026)
> Compiled: 2026-06-12

---

## 1. Product Overview

**Source**: graphifylabs.ai

Graphify Labs is the always-on layer built on top of graphify — it applies the same graph approach to your entire working life: meetings, browser history, emails, files, and code, updating continuously in the background. Built for people whose work lives across hundreds of conversations and documents they can never fully reconstruct. No cloud, fully on-device.

### Penpax

Penpax is the always-on layer built on top of graphify. It applies the same graph approach to your entire working life: meetings, browser history, emails, files, and code, updating continuously in the background. Free trial launching soon.

---

## 2. Graphify: The Knowledge Graph Engine

**Source**: github.com/safishamsi/graphify

Graphify turns any folder of code, SQL schemas, R scripts, shell scripts, docs, papers, images, or videos into a queryable knowledge graph. App code + database schema + infrastructure in one graph.

### Stars and adoption

- 65,940 stars
- 6,684 forks
- 346 open issues
- Language: Python
- License: MIT

### Key capabilities

- **Multi-modal extraction**: Code, SQL schemas, R scripts, shell scripts, docs, papers, images, videos
- **Community detection**: Louvain algorithm for hierarchical community detection
- **Global graph**: Cross-project knowledge graph at `~/.graphify/global.json`
- **Obsidian export**: Built-in export to Obsidian vault format
- **MCP server**: Serve the graph via Model Context Protocol
- **Incremental updates**: Content hashing for efficient updates

---

## 3. Architecture

**Source**: github.com/safishamsi/graphify/ARCHITECTURE.md

Graphify is a Claude Code skill backed by a Python library. The skill orchestrates the library; the library can be used standalone.

### Pipeline

```
detect()  →  extract()  →  build_graph()  →  cluster()  →  analyze()  →  report()  →  export()
```

Each stage is a single function in its own module. They communicate through plain Python dicts and NetworkX graphs — no shared state, no side effects outside `graphify-out/`.

### Module responsibilities

| Module | Function | Input → Output |
|--------|----------|----------------|
| `detect.py` | `collect_files(root)` | directory → `[Path]` filtered list |
| `extract.py` | `extract(path)` | file path → `{nodes, edges}` dict |
| `build.py` | `build_graph(extractions)` | list of extraction dicts → `nx.Graph` |
| `cluster.py` | `cluster(G)` | graph → graph with `community` attr on each node |
| `analyze.py` | `analyze(G)` | graph → analysis dict (god nodes, surprises, questions) |
| `report.py` | `render_report(G, analysis)` | graph + analysis → GRAPH_REPORT.md string |
| `export.py` | `export(G, out_dir, ...)` | graph → Obsidian vault, graph.json, graph.html, graph.svg |
| `ingest.py` | `ingest(url, ...)` | URL → file saved to corpus dir |
| `cache.py` | `check_semantic_cache / save_semantic_cache` | files → (cached, uncached) split |
| `security.py` | validation helpers | URL / path / label → validated or raises |
| `validate.py` | `validate_extraction(data)` | extraction dict → raises on schema errors |
| `serve.py` | `start_server(graph_path)` | graph file path → MCP stdio server |
| `watch.py` | `watch(root, flag_path)` | directory → writes flag file on change |
| `benchmark.py` | `run_benchmark(graph_path)` | graph file → corpus vs subgraph token comparison |

### Extraction output schema

Every extractor returns:

```json
{
  "nodes": [
    {"id": "unique_string", "label": "human name", "source_file": "path", "source_location": "L42"}
  ],
  "edges": [
    {"source": "id_a", "target": "id_b", "relation": "calls|imports|uses|...", "confidence": "EXTRACTED|INFERRED|AMBIGUOUS"}
  ]
}
```

`validate.py` enforces this schema before `build_graph()` consumes it.

### Confidence labels

| Label | Meaning |
|-------|---------|
| `EXTRACTED` | Relationship is explicitly stated in the source (e.g., an import statement, a direct call) |
| `INFERRED` | Relationship is a reasonable deduction (e.g., call-graph second pass, co-occurrence in context) |
| `AMBIGUOUS` | Relationship is uncertain; flagged for human review in GRAPH_REPORT.md |

### Adding a new language extractor

1. Add a `extract_<lang>(path: Path) -> dict` function in `extract.py` following the existing pattern (tree-sitter parse → walk nodes → collect `nodes` and `edges` → call-graph second pass for INFERRED `calls` edges).
2. Register the file suffix in `extract()` dispatch and `collect_files()`.
3. Add the suffix to `CODE_EXTENSIONS` in `detect.py` and `_WATCHED_EXTENSIONS` in `watch.py`.
4. Add the tree-sitter package to `pyproject.toml` dependencies.
5. Add a fixture file to `tests/fixtures/` and tests to `tests/test_languages.py`.

### Security

All external input passes through `graphify/security.py` before use:

- URLs → `validate_url()` (http/https only) + `_NoFileRedirectHandler` (blocks file:// redirects)
- Fetched content → `safe_fetch()` / `safe_fetch_text()` (size cap, timeout)
- Graph file paths → `validate_graph_path()` (must resolve inside `graphify-out/`)
- Node labels → `sanitize_label()` (strips control chars, caps 256 chars, HTML-escapes)

### Testing

One test file per module under `tests/`. All tests are pure unit tests — no network calls, no file system side effects outside `tmp_path`.

---

## 4. CLI Commands

**Source**: github.com/safishamsi/graphify README

### Core commands

```bash
graphify .                      # extract + cluster + analyze + report
graphify . --no-viz             # skip HTML visualization
graphify . --no-cluster         # raw extraction only, skip clustering
graphify . --mode deep          # richer semantic extraction via extended system prompt
graphify . --force              # overwrite graph.json even if new graph has fewer nodes
graphify . --dedup-llm          # LLM tiebreaker for ambiguous entity pairs
graphify . --global --as myrepo # extract and register into the cross-project global graph
```

### Update commands

```bash
graphify update ./src           # incremental update
graphify update ./src --no-cluster  # skip reclustering
graphify update ./src --force   # overwrite even if new graph has fewer nodes
graphify cluster-only ./my-project  # recluster only
graphify cluster-only ./my-project --resolution 1.5  # more, smaller communities
graphify cluster-only ./my-project --exclude-hubs 99 # exclude p99 degree nodes
graphify cluster-only ./my-project --no-label  # keep "Community N" placeholders
graphify cluster-only ./my-project --backend=gemini  # backend for community naming
graphify label ./my-project     # (re)name communities with the configured backend
```

### Query commands

```bash
graphify query "What functions handle authentication?" --graph graphify-out/graph.json
graphify query "What are the god nodes?" --graph graphify-out/graph.json
graphify path <source> <target> --graph graphify-out/graph.json
graphify explain <node> --graph graphify-out/graph.json
```

### Export commands

```bash
graphify . --obsidian           # export to Obsidian vault
graphify export callflow-html   # graphify-out/<project>-callflow.html
graphify export callflow-html --max-sections 8  # cap generated architecture sections
graphify export callflow-html --output docs/arch.html
```

### Global graph commands

```bash
graphify global add graphify-out/graph.json myrepo  # register a project graph
graphify global remove myrepo                        # remove a project
graphify global list                                 # show all registered repos
graphify global path                                 # print path to global graph
```

### PR commands

```bash
graphify prs                    # PR dashboard: CI, review, worktree, graph impact
graphify prs 42                 # deep dive on PR #42
graphify prs --triage           # AI triage ranking
graphify prs --worktrees        # worktree → branch → PR mapping
graphify prs --conflicts        # PRs sharing graph communities (merge-order risk)
graphify prs --base main        # filter to PRs targeting a specific base branch
```

### Hook commands

```bash
graphify hook install           # post-commit + post-checkout hooks
graphify hook uninstall
graphify hook status
```

### Agent integration commands

```bash
graphify claude install         # CLAUDE.md + PreToolUse hook (Claude Code)
graphify claude uninstall
graphify codebuddy install      # CODEBUDDY.md + PreToolUse hook (CodeBuddy)
graphify codex install          # AGENTS.md + PreToolUse hook in .codex/hooks.json (Codex)
graphify opencode install       # AGENTS.md + tool.execute.before plugin (OpenCode)
graphify kilo install           # native Kilo skill + /graphify command + AGENTS.md + .kilo plugin
graphify cursor install         # .cursor/rules/graphify.mdc (Cursor)
graphify gemini install         # GEMINI.md + BeforeTool hook (Gemini CLI)
graphify copilot install        # skill file (GitHub Copilot CLI)
graphify aider install          # AGENTS.md (Aider)
graphify pi install             # skill file (Pi coding agent)
graphify devin install          # skill file + .windsurf/rules/graphify.md (Devin CLI)
graphify antigravity install    # .agents/rules + .agents/workflows (Google Antigravity)
graphify hermes install         # AGENTS.md + ~/.hermes/skills/ (Hermes)
graphify amp install            # skill file (Amp)
graphify kiro install           # .kiro/skills/ + .kiro/steering/graphify.md (Kiro IDE/CLI)
graphify trae install           # AGENTS.md (Trae)
graphify trae-cn install        # AGENTS.md (Trae CN)
```

### Extract commands

```bash
graphify extract ./docs                         # headless LLM extraction for CI
graphify extract ./docs --backend gemini        # explicit backend
graphify extract ./docs --backend gemini --model gemini-3.1-pro-preview
graphify extract ./docs --backend ollama        # local Ollama
graphify extract ./docs --backend bedrock       # AWS Bedrock via IAM
graphify extract ./docs --backend claude-cli    # route through Claude Code CLI
graphify extract ./docs --backend azure         # Azure OpenAI
graphify extract ./docs --max-workers 16        # AST parallelism
graphify extract ./docs --token-budget 30000    # smaller semantic chunks
graphify extract ./docs --max-concurrency 2     # fewer parallel LLM calls
graphify extract ./docs --api-timeout 900       # longer HTTP timeout
graphify extract ./docs --google-workspace      # export .gdoc/.gsheet/.gslides
graphify extract ./docs --mode deep             # richer semantic extraction
graphify extract ./docs --no-cluster            # raw extraction only
graphify extract ./docs --force                 # overwrite graph.json
graphify extract ./docs --dedup-llm             # LLM tiebreaker
graphify extract --postgres "postgresql://..."   # introspect live PostgreSQL schema
graphify extract ./my-workspace --cargo         # introspect Rust Cargo workspace
```

### Utility commands

```bash
graphify clone https://github.com/karpathy/nanoGPT
graphify merge-graphs a.json b.json --out merged.json
graphify --version
graphify watch ./src
graphify check-update ./src
```

---

## 5. Pi Integration

**Source**: github.com/safishamsi/graphify README

Graphify has native integration with Pi (the coding agent that OMP is forked from):

```bash
graphify pi install             # installs skill file for Pi
graphify pi uninstall           # removes skill file
```

The `graphify pi install` command creates a skill file that Pi (and by extension OMP) can discover and use. This is the integration point for noesis.

### How it works

When `graphify pi install` is run, it:
1. Creates a skill file in the appropriate location for Pi/OMP discovery
2. The skill file contains instructions for the agent on how to use graphify
3. The agent can then call graphify commands through the skill

---

## 6. Obsidian Export

**Source**: github.com/safishamsi/graphify README

Graphify has built-in Obsidian export:

```bash
graphify . --obsidian           # export to Obsidian vault
```

This creates an Obsidian-compatible vault structure from the knowledge graph. The export includes:
- Markdown files for each node
- Backlinks between related nodes
- Graph view metadata
- Community structure

---

## 7. MCP Server

**Source**: github.com/safishamsi/graphify README

Graphify can serve the knowledge graph via Model Context Protocol:

```bash
graphify serve                  # start MCP stdio server
```

This allows any MCP-compatible agent to query the graph without direct CLI access.

---

## 8. Community Detection

**Source**: github.com/safishamsi/graphify README

Graphify uses the Louvain algorithm for hierarchical community detection:

- Communities are groups of related nodes
- Community names are generated by the configured backend (LLM)
- Communities can be nested (hierarchical)
- Resolution parameter controls community granularity
- Exclude-hubs parameter removes high-degree nodes from partitioning

---

## 9. Incremental Updates

**Source**: github.com/safishamsi/graphify README

Graphify uses content hashing for efficient incremental updates:

- Only files that have changed are re-extracted
- The graph is updated incrementally, not rebuilt from scratch
- `--force` flag overrides this behavior
- `--no-cluster` flag skips reclustering during updates

---

## 10. Global Graph

**Source**: github.com/safishamsi/graphify README

The global graph aggregates knowledge across multiple projects:

```bash
graphify global add graphify-out/graph.json myrepo  # register a project
graphify global remove myrepo                        # remove a project
graphify global list                                 # show all registered repos
graphify global path                                 # print path to global graph
```

The global graph is stored at `~/.graphify/global.json` and contains:
- All registered project graphs
- Cross-project relationships
- Unified community structure

---

## Implications for omp-noesis

Graphify is the perception layer for noesis. Here's how it maps:

1. **Graphify as perception, not feature**: Noesis wraps Graphify as an internal perception layer. The agent calls `noesis_attend` with graph queries, and noesis runs those queries against Graphify. The agent never calls Graphify directly.

2. **Query interface**: Noesis uses `graphify query` to ground beliefs in codebase reality. When the agent asks "What auth patterns exist?", noesis runs `graphify query "What auth patterns exist?" --graph graphify-out/graph.json` and incorporates the findings into the belief layer.

3. **Status detection**: Noesis checks Graphify status via:
   - `graphify --version` (is it installed?)
   - `graphify-out/graph.json` existence (is the graph built?)
   - File mtimes (is the graph stale?)

4. **Incremental updates**: Noesis runs `graphify update .` to keep the graph fresh without rebuilding from scratch.

5. **Community detection**: Graphify's community structure informs noesis about codebase organization. Communities map to architectural domains.

6. **Confidence labels**: Graphify's EXTRACTED/INFERRED/AMBIGUOUS confidence labels inform noesis about belief confidence. EXTRACTED findings get high confidence, AMBIGUOUS findings get low confidence.

7. **Obsidian export**: Noesis can optionally export the cognitive state + Graphify graph to Obsidian for human review. This is the optional Obsidian integration.

8. **Global graph**: For multi-project workflows, noesis can leverage Graphify's global graph for cross-project knowledge.
