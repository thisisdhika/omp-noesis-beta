"use strict";

/**
 * omp-noesis: Provider Schema Adaptation
 * Version: 0.1.0
 *
 * Transforms tool JSON Schemas in provider request payloads based on the
 * target model family.  Used by the `before_provider_request` hook to
 * ensure schema compatibility across frontier and small/free models.
 *
 * ## Strategy
 *
 *   family      │ adaptations
 *   ─────────── │ ──────────────────────────────────────────────────────
 *   deepseek    │ remove additionalProperties from object schemas
 *               │ (strict-mode DeepSeek APIs reject it)
 *   mimo, qwen, │ shorten tool descriptions to ≤200 chars
 *   llama       │ (saves context tokens on small-context models)
 *   claude,     │ no changes — frontier models handle full schemas
 *   gpt, gemini │
 *
 * ## Payload shape (OpenAI-compatible)
 *
 *   {
 *     model: "...",
 *     messages: [...],
 *     tools: [
 *       {
 *         type: "function",
 *         function: {
 *           name: "noesis_attend",
 *           description: "...",
 *           parameters: {
 *             type: "object",
 *             properties: { ... },
 *             required: [...],
 *             additionalProperties: false   // ← stripped for deepseek
 *           }
 *         }
 *       }
 *     ]
 *   }
 *
 * Other transport formats (Anthropic Messages API, Google Gemini) use
 * different shapes but always carry a `model` identifier — the module
 * handles them gracefully by checking for a `tools` array of the
 * OpenAI-compatible shape and falling through to the original payload
 * when the shape doesn't match.
 */

import { detectModelFamily, type ModelFamily } from "./model-profile.js";

// ============================================================================
// PUBLIC API
export function adaptProviderPayload(payload: unknown): unknown {
  if (payload === null || typeof payload !== "object") return payload;
  const p = payload as Record<string, unknown>;

  const family = detectFamilyFromPayload(p);
  if (family === "claude" || family === "gpt" || family === "gemini" || family === "unknown") {
    return payload;
  }

  const tools = extractOpenAICompatTools(p);
  if (!tools) return payload;

  // Clone the payload so the caller's reference is not mutated.
  const adapted = { ...p, tools: [] as unknown[] };

  switch (family) {
    case "deepseek":
      adapted.tools = tools.map(adaptForDeepSeek);
      break;
    case "mimo":
    case "qwen":
    case "llama":
      adapted.tools = tools.map(adaptForSmallModel);
      break;
  }

  return adapted;
 }

/**
 * Inject `tool_choice: "required"` for small/free models that need
 * explicit tool-calling coercion.  Frontier models (Claude, GPT,
 * Gemini) and unknown-family payloads are returned unchanged — they
 * handle tool selection without the hint.
 */
export function adaptToolChoice(payload: unknown, family: ModelFamily): unknown {
  if (payload === null || typeof payload !== "object") return payload;
  const p = payload as Record<string, unknown>;

  // Only coerce for small models
  if (family === "claude" || family === "gpt" || family === "gemini" || family === "unknown") {
    return payload;
  }

  // Inject tool_choice: "required" for OpenAI-compatible payloads
  if (!p["tool_choice"]) {
    const adapted = { ...p, tool_choice: "required" };
    return adapted;
  }

  return payload;
}


// ============================================================================
// INTERNALS
// ============================================================================

/** Detect model family from payload, falling back to "unknown". */
export function detectFamilyFromPayload(p: Record<string, unknown>): ModelFamily {
  // OpenAI-compatible: { model: "name" }
  if (typeof p["model"] === "string") {
    return detectModelFamily(p["model"]);
  }
  // Anthropic uses `model` at the top level too
  // Gemini might differ but the fallback is safe
  return "unknown";
}

/** Extract the OpenAI-compatible tools array from a payload, or null. */
function extractOpenAICompatTools(p: Record<string, unknown>): unknown[] | null {
  const tools = p["tools"];
  if (!Array.isArray(tools)) return null;
  // First tool must be an OpenAI-compatible function-tool shape
  const first = tools[0];
  if (
    first !== null &&
    typeof first === "object" &&
    (first as Record<string, unknown>)["type"] === "function"
  ) {
    return tools as unknown[];
  }
  return null;
}

// ---------------------------------------------------------------------------
// DeepSeek: remove additionalProperties from object schemas
// ---------------------------------------------------------------------------

function adaptForDeepSeek(tool: unknown): unknown {
  if (tool === null || typeof tool !== "object") return tool;
  const t = structuredClone(tool) as Record<string, unknown>;
  const fn = t["function"];
  if (fn !== null && typeof fn === "object") {
    const f = fn as Record<string, unknown>;
    const params = f["parameters"];
    if (params !== null && typeof params === "object") {
      f["parameters"] = stripAdditionalProperties(params);
    }
  }
  return t;
}

function stripAdditionalProperties(schema: unknown): unknown {
  if (schema === null || typeof schema !== "object") return schema;
  const s = schema as Record<string, unknown>;

  // Remove from this level
  if ("additionalProperties" in s) {
    const copy = { ...s };
    delete copy["additionalProperties"];
    // Recurse into nested objects
    if (copy["properties"] && typeof copy["properties"] === "object") {
      copy["properties"] = stripFromAllProperties(copy["properties"]);
    }
    if (copy["items"] && typeof copy["items"] === "object") {
      copy["items"] = stripAdditionalProperties(copy["items"]);
    }
    return copy;
  }

  // Recurse into nested objects
  if (s["properties"] && typeof s["properties"] === "object") {
    const copy = { ...s };
    copy["properties"] = stripFromAllProperties(copy["properties"]);
    return copy;
  }

  if (s["items"] && typeof s["items"] === "object") {
    const copy = { ...s };
    copy["items"] = stripAdditionalProperties(copy["items"]);
    return copy;
  }

  return schema;
}

function stripFromAllProperties(properties: unknown): unknown {
  if (properties === null || typeof properties !== "object") return properties;
  const props = properties as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    copy[key] = stripAdditionalProperties(value);
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Small-model: shorten tool descriptions
// ---------------------------------------------------------------------------

const MAX_DESC_LEN = 200;

function adaptForSmallModel(tool: unknown): unknown {
  if (tool === null || typeof tool !== "object") return tool;
  const t = tool as Record<string, unknown>;
  const fn = t["function"];
  if (fn === null || typeof fn !== "object") return tool;

  const f = fn as Record<string, unknown>;
  const desc = f["description"];
  if (typeof desc === "string" && desc.length > MAX_DESC_LEN) {
    const copy = { ...t, function: { ...f, description: truncateDescription(desc) } };
    return copy;
  }

  return tool;
}

function truncateDescription(desc: string): string {
  // Cut at the last full sentence boundary within MAX_DESC_LEN.
  if (desc.length <= MAX_DESC_LEN) return desc;

  const truncated = desc.slice(0, MAX_DESC_LEN);
  // Try to break at the last period or newline within the truncated text.
  const lastPeriod = truncated.lastIndexOf(".");
  const lastNewline = truncated.lastIndexOf("\n");
  const breakPoint = Math.max(lastPeriod, lastNewline);

  if (breakPoint > MAX_DESC_LEN * 0.5) {
    return truncated.slice(0, breakPoint + 1).trim();
  }
  // No good sentence break — cut at the last word boundary.
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0 ? truncated.slice(0, lastSpace).trim() : truncated;
}
