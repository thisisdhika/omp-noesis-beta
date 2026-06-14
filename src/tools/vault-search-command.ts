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
            type: "vault_search",
            message: "No vault backend configured. Run `noesis:init` to connect one.",
            params,
            results: [],
          };
        }

        const maxResults = params.maxResults ?? 10;
        const all = await vault.search(params.query, deps.projectPath, maxResults);
        const filtered = filterByKind(all, params.kind);
        const capped = filtered.slice(0, maxResults);

        return {
          type: "vault_search",
          message:
            capped.length > 0
              ? `Found ${capped.length} result${capped.length === 1 ? "" : "s"}.`
              : "No matching vault artifacts found.",
          params,
          results: capped,
        };
      } catch (err) {
        return {
          type: "vault_search",
          message: `Error: ${err instanceof Error ? err.message : String(err)}`,
          params,
          results: [],
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
