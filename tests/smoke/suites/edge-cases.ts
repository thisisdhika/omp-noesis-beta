"use strict";

/**
 * Edge Case Smoke Tests for the noesis extension.
 *
 * Validates boundary conditions: rapid attention switching, very long belief
 * content, many concurrent beliefs, empty tool parameters, and maximum workflow
 * steps. Uses only structural assertions (no content matching).
 */

import { createSmokeContext } from "../harness.ts";
import {
  assertAttentionSet,
  assertBeliefCount,
  assertFactExists,
  assertWorkflowExists,
  AssertionError,
} from "../assertions.ts";
import { PROMPT_TIMEOUT_MS } from "../config.ts";
import type { SuiteResult, ScenarioResult } from "../reporter.ts";
import type { NoesisState } from "../../../src/schema.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert that `value` is not null/undefined or throw. */
function assertNonNull<T>(
  value: T | null | undefined,
  label: string,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`Expected non-null value for: ${label}`);
  }
}

/** Build a belief content string of at least `minLen` characters. */
function buildLongBeliefContent(minLen = 500): string {
  const core =
    "The authentication microservice architecture consists of a central " +
    "OAuth 2.0 authorization server that issues JWT tokens with RS256 " +
    "signatures, supports refresh token rotation every 15 minutes, " +
    "integrates with the corporate LDAP directory for user federation, " +
    "and caches session data in a Redis cluster configured with three " +
    "replicas per shard across two availability zones to ensure high " +
    "availability during regional outages or network partitions that might " +
    "otherwise disrupt the login flow for the single-page application " +
    "client running on the customer-facing dashboard. ";
  const repeats = Math.ceil(minLen / core.length);
  return core.repeat(repeats).slice(0, minLen);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

export async function runEdgeCases(): Promise<SuiteResult> {
  const scenarios: ScenarioResult[] = [];
  const start = Date.now();

  // -----------------------------------------------------------------------
  // Scenario 1 — Rapid context switching (3 focus changes)
  // -----------------------------------------------------------------------
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();

      // First focus change: debugging auth module
      await ctx.prompt(
        "hey can you focus on debugging the auth module? I'm seeing " +
          "401 errors on the admin endpoints",
      );
      await ctx.waitForTool("noesis_attend", PROMPT_TIMEOUT_MS);

      // Second focus change: refactoring API routes
      await ctx.prompt(
        "ok switch gears, focus on refactoring the API routes — the " +
          "response format is inconsistent",
      );
      await ctx.waitForTool("noesis_attend", PROMPT_TIMEOUT_MS);

      // Third focus change: documentation write-up
      await ctx.prompt(
        "actually hold on, focus on writing docs for the public API " +
          "first before we change anything",
      );
      await ctx.waitForTool("noesis_attend", PROMPT_TIMEOUT_MS);

      // Verify attention is set after rapid switching
      const state = await ctx.readState();
      assertNonNull(state, "state after rapid context switching");
      assertAttentionSet(state);

      scenarios.push({
        name: "rapid context switching",
        passed: true,
        durationMs: Date.now() - s,
      });
    } catch (e) {
      scenarios.push({
        name: "rapid context switching",
        passed: false,
        error: String(e),
        durationMs: Date.now() - s,
      });
    } finally {
      await ctx?.dispose();
    }
  }

  // -----------------------------------------------------------------------
  // Scenario 2 — Belief with very long content (500+ characters)
  // -----------------------------------------------------------------------
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();

      const longContent = buildLongBeliefContent(500);

      await ctx.prompt(
        `Use the believe tool to record this fact: "${longContent}".` +
          ` Use type "fact", confidence 0.85, source "user".`,
      );
      await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);

      const state = await ctx.readState();
      assertNonNull(state, "state after long belief content");
      assertFactExists(state);

      scenarios.push({
        name: "belief with very long content",
        passed: true,
        durationMs: Date.now() - s,
      });
    } catch (e) {
      scenarios.push({
        name: "belief with very long content",
        passed: false,
        error: String(e),
        durationMs: Date.now() - s,
      });
    } finally {
      await ctx?.dispose();
    }
  }

  // -----------------------------------------------------------------------
  // Scenario 3 — Many concurrent beliefs (10+)
  // -----------------------------------------------------------------------
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();

      const facts = [
        "API rate limit is 100 requests per minute",
        "Database connection pool size is 20",
        "Redis cache TTL is 300 seconds",
        "Auth tokens expire after 24 hours",
        "CI pipeline runs on every push to main",
        "Production logs ship to CloudWatch",
        "Static assets served from S3 bucket",
        "Error tracking service is Sentry",
        "Feature flags managed in LaunchDarkly",
        "Container images stored in ECR",
      ];

      for (const fact of facts) {
        await ctx.prompt(
          `Use the believe tool to record this fact: "${fact}".` +
            ` Use type "fact", source "user".`,
        );
        await ctx.waitForTool("noesis_believe", PROMPT_TIMEOUT_MS);
      }

      const state = await ctx.readState();
      assertNonNull(state, "state after many concurrent beliefs");
      assertBeliefCount(state, 10);

      scenarios.push({
        name: "many concurrent beliefs",
        passed: true,
        durationMs: Date.now() - s,
      });
    } catch (e) {
      scenarios.push({
        name: "many concurrent beliefs",
        passed: false,
        error: String(e),
        durationMs: Date.now() - s,
      });
    } finally {
      await ctx?.dispose();
    }
  }

  // -----------------------------------------------------------------------
  // Scenario 4 — Null / empty tool parameters
  // -----------------------------------------------------------------------
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();

      // Empty prompt — must not crash
      await ctx.prompt("");

      // Attend with empty focus — the tool should either accept it or
      // reject gracefully without crashing the runtime
      await ctx.prompt(
        'Use the attend tool with focus="" (empty string) and ' +
          'priority="normal" to test empty parameter handling.',
      );
      await ctx.waitForTool("noesis_attend", PROMPT_TIMEOUT_MS);

      // Believe with empty content — should reject gracefully
      await ctx.prompt(
        'Use the believe tool with type="fact", content="" (empty ' +
          'string), confidence=0.5, and source="user" to test empty ' +
          "parameter handling.",
      );
      // May or may not call the tool — either is fine as long as state
      // remains readable
      try {
        await ctx.waitForTool("noesis_believe", 15_000);
      } catch {
        // Graceful rejection is acceptable
      }

      // State must still be readable after empty-parameter experiments
      const state = await ctx.readState();
      if (state === null) {
        throw new AssertionError(
          "state became unreadable after empty parameter attempts",
        );
      }

      scenarios.push({
        name: "null/empty tool parameters",
        passed: true,
        durationMs: Date.now() - s,
      });
    } catch (e) {
      scenarios.push({
        name: "null/empty tool parameters",
        passed: false,
        error: String(e),
        durationMs: Date.now() - s,
      });
    } finally {
      await ctx?.dispose();
    }
  }

  // -----------------------------------------------------------------------
  // Scenario 5 — Maximum workflow steps (10+)
  // -----------------------------------------------------------------------
  {
    const s = Date.now();
    let ctx;
    try {
      ctx = await createSmokeContext();

      const goal = "Deploy microservices to production";
      const steps = [
        "Run linting and type checks",
        "Execute unit tests with coverage",
        "Build Docker images for all services",
        "Scan images for vulnerabilities",
        "Push images to container registry",
        "Update Kubernetes manifests",
        "Deploy to staging environment",
        "Run integration tests against staging",
        "Promote canary to 10% of traffic",
        "Monitor error rates for 15 minutes",
        "Roll out to remaining production nodes",
        "Send deployment notification to Slack",
      ];

      await ctx.prompt(
        `Use the commit tool in extend_workflow mode to create a ` +
          `workflow with goal "${goal}" and steps: ` +
          steps.map((s) => `"${s}"`).join(", ") +
          ". Leave the status as draft.",
      );
      await ctx.waitForTool("noesis_commit", PROMPT_TIMEOUT_MS);

      const state = await ctx.readState();
      assertNonNull(state, "state after max workflow steps");
      assertWorkflowExists(state);

      if (state.commitment.workflow.steps.length < 10) {
        throw new AssertionError(
          `Expected at least 10 workflow steps, found ` +
            `${state.commitment.workflow.steps.length}`,
        );
      }

      scenarios.push({
        name: "maximum workflow steps",
        passed: true,
        durationMs: Date.now() - s,
      });
    } catch (e) {
      scenarios.push({
        name: "maximum workflow steps",
        passed: false,
        error: String(e),
        durationMs: Date.now() - s,
      });
    } finally {
      await ctx?.dispose();
    }
  }

  return {
    name: "edge-cases",
    scenarios,
    passed: scenarios.filter((s) => s.passed).length,
    failed: scenarios.filter((s) => !s.passed).length,
    durationMs: Date.now() - start,
  };
}
