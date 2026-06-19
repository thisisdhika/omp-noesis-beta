"use strict";

/**
 * omp-noesis: Graphify Client
 * Version: 0.1.0
 *
 * Graphify CLI client providing capability detection, query execution,
 * and build delegation for graph-based cognitive state enrichment.
 */

import type { CapabilityLevel } from "../shared/schema-base.js";
import type { GraphFinding } from "../domains/attention/schema.js";
import { validateGraphPath } from "../shared/paths.js";
import { runGraphifyBuild } from "./graphify-setup.js";
import { parseQueryOutput } from "./graphify-parser.js";
import { stat } from "node:fs/promises";

/** Flag to prevent repeated auto-heal attempts within a session. */
let _autoHealAttempted = false;

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
    const stats = await stat(graphPath);
    const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
    if (ageHours > 24) {
      // Attempt one auto-heal per session via incremental update
      if (!_autoHealAttempted) {
        _autoHealAttempted = true;
        const result = await updateGraph(projectRoot);
        if (result.success) {
          // Re-check freshness after successful update
          const newStats = await stat(graphPath);
          const newAgeHours = (Date.now() - newStats.mtimeMs) / (1000 * 60 * 60);
          return newAgeHours > 24 ? "STALE" : "FULL";
        }
      }
      return "STALE";
    }
    return "FULL";
  } catch {
    // If stat fails (permissions, race), treat as stale
    return "STALE";
  }
}

// ============================================================================
// QUERY RESULT TYPE
// ============================================================================

/**
 * Structured result from a graphify query execution.
 * Carries findings when successful, an error message on failure,
 * and the wall-clock duration of the operation in milliseconds.
 */
export interface QueryResult {
  /** Parsed graph query findings, empty on error. */
  findings: GraphFinding[];
  /** Error message if the query failed or no graph was found. */
  error?: string;
  /** Wall-clock duration of the query operation in milliseconds. */
  duration: number;
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
 * @returns QueryResult with findings array, optional error message, and duration in ms.
 */
export async function query(
  projectRoot: string,
  question: string,
): Promise<QueryResult> {
  const start = Date.now();
  const graphPath = validateGraphPath(projectRoot);
  if (!graphPath) {
    return { findings: [], error: "No graph file found", duration: Date.now() - start };
  }

  try {
    const proc = Bun.spawn(
      ["graphify", "query", question, "--graph", graphPath],
      {
        cwd: projectRoot,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30000,
      },
    );

    const [rawStdout, rawStderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      const errorMsg = rawStderr.trim() || `Graphify query exited with code ${exitCode}`;
      return {
        findings: [],
        error: errorMsg,
        duration: Date.now() - start,
      };
    }

    return { findings: parseQueryOutput(rawStdout), duration: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { findings: [], error: message, duration: Date.now() - start };
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

// ============================================================================
// UPDATE INVOCATION
// ============================================================================

/**
 * Run an incremental graphify update on the project.
 *
 * Uses `graphify . --update` to refresh the graph incrementally without
 * a full rebuild.  Timeout is 2 minutes.
 *
 * @param projectRoot - Absolute path to the project root.
 * @returns Update result with success flag and stdout/stderr output.
 */
export async function updateGraph(
  projectRoot: string,
): Promise<{ success: boolean; output: string }> {
  try {
    const proc = Bun.spawn(
      ["graphify", ".", "--update"],
      { cwd: projectRoot, stdout: "pipe", timeout: 120000 },
    );
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    return { success: exitCode === 0, output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: message };
  }
}
