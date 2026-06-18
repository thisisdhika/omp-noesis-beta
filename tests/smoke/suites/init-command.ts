"use strict";

/**
 * Smoke suite: noesis:init command validation
 *
 * Real behavior flow:
 *   1. Spawn RPC mode
 *   2. Send /noesis:init command
 *   3. Wait for init to complete (status message)
 *   4. Verify all bootstrap artifacts
 *   5. Kill RPC process
 *   6. Remaining suites restart fresh RPC
 *
 * This suite MUST run first — init is the prerequisite for everything.
 */

import { expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createSmokeContext, type SmokeContext } from "../harness.ts";
import { WORKDIR } from "../config.ts";
import type { SuiteResult, ScenarioResult } from "../reporter.ts";

function scenario(
  name: string,
  fn: () => void,
): ScenarioResult {
  const start = Date.now();
  try {
    fn();
    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return {
      name,
      passed: false,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - start,
    };
  }
}

async function asyncScenario(
  name: string,
  fn: () => Promise<void>,
): Promise<ScenarioResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return {
      name,
      passed: false,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - start,
    };
  }
}

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

export async function runInitCommand(): Promise<SuiteResult> {
  const scenarios: ScenarioResult[] = [];
  let ctx: SmokeContext | null = null;

  try {
    // ------------------------------------------------------------------
    // Phase 1: Spawn RPC and send /noesis:init
    // ------------------------------------------------------------------
    ctx = await createSmokeContext();

    // Send the init command — OMP processes /commands before reaching the model
    ctx.prompt("/noesis:init");

    // Wait for init to complete: the command sends a noesis:init-status message
    // via pi.sendMessage. In RPC mode, this appears as a custom event.
    // We also wait for tool_execution_end as a fallback (init may trigger tools).
    try {
      await ctx.waitForEvent(
        (e) =>
          e.type === "custom_message" ||
          e.type === "noesis:init-status" ||
          e.type === "tool_execution_end",
        30_000,
      );
    } catch {
      // If no event received, init may have completed silently
      // (e.g., state.json already exists, RULES.md up-to-date)
    }

    // Give the RPC process a moment to finish writing files
    await delay(1_000);

    // ------------------------------------------------------------------
    // Phase 2: Verify bootstrap artifacts
    // ------------------------------------------------------------------

    // 2a. state.json exists and has valid shape
    scenarios.push(scenario("state.json exists and is valid EMPTY_STATE", () => {
      expect(existsSync(WORKDIR + "/.omp/noesis/state.json")).toBe(true);

      const raw = readFileSync(WORKDIR + "/.omp/noesis/state.json", "utf-8");
      const state = JSON.parse(raw);

      expect(state).toHaveProperty("belief");
      expect(state).toHaveProperty("inference");
      expect(state).toHaveProperty("learning");
      expect(state).toHaveProperty("attention");
      expect(state).toHaveProperty("commitment");
      expect(Array.isArray(state.belief.facts)).toBe(true);
      expect(Array.isArray(state.belief.decisions)).toBe(true);
      expect(Array.isArray(state.inference.hypotheses)).toBe(true);
      expect(Array.isArray(state.learning.failures)).toBe(true);
      expect(Array.isArray(state.learning.successes)).toBe(true);
    }));

    // 2b. RULES.md exists and uses markdown (no XML tags)
    scenarios.push(scenario("RULES.md exists and uses markdown format", () => {
      const rulesPath = WORKDIR + "/.omp/RULES.md";
      expect(existsSync(rulesPath)).toBe(true);

      const content = readFileSync(rulesPath, "utf-8");

      // Must NOT contain XML tags
      expect(content).not.toContain("<noesis>");
      expect(content).not.toContain("</noesis>");
      expect(content).not.toContain("<rules>");
      expect(content).not.toContain("<gotchas>");

      // Must contain markdown markers
      expect(content).toContain("# Noesis Rules");
      expect(content).toContain("**Always do these FIRST:**");
      expect(content).toContain("**NEVER:**");

      // Must contain key rules
      expect(content).toContain("noesis_attend");
      expect(content).toContain("noesis_recall");
      expect(content).toContain("noesis_believe_fact");
    }));

    // 2c. config.yml exists and has compaction settings
    scenarios.push(scenario("config.yml exists with compaction settings", () => {
      const configPath = WORKDIR + "/.omp/config.yml";
      expect(existsSync(configPath)).toBe(true);

      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain("compaction");
    }));

    // 2d. .omp directory structure is correct
    scenarios.push(scenario(".omp directory structure is correct", () => {
      const ompDir = WORKDIR + "/.omp";
      expect(existsSync(ompDir)).toBe(true);
      expect(existsSync(ompDir + "/noesis")).toBe(true);
      expect(existsSync(ompDir + "/noesis/state.json")).toBe(true);
    }));

    // 2e. State is readable via harness (extension loaded correctly)
    scenarios.push(await asyncScenario("state is readable via harness readState", async () => {
      const state = await ctx!.readState();
      expect(state).not.toBeNull();
      expect(state!.belief).toBeDefined();
      expect(state!.attention).toBeDefined();
    }));

  } finally {
    // ------------------------------------------------------------------
    // Phase 3: Kill RPC process — remaining suites restart fresh
    // ------------------------------------------------------------------
    if (ctx) {
      await ctx.dispose();
    }
  }

  const passed = scenarios.filter(s => s.passed).length;
  const failed = scenarios.filter(s => !s.passed).length;

  return {
    name: "runInitCommand",
    scenarios,
    passed,
    failed,
    durationMs: scenarios.reduce((sum, s) => sum + s.durationMs, 0),
  };
}
