"use strict";

/**
 * Unit tests for context-hook.ts — modelFamily detection through
 * the hook handler's render context. Verifies that different
 * ctx.model values produce different preamble output via the
 * model-aware section limiting in buildPreamble.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createMockPi, toExtensionAPI } from "../../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { registerContextHook } from "../../../src/hooks/context-hook.js";
import { cleanPersistedState, populatedState } from "../../helpers/fixtures.js";
import type { MockPi } from "../../helpers/mock-pi.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let pi: MockPi;
let runtime: NoesisRuntime;

beforeEach(async () => {
  cleanPersistedState();
  pi = createMockPi();
  runtime = await createRuntime(toExtensionAPI(pi));
  registerContextHook(toExtensionAPI(pi), runtime);
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Invoke the registered context hook with the given ctx and a populated
 * state (enough data for workflow, decisions, beliefs, hypotheses, learning
 * sections). Returns the result messages array.
 */
async function runHookWithPopulatedState(
  ctx?: { model?: { id: string; provider?: string } },
) {
  // Populate state with enough data to exercise multiple preamble sections
  const p = populatedState();
  await runtime.stateManager.mutate((s) => {
    s.belief = p.belief;
    s.inference = p.inference;
    s.commitment = p.commitment;
    s.learning = p.learning;
  });

  const handler = pi._getHooks("context")[0]!;
  const event = {
    messages: [{ role: "user", content: [{ type: "text", text: "test" }] }],
  };
  return (await handler(event, ctx)) as {
    messages: Array<{
      role: string;
      content: Array<{ type: string; text: string }>;
    }>;
  };
}

/**
 * Invoke the handler with EMPTY_STATE (no populated data) to verify
 * baseline behavior for modelFamily edge cases.
 */
async function runHookWithEmptyState(
  ctx?: { model?: { id: string; provider?: string } },
) {
  const handler = pi._getHooks("context")[0]!;
  const event = {
    messages: [{ role: "user", content: [{ type: "text", text: "test" }] }],
  };
  return (await handler(event, ctx)) as {
    messages: Array<{
      role: string;
      content: Array<{ type: string; text: string }>;
    }>;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerContextHook modelFamily detection", () => {
  describe("deepseek model (small model, maxNonProtectedSections=3)", () => {
    it("detects deepseek from model.id and limits non-protected sections", async () => {
      const result = await runHookWithPopulatedState({
        model: { id: "deepseek-chat" },
      });
      const preamble = result.messages[0]!.content[0]!.text;

      expect(preamble).toContain("Noesis");
      // First 3 non-protected sections survive
      expect(preamble).toContain("Workflow:");
      expect(preamble).toContain("Decisions:");
      expect(preamble).toContain("Beliefs");
      // Sections 7 (hypotheses) and 8 (learning) are dropped for small models
      expect(preamble).not.toContain("Hypotheses:");
      expect(preamble).not.toContain("Learning:");
    });

    it("detects deepseek from model.id with version suffix", async () => {
      const result = await runHookWithPopulatedState({
        model: { id: "deepseek-v3" },
      });
      const preamble = result.messages[0]!.content[0]!.text;

      expect(preamble).toContain("Noesis");
      expect(preamble).toContain("Workflow:");
      expect(preamble).not.toContain("Hypotheses:");
    });

    it("still works with empty state and deepseek model", async () => {
      const result = await runHookWithEmptyState({
        model: { id: "deepseek-coder" },
      });
      const preamble = result.messages[0]!.content[0]!.text;

      // With empty state only protected sections remain, so model family
      // doesn't change visible output, but the handler should not throw
      expect(preamble).toContain("Noesis");
      expect(preamble).toContain("State: .omp/noesis/state.json");
      expect(result.messages).toHaveLength(2);
    });
  });

  describe("claude/large model (maxNonProtectedSections=8)", () => {
    it("detects claude from model.id and keeps all sections", async () => {
      const result = await runHookWithPopulatedState({
        model: { id: "claude-sonnet-4-20250514" },
      });
      const preamble = result.messages[0]!.content[0]!.text;

      expect(preamble).toContain("Noesis");
      expect(preamble).toContain("Workflow:");
      expect(preamble).toContain("Decisions:");
      expect(preamble).toContain("Beliefs");
      expect(preamble).toContain("Hypotheses:");
      expect(preamble).toContain("Learning:");
    });

    it("detects claude from anthropic provider name", async () => {
      const result = await runHookWithPopulatedState({
        model: { id: "some-model", provider: "anthropic" },
      });
      const preamble = result.messages[0]!.content[0]!.text;

      expect(preamble).toContain("Hypotheses:");
      expect(preamble).toContain("Learning:");
    });

    it("detects gpt from openai model.id", async () => {
      const result = await runHookWithPopulatedState({
        model: { id: "gpt-4o" },
      });
      const preamble = result.messages[0]!.content[0]!.text;

      expect(preamble).toContain("Hypotheses:");
    });

    it("detects gemini from model.id", async () => {
      const result = await runHookWithPopulatedState({
        model: { id: "gemini-2.0-flash" },
      });
      const preamble = result.messages[0]!.content[0]!.text;

      expect(preamble).toContain("Hypotheses:");
    });
  });

  describe("unknown model family (maxNonProtectedSections=8)", () => {
    it("uses unknown family for unrecognized model ID", async () => {
      const result = await runHookWithPopulatedState({
        model: { id: "some-unknown-model-v3" },
      });
      const preamble = result.messages[0]!.content[0]!.text;

      // unknown → maxNonProtectedSections=8, all sections kept
      expect(preamble).toContain("Noesis");
      expect(preamble).toContain("Workflow:");
      expect(preamble).toContain("Hypotheses:");
      expect(preamble).toContain("Learning:");
    });

    it("uses unknown family when ctx.model is undefined", async () => {
      const result = await runHookWithPopulatedState();
      const preamble = result.messages[0]!.content[0]!.text;

      // undefined → unknown → maxNonProtectedSections=8, all sections kept
      expect(preamble).toContain("Noesis");
      expect(preamble).toContain("Workflow:");
      expect(preamble).toContain("Hypotheses:");
      expect(preamble).toContain("Learning:");
    });

    it("uses unknown family when ctx.model has empty string id", async () => {
      const result = await runHookWithPopulatedState({ model: { id: "" } });
      const preamble = result.messages[0]!.content[0]!.text;

      // empty string id → detectModelFamily("") returns "unknown"
      expect(preamble).toContain("Workflow:");
      expect(preamble).toContain("Hypotheses:");
    });

    it("uses unknown family when ctx.model is null", async () => {
      const result = await runHookWithPopulatedState(null as unknown as undefined);
      const preamble = result.messages[0]!.content[0]!.text;

      // null model → detectFamilyFromModel(undefined) returns "unknown"
      expect(preamble).toContain("Workflow:");
      expect(preamble).toContain("Hypotheses:");
    });
  });

  describe("qwen, llama, mimo small models", () => {
    it("detects qwen and limits non-protected sections", async () => {
      const result = await runHookWithPopulatedState({
        model: { id: "qwen-2.5-72b" },
      });
      const preamble = result.messages[0]!.content[0]!.text;

      // qwen has maxNonProtectedSections=3
      expect(preamble).not.toContain("Hypotheses:");
    });

    it("detects llama and limits non-protected sections (max=4)", async () => {
      const result = await runHookWithPopulatedState({
        model: { id: "llama-3-70b" },
      });
      const preamble = result.messages[0]!.content[0]!.text;

      // llama has maxNonProtectedSections=4 — sections 4-7 survive, 8 is dropped
      expect(preamble).toContain("Beliefs");
      expect(preamble).toContain("Hypotheses:");
      expect(preamble).not.toContain("Learning:");
    });

    it("detects mimo and limits non-protected sections", async () => {
      const result = await runHookWithPopulatedState({
        model: { id: "mimo-7b" },
      });
      const preamble = result.messages[0]!.content[0]!.text;

      // mimo has maxNonProtectedSections=3
      expect(preamble).not.toContain("Hypotheses:");
    });
  });

  describe("provider field precedence over model.id", () => {
    it("uses provider field when it matches a known family", async () => {
      // model.id suggests "gpt" (openai), but provider="anthropic" → "claude"
      const result = await runHookWithPopulatedState({
        model: { id: "gpt-4", provider: "anthropic" },
      });
      const preamble = result.messages[0]!.content[0]!.text;

      // claude family → maxNonProtectedSections=8, all sections kept
      expect(preamble).toContain("Hypotheses:");
      expect(preamble).toContain("Learning:");
    });

    it("falls back to model.id when provider is unknown", async () => {
      const result = await runHookWithPopulatedState({
        model: { id: "deepseek-chat", provider: "my-custom-host" },
      });
      const preamble = result.messages[0]!.content[0]!.text;

      // provider "my-custom-host" is unknown → fall back to id "deepseek-chat"
      // → deepseek family → maxNonProtectedSections=3
      expect(preamble).not.toContain("Hypotheses:");
    });
  });

  describe("hook registration sanity", () => {
    it("still prepends preamble message with model in ctx", async () => {
      const result = await runHookWithEmptyState({
        model: { id: "claude-sonnet-4-20250514" },
      });
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]!.role).toBe("user");
      expect(result.messages[1]!.content[0]!.text).toBe("test");
    });

    it("passes modelFamily independently of capability level", async () => {
      // _capability is cached after first handler call; modelFamily is
      // resolved fresh each turn from ctx.model. Verify both affect preamble.
      const result = await runHookWithPopulatedState({
        model: { id: "claude-sonnet-4-20250514" },
      });
      const preamble = result.messages[0]!.content[0]!.text;

      // Capability block (independent of modelFamily)
      expect(preamble).toContain("[Noesis:");
      // ModelFamily affects section count — claude keeps all sections
      expect(preamble).toContain("Hypotheses:");
      expect(preamble).toContain("Learning:");
    });
  });
});
