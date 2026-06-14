import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { getTopLearning } from "../../src/domains/learning/learning-domain.js";
import type { LearningEntry, NoesisState } from "../../src/schema.js";
import {
  RpcHarness,
  StateAssert,
  attendPayload,
  believeFactPayload,
  seedBelief,
  toolCmd,
} from "./harness.js";

const EXT_PATH = join(process.cwd(), "src", "index.ts");
const hasOmp = spawnSync("which", ["omp"], { stdio: "ignore" }).status === 0;
const describeIf = hasOmp ? describe : describe.skip;
const DEFAULT_FOCUS = "No active focus. Use noesis_attend to set one.";

type RequestDump = {
  body?: {
    messages?: Array<{
      role?: string;
      content?: string | Array<{ type?: string; text?: string }>;
    }>;
  };
};

describeIf("OMP hook integration", () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "omp-noesis-int-"));
    dirs.push(dir);
    return dir;
  }

  function statePath(dir: string): string {
    return join(dir, ".omp", "noesis", "state.json");
  }

  function readState(dir: string): NoesisState {
    return JSON.parse(readFileSync(statePath(dir), "utf8")) as NoesisState;
  }

  function writeState(dir: string, state: NoesisState): void {
    writeFileSync(statePath(dir), JSON.stringify(state, null, 2));
  }

  function makeFailure(id: string, description: string, capturedAt: string): LearningEntry {
    return {
      id,
      toolName: "bash",
      description,
      skillScope: "bash",
      capturedAt,
    };
  }

  async function openHarness(dir: string): Promise<RpcHarness> {
    const h = new RpcHarness(dir, EXT_PATH);
    await h.ready();
    return h;
  }

  async function dumpNextRequest(h: RpcHarness, dir: string, prompt: string): Promise<string> {
    const dumpPath = join(dir, `request-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    await h.prompt(`/debug dump-next-request ${dumpPath}`);
    await h.waitIdle();
    await h.prompt(prompt);
    await h.waitIdle();

    expect(existsSync(dumpPath)).toBe(true);
    const dump = JSON.parse(readFileSync(dumpPath, "utf8")) as RequestDump;
    const userMessages = dump.body?.messages?.filter((message) => message.role === "user") ?? [];
    const texts = userMessages.flatMap((message) => {
      if (typeof message.content === "string") return [message.content];
      if (Array.isArray(message.content)) {
        return message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text ?? "");
      }
      return [];
    });
    if (texts.length === 0) throw new Error("user messages missing from dumped request");
    return texts.join("\n");
  }

  async function runToolPrompt(h: RpcHarness, tool: string, payload: Record<string, unknown>): Promise<void> {
    await h.prompt(toolCmd(tool, payload));
    await h.waitIdle();
  }

  it("preamble appears in context", async () => {
    const dir = makeDir();
    const h = await openHarness(dir);
    try {
      await runToolPrompt(h, "noesis_attend", attendPayload);
      const dumped = await dumpNextRequest(h, dir, toolCmd("noesis_commit", { mode: "extend", steps: [{ description: "Confirm preamble" }] }));
      expect(dumped).toContain("<noesis-state>");
      expect(dumped).toContain(attendPayload.focus);
    } finally {
      await h.close();
    }
  }, 120_000);

  it("request without focus uses the default orientation message", async () => {
    const dir = makeDir();
    const h = await openHarness(dir);
    try {
      await seedBelief(h, believeFactPayload);
      const dumped = await dumpNextRequest(h, dir, toolCmd("noesis_believe", believeFactPayload));
      expect(dumped).toContain("<noesis-state>");
      expect(dumped).toContain(`[Noesis] Focus: ${DEFAULT_FOCUS}`);
    } finally {
      await h.close();
    }
  }, 120_000);

  it("preamble rebuilds after mutation", async () => {
    const dir = makeDir();
    const h = await openHarness(dir);
    try {
      await runToolPrompt(h, "noesis_attend", { ...attendPayload, focus: "Focus A" });
      const first = await dumpNextRequest(h, dir, toolCmd("noesis_commit", { mode: "extend", steps: [{ description: "First" }] }));
      await runToolPrompt(h, "noesis_attend", { ...attendPayload, focus: "Focus B" });
      const second = await dumpNextRequest(h, dir, toolCmd("noesis_commit", { mode: "extend", steps: [{ description: "Second" }] }));
      expect(first).toContain("Focus A");
      expect(second).toContain("Focus B");
      expect(second.trim().endsWith("[Noesis] Focus: Focus B")).toBe(true);
    } finally {
      await h.close();
    }
  }, 120_000);

  it("graph findings clear after preamble", async () => {
    const dir = makeDir();
    let h = await openHarness(dir);
    try {
      await seedBelief(h, believeFactPayload);
    } finally {
      await h.close();
    }

    const state = readState(dir);
    state.attention.graphFindings = [{
      nodeName: "TestNode",
      confidence: 0.9,
      confidenceLabel: "EXTRACTED",
      isGodNode: false,
      isSurprising: false,
      rawSnippet: "Graph found something",
    }];
    writeState(dir, state);

    h = await openHarness(dir);
    try {
      const dumped = await dumpNextRequest(h, dir, toolCmd("noesis_believe", believeFactPayload));
      expect(dumped).toContain("TestNode");
      expect(dumped).toContain("Graph found something");
    } finally {
      await h.close();
    }

    const after = readState(dir);
    expect(after.attention.graphFindings).toBeUndefined();
  }, 240_000);

  it("emits session orientation on focus", async () => {
    const dir = makeDir();
    const h = await openHarness(dir);
    try {
      await runToolPrompt(h, "noesis_attend", { ...attendPayload, focus: "Debug auth token expiry in src/auth.ts" });
      const dumped = await dumpNextRequest(h, dir, toolCmd("noesis_commit", { mode: "extend", steps: [{ description: "Orient me" }] }));
      expect(dumped).toContain("[Noesis] Focus: Debug auth token expiry in src/auth.ts");
    } finally {
      await h.close();
    }
  }, 120_000);

  it("emits the default orientation without an explicit focus", async () => {
    const dir = makeDir();
    const h = await openHarness(dir);
    try {
      await seedBelief(h, believeFactPayload);
      const dumped = await dumpNextRequest(h, dir, toolCmd("noesis_believe", believeFactPayload));
      expect(dumped).toContain(`[Noesis] Focus: ${DEFAULT_FOCUS}`);
    } finally {
      await h.close();
    }
  }, 120_000);

  it("runs the active coding workflow end to end", async () => {
    const dir = makeDir();
    const h = await openHarness(dir);
    try {
      await runToolPrompt(h, "noesis_attend", {
        focus: "Debug auth token expiry",
        files: ["src/auth.ts"],
      });
      await runToolPrompt(h, "noesis_believe", {
        type: "fact",
        content: "JWT token TTL is 1 hour",
        confidence: 0.95,
        source: "execution",
        tags: ["auth"],
      });
      await runToolPrompt(h, "noesis_infer", {
        action: "hypothesize",
        content: "Token expiry not checked on refresh",
        evidence: "src/auth.ts:L42",
      });

      const hypothesisId = new StateAssert(dir).raw().inference.hypotheses[0]!.id;

      await runToolPrompt(h, "noesis_infer", {
        action: "confirm",
        hypothesisId,
      });
      await runToolPrompt(h, "noesis_commit", {
        mode: "replace",
        goal: "Fix auth token expiry",
        steps: [{ description: "Add expiry check" }],
      });

      const s = new StateAssert(dir).raw();
      expect(s.attention.focus).toBe("Fix auth token expiry");
      expect(s.attention.files).toEqual(["src/auth.ts"]);
      expect(s.belief.facts.some((fact) => fact.content === "JWT token TTL is 1 hour")).toBe(true);
      expect(s.inference.hypotheses[0]!.status).toBe("confirmed");
      expect(s.belief.facts.some((fact) => fact.content === "Token expiry not checked on refresh" && fact.source === "inference")).toBe(true);
      expect(s.commitment.workflow.goal).toBe("Fix auth token expiry");
      expect(s.commitment.workflow.steps[0]!.description).toBe("Add expiry check");
    } finally {
      await h.close();
    }
  }, 120_000);

  it("ranks resolved repeated failures above unresolved ones", async () => {
    const dir = makeDir();
    let h = await openHarness(dir);
    try {
      await seedBelief(h, believeFactPayload);
    } finally {
      await h.close();
    }

    const seeded = readState(dir);
    seeded.learning.failures = [
      makeFailure("le-1", "cmd failed: invalid syntax", "2026-06-14T00:00:01.000Z"),
      makeFailure("le-2", "cmd failed again: missing arg", "2026-06-14T00:00:02.000Z"),
      makeFailure("le-3", "cmd failed third time: permission denied", "2026-06-14T00:00:03.000Z"),
    ];
    seeded.learning.summary.failureCount = 3;
    writeState(dir, seeded);

    h = await openHarness(dir);
    try {
      await runToolPrompt(h, "noesis_believe", {
        type: "learning",
        learningId: "le-1",
        rootCause: "bad command syntax",
        fix: "use correct syntax",
      });

      const state = new StateAssert(dir).raw();
      const ranked = getTopLearning([...state.learning.successes, ...state.learning.failures], 3, "bash");
      expect(ranked[0]!.id).toBe("le-1");
      expect(ranked[0]!.rootCause).toBe("bad command syntax");
      expect(ranked[0]!.fix).toBe("use correct syntax");
    } finally {
      await h.close();
    }
  }, 120_000);
});
