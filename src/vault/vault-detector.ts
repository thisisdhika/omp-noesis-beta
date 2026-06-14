import { existsSync } from "node:fs";
import { join } from "node:path";
import { readYamlFile } from "../shared/simple-yaml.js";
import type { VaultStore } from "./vault-store.js";
import { NoopVaultStore } from "./noop-vault-store.js";
import { LocalVaultStore } from "./local-vault-store.js";
import { MnemopiVaultStore } from "./mnemopi-vault-store.js";
import { ObsidianVaultStore } from "./obsidian-vault-store.js";
import { HindsightVaultStore } from "./hindsight-vault-store.js";

/**
 * Detect and instantiate the correct VaultStore backend.
 *
 * Resolution order (project config → global config):
 * 1. Obsidian vault path configured in noesis config → ObsidianVaultStore
 * 2. OMP memory.backend setting → corresponding VaultStore
 * 3. Neither → NoopVaultStore
 *
 * Returns the store and a diagnostic label for the preamble.
 */
export interface VaultDetectionResult {
  store: VaultStore;
  label: string;
}

interface OmpConfig {
  settings?: {
    memory?: {
      backend?: string;
    };
  };
  noesis?: {
    obsidianVaultPath?: string;
    projectId?: string;
    hindsight?: {
      apiUrl?: string;
      apiToken?: string;
    };
  };
}

function mergeConfig(projectCfg: OmpConfig, globalCfg: OmpConfig): OmpConfig {
  return {
    settings: {
      ...globalCfg.settings,
      ...projectCfg.settings,
      memory: {
        ...globalCfg.settings?.memory,
        ...projectCfg.settings?.memory,
      },
    },
    noesis: {
      ...globalCfg.noesis,
      ...projectCfg.noesis,
      hindsight: {
        ...globalCfg.noesis?.hindsight,
        ...projectCfg.noesis?.hindsight,
      },
    },
  };
}
function resolveObsidianVaultPath(root: string, cfg: OmpConfig): string | null {
  const configuredPath = cfg.noesis?.obsidianVaultPath;
  if (configuredPath && existsSync(configuredPath)) return configuredPath;

  const projectVaultPath = join(root, ".obsidian");
  if (existsSync(projectVaultPath)) return root;

  return null;
}


export function detectVault(root: string): VaultDetectionResult {
  const projectConfigPath = join(root, ".omp", "config.yml");
  const globalConfigPath = join(process.env.HOME ?? "~", ".omp", "config.yml");

  const projectCfg = readYamlFile(projectConfigPath) as OmpConfig;
  const globalCfg = readYamlFile(globalConfigPath) as OmpConfig;
  const cfg = mergeConfig(projectCfg, globalCfg);

  const obsidianPath = resolveObsidianVaultPath(root, cfg);
  if (obsidianPath) {
    const store = new ObsidianVaultStore(obsidianPath, root);
    return { store, label: `Obsidian (${obsidianPath})` };
  }

  // Check OMP memory backend
  const backend = cfg?.settings?.memory?.backend ?? "off";
  switch (backend) {
    case "local":
      return { store: new LocalVaultStore(root), label: "local" };
    case "mnemopi":
      return { store: new MnemopiVaultStore(root), label: "mnemopi" };
    case "hindsight": {
      const hindsightUrl =
        cfg?.noesis?.hindsight?.apiUrl ??
        process.env["HINDSIGHT_API_URL"] ??
        "http://localhost:3040";
      const hindsightToken =
        cfg?.noesis?.hindsight?.apiToken ??
        process.env["HINDSIGHT_API_TOKEN"] ??
        "";
      return {
        store: new HindsightVaultStore(hindsightUrl, hindsightToken, root),
        label: `hindsight (${hindsightUrl})`,
      };
    }
    case "off":
    default:
      return { store: new NoopVaultStore(), label: "none (memory.backend: off)" };
  }
}
