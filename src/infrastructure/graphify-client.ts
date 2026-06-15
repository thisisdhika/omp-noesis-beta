"use strict";

/**
 * omp-noesis: Graphify Client
 * Version: 0.1.0
 *
 * Graphify CLI client providing capability detection, query execution,
 * and build delegation for graph-based cognitive state enrichment.
 */

import { statSync } from "node:fs";
import type { CapabilityLevel, GraphFinding } from "../schema.js";
import { validateGraphPath } from "../shared/paths.js";
import { runGraphifyBuild } from "./graphify-setup.js";
import { parseQueryOutput } from "./graphify-parser.js";

// ============================================================================
// CAPABILITY DETECTION
// ============================================================================

/**
 * Detect the graphify capability level for a project.
 *
 * Checks are evaluated in order:
 *   1. CLI availability via Bun.which → "DEGRADED"
 *   2. Graph existence via validateGraphPath → "NO_GRAPH"
 *   3. Graph freshness (24h threshold from mtime) → "STALE" or "FULL"
 *
 * @param projectRoot - Absolute path to the project root.
 * @returns The detected capability level.
 */
export async function detectCapability(
  projectRoot: string,
): Promise<CapabilityLevel> {
  // Check CLI availability first — worst case means no queries or builds
  if (!Bun.which("graphify")) {
    return "DEGRADED";
  }

  // Check graph file existence
  const graphPath = validateGraphPath(projectRoot);
  if (graphPath === null) {
    return "NO_GRAPH";
  }

  // Check graph file freshness using modification time
  try {
    const stats = statSync(graphPath);
    const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
    return ageHours > 24 ? "STALE" : "FULL";
  } catch {
    // If stat fails (permissions, race), treat as stale
    return "STALE";
  }
}

// ============================================================================
// QUERY EXECUTION
// ============================================================================

/**
 * Run a graph query against the project's graphify graph.
 *
 * Spawns the `graphify query` CLI with a 30-second timeout and
 * delegates JSON parsing to `parseQueryOutput`.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param question - Natural-language query string.
 * @returns Array of parsed GraphFindings (empty on failure or missing graph).
 */
export async function query(
  projectRoot: string,
  question: string,
): Promise<GraphFinding[]> {
  const graphPath = validateGraphPath(projectRoot);
  if (!graphPath) return [];

  try {
    const proc = Bun.spawn(
      ["graphify", "query", question, "--graph", graphPath],
      {
        cwd: projectRoot,
        stdout: "pipe",
        timeout: 30000,
      },
    );

    const raw = await new Response(proc.stdout).text();
    return parseQueryOutput(raw);
  } catch {
    return [];
  }
}

// ============================================================================
// BUILD INVOCATION
// ============================================================================

/**
 * Run a full graphify build on the project.
 *
 * Delegates to `runGraphifyBuild` from the setup module, which runs
 * `graphify . --no-viz` with a 2-minute timeout.
 *
 * @param projectRoot - Absolute path to the project root.
 * @returns Build result with success flag and stdout/stderr output.
 */
export async function build(
  projectRoot: string,
): Promise<{ success: boolean; output: string }> {
  return runGraphifyBuild(projectRoot);
}
