"use strict";

/**
 * omp-noesis: Graphify Client
 * Version: 1.0.0
 *
 * Graphify CLI client providing capability detection, query execution,
 * and build delegation for graph-based cognitive state enrichment.
 */

import type { CapabilityLevel } from "../shared/schema-base.js";
import type { GraphFinding } from "../domains/attention/schema.js";
import { validateGraphPath } from "../shared/paths.js";
import { readNoesisConfig } from "../shared/config.js";
import { runGraphifyBuild } from "./graphify-setup.js";
import { parseQueryOutput } from "./graphify-parser.js";
import { stat } from "node:fs/promises";
import { join } from "node:path";
/** Flag to prevent repeated auto-heal attempts within a session. */
let _autoHealAttempted = false;

const MAX_GRAPH_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

/** Ollama environment variables that signal the user needs `--backend ollama`. */
const OLLAMA_ENV_KEYS = ["OLLAMA_API_KEY", "OLLAMA_HOST"] as const;

/**
 * Check whether the user has Ollama-specific env vars set.
 * If none are set, they're a paid cloud API user (Graphify auto-detects).
 * If any are set, Graphify needs `--backend ollama` passed explicitly.
 */
export function needsOllamaBackend(): boolean {
  return OLLAMA_ENV_KEYS.some(key => !!process.env[key]);
}

/**
 * Return CLI args needed for Graphify's backend selection.
 * Only needed when Ollama envs are present; paid cloud API users
 * get auto-detection from Graphify's own API key scanning.
 */
export function getBackendArgs(): string[] {
  return needsOllamaBackend() ? ["--backend", "ollama"] : [];
}

/**
 * Check whether the existing graph file is within manageable size limits.
 * Returns true when no graph exists yet (will be built fresh).
 */
export async function isGraphSizeManageable(projectRoot: string): Promise<boolean> {
  const graphPath = join(projectRoot, "graphify-out", "graph.json");
  try {
    const stats = await stat(graphPath);
    return stats.size <= MAX_GRAPH_SIZE_BYTES;
  } catch {
    return true; // No graph file yet = manageable (will build fresh)
  }
}
/**
 * Compute the age of the graph file in hours since last modification.
 * Returns null when no graph file exists or stats can't be read.
 */
export async function computeGraphAgeHours(projectRoot: string): Promise<number | null> {
  const graphPath = validateGraphPath(projectRoot);
  if (graphPath === null) return null;
  try {
    const stats = await stat(graphPath);
    return (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
  } catch {
    return null;
  }
}


/**
 * Check if we can run a graph update based on rate limiting.
 * Returns true if enough time has elapsed since the last update.
 */
export function canRunGraphUpdate(
  lastUpdateTimestamp: string | undefined | null,
  maxIntervalMinutes: number = 15,
): boolean {
  if (!lastUpdateTimestamp) return true; // Never updated = can update
  const last = new Date(lastUpdateTimestamp).getTime();
  const elapsed = Date.now() - last;
  return elapsed >= maxIntervalMinutes * 60 * 1000;
}

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
 * Also passes `--backend ollama` automatically when no paid API key is detected.
 *
 * @param projectRoot - Absolute path to the project root.
 * @returns Build result with success flag and stdout/stderr output.
 */
export async function build(
  projectRoot: string,
): Promise<{ success: boolean; output: string }> {
  return runGraphifyBuild(projectRoot, getBackendArgs());
}

// ============================================================================
// UPDATE INVOCATION
// ============================================================================

/** Options for graphify update operations. */
export interface UpdateOptions {
  /** Whether to skip clustering (Leiden algorithm). Default: true */
  skipCluster?: boolean;
  /** Whether to skip viz generation. Default: true */
  skipViz?: boolean;
  /** Timeout in milliseconds. Default: 60000 (60s) */
  timeout?: number;
  /** Whether to force a full rebuild instead of incremental update. Default: false */
  fullRebuild?: boolean;
}

/**
 * Run an incremental graphify update on the project.
 * Uses `--update --no-cluster --no-viz` by default for fast incremental updates.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param options - Optional flags to control update behavior.
 * @returns Update result with success flag and stdout/stderr output.
 */
export async function updateGraph(
  projectRoot: string,
  options?: UpdateOptions,
): Promise<{ success: boolean; output: string }> {
  const opts = {
    skipCluster: options?.skipCluster ?? true,
    skipViz: options?.skipViz ?? true,
    timeout: options?.timeout ?? 60000,
    fullRebuild: options?.fullRebuild ?? false,
  };

  try {
    const args = ["graphify", "."];
    if (!opts.fullRebuild) args.push("--update");
    if (opts.skipCluster) args.push("--no-cluster");
    if (opts.skipViz) args.push("--no-viz");
    args.push(...getBackendArgs());

    const proc = Bun.spawn(args, {
      cwd: projectRoot,
      stdout: "pipe",
      timeout: opts.timeout,
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    return { success: exitCode === 0, output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: message };
  }
}

// ============================================================================
// BACKGROUND UPDATE HELPER
// ============================================================================

/** Options for the background graph update helper. */
export interface BackgroundUpdateOptions {
  fullRebuild?: boolean;
  timeout?: number;
}

/**
 * Try to run a background graph update and record the timestamp on success.
 * Checks graph size before attempting; returns true on success, false otherwise.
 */
export async function tryBackgroundGraphUpdate(
  projectRoot: string,
  stateManager: { read: () => Readonly<{ _lastGraphUpdate?: string }>; mutate: (fn: (s: any) => void) => Promise<unknown> },
  options?: BackgroundUpdateOptions,
): Promise<boolean> {
  // Check graph size before attempting update
  if (!(await isGraphSizeManageable(projectRoot))) return false;

  const result = await updateGraph(projectRoot, {
    skipCluster: true,
    skipViz: true,
    fullRebuild: options?.fullRebuild,
    timeout: options?.timeout,
  });

  if (result.success) {
    await stateManager.mutate(s => {
      s._lastGraphUpdate = new Date().toISOString();
    });
    return true;
  }
  return false;
}
/**
 * Run a lifecycle-triggered graph refresh with the same checks used by
 * session_start, turn_end, and session_shutdown.
 */
export interface LifecycleGraphUpdateOptions {
  requireAutoUpdate?: boolean;
  requireStale?: boolean;
  allowFreshGraph?: boolean;
  fullRebuildOnNoGraph?: boolean;
  timeout?: number;
}

export async function tryLifecycleGraphUpdate(
  projectRoot: string,
  stateManager: { read: () => Readonly<{ _lastGraphUpdate?: string }>; mutate: (fn: (s: any) => void) => Promise<unknown> },
  options?: LifecycleGraphUpdateOptions,
): Promise<boolean> {
  const capability = await detectCapability(projectRoot);
  if (capability === "DEGRADED") return false;
  if (!options?.allowFreshGraph && capability === "FULL") return false;
  if (options?.requireStale && capability !== "STALE") return false;

  const state = stateManager.read();
  const config = await readNoesisConfig(projectRoot);

  if (options?.requireAutoUpdate !== false && !config.autoUpdate) return false;

  if (!canRunGraphUpdate(state._lastGraphUpdate, config.maxUpdateInterval)) return false;
  if (!(await isGraphSizeManageable(projectRoot))) return false;

  return tryBackgroundGraphUpdate(projectRoot, stateManager, {
    fullRebuild: capability === "NO_GRAPH" && (options?.fullRebuildOnNoGraph ?? true),
    timeout: options?.timeout,
  });
}
