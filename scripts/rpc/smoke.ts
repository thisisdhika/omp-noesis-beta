import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { RpcHarness, MODEL_ID } from "./lib/harness.ts";
import { StateAssert } from "./lib/assertions.ts";

import {
  registerTools,
  attendScenario,
  believeFactScenario,
  believeDecisionScenario,
  commitReplaceScenario,
  commitExtendScenario,
  inferHypothesizeScenario,
  inferConfirmScenario,
} from "./scenarios/core.ts";

import {
  contextHookPreamble,
  toolResultFailureCapture,
  beforeAgentStartOrientation,
  sessionCompacting,
} from "./scenarios/hooks.ts";

import {
  missingStateFile,
  corruptStateFile,
  badToolParams,
  rapidCompactions,
  emptyNoopAttend,
} from "./scenarios/edges.ts";

import {
  multiTurnWorkflow,
  sessionResume,
  handoffContinuity,
  postCompactIntegrity,
} from "./scenarios/real-world.ts";

type Scenario = { name: string; fn: (h: RpcHarness, dir: string) => Promise<void> };

const EXT_PATH = join(process.cwd(), "src", "index.ts");

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), "omp-noesis-smoke-"));
}

function cleanup(dir: string): void {
  setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ } }, 500);
}

async function runOne(h: RpcHarness, dir: string, scenario: Scenario): Promise<boolean> {
  try {
    await scenario.fn(h, dir);
    console.log(`  ✓ ${scenario.name}`);
    return true;
  } catch (e) {
    console.log(`  ✗ ${scenario.name}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

async function runIsolated(label: string, scenarios: Scenario[]): Promise<{ ok: number; total: number }> {
  console.log(`\n── ${label} ──`);
  let ok = 0;
  const total = scenarios.length;

  for (const s of scenarios) {
    const dir = makeDir();
    const h = new RpcHarness(dir, EXT_PATH);
    try {
      await h.ready();
      await h.call({ type: "get_state" });
      const pass = await runOne(h, dir, s);
      if (pass) ok++;
    } finally {
      await h.close();
      cleanup(dir);
    }
  }

  console.log(`[closed]`);
  return { ok, total };
}

async function runSuite(label: string, scenarios: Scenario[]): Promise<{ ok: number; total: number }> {
  console.log(`\n── ${label} ──`);

  const dir = makeDir();
  const h = new RpcHarness(dir, EXT_PATH);
  let ok = 0;

  try {
    await h.ready();
    await h.call({ type: "get_state" });

    for (const s of scenarios) {
      const pass = await runOne(h, dir, s);
      if (pass) ok++;
    }
  } finally {
    await h.close();
    cleanup(dir);
    console.log(`[closed]`);
  }

  return { ok, total: scenarios.length };
}

async function main(): Promise<void> {
  console.log(`[smoke] model=${MODEL_ID}`);
  console.log(`[smoke] extension=${EXT_PATH}`);

  let grandOk = 0;
  let grandTotal = 0;

  // Phase 1: Core tool scenarios (shared session)
  const core: Scenario[] = [
    { name: "register tools", fn: registerTools },
    { name: "attend", fn: attendScenario },
    { name: "believe fact", fn: believeFactScenario },
    { name: "believe decision", fn: believeDecisionScenario },
    { name: "commit replace", fn: commitReplaceScenario },
    { name: "commit extend", fn: commitExtendScenario },
    { name: "infer hypothesize", fn: inferHypothesizeScenario },
    { name: "infer confirm", fn: inferConfirmScenario },
  ];
  const r1 = await runSuite("Core Scenarios", core);
  grandOk += r1.ok; grandTotal += r1.total;

  // Phase 2: Hook validation (shared session)
  const hooks: Scenario[] = [
    { name: "context hook preamble", fn: contextHookPreamble },
    { name: "tool_result failure capture", fn: toolResultFailureCapture },
    { name: "before_agent_start orientation", fn: beforeAgentStartOrientation },
    { name: "session.compacting survival", fn: sessionCompacting },
  ];
  const r2 = await runSuite("Hook Validation", hooks);
  grandOk += r2.ok; grandTotal += r2.total;

  // Phase 3: Edge cases (isolated per scenario to avoid state contamination)
  const edges: Scenario[] = [
    { name: "missing state file", fn: missingStateFile },
    { name: "corrupt state file", fn: corruptStateFile },
    { name: "bad tool params", fn: badToolParams },
    { name: "rapid compactions", fn: rapidCompactions },
    { name: "empty no-op attend", fn: emptyNoopAttend },
  ];
  const r3 = await runIsolated("Edge Cases", edges);
  grandOk += r3.ok; grandTotal += r3.total;

  // Phase 4: Real-world flows (isolated per scenario)
  const flows: Scenario[] = [
    { name: "multi-turn workflow", fn: multiTurnWorkflow },
    { name: "session resume", fn: sessionResume },
    { name: "handoff continuity", fn: handoffContinuity },
    { name: "post-compact integrity", fn: postCompactIntegrity },
  ];
  const r4 = await runIsolated("Real-World Flows", flows);
  grandOk += r4.ok; grandTotal += r4.total;

  console.log(`\n══════════════════════════════`);
  console.log(`[smoke] ${grandOk}/${grandTotal} passed`);
  if (grandOk < grandTotal) process.exitCode = 1;
}

await main();
