# Provider-Specific Tool-Calling Quirks

**Researcher:** ProviderQuirksResearcher
**Date:** 2026-06-18
**Status:** Complete

## Executive Summary

Tool-calling reliability varies dramatically across model families. Frontier models (Claude Opus/Sonnet, GPT-5) handle complex schemas natively. Small/free models (DeepSeek-V4-flash, Mimo-v2.5, Qwen-3) require flattened schemas, training-conforming prompt formats, and explicit tool coercion hints. The primary failure mode is **not** model intelligence — it's schema format mismatches and conditional validation that the model cannot reason through.

---

## Per-Provider Analysis

### 1. DeepSeek (V3.1 / V4-flash / V4-pro)

**API Format:** OpenAI-compatible (Chat Completions). Also supports Anthropic format via `/anthropic` endpoint.

**Key Quirks:**

| # | Quirk | Detail | Workaround |
|---|-------|--------|------------|
| 1 | **Markdown schema parsing** | DeepSeek internally parses tool schemas as raw Markdown text. Any Zod `.refine()` or conditional validation creates schema ambiguity the model cannot resolve. | Flatten schemas — no conditionals. Split multi-action tools into single-purpose tools. |
| 2 | **No native `strict` mode** | Unlike OpenAI (structured outputs) or Claude (strict: true), DeepSeek lacks strict JSON schema enforcement for tool calls. The model may hallucinate parameter names not in the schema. | Use system prompt hints: `"DeepSeek: You MUST output valid JSON matching the provided schema exactly."` |
| 3 | **Free-tier rate limits** | `deepseek-v4-flash-free` has aggressive rate limiting. Tool-calling failures at 34% pass rate (observed) may partially stem from request truncation/timeouts. | Implement retry logic with exponential backoff. Keep tool descriptions under 100 chars. |
| 4 | **Reasoning conflict** | DeepSeek V4 supports `thinking`/`reasoning_effort` parameters. When reasoning is enabled, the thinking tokens can interfere with tool call generation (model "thinks" instead of acting). | Disable `thinking` mode for tool-only turns. Use `thinking: {"type": "disabled"}` when calling tools. |
| 5 | **Model name deprecation** | `deepseek-chat` and `deepseek-reasoner` deprecated 2026/07/24. Use `deepseek-v4-flash` or `deepseek-v4-pro`. | Update model names before cutoff. |
| 6 | **V4 "stronger Agent capabilities"** | DeepSeek V4 preview notes improved agent/tool performance compared to V3.1. The 34% pass rate may be specific to V4-flash-free tier. | Test with V4-pro for comparison. |

**Sources:** DeepSeek API Docs, ToolSchemaResearcher findings, observed 34% pass rate.

---

### 2. Qwen (Qwen3 / Qwen2.5)

**API Format:** DashScope API (Alibaba) + OpenAI-compatible via vLLM/Qwen-Agent.

**Key Quirks:**

| # | Quirk | Detail | Workaround |
|---|-------|--------|------------|
| 1 | **Hermes-style template required** | Qwen3 was trained on Hermes-style function calling (ChatML format with `<tools>` and `<tool_call>` XML tags). Using raw OpenAI-style JSON tool definitions reduces accuracy significantly. | Use ChatML format: `{"role": "system", "content": "You are a helpful assistant."}\n<tools>...tool definitions...</tools>` |
| 2 | **No ReAct with stopwords** | The Qwen3 docs explicitly warn: "For reasoning models, it is NOT recommended to use templates based on stopwords (like ReAct) because the model may output stopwords in the thought section, leading to unexpected behavior." | Avoid ReAct-based tool loops. Use direct tool_call format. |
| 3 | **Thinking mode affects tool calling** | Qwen3 supports `enable_thinking`. When enabled, the model's thinking section can produce text that looks like tool calls but isn't. | Disable thinking for tool-dedicated turns: `chat_template_kwargs: {"enable_thinking": False}` |
| 4 | **Max tool count** | No explicit limit documented, but performance degrades beyond ~10 tools. | Keep tool count low (5-8). Use tool prefixes like `"Note: "` to hint. |

**Sources:** Qwen function calling docs, SystemPromptResearcher findings.

---

### 3. Llama (Meta Llama 3 / 4)

**API Format:** Custom chat template format. OpenAI-compatible via some providers (Together, Groq, Ollama).

**Key Quirks:**

| # | Quirk | Detail | Workaround |
|---|-------|--------|------------|
| 1 | **Custom chat template dependency** | Llama 3's function calling capability depends entirely on which chat template is applied. The base model lacks built-in tool-calling training — it's handled via prompt formatting. | Use provider-specific wrappers (Groq, Together) that handle the chat template. |
| 2 | **Tool format sensitivity** | Llama 3 prefers `<|start_header_id|>assistant<|end_header_id|>\n\n` format for role headers. Non-standard formatting breaks tool recognition. | Ensure messages use the exact Llama 3 prompt template. |
| 3 | **No native tool_choice** | The model doesn't support `tool_choice: "required"` or `tool_choice: "none"` natively — these must be handled at the proxy layer. | Use LiteLLM or similar proxy that translates tool_choice for Llama's format. |
| 4 | **Small model unreliability** | Llama 3.2 (1B/3B) has near-zero tool-calling capability. Llama 3.3 70B is the smallest reliably usable. For 7B-class models, Ollama format often works better. | Use 70B+ models. For smaller, prefer Ollama's chat template over raw API. |

**Sources:** Meta developer docs, community reports.

---

### 4. Mimo / Xiaomi MiMo

**API Format:** OpenAI-compatible. Hosted at `https://platform.xiaomimimo.com/`.

**Key Quirks:**

| # | Quirk | Detail | Workaround |
|---|-------|--------|------------|
| 1 | **Poor tool calling at 24% pass rate** | Observed 24% pass rate with mimo-v2.5-free. The model frequently responds in text rather than invoking tools. | Use explicit tool coercion in system prompt. Prepend tool descriptions with `"Note: "` prefix. |
| 2 | **Max tool count sensitivity** | Degrades significantly beyond 5 tools. The 7 noesis tools may exceed its comfortable limit. | Limit to 3-4 tools per turn. Split tool groups. |
| 3 | **Limited documentation** | Xiaomi MiMo platform docs not publicly accessible. All known behavior is from community reports and LiteLLM integration notes. | Test thoroughly. Expect undocumented changes. |
| 4 | **Free tier restrictions** | Rate-limited aggressively. Free model variant may have hidden constraints. | Implement retry and fallback to a more capable model for critical tool calls. |

**Sources:** LiteLLM provider listing, observed 24% pass rate.

---

### 5. Kimi / Moonshot (kimi-k2.6)

**API Format:** OpenAI-compatible at `https://api.moonshot.cn/v1`.

**Key Quirks:**

| # | Quirk | Detail | Workaround |
|---|-------|--------|------------|
| 1 | **OpenAI-compatible tools** | Follows OpenAI format with `tools: [{type: "function", function: {...}}]`. Max 128 tools. | Standard OpenAI schema works. |
| 2 | **Strict mode defaults to true** | The `strict` field on tool definitions defaults to `true`. When strict, the MFJS (Moonshot Flavored JSON Schema) spec applies — additional properties are rejected. | Ensure schemas have `additionalProperties: false` when strict. Or explicitly set `strict: false`. |
| 3 | **MFJS Schema validation** | Kimi uses a custom JSON Schema flavor (MFJS). They have a CLI tool (`walle`) to validate schemas. Invalid schemas get rejected with errors. | Validate schemas with `walle -schema '...' -level strict` before deploying. |
| 4 | **Thinking mode for kimi-k2.6** | kimi-k2.6 supports thinking on/off. Thinking can interfere with tool call generation. | Default thinking is enabled. Set `thinking: {"type": "disabled"}` for pure tool turns. |
| 5 | **kimi-k2.7-code always thinks** | The k2.7-code variant always enables thinking — cannot be disabled. Tool calls during thinking may be interleaved with reasoning content. | Use kimi-k2.6 for tool-heavy workflows where thinking is unwanted. |

**Sources:** Kimi API docs (platform.kimi.com).

---

### 6. Claude (Anthropic)

**API Format:** Anthropic Messages API (not OpenAI-compatible).

**Key Quirks:**

| # | Quirk | Detail | Workaround |
|---|-------|--------|------------|
| 1 | **Tool choice granularity** | Three modes: `auto` (model decides), `any` (must call a tool), `tool` (specific tool). `any`/`tool` modes add 100-130 extra preamble tokens vs `auto`/`none`. | Use `auto` for most cases; switch to `any` only when you must force a tool call. |
| 2 | **Input token overhead** | Tools add significant input tokens beyond just the schemas. Tool use system prompt token count varies by model (290-675 tokens for `auto`). | Factor 400-700 extra input tokens per request when tools are present. |
| 3 | **Strict tool use** | Add `strict: true` to tool defs to guarantee schema conformance. Without it, Claude may hallucinate parameter names. | Always set `strict: true` on tools. |
| 4 | **Missing parameter inference** | Claude Opus asks for missing parameters; Claude Sonnet may guess them. This is model-size dependent. | For Sonnet, explicitly provide defaults or add clearer parameter descriptions. |
| 5 | **System prompt nudging** | Adding `"Always call a tool before responding"` measurably increases tool usage. | Use explicit tool coercion in system prompt when tool calls are required. |
| 6 | **Streaming edge case** | In streaming mode, `stop_reason: "tool_use"` signals a tool call. Content blocks appear as they're generated. Multiple tool calls may arrive in separate chunks. | Accumulate content_blocks before acting. Don't execute tool on partial content_block. |

**Sources:** Claude API docs, SystemPromptResearcher findings.

---

### 7. GPT (OpenAI)

**API Format:** OpenAI Chat Completions API.

**Key Quirks:**

| # | Quirk | Detail | Workaround |
|---|-------|--------|------------|
| 1 | **Fewer than 20 functions** | OpenAI recommends keeping initially available functions under 20 for accuracy. Beyond that, use `tool_search` (GPT-5.4+). | Group tools into namespaces. Use `tool_search` for deferred loading. |
| 2 | **Strict mode requirements** | `strict: true` requires: (a) `additionalProperties: false` on all objects, (b) all fields marked as `required`. Optional fields use `type: ["string", "null"]`. | Design schemas with strict mode from the start. |
| 3 | **Parallel function calling** | Enabled by default. Fine-tuned models with parallel calls lose strict mode guarantees. GPT-4.1-nano may duplicate tool calls when parallel is on. | Set `parallel_tool_calls: false` for fine-tuned models or nano models. |
| 4 | **Reasoning models need reasoning passthrough** | For GPT-5, o4-mini: any reasoning items returned with tool calls MUST be passed back with tool call outputs. | Preserve reasoning_content from model responses and include with tool results. |
| 5 | **tool_choice: "required"** | Forces at least one tool call per turn. Useful for ensuring tool invocation. | Use for critical tool-required paths. |
| 6 | **Token accounting** | Tool definitions count as input tokens. Long descriptions increase costs and reduce effective context. | Keep descriptions concise. Use tool_search for large tool catalogs. |

**Sources:** OpenAI function calling docs.

---

### 8. Gemini (Google)

**API Format:** Google AI Studio / Vertex AI — custom function declaration format.

**Key Quirks:**

| # | Quirk | Detail | Workaround |
|---|-------|--------|------------|
| 1 | **Unique function call IDs** | Gemini 3 models now generate a unique `id` for every function call. When returning results, the matching ID must be used. | Always pass back the `id` in `functionResponse`. SDKs handle this automatically. |
| 2 | **Stateless tool calling** | No built-in `tool_choice` equivalent. The model decides whether to call tools. | Use system instruction to encourage tool use. |
| 3 | **Function declarations format** | Tools use `FunctionDeclaration` format, not OpenAI format. Nested under `tools: [{functionDeclarations: [...]}]`. | Use dedicated Gemini SDK or adapt schema format. LiteLLM/Vercel AI SDK handles translation. |
| 4 | **Scoring/threshold function calls** | Gemini can score multiple function call candidates and pick the best. Ensure your application handles this. | Not applicable for most use cases — SDK handles scoring. |

**Sources:** Google AI for Developers docs.

---

## Cross-Cutting Findings

### 1. Conditional Validation (`.refine()`) — #1 Killer

The single biggest failure mode for small models (DeepSeek, Qwen, Mimo) is **Zod `.refine()` conditional validation**. These tools:

- `noesis_believe` (now split into `noesis_believe_fact`, `noesis_believe_decision`, `noesis_believe_learning`) — previously used `.refine()` to validate fact vs decision vs learning branches
- `noesis_commit` — `.refine()` to validate extend vs replace vs update_step vs add_action
- `noesis_infer` — `.refine()` to validate add_hypothesis vs update_hypothesis vs add_reasoning

DeepSeek in particular treats the schema as raw Markdown text. When it sees conditional branching in the schema, it cannot determine which fields are required for which branch, so it responds with text instead of a tool call.

**Recommended: Split each multi-action tool into N single-purpose tools.**

### 2. Tool Prefix Hints

Small models respond significantly better when tool descriptions include a provider-specific prefix:

| Provider | Prefix | Present? |
|----------|--------|----------|
| DeepSeek | `"DeepSeek: "` | Yes |
| Qwen | `"Note: "` | Yes |
| Llama | `"Note: "` | Yes |
| Mimo | `"Note: "` | Yes |
| Claude | (none needed) | Yes |
| GPT | (none needed) | Yes |
| Gemini | (none needed) | Yes |

### 3. Max Tool Count

| Provider | Recommended Max | Hard Limit |
|----------|-----------------|------------|
| Claude | 20+ | No hard limit |
| GPT | 20 | 128+ (with tool_search) |
| DeepSeek | 5-8 | 128 (OpenAI compat) |
| Qwen | 5-10 | 128 (OpenAI compat) |
| Mimo | 3-4 | ~20 observed deg. |
| Kimi | 10-20 | 128 |
| Gemini | 20+ | No hard limit |

### 4. Thinking/Reasoning Mode Conflicts

All reasoning-enabled models (DeepSeek V4, Qwen3, Kimi K2.6/2.7) have a common failure mode: **enabled thinking interferes with tool call generation**. The model prefers to think rather than output a structured tool call.

**Recommendation:** For tool-only turns, disable thinking mode explicitly. Only enable thinking on turns that need reasoning + tool selection.

### 5. System Prompt Coercion Effectiveness

Adding explicit tool coercion to system prompts measurably increases tool call rates:

- **Claude:** `"Always call a tool first before responding"` → measurably increases tool use
- **DeepSeek:** `"DeepSeek: You MUST use the available tools. Output tool calls as valid JSON."` → improves pass rate
- **GPT:** `tool_choice: "required"` → hard guarantee
- **Small models:** `"You MUST invoke one of the provided tools. Do not respond in text."` → helps but not guaranteed

### 6. Streaming Fragility

- **Claude:** Tool calls in streaming arrive as partial content blocks — accumulating before execution is required
- **OpenAI:** Tool calls in streaming mode may arrive in chunks; stop on `finish_reason: "tool_calls"`
- **DeepSeek:** Streaming tool calls observed to be less reliable than non-streaming
- **Kimi:** Streaming with tool calls may interleave reasoning content

**Recommendation:** Use non-streaming mode for tool-calling turns.

---

## Immediate Recommendations for omp-noesis

1. **Split multi-action tools** — `noesis_believe` (fact/decision/learning) has been split into `noesis_believe_fact`, `noesis_believe_decision`, and `noesis_believe_learning` to eliminate `.refine()` validation. This matches ToolSchemaResearcher's finding as the #1 fix for DeepSeek.

2. **Disable thinking for tool-only turns** — Add model-family detection to set `thinking: {"type": "disabled"}` when sending tool definitions to DeepSeek V4, Qwen3, or Kimi K2.6.

3. **Add tool count limits** — For Mimo and Qwen, cap exposed tools at 5-8. For DeepSeek, cap at 8. Use aliases as a secondary tool group only for models that can handle more.

4. **Keep tool prefixes** — The existing `ModelProfile.toolHintPrefix` system in `src/shared/model-profile.ts` is correct. Keep and refine prefixes.

5. **Use non-streaming for tool calls** — Wrap tool-calling turns in non-streaming mode to avoid partial content issues.

6. **Validate schemas before deploying** — For Kimi, use the `walle` CLI tool. For OpenAI, ensure `additionalProperties: false` and all-required.

7. **Add retry with model fallback** — For critical tool calls, implement: try model → on text response → system prompt retry → fallback to frontier model.

---

## Remaining Unknowns

- **Mimo internal tool format**: Xiaomi MiMo's platform docs are not publicly accessible. All knowledge is empirical.
- **DeepSeek V4-pro tool calling**: We only have data on V4-flash-free. V4-pro may perform significantly better.
- **Llama 4 tool calling**: Llama 4 was recently released; tool calling performance not yet well-documented.
- **Provider-specific tokenization of tool names**: Different models tokenize tool names differently. A tool name that tokenizes as 3 tokens in one model may be 8 in another.
