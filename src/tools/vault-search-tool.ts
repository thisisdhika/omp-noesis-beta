"use strict";

/**
 * omp-noesis: Vault Search Tool
 * Version: 0.1.0
 *
 * "noesis_vault_search" — search the cognitive vault for stored artifacts
 * (decisions, beliefs, learnings). Returns matching artifacts from the
 * vault backend (Mnemopi, Local, or Obsidian).
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";
import type { AgentToolResult } from "@oh-my-pi/pi-agent-core";
import { createVaultStore } from "../vault/vault-detector.js";

export function buildVaultSearchParams(pi: ExtensionAPI) {
  return pi.zod.object({
    query: pi.zod.string(),
    kind: pi.zod.enum(["decision", "belief", "learning"]).optional(),
    maxResults: pi.zod.number().min(1).max(20).default(10),
  });
}

export async function executeVaultSearch(
  runtime: NoesisRuntime,
  params: { query: string; kind?: "decision" | "belief" | "learning"; maxResults?: number },
): Promise<AgentToolResult<any, any>> {
  const store = await createVaultStore(runtime.projectRoot);
  const valid = await store.validate();
  if (!valid) {
    return {
      content: [{ type: "text", text: "Vault not available or not writable" }],
      isError: true,
      details: { error: "vault_unavailable" },
    };
  }

  const results = await store.search(params.query, params.kind, params.maxResults);

  if (results.length === 0) {
    return {
      content: [{ type: "text", text: `No vault artifacts found matching "${params.query}"` }],
      isError: false,
      details: { count: 0 },
    };
  }

  const formatted = results.map((a, i) =>
    `${i + 1}. [${a.kind}] ${a.id}: ${a.content.slice(0, 200)}${a.content.length > 200 ? "..." : ""}`,
  ).join("\n");

  return {
    content: [{ type: "text", text: `Found ${results.length} vault artifact(s):\n${formatted}` }],
    isError: false,
    details: { count: results.length },
  };
}

export function registerVaultSearchTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_vault_search",
    label: "Noesis: Vault Search",
    description:
  "Search the persistent vault for artifacts stored across sessions — decisions, beliefs, and learning entries from Mnemopi, Local, or Obsidian backends. " +
  "Call when you need historical context from past sessions or durable artifacts not available in current cognitive state. " +
  "Do NOT call for live in-memory state queries; use noesis_recall which returns current session state without vault latency. " +
  "Consequence: searches durable storage through the vault backend; returns matched artifacts with content previews, may be slower than in-memory state recall. " +
  "Fields: query (required), kind (decision|belief|learning), maxResults (optional, default 10, max 20)",
    parameters: buildVaultSearchParams(pi),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return executeVaultSearch(runtime, params);
    },
  });
}
