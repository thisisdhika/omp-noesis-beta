"use strict";

/**
 * Smoke test runner — batches suites by domain.
 *
 * Usage:
 *   bun run smoke              # run all batches sequentially
 *   bun run smoke --batch 1    # run only batch 1 (bootstrap)
 *   bun run smoke --batch 2    # run only batch 2 (belief & inference)
 *
 * Batch 1 (bootstrap):  init-command
 * Batch 2 (belief):     belief-lifecycle, belief-revision, inference-lifecycle, recall-queries
 * Batch 3 (workflow):   learning-loop, workflow-tracking
 * Batch 4 (infra):      hook-integration, compaction-survival, cross-session-persistence, preamble-generation
 * Batch 5 (robustness): error-recovery, malformed-inputs, edge-cases
 * Batch 6 (integration): real-world-workflows, real-world-developer, vault-search, mcp-integration
 */

import { report, type SuiteResult } from "./reporter.ts";
import { runInitCommand } from "./suites/init-command.ts";
import { runBeliefLifecycle } from "./suites/belief-lifecycle.ts";
import { runBeliefRevision } from "./suites/belief-revision.ts";
import { runInferenceLifecycle } from "./suites/inference-lifecycle.ts";
import { runRecallQueries } from "./suites/recall-queries.ts";
import { runLearningLoop } from "./suites/learning-loop.ts";
import { runWorkflowTracking } from "./suites/workflow-tracking.ts";
import { runHookIntegration } from "./suites/hook-integration.ts";
import { runCompactionSurvival } from "./suites/compaction-survival.ts";
import { runCrossSessionPersistence } from "./suites/cross-session-persistence.ts";
import { runPreambleGeneration } from "./suites/preamble-generation.ts";
import { runErrorRecovery } from "./suites/error-recovery.ts";
import { runMalformedInputs } from "./suites/malformed-inputs.ts";
import { runEdgeCases } from "./suites/edge-cases.ts";
import { runRealWorldWorkflows } from "./suites/real-world-workflows.ts";
import { runRealWorldDeveloper } from "./suites/real-world-developer.ts";
import { runVaultSearch } from "./suites/vault-search.ts";
import { runMcpIntegration } from "./suites/mcp-integration.ts";

// ---------------------------------------------------------------------------
// Domain batches
// ---------------------------------------------------------------------------

const batches: Record<number, { name: string; suites: Array<() => Promise<SuiteResult>> }> = {
  1: {
    name: "Bootstrap",
    suites: [runInitCommand],
  },
  2: {
    name: "Belief & Inference",
    suites: [runBeliefLifecycle, runBeliefRevision, runInferenceLifecycle, runRecallQueries],
  },
  3: {
    name: "Learning & Commitment",
    suites: [runLearningLoop, runWorkflowTracking],
  },
  4: {
    name: "Infrastructure",
    suites: [runHookIntegration, runCompactionSurvival, runCrossSessionPersistence, runPreambleGeneration],
  },
  5: {
    name: "Robustness",
    suites: [runErrorRecovery, runMalformedInputs, runEdgeCases],
  },
  6: {
    name: "Integration",
    suites: [runRealWorldWorkflows, runRealWorldDeveloper, runVaultSearch, runMcpIntegration],
  },
};

// ---------------------------------------------------------------------------
// Parse --batch flag
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const batchIdx = args.indexOf("--batch");
const selectedBatch = batchIdx !== -1 ? Number(args[batchIdx + 1]) : null;

const batchNumbers = selectedBatch !== null
  ? [selectedBatch]
  : Object.keys(batches).map(Number);

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const allResults: SuiteResult[] = [];

for (const bi of batchNumbers) {
  const batch = batches[bi];
  if (!batch) {
    console.error(`Unknown batch: ${bi}. Valid: ${Object.keys(batches).join(", ")}`);
    process.exit(1);
  }

  console.log(`\n=== Batch ${bi}: ${batch.name} (${batch.suites.length} suites) ===\n`);

  for (const suite of batch.suites) {
    const start = Date.now();
    try {
      allResults.push(await suite());
    } catch (e) {
      allResults.push({
        name: suite.name,
        scenarios: [
          { name: "suite crashed", passed: false, error: String(e), durationMs: 0 },
        ],
        passed: 0,
        failed: 1,
        durationMs: Date.now() - start,
      });
    }
  }
}

const { failed } = report(allResults);
process.exit(failed > 0 ? 1 : 0);
