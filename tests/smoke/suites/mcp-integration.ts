"use strict";

/**
 * Smoke suite: MCP integration.
 *
 * Verifies that the noesis MCP integration works correctly:
 *   1. MCP config file (.omp/mcp.json) can be created with expected structure
 *   2. With MCP config present, the context hook fires and attention updates
 *   3. With MCP config present, the before_agent_start hook delivers the
 *      system prompt (agent can process beliefs via MCP-augmented preamble)
 */

import { WORKDIR, PROMPT_TIMEOUT_MS } from "../config.ts";
import { createSmokeContext } from "../harness.ts";
import { assertAttentionSet, assertFactExists } from "../assertions.ts";
import type { SuiteResult, ScenarioResult } from "../reporter.ts";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Path to .omp/mcp.json within the smoke workdir. */
function mcpConfigPath(): string {
  return join(WORKDIR, ".omp", "mcp.json");
}

/** Write a mock graphify MCP config to the smoke workdir. */
function writeMcpConfig(): void {
  const dir = join(WORKDIR, ".omp");
  mkdirSync(dir, { recursive: true });
  const config = {
    mcpServers: {
      graphify: {
        command: "python3",
        args: ["-m", "graphify.serve", "graphify-out/graph.json"],
      },
    },
  };
  writeFileSync(mcpConfigPath(), JSON.stringify(config, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------

async function measure(
  name: string,
  fn: () => Promise<void>,
): Promise<ScenarioResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, passed: true, durationMs: Date.now() - start };
  } catch (e) {
    return { name, passed: false, error: String(e), durationMs: Date.now() - start };
  }
}

// ---------------------------------------------------------------------------
// Suite: mcp-integration
// ---------------------------------------------------------------------------

export async function runMcpIntegration(): Promise<SuiteResult> {
  const scenarios: ScenarioResult[] = [];
  const suiteStart = Date.now();

  // -----------------------------------------------------------------------
  // Scenario 1: MCP config is written with expected structure
  // -----------------------------------------------------------------------
  scenarios.push(
    await measure("MCP config has graphify server entry", async () => {
      writeMcpConfig();

      const path = mcpConfigPath();
      if (!existsSync(path)) {
        throw new Error("MCP config file was not created");
      }

      const config = JSON.parse(readFileSync(path, "utf-8"));
      if (!config.mcpServers?.graphify) {
        throw new Error("MCP config missing graphify server entry");
      }

      if (config.mcpServers.graphify.command !== "python3") {
        throw new Error(
          `Expected graphify command "python3", got "${config.mcpServers.graphify.command}"`,
        );
      }

      if (!Array.isArray(config.mcpServers.graphify.args)) {
        throw new Error("MCP config graphify args must be an array");
      }
    }),
  );

  // -----------------------------------------------------------------------
  // Scenario 2: With MCP config, the context hook fires and attention
  //             updates when the agent sets a focus.
  // -----------------------------------------------------------------------
  scenarios.push(
    await measure("context hook fires with MCP config", async () => {
      writeMcpConfig();

      const ctx = await createSmokeContext();
      try {
        // Trigger the context hook by prompting; ask the LLM to set focus
        // so we can later verify the attention layer was touched.
        await ctx.prompt("Focus on MCP integration and Graphify tools.");
        await ctx.waitForTool("noesis_focus", PROMPT_TIMEOUT_MS);

        // Small delay for async hooks to persist state
        const { promise: pause, resolve: unpause } = Promise.withResolvers<void>();
        setTimeout(unpause, 500);
        await pause;

        const state = await ctx.readState();
        if (!state) throw new Error("State was not persisted");

        // The context hook fired and the attention layer was updated
        assertAttentionSet(state);
      } finally {
        await ctx.dispose();
      }
    }),
  );

  // -----------------------------------------------------------------------
  // Scenario 3: With MCP config, the before_agent_start hook delivers the
  //             system prompt that enables MCP tool hints — verify by
  //             creating a belief through the MCP-augmented preamble.
  // -----------------------------------------------------------------------
  scenarios.push(
    await measure("belief creation succeeds with MCP config", async () => {
      writeMcpConfig();

      const ctx = await createSmokeContext();
      try {
        // The system prompt includes MCP tool hints from append-system.ts.
        // The agent should be able to call noesis_believe_fact normally.
        await ctx.prompt(
          "Record that Graphify MCP tools are available for graph queries. " +
          "Use confidence 0.9, source execution, tag it mcp.",
        );
        await ctx.waitForTool("noesis_believe_fact", PROMPT_TIMEOUT_MS);

        const state = await ctx.readState();
        if (!state) throw new Error("State was not persisted");

        // At least one fact belief was created
        assertFactExists(state);
      } finally {
        await ctx.dispose();
      }
    }),
  );

  const passed = scenarios.filter((s) => s.passed).length;
  const failed = scenarios.filter((s) => !s.passed).length;

  return {
    name: "mcp-integration",
    scenarios,
    passed,
    failed,
    durationMs: Date.now() - suiteStart,
  };
}
