import { join } from "node:path";

import { RpcHarness } from "../lib/harness.ts";
import { StateAssert } from "../lib/assertions.ts";
import {
  toolCmd,
  attendPayload,
  commitReplacePayload,
  believeFactPayload,
  inferHypothesizePayload,
} from "../lib/scenarios.ts";

export async function multiTurnWorkflow(
  h: RpcHarness,
  workDir: string,
): Promise<void> {
  await h.prompt(toolCmd("noesis_attend", attendPayload));
  await h.waitIdle();

  await h.prompt(toolCmd("noesis_commit", commitReplacePayload));
  await h.waitIdle();

  await h.prompt(toolCmd("noesis_believe", believeFactPayload));
  await h.waitIdle();

  const s = new StateAssert(workDir);
  s.focus();
  s.files(attendPayload.files);
  s.workflowGoal(commitReplacePayload.goal);
  s.factExists(believeFactPayload.content);
}

export async function sessionResume(
  h: RpcHarness,
  workDir: string,
): Promise<void> {
  await h.prompt(toolCmd("noesis_attend", attendPayload));
  await h.waitIdle();
  await h.prompt(toolCmd("noesis_commit", commitReplacePayload));
  await h.waitIdle();

  const sessionPath = h.getSessionFile();
  if (!sessionPath) throw new Error("no session file returned by get_state");

  await h.close();

  const extPath = join(process.cwd(), "src", "index.ts");
  const h2 = new RpcHarness(workDir, extPath);
  try {
    await h2.ready();
    const s = new StateAssert(workDir);
    s.focus();
    s.workflowGoal(commitReplacePayload.goal);
  } finally {
    await h2.close();
  }
}

export async function handoffContinuity(
  h: RpcHarness,
  workDir: string,
): Promise<void> {
  await h.prompt(toolCmd("noesis_attend", attendPayload));
  await h.waitIdle();
  await h.prompt(toolCmd("noesis_believe", believeFactPayload));
  await h.waitIdle();

  await h.handoff();
  await h.newSession();

  const s = new StateAssert(workDir);
  s.focus();
  s.factExists(believeFactPayload.content);
}

export async function postCompactIntegrity(
  h: RpcHarness,
  workDir: string,
): Promise<void> {
  await h.prompt(toolCmd("noesis_attend", attendPayload));
  await h.waitIdle();
  await h.prompt(toolCmd("noesis_believe", believeFactPayload));
  await h.waitIdle();
  await h.prompt(toolCmd("noesis_commit", commitReplacePayload));
  await h.waitIdle();
  await h.prompt(toolCmd("noesis_infer", inferHypothesizePayload));
  await h.waitIdle();

  await h.compact();
  await h.waitIdle();

  const s = new StateAssert(workDir);
  s.focus();
  s.files(attendPayload.files);
  s.factExists(believeFactPayload.content);
  s.workflowGoal(commitReplacePayload.goal);
}
