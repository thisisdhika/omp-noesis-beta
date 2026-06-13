import { existsSync, readFileSync } from "node:fs";

export type NoesisState = Record<string, unknown> & {
  version?: number;
  lastPersisted?: string;
  attention?: Record<string, unknown> & {
    focus?: string;
    files?: string[];
    graphQueries?: string[];
    updatedAt?: string;
  };
  belief?: Record<string, unknown> & {
    facts?: Array<Record<string, unknown> & {
      id?: string;
      content?: string;
      confidence?: number;
      source?: string;
      status?: string;
      tags?: string[];
    }>;
    decisions?: Array<Record<string, unknown> & {
      id?: string;
      content?: string;
      rationale?: string;
      status?: string;
    }>;
  };
  inference?: Record<string, unknown> & {
    hypotheses?: Array<Record<string, unknown> & {
      id?: string;
      content?: string;
      status?: string;
      evidence?: string;
    }>;
    reasoning?: Array<Record<string, unknown>>;
  };
  commitment?: Record<string, unknown> & {
    workflow?: Record<string, unknown> & {
      goal?: string;
      status?: string;
      steps?: Array<Record<string, unknown> & {
        id?: string;
        description?: string;
        status?: string;
      }>;
    };
    actions?: Array<Record<string, unknown>>;
  };
  learning?: Record<string, unknown> & {
    successes?: Array<Record<string, unknown>>;
    failures?: Array<Record<string, unknown> & {
      id?: string;
      description?: string;
      toolName?: string;
      rootCause?: string;
      fix?: string;
    }>;
    summary?: Record<string, unknown> & {
      successCount?: number;
      failureCount?: number;
      resolvedCount?: number;
    };
  };
};

export class StateAssert {
  private readonly state: NoesisState;
  readonly path: string;

  constructor(readonly workDir: string) {
    this.path = `${workDir}/.omp/noesis/state.json`;
    if (!existsSync(this.path)) throw new Error(`State file missing: ${this.path}`);
    this.state = JSON.parse(readFileSync(this.path, "utf-8")) as NoesisState;
  }

  exists(): boolean { return existsSync(this.path); }

  // ── attention ──

  attn(): NonNullable<NoesisState["attention"]> {
    if (!this.state.attention) throw new Error("attention layer missing");
    return this.state.attention;
  }

  focus(): string {
    const f = this.attn().focus;
    if (typeof f !== "string" || f.length === 0) throw new Error("focus empty/missing");
    return f;
  }

  files(expect: string[]): this {
    const got = this.attn().files ?? [];
    const missing = expect.filter((f) => !got.includes(f));
    if (missing.length > 0) throw new Error(`attention.files missing: ${missing.join(", ")}`);
    return this;
  }

  // ── belief ──

  blf(): NonNullable<NoesisState["belief"]> {
    if (!this.state.belief) throw new Error("belief layer missing");
    return this.state.belief;
  }

  facts(): Array<NonNullable<NonNullable<NoesisState["belief"]>["facts"]>[number]> {
    return this.blf().facts ?? [];
  }

  factWithContent(content: string): Record<string, unknown> {
    const match = this.facts().find((f) => f.content === content);
    if (!match) throw new Error(`fact not found: "${content}"`);
    return match;
  }

  factCount(n: number): this {
    const got = this.facts().length;
    if (got !== n) throw new Error(`expected ${n} facts, got ${got}`);
    return this;
  }

  factExists(content: string, confidence?: number): this {
    const f = this.factWithContent(content);
    if (f.status !== "active") throw new Error(`fact "${content}" status=${String(f.status)}, expected active`);
    if (confidence !== undefined && f.confidence !== confidence) {
      throw new Error(`fact "${content}" confidence=${String(f.confidence)}, expected ${confidence}`);
    }
    return this;
  }

  decisions(): Array<NonNullable<NonNullable<NoesisState["belief"]>["decisions"]>[number]> {
    return this.blf().decisions ?? [];
  }

  // ── inference ──

  inf(): NonNullable<NoesisState["inference"]> {
    if (!this.state.inference) throw new Error("inference layer missing");
    return this.state.inference;
  }

  hypotheses(): Array<NonNullable<NonNullable<NoesisState["inference"]>["hypotheses"]>[number]> {
    return this.inf().hypotheses ?? [];
  }

  hypothesisWithContent(content: string): Record<string, unknown> {
    const match = this.hypotheses().find((h) => h.content === content);
    if (!match) throw new Error(`hypothesis not found: "${content}"`);
    return match;
  }

  // ── commitment ──

  cmt(): NonNullable<NoesisState["commitment"]> {
    if (!this.state.commitment) throw new Error("commitment layer missing");
    return this.state.commitment;
  }

  workflow(): NonNullable<NonNullable<NoesisState["commitment"]>["workflow"]> {
    const wf = this.cmt().workflow;
    if (!wf) throw new Error("workflow missing");
    return wf;
  }

  workflowGoal(expected: string): this {
    const got = this.workflow().goal;
    if (got !== expected) throw new Error(`workflow.goal="${String(got)}", expected "${expected}"`);
    return this;
  }

  workflowStatus(expected: string): this {
    const got = this.workflow().status;
    if (got !== expected) throw new Error(`workflow.status="${String(got)}", expected "${expected}"`);
    return this;
  }

  stepCount(n: number): this {
    const got = (this.workflow().steps ?? []).length;
    if (got !== n) throw new Error(`expected ${n} workflow steps, got ${got}`);
    return this;
  }

  // ── learning ──

  lrn(): NonNullable<NoesisState["learning"]> {
    if (!this.state.learning) throw new Error("learning layer missing");
    return this.state.learning;
  }

  failures(): Array<NonNullable<NonNullable<NoesisState["learning"]>["failures"]>[number]> {
    return this.lrn().failures ?? [];
  }

  hasFailureForTool(toolName: string): this {
    const match = this.failures().find((f) => f.toolName === toolName);
    if (!match) throw new Error(`no failure entry for tool "${toolName}"`);
    return this;
  }

  // ── raw access ──

  raw(): NoesisState { return this.state; }

  dump(label: string): this {
    console.log(`[assert] ${label}:\n${JSON.stringify(this.state, null, 2)}`);
    return this;
  }
}
