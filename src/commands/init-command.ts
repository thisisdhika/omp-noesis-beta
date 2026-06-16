"use strict";

/**
 * omp-noesis: Init Command
 * Version: 0.1.0
 *
 * `/noesis:init` — bootstrap a new noesis cognitive state directory,
 * write the initial EMPTY_STATE, configure .omp/config.yml with recommended
 * settings, and optionally set up the Graphify integration for codebase-aware
 * reasoning.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { join } from "node:path";
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { ensureNoesisDir } from "../shared/paths.js";
import { writeAtomic, fileExists } from "../infrastructure/filesystem-store.js";
import { checkGraphifyCLI, installGraphifySkill, runGraphifyBuild } from "../infrastructure/graphify-setup.js";
import { EMPTY_STATE } from "../schema.js";


// ============================================================================
// SETTINGS YAML TEMPLATE
// ============================================================================

const SETTINGS_YAML = `compaction:
  enabled: true
  strategy: context-full
  autoContinue: true
  thresholdTokens: 160000
`;

// ============================================================================
// RULES.md TEMPLATE — static noesis cognitive substrate instructions
// ============================================================================

const RULES_MD = `<noesis>
<identity>Noesis-enhanced agent. Cognitive state persists at .omp/noesis/state.json across turns and compaction.</identity>

<rules>
1. Task start → noesis_attend. NEVER skip.
2. Before assuming ignorance → noesis_recall first.
3. After verifying → noesis_believe type=fact (confidence + source).
4. After deciding → noesis_believe type=decision (rationale + alternatives).
5. After fixing failure → noesis_believe type=learning (rootCause + fix).
6. When planning → noesis_commit.
7. When testing theories → noesis_infer (add→update cycle).
8. Quick context switch → noesis_focus (≤200 chars).
</rules>

<graphify>
EXTRACTED → 1.0 (believe after verify) | INFERRED → 0.55–0.95 (default 0.70, verify first) | AMBIGUOUS → 0.55 (store, low-confidence)
Stale graph: -0.10 from INFERRED only (additive, floor 0.55). EXTRACTED never penalized.
Modes: FULL (normal) | STALE (penalty) | NO_GRAPH (build attempt) | DEGRADED (execution/user only)
</graphify>

<gotchas>
- NEVER auto-believe INFERRED graph edges. Verify first.
- NEVER duplicate OMP plan surface. noesis_commit tracks cognition, not execution.
- ONLY capture significant events as learning. Not every tool result.
- Beliefs are NEVER deleted — superseded → archive for audit.
- ALWAYS noesis_recall before rediscovering. Recall first, read second.
- Focus ≤200 chars. Long focus wastes preamble budget.
- noesis_vault_search queries human artifacts. Use noesis_recall for live state.
</gotchas>

<templates>
Fact: {mechanism} at {path} {action} {target} using {method}
Decision: Use {choice} over {alternative} because {rationale}. Rejected: {rejected}
Learning: {what_failed} when {trigger} | root_cause: {actual_cause} (not symptom) | fix: {exact_fix} verified by {cmd}
</templates>

<confidence>
execution/user observed → 1.0 | graph EXTRACTED → 1.0 | graph INFERRED → 0.55–0.95 | graph AMBIGUOUS → 0.55 | agent deduced → 0.5–0.95 | learning resolved → 0.85
</confidence>

<boundaries>
noesis: task cognitive state | mnemopi: cross-session memory | hindsight: session summaries | obsidian: human projection (write-only)
</boundaries>

<compaction>
State survives via survivor set in compaction context + preserveData.noesis + .omp/noesis/state.json.
</compaction>
<graphify-mcp>
When graph features are available, you can call these MCP tools directly:
- mcp__graphify__query_graph — BFS/DFS traversal with keyword scoring
- mcp__graphify__get_node — Full details for a specific node
- mcp__graphify__get_neighbors — All direct neighbors with edge details
- mcp__graphify__shortest_path — Shortest path between two concepts
- mcp__graphify__god_nodes — Most connected nodes
- mcp__graphify__graph_stats — Node/edge/community counts
- mcp__graphify__get_community — All nodes in a community

Use these for on-demand graph exploration. The attend-tool handles automated preamble evidence via CLI.
</graphify-mcp>
</noesis>`;

// ============================================================================
// INIT ARGS
// ============================================================================

export interface InitArgs {
  /** Overwrite state.json if it already exists */
  force?: boolean;
  /** Build the project knowledge graph after initializing (default true) */
  buildGraph?: boolean;
  /** Skip all Graphify-related setup (default false) */
  skipGraphify?: boolean;
}

// ============================================================================
// CONFIG MERGE
// ============================================================================

/**
 * Deep-merge recommended compaction settings into an existing config.yml string.
 * Keeps all existing non-compaction sections. Within compaction, overrides keys
 * from SETTINGS_YAML and removes deprecated keys (reserveTokens, keepRecentTokens,
 * idleThresholdTokens).
 */
function mergeConfigYaml(existing: string, recommended: string): string {
  // Parse existing YAML into a section -> key -> value map
  // Top-level keys (no indent) go under the "" pseudo-section
  const data: Record<string, Record<string, string>> = {};
  let currentSection = "";

  for (const line of existing.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // A line with no leading whitespace that ends with ":" starts a new section
    const sectionMatch = trimmed.match(/^(\w[\w-]*):\s*$/);
    if (sectionMatch && sectionMatch[1] && !line.startsWith(" ") && !line.startsWith("\t")) {
      currentSection = sectionMatch[1];
      if (!data[currentSection]) data[currentSection] = {};
      continue;
    }

    // A key: value line (any indent level — always a child of current section)
    const kvMatch = trimmed.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kvMatch && kvMatch[1] && kvMatch[2] && currentSection) {
      const section = data[currentSection];
      if (section) section[kvMatch[1]] = kvMatch[2].trim();
      continue;
    }

    // Unindented top-level kv (no section context) — treat as root
    const topKvMatch = trimmed.match(/^(\w[\w-]*):\s*(.+)$/);
    if (topKvMatch && topKvMatch[1] && topKvMatch[2] && !line.startsWith(" ") && !line.startsWith("\t")) {
      currentSection = "";
      if (!data[""]) data[""] = {};
      data[""][topKvMatch[1]] = topKvMatch[2].trim();
    }
  }

  // Parse recommended into same structure, overriding existing values
  currentSection = "";
  for (const line of recommended.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const sectionMatch = trimmed.match(/^(\w[\w-]*):\s*$/);
    if (sectionMatch && sectionMatch[1] && !line.startsWith(" ") && !line.startsWith("\t")) {
      currentSection = sectionMatch[1];
      if (!data[currentSection]) data[currentSection] = {};
      continue;
    }

    const kvMatch = trimmed.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kvMatch && kvMatch[1] && kvMatch[2] && currentSection) {
      if (!data[currentSection]) data[currentSection] = {};
      const section = data[currentSection];
      if (section) section[kvMatch[1]] = kvMatch[2].trim();
    }
  }

  // Remove deprecated compaction keys
  const compaction = data.compaction;
  if (compaction) {
    const deprecated = ["reserveTokens", "keepRecentTokens", "idleThresholdTokens"];
    for (const key of deprecated) {
      delete compaction[key];
    }
  }

  // Serialize back to YAML: root keys first, then sections
  const lines: string[] = [];
  for (const [section, kvs] of Object.entries(data)) {
    if (section === "") {
      // Top-level keys (no section header)
      for (const [key, value] of Object.entries(kvs)) {
        lines.push(`${key}: ${value}`);
      }
    } else {
      lines.push(`${section}:`);
      for (const [key, value] of Object.entries(kvs)) {
        lines.push(`  ${key}: ${value}`);
      }
    }
  }

  return lines.join("\n") + "\n";
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
 * 3. Writes/merges `.omp/config.yml` with recommended compaction settings.
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
    const buildResult = await runGraphifyBuild(projectRoot);
    if (buildResult.success) {
      summary.push("Graph: built");
    } else {
      summary.push("Graph: build errors");
    }
  }

  // 8. Write MCP config
  const mcpConfigPath = join(ompDir, "mcp.json");
  const mcpConfig = {
    $schema: "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
    mcpServers: {
      graphify: {
        command: "python3",
        args: ["-m", "graphify.serve", "graphify-out/graph.json"],
      },
    },
  };
  let mcpAction = "written";
  if (existsSync(mcpConfigPath)) {
    try {
      const existing = JSON.parse(readFileSync(mcpConfigPath, "utf-8"));
      if (existing.mcpServers?.graphify) {
        mcpAction = "already configured";
      } else {
        existing.mcpServers = existing.mcpServers || {};
        existing.mcpServers.graphify = mcpConfig.mcpServers.graphify;
        writeFileSync(mcpConfigPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
        mcpAction = "added";
      }
    } catch {
      writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2) + "\n", "utf-8");
      mcpAction = "replaced";
    }
  } else {
    writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2) + "\n", "utf-8");
  }
  summary.push(`MCP: ${mcpAction}`);

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

  // 9. Done — single status message
  pi.sendMessage({
    customType: "noesis:init-status",
    content: summary.join(" | "),
    display: true,
    attribution: "agent",
  });
  return "initialized-full";
}
