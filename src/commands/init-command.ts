"use strict";

/**
 * omp-noesis: Init Command
 * Version: 1.0.0
 *
 * Bootstraps a noesis cognitive state in the current project directory.
 * Creates state file, config, RULES.md, Obsidian vault, and optionally
 * installs + builds the graphify knowledge graph.
 *
 * Returns one of:
 *   "initialized-full"              — everything set up
 *   "initialized-degraded-no-cli"   — graphify CLI not found
 *   "initialized-degraded-no-graphify" — graphify setup skipped
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { join } from "node:path";
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { ensureNoesisDir } from "../shared/paths.js";
import { writeAtomic, fileExists } from "../infrastructure/filesystem-store.js";
import { checkGraphifyCLI, installGraphifySkill, runGraphifyBuild } from "../infrastructure/graphify-setup.js";
import { getBackendArgs } from "../infrastructure/graphify-client.js";
import { EMPTY_STATE } from "../shared/schema.js";

// ============================================================================
// SETTINGS YAML TEMPLATE
// ============================================================================

const SETTINGS_YAML = `compaction:
  enabled: true
  strategy: context-full
  autoContinue: true
  thresholdTokens: 160000

noesis:
  graphify:
    autoUpdate: true
    updateOnAttend: true
    maxUpdateInterval: 15
`;

// ============================================================================
// RULES.md TEMPLATE — static noesis cognitive substrate instructions
// ============================================================================

const RULES_MD = `# Noesis Rules

**Always do these FIRST:**
- **Task start:** Call noesis_attend. ALWAYS. No exceptions.
- **Before assuming you don't know:** Call noesis_state_inspect.
- **Before rediscovering:** Call noesis_state_inspect. Recall first, read second.

**After events:**
- After verifying a fact → noesis_believe_fact
- After making a decision → noesis_believe_decision
- When planning work → noesis_commit
- When testing theories → noesis_infer (add→update cycle)
- Quick context switch → noesis_attend (omit graphQueries, max 200 chars)

**NEVER:**
- Auto-believe INFERRED graph edges. Verify first.
- Duplicate OMP plan surface. noesis_commit = cognition, not execution.
- Capture every tool result as learning. Only significant events.
- Delete beliefs. Supersede → archive for audit.
- **Outdated or unsure?** Use noesis_state_inspect (includes query:"search" for full-text search of live session state). For **durable cross-session artifacts** (decisions, beliefs, learnings persisted across turns) consider vault backends. Do NOT use noesis_state_inspect for vault queries.

**Templates:**
- Fact: {mechanism} at {path} {action} {target} using {method}
- Decision: Use {choice} over {alt} because {reason}. Rejected: {rejected}
- Learning: {what} failed when {trigger} | root: {cause} | fix: {fix} verified by {cmd}

**Confidence:** execution/user = 1.0 | graph EXTRACTED = 1.0 | INFERRED = 0.55–0.95 | AMBIGUOUS = 0.55 | deduced = 0.5–0.95 | resolved = 0.85

**Boundaries:** noesis_state_inspect = current live session state (beliefs, decisions, learning, query:"search") | mnemopi = cross-session raw memory | local = durable local fallback | obsidian = human projection (write-only)

**Compaction:** State survives via survivor set + preserveData.noesis + .omp/noesis/state.json

**Graph modes:** FULL | STALE (−0.10 penalty, floor 0.55) | NO_GRAPH | DEGRADED

**Graph Queries:**
- Request fresh graph: \`noesis_attend(focus="...", graphQueries=[...], ensureFresh=true)\`
- \`graphify-extract\` mode: Use \`skill://graphify\` for headless CI extraction
- All graph interactions go through the attend-tool or skill file, never direct CLI
- The attend-tool handles automated preamble evidence via CLI.`;

// ============================================================================
// OBSIDIAN INDEX TEMPLATE
// ============================================================================

const NOESIS_INDEX_MD = `# Noesis Index

Welcome to your Noesis cognitive state index. This file is your window into what the AI assistant has learned, decided, and is tracking in this project.

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
4. Index auto-updates at session start
`;

// ============================================================================
// INIT ARGS
// ============================================================================

export interface InitArgs {
  /** Force-overwrite existing files (default false) */
  force?: boolean;
  /** Build project knowledge graph after init (default true) */
  buildGraph?: boolean;
  /** Skip all Graphify-related setup (default false) */
  skipGraphify?: boolean;
}

// ============================================================================
// CONFIG MERGE
// ============================================================================

/**
 * Deep-merge recommended settings into an existing config.yml string.
 * Handles flat sections (compaction) and nested subsections (noesis.graphify).
 * Keeps all existing keys, overrides recommended ones, removes deprecated keys.
 */
function mergeConfigYaml(existing: string, recommended: string): string {
  // Recursive deep-merge helper
  function deepMerge(target: any, source: any): void {
    for (const [key, value] of Object.entries(source)) {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        if (!(key in target) || target[key] === null || typeof target[key] !== "object") {
          target[key] = {};
        }
        deepMerge(target[key], value);
      } else {
        target[key] = value;
      }
    }
  }

  // Parse YAML text into a nested Record<string, any>
  function parseYaml(yaml: string): Record<string, any> {
    const data: Record<string, any> = {};
    let section = "";
    let subSection = "";

    for (const line of yaml.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const indent = line.length - trimmed.length;
      const isTopLevel = indent === 0;

      // Section or subsection header (key: with no value after colon)
      const headerMatch = trimmed.match(/^([\w-]+):\s*$/);
      if (headerMatch) {
        const headerKey = headerMatch[1]!;
        if (isTopLevel) {
          section = headerKey;
          subSection = "";
          if (!data[section]) data[section] = {};
        } else if (section) {
          subSection = headerKey;
          if (!data[section]) data[section] = {};
          if (!data[section][subSection]) data[section][subSection] = {};
        }
        continue;
      }
      // Key: value line
      const kvMatch = trimmed.match(/^([\w-]+):\s*(.+)$/);
      if (kvMatch) {
        const key = kvMatch[1]!;
        const value = kvMatch[2]!.trim();

        if (subSection) {
          if (!data[section]) data[section] = {};
          if (!data[section][subSection]) data[section][subSection] = {};
          data[section][subSection][key] = value;
        } else if (section) {
          if (!data[section]) data[section] = {};
          data[section][key] = value;
        } else if (isTopLevel) {
          data[key] = value;
        }
      }
    }

    return data;
  }

  // Serialize a nested Record back to YAML
  function serializeYaml(data: Record<string, any>, indent: number = 0): string[] {
    const lines: string[] = [];
    const pad = " ".repeat(indent);

    for (const [key, value] of Object.entries(data)) {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        if (Object.keys(value).length > 0) {
          lines.push(`${pad}${key}:`);
          lines.push(...serializeYaml(value, indent + 2));
        }
      } else {
        lines.push(`${pad}${key}: ${value}`);
      }
    }

    return lines;
  }

  // Parse both documents, then deep-merge
  const existingData = parseYaml(existing);
  const recommendedData = parseYaml(recommended);
  deepMerge(existingData, recommendedData);

  // Remove deprecated compaction keys
  if (existingData.compaction && typeof existingData.compaction === "object") {
    const deprecated = ["reserveTokens", "keepRecentTokens", "idleThresholdTokens"];
    for (const key of deprecated) {
      delete existingData.compaction[key];
    }
  }

  return serializeYaml(existingData).join("\n") + "\n";
}

// ============================================================================
// INIT COMMAND
// ============================================================================

/**
 * Bootstrap a noesis cognitive state in the current project.
 *
 * 1. Creates `.omp/noesis/` directory.
 * 2. Writes `EMPTY_STATE` to `.omp/noesis/state.json` (unless it exists
 *    and `force` is false).
 * 3. Writes/merges `.omp/config.yml` with recommended settings.
 * 4. Optionally installs and runs Graphify integration.
 *
 * Returns a status string: "initialized-full", "initialized-degraded-no-cli",
 * or "initialized-degraded-no-graphify".
 */
export async function initCommand(pi: ExtensionAPI, args: InitArgs = {}): Promise<string> {
  const { force = false, buildGraph = true, skipGraphify = false } = args;
  const projectRoot = process.cwd();
  const ompDir = join(projectRoot, ".omp");
  const summary: string[] = [];

  // 1. Ensure the .omp/noesis directory exists
  const noesisDir = ensureNoesisDir(projectRoot);
  const statePath = join(noesisDir, "state.json");

  // 2. Write state.json
  const stateExists = fileExists(statePath);
  if (stateExists && !force) {
    summary.push("state.json: up-to-date");
  } else {
    if (stateExists) summary.push("state.json: overwritten");
    else summary.push("state.json: created");
    await writeAtomic(statePath, EMPTY_STATE);
  }

  // 3. Write/merge .omp/config.yml
  const configPath = join(ompDir, "config.yml");
  if (force) {
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(configPath, SETTINGS_YAML, "utf-8");
    summary.push("config.yml: overwritten");
  } else if (existsSync(configPath)) {
    const existing = readFileSync(configPath, "utf-8");
    writeFileSync(configPath, mergeConfigYaml(existing, SETTINGS_YAML), "utf-8");
    summary.push("config.yml: merged");
  } else {
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(configPath, SETTINGS_YAML, "utf-8");
    summary.push("config.yml: created");
  }

  // 3a. Write .omp/RULES.md
  const rulesPath = join(ompDir, "RULES.md");
  if (existsSync(rulesPath) && !force) {
    summary.push("RULES.md: up-to-date");
  } else {
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(rulesPath, RULES_MD, "utf-8");
    summary.push("RULES.md: written");
  }

  // 3b. Setup Obsidian Vault & Index
  const obsidianDir = join(projectRoot, ".obsidian");
  if (!existsSync(obsidianDir)) {
    mkdirSync(obsidianDir, { recursive: true });
    summary.push("Obsidian Vault: created");
  } else {
    summary.push("Obsidian Vault: detected");
  }

  const indexPath = join(projectRoot, "Noesis Index.md");
  if (!existsSync(indexPath) || force) {
    writeFileSync(indexPath, NOESIS_INDEX_MD, "utf-8");
    summary.push("Index: generated");
  } else {
    summary.push("Index: up-to-date");
  }

  // Quick return if graph setup skipped
  if (skipGraphify) {
    summary.push("Graphify: skipped");
    pi.sendMessage({
      customType: "noesis:init-status",
      content: summary.join(" | "),
      display: true,
      attribution: "agent",
    });
    return "initialized-degraded-no-graphify";
  }

  // 4. Check Graphify CLI availability
  const cliCheck = await checkGraphifyCLI();
  if (!cliCheck.installed) {
    summary.push("Graphify: CLI unavailable");
    pi.sendMessage({
      customType: "noesis:init-status",
      content: summary.join(" | "),
      display: true,
      attribution: "agent",
    });
    return "initialized-degraded-no-cli";
  }

  // 5. Install Graphify skill
  await installGraphifySkill(projectRoot);
  summary.push("Graphify skill: installed");

  // 6. Send LLM-visible Graphify skill intro (steer, not TUI noise)
  pi.sendMessage({
    customType: "noesis:graphify-skill",
    content: "The Graphify skill has been installed to .omp/skills/graphify/. You can use skill://graphify to query the project knowledge graph for codebase-aware reasoning about file relationships, architecture, and dependencies.",
    display: true,
    attribution: "agent",
  }, { deliverAs: "steer" });


  // 7. Build the project knowledge graph (unless opted out)
  if (buildGraph) {
    pi.sendMessage({
      customType: "noesis:init-status",
      content: `Building project knowledge graph${summary.length ? " (" + summary.join(", ") + ")" : ""}...`,
      display: true,
      attribution: "agent",
    });
    const buildResult = await runGraphifyBuild(projectRoot, getBackendArgs());
    if (buildResult.success) {
      summary.push("Graph: built");
    } else {
      summary.push("Graph: build errors");
    }
  }


  // 8a. Ensure .omp/ is in local git exclude (best-effort)
  const excludePath = join('.git', 'info', 'exclude');
  const excludeDir = join('.git', 'info');
  if (existsSync('.git')) {
    try {
      mkdirSync(excludeDir, { recursive: true });
      const excludeContent = existsSync(excludePath)
        ? readFileSync(excludePath, 'utf-8')
        : '';
      if (!excludeContent.includes('.omp/')) {
        appendFileSync(excludePath, (excludeContent ? '\n' : '') + '.omp/');
      }
    } catch {
      // best-effort
    }
  }

  // 8b. Write recommended .gitignore entries for noesis-generated artifacts.
  // These are derived/cache files that should never be version-controlled:
  //   graphify-out/      — AST cache, graph JSON, manifest, cost analysis
  //   .obsidian/noesis/  — vault projections derived from state.json
  //   .omp/noesis/       — runtime state (state.json, vault-retry.json)
  const gitignorePath = join(projectRoot, ".gitignore");
  const GITIGNORE_ENTRIES = [
    "# Noesis — generated graph artifacts (local tracking only)",
    "graphify-out/",
    "",
    "# Noesis — projected vault artifacts (derived from state.json)",
    ".obsidian/noesis/",
    "",
    "# Noesis — runtime state (regenerated on each run)",
    ".omp/noesis/",
  ];
  if (existsSync(gitignorePath)) {
    const existing = readFileSync(gitignorePath, "utf-8");
    const existingLines = existing.split(/\r?\n/).map(l => l.trim());
    const missing = GITIGNORE_ENTRIES.filter(line => line && !existingLines.some(el => el === line));
    if (missing.length > 0) {
      appendFileSync(gitignorePath, "\n" + missing.join("\n") + "\n");
      summary.push(".gitignore: updated");
    }
  } else {
    writeFileSync(gitignorePath, GITIGNORE_ENTRIES.join("\n") + "\n");
    summary.push(".gitignore: created");
  }
  // 9. Done — single status message
  pi.sendMessage({
    customType: "noesis:init-status",
    content: summary.join(" | "),
    display: true,
    attribution: "agent",
  });
  return "initialized-full";
}
