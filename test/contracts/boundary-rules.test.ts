import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";

const OMP_TOOLS = ["bash", "read", "write", "edit", "search", "find"] as const;
const OMP_COMMANDS = ["compact", "handoff", "new_session"] as const;
const NOESIS_TOOLS = [
  "noesis_attend",
  "noesis_believe",
  "noesis_infer",
  "noesis_commit",
  "noesis_focus",
  "noesis_vault_search",
] as const;
const NOESIS_HOOKS = [
  "context",
  "tool_result",
  "session.compacting",
  "turn_end",
  "before_agent_start",
] as const;

describe("Boundary Rules", () => {
  let ctx: TestContext & { cleanup: () => void };

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("does not register OMP platform tools", () => {
    for (const name of OMP_TOOLS) {
      expect(ctx.extension.tools.has(name)).toBe(false);
    }
  });

  it("does not register OMP commands", () => {
    for (const name of OMP_COMMANDS) {
      expect(ctx.extension.commands.has(name)).toBe(false);
    }
  });

  it("registers exactly its 6 tools and no others", () => {
    const registered = [...ctx.extension.tools.keys()];
    expect(registered.sort()).toEqual([...NOESIS_TOOLS].sort());
  });

  it("registers all 5 hooks", () => {
    for (const event of NOESIS_HOOKS) {
      expect(ctx.extension.hookCount(event)).toBeGreaterThan(0);
    }
  });

  it("registers noesis:init command with non-empty description", () => {
    const cmd = ctx.extension.getCommand("noesis:init");
    expect(cmd).toBeDefined();
    expect(cmd!.description).toBeTruthy();
  });
});
