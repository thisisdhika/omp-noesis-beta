import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";
import { makeFact } from "../_harness/factories.js";
import { setFocus } from "../../src/domains/attention/attention-domain.js";
import { statePath } from "../../src/infrastructure/filesystem-store.js";

describe("Scenario A: First-time user experience", () => {
  let ctx: TestContext & { cleanup: () => void };
  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => {
    ctx.cleanup();
  });

  it("registers all 6 tools with non-empty descriptions", () => {
    const tools = ctx.extension.tools;
    expect(tools.size).toBe(6);

    for (const [name, tool] of tools) {
      expect(tool.description, `Tool "${name}" must have a description`).toBeTruthy();
    }
  });

  it("registers the noesis:init command with a description", () => {
    const cmd = ctx.extension.getCommand("noesis:init");
    expect(cmd).toBeDefined();
    expect(cmd!.description).toBeTruthy();
  });

  it("registers all 5 expected hooks", () => {
    expect(ctx.extension.hookCount("context")).toBeGreaterThan(0);
    expect(ctx.extension.hookCount("tool_result")).toBeGreaterThan(0);
    expect(ctx.extension.hookCount("session.compacting")).toBeGreaterThan(0);
    expect(ctx.extension.hookCount("turn_end")).toBeGreaterThan(0);
    expect(ctx.extension.hookCount("before_agent_start")).toBeGreaterThan(0);
  });

  it("produces a preamble containing the project name on first context hook", () => {
    ctx.state.mutate((s) => {
      setFocus(s, "initial exploration");
    });

    const result = ctx.extension.invokeHook("context", {
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    }) as { messages: unknown[] };

    const firstMsg = result.messages[0] as {
      role: string;
      content: Array<{ type: string; text?: string }>;
    };
    const text = firstMsg.content.map((c) => c.text ?? "").join("");
    const projectName = basename(ctx.workDir);
    expect(text).toContain(projectName);
  });

  it("creates state file at expected path after a durable mutation", () => {
    ctx.state.mutate((s) => {
      s.belief.facts.push(makeFact());
    });

    expect(existsSync(statePath(ctx.workDir))).toBe(true);
  });

  it("persists state to .omp/noesis/state.json", () => {
    const expected = statePath(ctx.workDir);
    expect(expected).toContain(".omp/noesis/state.json");

    ctx.state.mutate((s) => {
      s.belief.facts.push(makeFact({ content: "first fact" }));
    });

    expect(existsSync(expected)).toBe(true);
  });
});
