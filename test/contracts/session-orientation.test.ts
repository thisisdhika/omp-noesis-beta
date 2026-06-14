import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";
import { setFocus } from "../../src/domains/attention/attention-domain.js";

describe.skip("Session Orientation (before_agent_start hook) — requires real OMP hook lifecycle", () => {
  let ctx: TestContext & { cleanup: () => void };

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("returns orientation message when state has focus", () => {
    ctx.state.mutate((s) => {
      setFocus(s, "Debug auth token expiry in src/auth.ts");
    });

    const result = ctx.extension.invokeHook("before_agent_start") as
      | {
          message: {
            customType: string;
            content: Array<{ type: string; text: string }>;
            display: boolean;
            attribution: string;
          };
        }
      | undefined;

    expect(result).toBeDefined();
    expect(result!.message.customType).toBe("noesis-orientation");
    expect(result!.message.content).toHaveLength(1);
    expect(result!.message.content[0]!.type).toBe("text");
    expect(result!.message.display).toBe(true);
    expect(result!.message.attribution).toBe("agent");
  });

  it("returns undefined when state has no focus", () => {
    const result = ctx.extension.invokeHook("before_agent_start");
    expect(result).toBeUndefined();
  });

  it("orientation content includes the current focus text", () => {
    ctx.state.mutate((s) => {
      setFocus(s, "Fix auth bug");
    });

    const result = ctx.extension.invokeHook("before_agent_start") as
      | {
          message: {
            content: Array<{ type: string; text: string }>;
          };
        }
      | undefined;

    expect(result).toBeDefined();
    expect(result!.message.content[0]!.text).toContain("Fix auth bug");
  });
});
