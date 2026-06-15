import { report, type SuiteResult } from "./reporter.ts";
import { runBeliefLifecycle } from "./suites/belief-lifecycle.ts";
import { runBeliefRevision } from "./suites/belief-revision.ts";
import { runLearningLoop } from "./suites/learning-loop.ts";
import { runWorkflowTracking } from "./suites/workflow-tracking.ts";
import { runCompactionSurvival } from "./suites/compaction-survival.ts";
import { runPreambleGeneration } from "./suites/preamble-generation.ts";
import { runHookIntegration } from "./suites/hook-integration.ts";
import { runCrossSessionPersistence } from "./suites/cross-session-persistence.ts";
import { runErrorRecovery } from "./suites/error-recovery.ts";
import { runRecallQueries } from "./suites/recall-queries.ts";
import { runMalformedInputs } from "./suites/malformed-inputs.ts";
import { runRealWorldWorkflows } from "./suites/real-world-workflows.ts";
import { runRealWorldDeveloper } from "./suites/real-world-developer.ts";
import { runInferenceLifecycle } from "./suites/inference-lifecycle.ts";
import { runVaultSearch } from "./suites/vault-search.ts";
import { runEdgeCases } from "./suites/edge-cases.ts";

const suites: Array<() => Promise<SuiteResult>> = [
  runBeliefLifecycle,
  runBeliefRevision,
  runLearningLoop,
  runWorkflowTracking,
  runCompactionSurvival,
  runPreambleGeneration,
  runHookIntegration,
  runCrossSessionPersistence,
  runRecallQueries,
  runRealWorldWorkflows,
  runInferenceLifecycle,
  runVaultSearch,
  runErrorRecovery,
  runMalformedInputs,
  runRealWorldDeveloper,
  runEdgeCases,
];

const results: SuiteResult[] = [];
for (const suite of suites) {
  const start = Date.now();
  try {
    results.push(await suite());
  } catch (e) {
    results.push({
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

const { failed } = report(results);
process.exit(failed > 0 ? 1 : 0);
