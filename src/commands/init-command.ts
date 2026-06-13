import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { ensureDir } from "../shared/paths.js";

interface InitCommandContext {
  cwd: string;
  ui: { notify: (msg: string) => void };
}

interface YamlApi {
  parse(text: string): Record<string, unknown>;
  stringify(data: unknown): string;
}

declare global {
  var YAML: YamlApi | undefined;
}

const RECOMMENDED: Record<string, unknown> = {
  compaction: {
    enabled: true,
    strategy: "context-full",
    autoContinue: true,
    thresholdTokens: 160000,
  },
};

function loadYaml(path: string): Record<string, unknown> {
  try {
    const raw = readFileSync(path, "utf-8");
    return YAML ? YAML.parse(raw) : JSON.parse(raw);
  } catch {
    return {};
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function formatScalar(value: string | number | boolean): string {
  if (typeof value === "string") {
    return value === "" || /[:#\-\n\r\t]|^\s|\s$/.test(value) ? JSON.stringify(value) : value;
  }
  return String(value);
}

function toYaml(data: Record<string, unknown>, indent = 0): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (isPlainRecord(value)) {
      lines.push(`${pad}${key}:`);
      lines.push(toYaml(value, indent + 1));
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${pad}${key}: []`);
        continue;
      }

      lines.push(`${pad}${key}:`);
      for (const item of value) {
        if (isPlainRecord(item)) {
          lines.push(`${pad}  -`);
          lines.push(toYaml(item, indent + 2));
        } else if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
          lines.push(`${pad}  - ${formatScalar(item)}`);
        }
      }
      continue;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      lines.push(`${pad}${key}: ${formatScalar(value)}`);
    }
  }

  return lines.join("\n");
}

function saveYaml(path: string, data: Record<string, unknown>): void {
  const yaml = globalThis.YAML;
  writeFileSync(path, yaml ? yaml.stringify(data) : `${toYaml(data)}\n`);
}

function mergeSettings(current: Record<string, unknown>, recommended: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current };

  for (const [key, recommendedValue] of Object.entries(recommended)) {
    const currentValue = current[key];
    merged[key] = isPlainRecord(recommendedValue)
      ? mergeSettings(asRecord(currentValue), recommendedValue)
      : recommendedValue;
  }

  return merged;
}

function normalizeSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const compaction = asRecord(settings.compaction);
  delete compaction.reserveTokens;
  delete compaction.keepRecentTokens;
  delete compaction.idleThresholdTokens;
  return { ...settings, compaction };
}

export function createInitCommandHandler() {
  return async function handleInit(_args: string, ctx: InitCommandContext) {
    const configPath = join(ctx.cwd, ".omp", "config.yml");
    const existed = existsSync(configPath);
    const updated = normalizeSettings(mergeSettings(existed ? loadYaml(configPath) : {}, RECOMMENDED));

    ensureDir(dirname(configPath));
    saveYaml(configPath, updated);

    ctx.ui.notify(
      `[noesis] ${existed ? "Updated" : "Created"} project OMP config at ${configPath}\n` +
      "Restart OMP or start a new session to ensure the updated project settings are reloaded.",
    );
  };
}
