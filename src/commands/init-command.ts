"use strict";

/**
 * omp-noesis: Init Command
 * Version: 0.1.0
 *
 * `/noesis:init` — bootstrap a new noesis cognitive state directory,
 * write the initial EMPTY_STATE, and optionally set up the Graphify
 * integration for codebase-aware reasoning.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { join } from "node:path";
import { ensureNoesisDir } from "../shared/paths.js";
import { writeAtomic, fileExists } from "../infrastructure/filesystem-store.js";
import { checkGraphifyCLI, installGraphifySkill, runGraphifyBuild } from "../infrastructure/graphify-setup.js";
import { EMPTY_STATE } from "../schema.js";

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
// INIT COMMAND
// ============================================================================

/**
 * Bootstrap a noesis cognitive state in the current project.
 *
 * 1. Creates `.omp/noesis/` directory.
 * 2. Writes `EMPTY_STATE` to `.omp/noesis/state.json` (unless it exists
 *    and `force` is false).
 * 3. Optionally installs and runs Graphify integration.
 */
export async function initCommand(pi: ExtensionAPI, args: InitArgs = {}): Promise<void> {
  const { force = false, buildGraph = true, skipGraphify = false } = args;
  const projectRoot = process.cwd();

  // 1. Ensure the .omp/noesis directory exists
  const noesisDir = ensureNoesisDir(projectRoot);
  const statePath = join(noesisDir, "state.json");

  // 2. Check if state.json exists already
  if (fileExists(statePath)) {
    if (!force) {
      pi.logger.warn("[noesis] state.json already exists — skipping state init (use --force to overwrite)");
    } else {
      pi.logger.info("[noesis] --force set, overwriting existing state.json");
      await writeAtomic(statePath, EMPTY_STATE);
    }
  } else {
    await writeAtomic(statePath, EMPTY_STATE);
    pi.logger.info("[noesis] Wrote empty state to .omp/noesis/state.json");
  }

  // 3. Early return if Graphify setup is skipped
  if (skipGraphify) {
    pi.logger.info("[noesis] Graphify setup skipped (--skip-graphify)");
    pi.logger.info("[noesis] Noesis initialized! (DEGRADED — no graph awareness)");
    return;
  }

  // 4. Check if Graphify CLI is available
  const cliCheck = await checkGraphifyCLI();
  if (!cliCheck.installed) {
    pi.logger.warn("[noesis] Graphify CLI not found — graph features unavailable");
    pi.logger.info("[noesis] Install Graphify via `pip install graphify` or `bun install -g graphify`");
    pi.logger.info("[noesis] Noesis initialized! (DEGRADED — run `graphify .` manually for graph awareness)");
    return;
  }

  // 5. Install the Graphify skill definition
  const skillPath = await installGraphifySkill(projectRoot);
  pi.logger.info(`[noesis] Installed Graphify skill to .omp/skills/graphify/ (${skillPath})`);

  // 6. Build the project knowledge graph (unless opted out)
  if (buildGraph) {
    pi.logger.info("[noesis] Building project knowledge graph...");
    const buildResult = await runGraphifyBuild(projectRoot);
    if (buildResult.success) {
      pi.logger.info(`[noesis] Graph build complete — ${buildResult.output.split("\n").filter(Boolean).length} output lines`);
    } else {
      pi.logger.warn(`[noesis] Graph build reported errors:\n${buildResult.output}`);
    }
  }

  // 7. Done
  pi.logger.info("[noesis] Noesis initialized!");
}
