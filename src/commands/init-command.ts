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

  // 1. Ensure the .omp/noesis directory exists
  const noesisDir = ensureNoesisDir(projectRoot);
  const statePath = join(noesisDir, "state.json");

  // 2. Check if state.json exists already
  if (fileExists(statePath)) {
    if (!force) {
      pi.sendMessage({
        customType: "noesis:init-status",
        content: "state.json already exists -- skipping state init (use --force to overwrite)",
        display: true,
        attribution: "agent",
      });
    } else {
      pi.sendMessage({
        customType: "noesis:init-status",
        content: "--force set, overwriting existing state.json",
        display: true,
        attribution: "agent",
      });
      await writeAtomic(statePath, EMPTY_STATE);
    }
  } else {
    await writeAtomic(statePath, EMPTY_STATE);
    pi.sendMessage({
      customType: "noesis:init-status",
      content: "Wrote empty state to .omp/noesis/state.json",
      display: true,
      attribution: "agent",
    });
  }

  // 3. Write/merge .omp/config.yml with recommended compaction settings
  const ompDir = join(projectRoot, ".omp");
  const configPath = join(ompDir, "config.yml");

  if (force) {
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(configPath, SETTINGS_YAML, "utf-8");
    pi.sendMessage({
      customType: "noesis:init-status",
      content: "--force set, overwritten .omp/config.yml with recommended settings",
      display: true,
      attribution: "agent",
    });
  } else if (existsSync(configPath)) {
    const existing = readFileSync(configPath, "utf-8");
    const merged = mergeConfigYaml(existing, SETTINGS_YAML);
    writeFileSync(configPath, merged, "utf-8");
    pi.sendMessage({
      customType: "noesis:init-status",
      content: "Merged recommended settings into .omp/config.yml",
      display: true,
      attribution: "agent",
    });
  } else {
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(configPath, SETTINGS_YAML, "utf-8");
    pi.sendMessage({
      customType: "noesis:init-status",
      content: "Wrote recommended settings to .omp/config.yml",
      display: true,
      attribution: "agent",
    });
  }

  // 4. Early return if Graphify setup is skipped
  if (skipGraphify) {
    pi.sendMessage({
      customType: "noesis:init-status",
      content: "Graphify setup skipped (--skip-graphify) -- noesis initialized without graph awareness",
      display: true,
      attribution: "agent",
    });
    return "initialized-degraded-no-graphify";
  }

  // 5. Check if Graphify CLI is available
  const cliCheck = await checkGraphifyCLI();
  if (!cliCheck.installed) {
    pi.sendMessage({
      customType: "noesis:init-status",
      content: "Graphify CLI not found -- graph features unavailable. Install via `pip install graphify` or `bun install -g graphify`",
      display: true,
      attribution: "agent",
    });
    return "initialized-degraded-no-cli";
  }

  // 6. Install the Graphify skill definition
  const skillPath = await installGraphifySkill(projectRoot);
  pi.sendMessage({
    customType: "noesis:init-status",
    content: "Installed Graphify skill to .omp/skills/graphify/",
    display: true,
    attribution: "agent",
  });

  // 7. Send LLM-visible message about Graphify skill
  pi.sendMessage({
    customType: "noesis:graphify-skill",
    content: "The Graphify skill has been installed to .omp/skills/graphify/. You can use skill://graphify to query the project knowledge graph for codebase-aware reasoning about file relationships, architecture, and dependencies.",
    display: true,
    attribution: "agent",
  }, { deliverAs: "steer" });

  // 8. Build the project knowledge graph (unless opted out)
  if (buildGraph) {
    pi.sendMessage({
      customType: "noesis:init-status",
      content: "Building project knowledge graph...",
      display: true,
      attribution: "agent",
    });
    const buildResult = await runGraphifyBuild(projectRoot);
    if (buildResult.success) {
      pi.sendMessage({
        customType: "noesis:init-status",
        content: `Graph build complete -- ${buildResult.output.split("\n").filter(Boolean).length} output lines`,
        display: true,
        attribution: "agent",
      });
    } else {
      pi.sendMessage({
        customType: "noesis:init-status",
        content: `Graph build reported errors:\n${buildResult.output}`,
        display: true,
        attribution: "agent",
      });
    }
  }

  // 9. Write MCP config for Graphify server (if Python available)
  const mcpConfigPath = join(ompDir, "mcp.json");
  const mcpConfig = {
    "$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
    mcpServers: {
      graphify: {
        command: "python3",
        args: ["-m", "graphify.serve", "graphify-out/graph.json"],
      },
    },
  };

  if (existsSync(mcpConfigPath)) {
    try {
      const existing = JSON.parse(readFileSync(mcpConfigPath, "utf-8"));
      if (!existing.mcpServers?.graphify) {
        existing.mcpServers = existing.mcpServers || {};
        existing.mcpServers.graphify = mcpConfig.mcpServers.graphify;
        writeFileSync(mcpConfigPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
        pi.sendMessage({
          customType: "noesis:init-status",
          content: "Added Graphify MCP server to .omp/mcp.json",
          display: true,
          attribution: "agent",
        });
      }
    } catch {
      writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2) + "\n", "utf-8");
      pi.sendMessage({
        customType: "noesis:init-status",
        content: "Wrote Graphify MCP config to .omp/mcp.json (replaced invalid JSON)",
        display: true,
        attribution: "agent",
      });
    }
  } else {
    writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2) + "\n", "utf-8");
    pi.sendMessage({
      customType: "noesis:init-status",
      content: "Wrote Graphify MCP config to .omp/mcp.json",
      display: true,
      attribution: "agent",
    });
  }

  // 9a. Ensure .omp/ is in local git exclude (not .gitignore)
  const excludePath = join('.git', 'info', 'exclude');
  const excludeDir = join('.git', 'info');
  if (existsSync('.git')) {
    try {
      mkdirSync(excludeDir, { recursive: true });
      const excludeContent = existsSync(excludePath)
        ? readFileSync(excludePath, 'utf-8')
        : '';
      if (!excludeContent.includes('.omp/')) {
        if (excludeContent) {
          appendFileSync(excludePath, '\n.omp/');
        } else {
          appendFileSync(excludePath, '.omp/');
        }
      }
    } catch {
      // .git/info/exclude is best-effort — don't fail init over it
    }
  }
  // 10. Done
  pi.sendMessage({
    customType: "noesis:init-status",
    content: "Noesis initialized! Restart TUI to activate graph features.",
    display: true,
    attribution: "agent",
  });
  return "initialized-full";
}
