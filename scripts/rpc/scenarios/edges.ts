import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { RpcHarness } from "../lib/harness.ts";
import { StateAssert } from "../lib/assertions.ts";
import {
  toolCmd,
  attendPayload,
  believeFactPayload,
  seedBelief,
} from "../lib/scenarios.ts";

export async function missingStateFile(
  h: RpcHarness,
  workDir: string,
): Promise<void> {
  await seedBelief(h, believeFactPayload);
  const statePath = join(workDir, ".omp", "noesis", "state.json");
  if (!existsSync(statePath)) throw new Error("state file not created by seed");
  rmSync(statePath, { force: true });

  await h.prompt(toolCmd("noesis_attend", attendPayload));
  await h.waitIdle();
  if (!existsSync(statePath)) throw new Error("state file not recreated after deletion");
  new StateAssert(workDir);
}

export async function corruptStateFile(
  h: RpcHarness,
  workDir: string,
): Promise<void> {
  await seedBelief(h, believeFactPayload);
  const statePath = join(workDir, ".omp", "noesis", "state.json");
  writeFileSync(statePath, "{{{ not json }}}", "utf-8");

  await h.prompt(toolCmd("noesis_attend", attendPayload));
  await h.waitIdle();
  new StateAssert(workDir).focus();
}

export async function badToolParams(h: RpcHarness, workDir: string): Promise<void> {
  await seedBelief(h, believeFactPayload);
  const badPayload = { focus: 42, files: "not-an-array" };
  await h.prompt(toolCmd("noesis_attend", badPayload));
  await h.waitIdle();
  if (!h.hasEvent("agent_end")) throw new Error("OMP crashed on bad params — no agent_end");
  new StateAssert(workDir);
}

export async function rapidCompactions(
  h: RpcHarness,
  workDir: string,
): Promise<void> {
  await seedBelief(h, believeFactPayload);
  await h.prompt(toolCmd("noesis_attend", attendPayload));
  await h.waitIdle();
  await h.compact("first");
  await h.waitIdle();
  await h.compact("second");
  await h.waitIdle();
  new StateAssert(workDir);
}

export async function emptyNoopAttend(
  h: RpcHarness,
): Promise<void> {
  await seedBelief(h, believeFactPayload);
  await h.prompt(toolCmd("noesis_attend", { focus: "", files: [] }));
  await h.waitIdle();
  if (!h.toolStarted("noesis_attend")) throw new Error("noesis_attend did not start for empty focus");
}
