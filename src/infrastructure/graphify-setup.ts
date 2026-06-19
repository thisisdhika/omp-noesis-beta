"use strict";

/**
 * omp-noesis: Graphify CLI Setup
 * Version: 0.1.0
 *
 * Graphify CLI detection, skill file installation, and build invocation.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// CLI DETECTION
// ============================================================================

/**
 * Check whether the `graphify` CLI is installed and reachable.
 *
 * Uses `Bun.which` to locate the binary, then attempts to extract its
 * version string via `graphify --version`.
 *
 * @returns installed flag and optional semver string.
 */
export async function checkGraphifyCLI(): Promise<{
  installed: boolean;
  version?: string;
}> {
  const graphifyPath = Bun.which("graphify");
  if (graphifyPath === null) {
    return { installed: false };
  }

  try {
    const proc = Bun.spawn(["graphify", "--version"], { stdout: "pipe" });
    const version = await new Response(proc.stdout).text();
    return { installed: true, version: version.trim() };
  } catch {
    // Version detection is best-effort; the CLI is still installed.
    return { installed: true };
  }
}

// ============================================================================
// SKILL INSTALLATION
// ============================================================================

/**
 * Download the Graphify skill manifest and write it to
 * `.omp/skills/graphify/SKILL.md` under the given project root.
 *
 * Creates the destination directory if it does not already exist.
 *
 * @param projectRoot - Absolute path to the project.
 * @returns The absolute path of the installed SKILL.md.
 * @throws If the fetch fails or the response status is not OK.
 */
export async function installGraphifySkill(projectRoot: string): Promise<string> {
  const skillDir = join(projectRoot, ".omp", "skills", "graphify");
  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true });
  }

  const url =
    "https://raw.githubusercontent.com/safishamsi/graphify/HEAD/graphify/skill.md";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download Graphify skill: ${response.status} ${response.statusText}`,
    );
  }

  const content = await response.text();
  const skillPath = join(skillDir, "SKILL.md");
  await Bun.write(skillPath, content);
  return skillPath;
}

// ============================================================================
// BUILD INVOCATION
// ============================================================================

/**
 * Run `graphify . --no-viz` in the project root and collect its output.
 *
 * The process is given a 120-second timeout.  If the spawn itself fails
 * (e.g. binary not found) the error message is returned as the output.
 *
 * @param projectRoot - Working directory for the build.
 * @returns Success flag and captured stdout text.
 */
export async function runGraphifyBuild(
  projectRoot: string,
  extraArgs?: string[],
): Promise<{ success: boolean; output: string }> {
  try {
    const proc = Bun.spawn(["graphify", ".", "--no-viz", ...(extraArgs ?? [])], {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120000,
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    return { success: exitCode === 0, output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: message };
  }
}
