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
- **[noesis-rules]**

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
- The attend-tool handles automated preamble evidence via CLI.

- **[end-noesis-rules]**`;

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

/** Recursive YAML node type — replaces `any` in config merge/parse/serialize. */
type YamlNode = string | number | boolean | null | { [key: string]: YamlNode };
type YamlRecord = Record<string, YamlNode>;
/**
 * Deep-merge recommended settings into an existing config.yml string.
 * Handles flat sections (compaction) and nested subsections (noesis.graphify).
 * Keeps all existing keys, overrides recommended ones, removes deprecated keys.
 */
function mergeConfigYaml(existing: string, recommended: string): string {
  function deepMerge(target: YamlRecord, source: YamlRecord): void {
    for (const [key, value] of Object.entries(source)) {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        if (!(key in target) || target[key] === null || typeof target[key] !== "object") {
          target[key] = {};
        }
        deepMerge(target[key] as YamlRecord, value as YamlRecord);
      } else {
        target[key] = value;
      }
    }
  }

  // Parse YAML text into a nested YamlRecord
  function parseYaml(yaml: string): YamlRecord {
    const data: YamlRecord = {};
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
          const sec = (data[section] ??= {}) as YamlRecord;
          if (!sec[subSection]) sec[subSection] = {};
        }
        continue;
      }
      // Key: value line
      const kvMatch = trimmed.match(/^([\w-]+):\s*(.+)$/);
      if (kvMatch) {
        const key = kvMatch[1]!;
        const value = kvMatch[2]!.trim();

        if (subSection) {
          const sec = (data[section] ??= {}) as YamlRecord;
          const sub = (sec[subSection] ??= {}) as YamlRecord;
          sub[key] = value;
        } else if (section) {
          const sec = (data[section] ??= {}) as YamlRecord;
          sec[key] = value;
        } else if (isTopLevel) {
          data[key] = value;
        }
      }
    }

    return data;
  }

  // Serialize a nested YamlRecord back to YAML
  function serializeYaml(data: YamlRecord, indent: number = 0): string[] {
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
// RULES MERGE
// ============================================================================

const RULES_START = "[noesis-rules]";
const RULES_END = "[end-noesis-rules]";

/**
 * Marker-based merge for RULES.md.
 *
 * The template contains a managed block delimited by [noesis-rules] / [end-noesis-rules].
 * If the existing file has those markers, replace the content between them.
 * Otherwise, append the full template at the end.
 *
 * Any content outside the markers is user-owned and never touched.
 */
function mergeRulesMd(existing: string, template: string): string {
  const existingStart = existing.indexOf(RULES_START);
  const existingEnd = existing.indexOf(RULES_END);

  if (existingStart !== -1 && existingEnd !== -1 && existingStart < existingEnd) {
    // Has markers — extract the template's managed block and inject it
    const tplStart = template.indexOf(RULES_START);
    const tplEnd = template.indexOf(RULES_END);
    if (tplStart === -1 || tplEnd === -1) return existing;

    const managedBlock = template.slice(tplStart, tplEnd + RULES_END.length);
    const before = existing.slice(0, existingStart);
    const after = existing.slice(existingEnd + RULES_END.length);
    const merged = before + managedBlock + after;
    return merged === existing ? existing : merged;
  }

  // No markers — append the full template (user can rearrange afterward)
  const suffix = existing.endsWith("\n") ? "\n" : "\n\n";
  return existing + suffix + template + "\n";
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
 * 3. Writes/merges `.omp/config.yml` with recommended settings (additive).
 * 4. Writes/merges `.omp/RULES.md` with recommended sections (additive).
 * 5. Optionally installs and runs Graphify integration.
 * 6. Adds generated artifacts to `.git/info/exclude` (best-effort).
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

  // 3a. Write/merge .omp/RULES.md
  const rulesPath = join(ompDir, "RULES.md");
  if (force) {
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(rulesPath, RULES_MD, "utf-8");
    summary.push("RULES.md: overwritten");
  } else if (existsSync(rulesPath)) {
    const existing = readFileSync(rulesPath, "utf-8");
    const merged = mergeRulesMd(existing, RULES_MD);
    if (merged !== existing) {
      writeFileSync(rulesPath, merged, "utf-8");
      summary.push("RULES.md: merged");
    } else {
      summary.push("RULES.md: up-to-date");
    }
  } else {
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(rulesPath, RULES_MD, "utf-8");
    summary.push("RULES.md: created");
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

  // 5. Install Graphify skill in the background so init never blocks on GitHub
  void installGraphifySkill(projectRoot).catch(() => {});
  summary.push("Graphify skill: installing in background");
  pi.sendMessage({
    customType: "noesis:graphify-skill",
    content: "The Graphify skill is being installed in the background. You can use skill://graphify to query the project knowledge graph for codebase-aware reasoning about file relationships, architecture, and dependencies.",
    display: true,
    attribution: "agent",
  }, { deliverAs: "steer" });


  // 7. Build the project knowledge graph (fire-and-forget — background to avoid 30s handler timeout)
  if (buildGraph) {
    runGraphifyBuild(projectRoot, getBackendArgs()).catch(() => {});
    summary.push("Graph: building in background");
  }

  // 8. Ensure generated artifacts are in local git exclude (best-effort).
  //    Using .git/info/exclude (per-clone, never version-controlled)
  //    instead of .gitignore (project-wide, shared with team).
  if (existsSync('.git')) {
    const excludePath = join('.git', 'info', 'exclude');
    const excludeDir = join('.git', 'info');
    const EXCLUDE_ENTRIES = [
      ".omp/",
      ".omp/noesis/",
      "graphify-out/",
      ".obsidian/noesis/",
    ];
    try {
      mkdirSync(excludeDir, { recursive: true });
      const excludeContent = existsSync(excludePath)
        ? readFileSync(excludePath, 'utf-8')
        : '';
      const existingLines = excludeContent.split(/\r?\n/).map(l => l.trim());
      const missing = EXCLUDE_ENTRIES.filter(
        entry => !existingLines.some(el => el === entry)
      );
      if (missing.length > 0) {
        appendFileSync(
          excludePath,
          (excludeContent && !excludeContent.endsWith('\n') ? '\n' : '') +
          missing.join('\n') + '\n'
        );
        summary.push("git exclude: updated");
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
