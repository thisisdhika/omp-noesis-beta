import type { VaultStore } from "../vault/vault-store.js";
import type { NoesisVaultSearchParams, VaultArtifact, VaultArtifactKind } from "../schema.js";
import { NoesisVaultSearchParamsSchema } from "../schema.js";

interface VaultSearchDeps {
  vault?: VaultStore;
  projectPath: string;
}

export function createVaultSearchTool(deps: VaultSearchDeps) {
  return {
    name: "noesis_vault_search",
    label: "Noesis Vault Search",
    description:
      "Search the cognitive vault for past artifacts — decisions, beliefs, learnings, or patterns.",
    parameters: NoesisVaultSearchParamsSchema,
    async execute(
      _toolCallId: string,
      params: NoesisVaultSearchParams,
    ) {
      try {
        const vault = deps.vault;
        if (!vault) {
          return {
            content: [{ type: "text", text: "No vault backend configured. Run `noesis:init` to connect one." }],
          };
        }

        const maxResults = params.maxResults ?? 10;
        const all = await vault.search(params.query, deps.projectPath, maxResults);
        const filtered = filterByKind(all, params.kind);
        const capped = filtered.slice(0, maxResults);

        return {
          content: [{ type: "text", text: JSON.stringify({ message: `Found ${capped.length} result${capped.length === 1 ? "" : "s"}.`, results: capped }) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        };
      }
    },
  };
}

function filterByKind(
  artifacts: VaultArtifact[],
  kind?: VaultArtifactKind | "all",
): VaultArtifact[] {
  if (!kind || kind === "all") return artifacts;
  return artifacts.filter((a) => a.kind === kind);
}
