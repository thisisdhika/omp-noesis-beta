"use strict";

/**
 * Smoke tests for the noesis vault-search tool.
 *
 * The vault-search tool is currently a forward-compatible stub that returns
 * "Vault search not yet available."  These scenarios verify the tool is
 * reachable and returns the expected stub response.
 */

import { createSmokeContext } from "../harness.ts";
import { PROMPT_TIMEOUT_MS } from "../config.ts";
import type { SuiteResult, ScenarioResult } from "../reporter.ts";

export async function runVaultSearch(): Promise<SuiteResult> {
  const scenarios: ScenarioResult[] = [];
  const start = Date.now();

  // -----------------------------------------------------------------------
  // Scenario 1 — vault search stub call
  // -----------------------------------------------------------------------
  {
    const name = "vault search stub call";
    const s = Date.now();
    const ctx = await createSmokeContext();
    try {
      await ctx.prompt(
        'Use the vault-search tool to search for "database migration" across all vaults. Use kind="all" and maxResults=3.',
      );
      const event = await ctx.waitForTool("noesis_vault_search", PROMPT_TIMEOUT_MS);

      // The event itself proves the tool was called and executed
      if (!event || typeof event !== "object") {
        throw new Error("vault-search tool was not called");
      }

      // Check the stub result contains expected placeholder text
      const resultStr = JSON.stringify(event.result ?? "");
      if (
        !resultStr.toLowerCase().includes("not yet available") &&
        !resultStr.toLowerCase().includes("placeholder")
      ) {
        throw new Error(
          `Expected stub message in vault-search result, got: ${resultStr}`,
        );
      }

      await ctx.dispose();
      scenarios.push({ name, passed: true, durationMs: Date.now() - s });
    } catch (e) {
      await ctx?.dispose().catch(() => {});
      scenarios.push({
        name,
        passed: false,
        error: String(e),
        durationMs: Date.now() - s,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Scenario 2 — vault search by kind
  // -----------------------------------------------------------------------
  {
    const name = "vault search by kind";
    const s = Date.now();
    const ctx = await createSmokeContext();
    try {
      await ctx.prompt(
        'Use the vault-search tool with query="PostgreSQL", kind="decision", maxResults=10.',
      );
      // Verify the tool handles non-"all" kind parameter without error
      await ctx.waitForTool("noesis_vault_search", PROMPT_TIMEOUT_MS);

      await ctx.dispose();
      scenarios.push({ name, passed: true, durationMs: Date.now() - s });
    } catch (e) {
      await ctx?.dispose().catch(() => {});
      scenarios.push({
        name,
        passed: false,
        error: String(e),
        durationMs: Date.now() - s,
      });
    }
  }

  return {
    name: "vault-search",
    scenarios,
    passed: scenarios.filter((s) => s.passed).length,
    failed: scenarios.filter((s) => !s.passed).length,
    durationMs: Date.now() - start,
  };
}
