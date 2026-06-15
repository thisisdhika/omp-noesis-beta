"use strict";

/**
 * omp-noesis: Vault Search Tool (stub)
 * Version: 0.1.0
 *
 * "noesis_vault_search" — search knowledge base vaults for relevant
 * context.  This is a forward-compatible stub that will be implemented
 * in Phase 4 when vault backends (Obsidian, local, Mnemopi, Hindsight)
 * are integrated.
 */

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { NoesisRuntime } from "../runtime.js";

export function registerVaultSearchTool(pi: ExtensionAPI, runtime: NoesisRuntime): void {
  pi.registerTool({
    name: "noesis_vault_search",
    label: "Noesis: Vault Search",
    description:
      "Search knowledge base vaults (Obsidian, local, Mnemopi, Hindsight) for " +
      "relevant context.  Currently a placeholder — vault backends will be " +
      "integrated in a future release.",
    parameters: pi.zod.object({
      query: pi.zod.string().max(500),
      kind: pi.zod.enum(["all", "decision", "learning", "belief"]).default("all"),
      maxResults: pi.zod.number().min(1).max(20).default(5),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return {
        content: [
          {
            type: "text",
            text:
              "Vault search not yet available. Install a vault backend " +
              "(Obsidian, local, Mnemopi, or Hindsight).",
          },
        ],
        details: {
          query: params.query,
          kind: params.kind,
          maxResults: params.maxResults,
          available: false,
        },
        isError: false,
      };
    },
  });
}
