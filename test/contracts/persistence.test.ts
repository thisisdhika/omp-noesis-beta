import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, writeFileSync } from "node:fs";
import { createTestContext, type TestContext } from "../_harness/fixtures.js";
import { makeFact } from "../_harness/factories.js";
import { setFocus } from "../../src/domains/attention/attention-domain.js";
import { loadState, statePath } from "../../src/infrastructure/filesystem-store.js";

describe("State persistence", () => {
  let ctx: TestContext & { cleanup: () => void };
  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => {
    ctx.cleanup();
  });

  it("state file created on first durable write", () => {
    const filePath = statePath(ctx.workDir);
    expect(existsSync(filePath)).toBe(false);

    ctx.state.mutate((current) => {
      current.belief.facts.push(makeFact());
    });

    expect(existsSync(filePath)).toBe(true);
  });

  it("attention-only writes NOT immediately persisted", () => {
    const filePath = statePath(ctx.workDir);

    ctx.state.mutate((current) => {
      setFocus(current, "test focus");
    });

    expect(existsSync(filePath)).toBe(false);
  });

  it("attention persisted after checkpoint", () => {
    const filePath = statePath(ctx.workDir);

    ctx.state.mutate((current) => {
      setFocus(current, "test focus");
    });
    expect(existsSync(filePath)).toBe(false);

    ctx.state.checkpointAttention();
    expect(existsSync(filePath)).toBe(true);

    const loaded = loadState(ctx.workDir);
    expect(loaded.attention.focus).toBe("test focus");
  });

  it("atomic write: no partial file", () => {
    ctx.state.mutate((current) => {
      current.belief.facts.push(makeFact({ content: "first fact" }));
    });
    ctx.state.mutate((current) => {
      current.belief.facts.push(makeFact({ content: "second fact" }));
    });
    ctx.state.mutate((current) => {
      setFocus(current, "debugging session");
    });
    ctx.state.checkpointAttention();

    const loaded = loadState(ctx.workDir);
    expect(loaded.belief.facts).toHaveLength(2);
    expect(loaded.belief.facts[0]!.content).toBe("first fact");
    expect(loaded.belief.facts[1]!.content).toBe("second fact");
    expect(loaded.attention.focus).toBe("debugging session");
  });

  it("corrupt state file → recovered", () => {
    // Trigger a durable write to ensure the .omp/noesis/ directory exists
    ctx.state.mutate((current) => {
      current.belief.facts.push(makeFact());
    });
    const filePath = statePath(ctx.workDir);
    writeFileSync(filePath, "{{{ not json }}}", "utf-8");

    const loaded = loadState(ctx.workDir);
    expect(loaded.version).toBe(1);
    expect(loaded.belief.facts).toHaveLength(0);
    expect(loaded.attention.focus).toBe("");
  });

  it("version 1 state loads correctly", () => {
    ctx.state.mutate((current) => {
      current.belief.facts.push(makeFact({ content: "v1 fact", confidence: 0.9 }));
    });

    const loaded = loadState(ctx.workDir);
    expect(loaded.version).toBe(1);
    expect(loaded.belief.facts).toHaveLength(1);
    expect(loaded.belief.facts[0]!.content).toBe("v1 fact");
    expect(loaded.belief.facts[0]!.confidence).toBe(0.9);
    expect(loaded.belief.decisions).toHaveLength(0);
    expect(loaded.inference.hypotheses).toHaveLength(0);
  });
});
