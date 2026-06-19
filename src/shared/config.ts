"use strict";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let _parseYaml: ((text: string) => unknown) | null = null;
async function getYamlParser(): Promise<(text: string) => unknown> {
  if (!_parseYaml) {
    // OMP bundles yaml — lazily loaded to avoid hard dependency at compile time
    const mod = await import("yaml");
    _parseYaml = mod.parse.bind(mod);
  }
  return _parseYaml!;
}

export interface NoesisGraphifyConfig {
  autoUpdate: boolean;
  updateOnAttend: boolean;
  maxUpdateInterval: number; // minutes
}

export const DEFAULT_GRAPHIFY_CONFIG: NoesisGraphifyConfig = {
  autoUpdate: true,
  updateOnAttend: true,
  maxUpdateInterval: 15,
};

/**
 * Read noesis-specific config from .omp/config.yml.
 * Gracefully falls back to defaults when config is absent or malformed.
 */
export async function readNoesisConfig(projectRoot: string): Promise<NoesisGraphifyConfig> {
  const configPath = join(projectRoot, ".omp", "config.yml");
  if (!existsSync(configPath)) return { ...DEFAULT_GRAPHIFY_CONFIG };
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parse = await getYamlParser();
    const parsed = parse(raw) as Record<string, unknown>;
    const g = (parsed?.noesis as Record<string, unknown>)?.graphify as Record<string, unknown> | undefined;
    if (!g) return { ...DEFAULT_GRAPHIFY_CONFIG };
    return {
      autoUpdate: (g.autoUpdate as boolean | undefined) ?? DEFAULT_GRAPHIFY_CONFIG.autoUpdate,
      updateOnAttend: (g.updateOnAttend as boolean | undefined) ?? DEFAULT_GRAPHIFY_CONFIG.updateOnAttend,
      maxUpdateInterval: (g.maxUpdateInterval as number | undefined) ?? DEFAULT_GRAPHIFY_CONFIG.maxUpdateInterval,
    };
  } catch {
    return { ...DEFAULT_GRAPHIFY_CONFIG };
  }
}
