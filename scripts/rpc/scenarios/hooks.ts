import { RpcHarness } from "../lib/harness.ts";
import { StateAssert } from "../lib/assertions.ts";
import {
  toolCmd,
  attendPayload,
  believeFactPayload,
  failBash,
  seedBelief,
} from "../lib/scenarios.ts";

export async function contextHookPreamble(
  h: RpcHarness,
  workDir: string,
): Promise<void> {
  await seedBelief(h, believeFactPayload);
  await h.prompt(toolCmd("noesis_attend", attendPayload));
  await h.waitIdle();
  new StateAssert(workDir).focus();
}

export async function toolResultFailureCapture(
  h: RpcHarness,
  workDir: string,
): Promise<void> {
  await seedBelief(h, believeFactPayload);
  await h.prompt(failBash);
  await h.waitIdle();
  new StateAssert(workDir).hasFailureForTool("bash");
}

export async function beforeAgentStartOrientation(
  h: RpcHarness,
): Promise<void> {
  await seedBelief(h, believeFactPayload);
  await h.prompt(toolCmd("noesis_attend", attendPayload));
  await h.waitIdle();
  const found = h.frames.some((frame) => frame.type === "custom_message" && frame.customType === "noesis-orientation");
  if (!found) {
    console.log("  ⚠ beforeAgentStart: no noesis-orientation frame (OMP version dependent)");
  }
}

export async function sessionCompacting(
  h: RpcHarness,
  workDir: string,
): Promise<void> {
  await seedBelief(h, believeFactPayload);
  await h.prompt(toolCmd("noesis_attend", attendPayload));
  await h.waitIdle();
  await h.compact();
  new StateAssert(workDir);
}
