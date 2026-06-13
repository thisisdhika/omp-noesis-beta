import { RpcHarness } from "../lib/harness";
import { StateAssert } from "../lib/assertions";
import {
  toolCmd,
  attendPayload,
  believeFactPayload,
  believeDecisionPayload,
  commitReplacePayload,
  commitExtendPayload,
  inferHypothesizePayload,
  inferConfirmPayload,
} from "../lib/scenarios";

// ── Registration check ──

export async function registerTools(h: RpcHarness): Promise<void> {
  const tools = h.getDumpTools();
  const required = ["noesis_attend", "noesis_believe", "noesis_commit", "noesis_infer"];
  for (const t of required) {
    if (!tools.includes(t)) throw new Error(`Required tool "${t}" is not registered`);
  }
}

// ── attention ──

export async function attendScenario(h: RpcHarness, workDir: string): Promise<void> {
  await h.prompt(toolCmd("noesis_attend", attendPayload));
  await h.waitIdle();
  if (!h.toolStarted("noesis_attend")) throw new Error("noesis_attend did not start");
  // Attention-only writes are deferred — state file may not exist yet.
  // The context hook will repopulate focus on the next LLM call.
}

export async function believeFactScenario(h: RpcHarness, workDir: string): Promise<void> {
  await h.prompt(toolCmd("noesis_believe", believeFactPayload));
  await h.waitIdle();
  if (!h.toolStarted("noesis_believe")) throw new Error("noesis_believe did not start");

  const s = new StateAssert(workDir);
  s.factExists(believeFactPayload.content, believeFactPayload.confidence);

  const fact = s.factWithContent(believeFactPayload.content);
  if (fact.source !== believeFactPayload.source) {
    throw new Error(`fact.source="${String(fact.source)}", expected "${believeFactPayload.source}"`);
  }
  const tags = fact.tags as string[] | undefined;
  if (!tags || !believeFactPayload.tags.every((t) => tags.includes(t))) {
    throw new Error("fact.tags missing expected tags");
  }
}

export async function believeDecisionScenario(h: RpcHarness, workDir: string): Promise<void> {
  await h.prompt(toolCmd("noesis_believe", believeDecisionPayload));
  await h.waitIdle();
  if (!h.toolStarted("noesis_believe")) throw new Error("noesis_believe did not start");

  const s = new StateAssert(workDir);
  const decisions = s.decisions();
  const match = decisions.find((d: Record<string, unknown>) => d.content === believeDecisionPayload.content);
  if (!match) throw new Error("decision not persisted");
  if (match.rationale !== believeDecisionPayload.rationale) {
    throw new Error(
      `decision.rationale="${String(match.rationale)}", expected "${believeDecisionPayload.rationale}"`,
    );
  }
}

// ── commitment ──

export async function commitReplaceScenario(h: RpcHarness, workDir: string): Promise<void> {
  await h.prompt(toolCmd("noesis_commit", commitReplacePayload));
  await h.waitIdle();
  if (!h.toolStarted("noesis_commit")) throw new Error("noesis_commit did not start");

  const s = new StateAssert(workDir);
  s.workflowGoal(commitReplacePayload.goal);
  s.workflowStatus(commitReplacePayload.status);
  s.stepCount(commitReplacePayload.steps.length);
}

export async function commitExtendScenario(h: RpcHarness, workDir: string): Promise<void> {
  await h.prompt(toolCmd("noesis_commit", commitExtendPayload));
  await h.waitIdle();
  if (!h.toolStarted("noesis_commit")) throw new Error("noesis_commit did not start");

  const s = new StateAssert(workDir);
  // replace created 1 step, extend adds 1 more → 2 steps total
  s.stepCount(2);
}

// ── inference ──

export async function inferHypothesizeScenario(h: RpcHarness, workDir: string): Promise<void> {
  await h.prompt(toolCmd("noesis_infer", inferHypothesizePayload));
  await h.waitIdle();
  if (!h.toolStarted("noesis_infer")) throw new Error("noesis_infer did not start");

  const s = new StateAssert(workDir);
  s.hypothesisWithContent(inferHypothesizePayload.content);
}

export async function inferConfirmScenario(h: RpcHarness, workDir: string): Promise<void> {
  // Phase 1: create a hypothesis
  await h.prompt(toolCmd("noesis_infer", inferHypothesizePayload));
  await h.waitIdle();
  if (!h.toolStarted("noesis_infer")) throw new Error("noesis_infer did not start for hypothesize");

  const s1 = new StateAssert(workDir);
  const hyp = s1.hypothesisWithContent(inferHypothesizePayload.content);
  const hypId = hyp.id as string | undefined;
  if (!hypId) throw new Error("hypothesis id is missing");

  // Phase 2: confirm the hypothesis
  await h.prompt(toolCmd("noesis_infer", inferConfirmPayload(hypId)));
  await h.waitIdle();
  if (!h.toolStarted("noesis_infer")) throw new Error("noesis_infer did not start for confirm");

  const s2 = new StateAssert(workDir);
  const confirmed = s2.hypothesisWithContent(inferHypothesizePayload.content);
  if (confirmed.status !== "confirmed") {
    throw new Error(`hypothesis status="${String(confirmed.status)}", expected "confirmed"`);
  }

  // A belief fact should have been auto-created
  if (s2.facts().length === 0) throw new Error("no belief fact was auto-created after confirmation");
}
