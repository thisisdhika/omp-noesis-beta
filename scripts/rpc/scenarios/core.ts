import { RpcHarness } from "../lib/harness.ts";
import { StateAssert } from "../lib/assertions.ts";
import {
  toolCmd,
  believeFactPayload,
  believeDecisionPayload,
  inferHypothesizePayload,
  inferConfirmPayload,
  attendPayload,
  commitReplacePayload,
  commitExtendPayload,
} from "../lib/scenarios.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function believeFactScenario(h: RpcHarness, workDir: string): Promise<void> {
  await h.prompt(toolCmd("noesis_believe", believeFactPayload));
  await h.waitIdle();
  if (!h.toolStarted("noesis_believe")) throw new Error("noesis_believe did not start");

  const s = new StateAssert(workDir);
  s.factExists(believeFactPayload.content, believeFactPayload.confidence);
}

export async function believeDecisionScenario(h: RpcHarness, workDir: string): Promise<void> {
  await h.prompt(toolCmd("noesis_believe", believeDecisionPayload));
  await h.waitIdle();
  if (!h.toolStarted("noesis_believe")) throw new Error("noesis_believe did not start");

  const s = new StateAssert(workDir);
  const decisions = s.decisions();
  const match = decisions.find((decision) => decision.content === believeDecisionPayload.content);
  if (!match) throw new Error("decision not persisted");
  if (match.rationale !== believeDecisionPayload.rationale) {
    throw new Error(`decision rationale="${String(match.rationale)}", expected "${believeDecisionPayload.rationale}"`);
  }
}

export async function inferHypothesizeScenario(h: RpcHarness, workDir: string): Promise<void> {
  await h.prompt(toolCmd("noesis_infer", inferHypothesizePayload));
  await h.waitIdle();
  if (!h.toolStarted("noesis_infer")) throw new Error("noesis_infer did not start");

  const s = new StateAssert(workDir);
  s.hypothesisWithContent(inferHypothesizePayload.content);
}

export async function inferConfirmScenario(h: RpcHarness, workDir: string): Promise<void> {
  await h.prompt(toolCmd("noesis_infer", inferHypothesizePayload));
  await h.waitIdle();
  if (!h.toolStarted("noesis_infer")) throw new Error("noesis_infer did not start for hypothesize");

  const s1 = new StateAssert(workDir);
  const hyp = s1.hypothesisWithContent(inferHypothesizePayload.content);
  if (!hyp.id) throw new Error("hypothesis id is missing");

  await h.prompt(toolCmd("noesis_infer", inferConfirmPayload(hyp.id)));
  await h.waitIdle();
  if (!h.toolStarted("noesis_infer")) throw new Error("noesis_infer did not start for confirm");

  const s2 = new StateAssert(workDir);
  const confirmed = s2.hypothesisWithContent(inferHypothesizePayload.content);
  if (confirmed.status !== "confirmed") {
    throw new Error(`hypothesis status="${String(confirmed.status)}", expected "confirmed"`);
  }

  if (s2.facts().length === 0) throw new Error("no belief fact was auto-created after confirmation");
}

export async function registerTools(h: RpcHarness): Promise<void> {
  const cmdFrame = h.frames.find(
    (frame) => frame.type === "available_commands_update",
  );
  const commands = Array.isArray(cmdFrame?.commands) ? cmdFrame.commands : [];
  const names = commands
    .filter((command): command is { name: string } => isRecord(command) && typeof command.name === "string")
    .map((command) => command.name);
  if (!names.includes("noesis:init")) {
    throw new Error("noesis:init command not registered — extension failed to load");
  }
}

export async function attendScenario(h: RpcHarness, workDir: string): Promise<void> {
  await h.prompt(toolCmd("noesis_attend", attendPayload));
  await h.waitIdle();
  if (!h.toolStarted("noesis_attend")) throw new Error("noesis_attend did not start");
  const s = new StateAssert(workDir);
  s.focus();
}

export async function commitReplaceScenario(h: RpcHarness, workDir: string): Promise<void> {
  await h.prompt(toolCmd("noesis_commit", commitReplacePayload));
  await h.waitIdle();
  if (!h.toolStarted("noesis_commit")) throw new Error("noesis_commit did not start");
  const s = new StateAssert(workDir);
  s.workflowGoal(commitReplacePayload.goal);
}

export async function commitExtendScenario(h: RpcHarness, workDir: string): Promise<void> {
  await h.prompt(toolCmd("noesis_commit", commitReplacePayload));
  await h.waitIdle();
  await h.prompt(toolCmd("noesis_commit", commitExtendPayload));
  await h.waitIdle();
  const s = new StateAssert(workDir);
  s.stepCount(2);
}
