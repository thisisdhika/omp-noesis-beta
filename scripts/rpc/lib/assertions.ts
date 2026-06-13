import { existsSync, readFileSync } from "node:fs";
import { NoesisStateSchema, type BeliefDecision, type BeliefFact, type CommitmentLayer, type Hypothesis, type InferenceLayer, type LearningEntry, type LearningLayer, type NoesisState, type Workflow, type AttentionLayer } from "../../src/schema.js";

function readState(path: string): NoesisState {
  return NoesisStateSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
}

export class StateAssert {
  private readonly state: NoesisState;
  readonly path: string;

  constructor(readonly workDir: string) {
    this.path = `${workDir}/.omp/noesis/state.json`;
    if (!existsSync(this.path)) throw new Error(`State file missing: ${this.path}`);
    this.state = readState(this.path);
  }

  attn(): AttentionLayer { return this.state.attention; }
  focus(): string { const focus = this.attn().focus; if (typeof focus !== "string" || focus.length === 0) throw new Error("focus empty/missing"); return focus; }
  files(expect: string[]): this { const got = this.attn().files ?? []; const missing = expect.filter((file) => !got.includes(file)); if (missing.length > 0) throw new Error(`attention.files missing: ${missing.join(", ")}`); return this; }
  blf() { return this.state.belief; }
  facts(): BeliefFact[] { return this.blf().facts ?? []; }
  factWithContent(content: string): BeliefFact { const match = this.facts().find((fact) => fact.content === content); if (!match) throw new Error(`fact not found: "${content}"`); return match; }
  factCount(n: number): this { const got = this.facts().length; if (got !== n) throw new Error(`expected ${n} facts, got ${got}`); return this; }
  factExists(content: string, confidence?: number): this { const fact = this.factWithContent(content); if (fact.status !== "active") throw new Error(`fact "${content}" status=${String(fact.status)}, expected active`); if (confidence !== undefined && fact.confidence !== confidence) throw new Error(`fact "${content}" confidence=${String(fact.confidence)}, expected ${confidence}`); return this; }
  decisions(): BeliefDecision[] { return this.blf().decisions ?? []; }
  inf(): InferenceLayer { return this.state.inference; }
  hypotheses(): Hypothesis[] { return this.inf().hypotheses ?? []; }
  hypothesisWithContent(content: string): Hypothesis { const match = this.hypotheses().find((hypothesis) => hypothesis.content === content); if (!match) throw new Error(`hypothesis not found: "${content}"`); return match; }
  cmt(): CommitmentLayer { return this.state.commitment; }
  workflow(): Workflow { return this.cmt().workflow; }
  workflowGoal(expected: string): this { const got = this.workflow().goal; if (got !== expected) throw new Error(`workflow.goal="${String(got)}", expected "${expected}"`); return this; }
  workflowStatus(expected: string): this { const got = this.workflow().status; if (got !== expected) throw new Error(`workflow.status="${String(got)}", expected "${expected}"`); return this; }
  stepCount(n: number): this { const got = (this.workflow().steps ?? []).length; if (got !== n) throw new Error(`expected ${n} workflow steps, got ${got}`); return this; }
  lrn(): LearningLayer { return this.state.learning; }
  failures(): LearningEntry[] { return this.lrn().failures ?? []; }
  hasFailureForTool(toolName: string): this { const match = this.failures().find((failure) => failure.toolName === toolName); if (!match) throw new Error(`no failure entry for tool "${toolName}"`); return this; }
  raw(): NoesisState { return this.state; }
  dump(label: string): this { console.log(`[assert] ${label}:\n${JSON.stringify(this.state, null, 2)}`); return this; }
}
