"use strict";

/**
 * Unit tests for provider-schema.ts — schema transformation per model family.
 */

import { describe, it, expect } from "bun:test";
import { adaptProviderPayload } from "../../../src/shared/provider-schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an OpenAI-compatible tools array payload. */
function makePayload(model: string, tools: unknown[]): Record<string, unknown> {
  return { model, messages: [{ role: "user", content: "test" }], tools };
}

/** A single OpenAI-compatible function tool entry. */
function makeTool(name: string, desc: string, params: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "function",
    function: { name, description: desc, parameters: params },
  };
}

// ---------------------------------------------------------------------------
// Null / non-object safety
// ---------------------------------------------------------------------------

describe("adaptProviderPayload", () => {
  it("returns null unchanged", () => {
    expect(adaptProviderPayload(null)).toBeNull();
  });

  it("returns string unchanged", () => {
    expect(adaptProviderPayload("hello")).toBe("hello");
  });

  it("returns payload without tools unchanged", () => {
    const payload = { model: "claude-sonnet-4-6", messages: [] };
    expect(adaptProviderPayload(payload)).toEqual(payload);
  });

  it("returns payload with non-array tools unchanged", () => {
    const payload = { model: "gpt-5.4", tools: "not-an-array" };
    expect(adaptProviderPayload(payload)).toEqual(payload);
  });

  it("returns payload with non-function tools unchanged", () => {
    const payload = { model: "gpt-5.4", tools: [{ type: "custom", data: {} }] };
    expect(adaptProviderPayload(payload)).toEqual(payload);
  });
});

// ---------------------------------------------------------------------------
// Frontier models — no changes
// ---------------------------------------------------------------------------

describe("frontier models — unchanged", () => {
  it("claude payload passes through unmodified", () => {
    const tool = makeTool("test", "A long description that exceeds 200 characters so we can verify it isn't truncated for claude. Extra text to fill space so we are definitely over the 200-char limit for this test.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    });
    const payload = makePayload("claude-sonnet-4-6", [tool]);
    const result = adaptProviderPayload(structuredClone(payload));
    const t = (result as any).tools[0];
    expect(t.function.description).toBe((tool as any).function.description);
    expect(t.function.parameters.additionalProperties).toBe(false);
  });

  it("gpt payload passes through unmodified", () => {
    const tool = makeTool("test", "A very long description that exceeds 200 characters for testing that gpt models do not get description truncation. More text just to make sure we cross that threshold comfortably.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    });
    const payload = makePayload("gpt-5.4", [tool]);
    const result = adaptProviderPayload(structuredClone(payload));
    expect((result as any).tools[0].function.parameters.additionalProperties).toBe(false);
  });

  it("gemini payload passes through unmodified", () => {
    const tool = makeTool("test", "Test", { type: "object", properties: {}, additionalProperties: false });
    const payload = makePayload("google/gemini-3.5-flash", [tool]);
    const result = adaptProviderPayload(structuredClone(payload));
    expect((result as any).tools[0].function.parameters.additionalProperties).toBe(false);
  });

  it("unknown model passes through unmodified", () => {
    const tool = makeTool("test", "Test", { type: "object", properties: {}, additionalProperties: false });
    const payload = makePayload("some-unknown/model", [tool]);
    const result = adaptProviderPayload(structuredClone(payload));
    expect((result as any).tools[0].function.parameters.additionalProperties).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DeepSeek: strips additionalProperties
// ---------------------------------------------------------------------------

describe("deepseek — strips additionalProperties", () => {
  it("removes additionalProperties from root parameters object", () => {
    const tool = makeTool("noesis_attend", "Set focus", {
      type: "object",
      properties: { focus: { type: "string" } },
      required: ["focus"],
      additionalProperties: false,
    });
    const payload = makePayload("deepseek/deepseek-v4-pro", [tool]);
    const result = adaptProviderPayload(structuredClone(payload));
    const params = (result as any).tools[0].function.parameters;
    expect(params.additionalProperties).toBeUndefined();
    expect(params.required).toEqual(["focus"]);
    expect(params.properties.focus.type).toBe("string");
  });

  it("removes additionalProperties from nested object properties", () => {
    const tool = makeTool("noesis_state_inspect", "Query state", {
      type: "object",
      properties: {
        query: { type: "string" },
        nested: {
          type: "object",
          properties: { inner: { type: "string" } },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    });
    const payload = makePayload("deepseek-v4-flash", [tool]);
    const result = adaptProviderPayload(structuredClone(payload));
    const params = (result as any).tools[0].function.parameters;
    expect(params.additionalProperties).toBeUndefined();
    expect(params.properties.nested.additionalProperties).toBeUndefined();
  });

  it("removes additionalProperties from array items", () => {
    const tool = makeTool("noesis_believe_fact", "Store belief fact", {
      type: "object",
      properties: {
        tags: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" } },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    });
    const payload = makePayload("deepseek-v4-pro", [tool]);
    const result = adaptProviderPayload(structuredClone(payload));
    const params = (result as any).tools[0].function.parameters;
    expect(params.additionalProperties).toBeUndefined();
    expect(params.properties.tags.items.additionalProperties).toBeUndefined();
  });

  it("deepseek: description is NOT truncated", () => {
    const longDesc = "A".repeat(300);
    const tool = makeTool("test", longDesc, {
      type: "object",
      properties: {},
      additionalProperties: false,
    });
    const payload = makePayload("deepseek/deepseek-v4-pro", [tool]);
    const result = adaptProviderPayload(structuredClone(payload));
    expect((result as any).tools[0].function.description).toBe(longDesc);
  });
});

// ---------------------------------------------------------------------------
// Small models: truncate descriptions
// ---------------------------------------------------------------------------

describe("small models — description truncation", () => {
  const smallModelIds = [
    "xiaomi/mimo-v2.5",
    "Qwen/Qwen3.6-Plus",
    "meta-llama/Llama-4",
  ];

  for (const modelId of smallModelIds) {
    const family = (modelId.split("/")[0] ?? "").toLowerCase();

    it(`${family}: truncates description > 200 chars`, () => {
      const longDesc =
        "This is a very long tool description that should definitely be truncated because it exceeds the maximum length of two hundred characters. We need to add more text here to make sure we go well past the threshold.";
      const tool = makeTool("test", longDesc, { type: "object", properties: {} });
      const payload = makePayload(modelId, [tool]);
      const result = adaptProviderPayload(structuredClone(payload));
      const desc = (result as any).tools[0].function.description;
      expect(desc.length).toBeLessThanOrEqual(200);
    });

    it(`${family}: leaves short description unchanged`, () => {
      const shortDesc = "Short description";
      const tool = makeTool("test", shortDesc, { type: "object", properties: {} });
      const payload = makePayload(modelId, [tool]);
      const result = adaptProviderPayload(structuredClone(payload));
      expect((result as any).tools[0].function.description).toBe(shortDesc);
    });

    it(`${family}: truncates at sentence boundary when possible`, () => {
      // Build a description with a clear sentence break before 200 chars
      const desc =
        "Call at task start or when focus changes. Sets what you're working on and runs graph queries if provided. Call BEFORE doing the work, not after. Do NOT skip. This extra sentence pushes us well past the 200 character limit so truncation is definitely triggered.";
      const tool = makeTool("test", desc, { type: "object", properties: {} });
      const payload = makePayload(modelId, [tool]);
      const result = adaptProviderPayload(structuredClone(payload));
      const truncated = (result as any).tools[0].function.description;
      expect(truncated.length).toBeLessThanOrEqual(200);
      // It should end with a period (sentence boundary)
      expect(truncated.endsWith(".")).toBe(true);
    });

    it(`${family}: does not modify other tool fields`, () => {
      const tool = makeTool("noesis_attend", "A".repeat(300), {
        type: "object",
        properties: { focus: { type: "string" } },
        required: ["focus"],
        additionalProperties: false,
      });
      const payload = makePayload(modelId, [tool]);
      const result = adaptProviderPayload(structuredClone(payload));
      const t = (result as any).tools[0];
      expect(t.type).toBe("function");
      expect(t.function.name).toBe("noesis_attend");
      expect(t.function.parameters.required).toEqual(["focus"]);
      // additionalProperties stays for small models (not deepseek)
      expect(t.function.parameters.additionalProperties).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// No tools array — unchanged
// ---------------------------------------------------------------------------

describe("no tools array", () => {
  it("payload without tools is unchanged", () => {
    const payload = { model: "deepseek-v4-pro", messages: [] };
    const result = adaptProviderPayload(payload);
    expect(result).toBe(payload);
  });
});

// ---------------------------------------------------------------------------
// Multiple tools
// ---------------------------------------------------------------------------

describe("multiple tools", () => {
  it("adapts all tools in array", () => {
    const tools = [
      makeTool("tool_a", "A".repeat(300), { type: "object", properties: {}, additionalProperties: false }),
      makeTool("tool_b", "B".repeat(300), { type: "object", properties: {}, additionalProperties: false }),
      makeTool("tool_c", "C short", { type: "object", properties: {}, additionalProperties: false }),
    ];
    const payload = makePayload("Qwen/Qwen3.6-Plus", tools);
    const result = adaptProviderPayload(structuredClone(payload));
    const adapted = (result as any).tools;
    expect(adapted[0].function.description.length).toBeLessThanOrEqual(200);
    expect(adapted[1].function.description.length).toBeLessThanOrEqual(200);
    expect(adapted[2].function.description).toBe("C short");
  });

  it("deepseek: strips additionalProperties from all tools", () => {
    const tools = [
      makeTool("a", "desc", { type: "object", properties: {}, additionalProperties: false }),
      makeTool("b", "desc", { type: "object", properties: {}, additionalProperties: false }),
    ];
    const payload = makePayload("deepseek-v4-pro", tools);
    const result = adaptProviderPayload(structuredClone(payload));
    const adapted = (result as any).tools;
    expect(adapted[0].function.parameters.additionalProperties).toBeUndefined();
    expect(adapted[1].function.parameters.additionalProperties).toBeUndefined();
  });
});
