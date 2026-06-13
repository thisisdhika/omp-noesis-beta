import { RpcHarness } from "../lib/harness.ts";
import { StateAssert } from "../lib/assertions.ts";
import {
  toolCmd,
  believeFactPayload,
  believeDecisionPayload,
  inferHypothesizePayload,
  inferConfirmPayload,
} from "../lib/scenarios.ts";

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
