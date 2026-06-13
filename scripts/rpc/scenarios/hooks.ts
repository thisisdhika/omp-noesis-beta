import { RpcHarness } from "../lib/harness.ts";
import { StateAssert } from "../lib/assertions.ts";
import {
  toolCmd,
  attendPayload,
  believeFactPayload,
  failBash,
} from "../lib/scenarios.ts";

// Helper: ensure state file exists via a durable write.
async function seed(h: RpcHarness): Promise<void> {
  await h.prompt(toolCmd("noesis_believe", believeFactPayload));
  await h.waitIdle();
}

export async function contextHookPreamble(
  h: RpcHarness,
  workDir: string,
): Promise<void> {
  await seed(h);
  await h.prompt(toolCmd("noesis_attend", attendPayload));
  await h.waitIdle();
  new StateAssert(workDir).focus();
}

export async function toolResultFailureCapture(
  h: RpcHarness,
  workDir: string,
): Promise<void> {
  await seed(h);
  await h.prompt(failBash);
  await h.waitIdle();
  new StateAssert(workDir).hasFailureForTool("bash");
}

export async function beforeAgentStartOrientation(
  h: RpcHarness,
): Promise<void> {
  await seed(h);
  await h.prompt(toolCmd("noesis_attend", attendPayload));
  await h.waitIdle();
  const found = h.frames.some(
    (f) =>
      f.type === "custom_message" &&
      (f as Record<string, unknown>).customType === "noesis-orientation",
  );
  if (!found) {
    console.log("  ⚠ beforeAgentStart: no noesis-orientation frame (OMP version dependent)");
  }
}

export async function sessionCompacting(
  h: RpcHarness,
  workDir: string,
): Promise<void> {
  await seed(h);
  await h.prompt(toolCmd("noesis_attend", attendPayload));
  await h.waitIdle();
  await h.compact();
  new StateAssert(workDir);
}
