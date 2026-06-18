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
import { createVaultStore } from "../vault/vault-detector.js";

export function registerVaultSearchTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_vault_search",
    label: "Noesis: Vault Search",
    description:
  "Search persistent vault (cross-session memory). Call when: looking for past " +
  "decisions, beliefs, or learnings stored in Mnemopi or Obsidian. " +
  "Do NOT call for live current state — use noesis_recall.",
    parameters: pi.zod.object({
      query: pi.zod.string().min(1).max(200),
      kind: pi.zod.enum(["decision", "belief", "learning"]).optional(),
      maxResults: pi.zod.number().min(1).max(20).default(10),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
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
        `${i + 1}. [${a.kind}] ${a.id}: ${a.content.slice(0, 200)}${a.content.length > 200 ? "..." : ""}`
      ).join("\n");

      return {
        content: [{ type: "text", text: `Found ${results.length} vault artifact(s):\n${formatted}` }],
        isError: false,
        details: { count: results.length },
      };
    },
  });
}
