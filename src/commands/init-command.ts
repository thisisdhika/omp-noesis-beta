import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { ensureDir } from "../shared/paths.js";

interface InitCommandContext {
  cwd: string;
  ui: { notify: (msg: string) => void };
}

const RECOMMENDED: Record<string, unknown> = {
  compaction: {
    enabled: true,
    strategy: "context-full",
    autoContinue: true,
    thresholdTokens: 160000,
  },
};

interface SettingDiff {
  key: string;
  current: unknown;
  recommended: unknown;
}

function findDiffs(current: Record<string, unknown>, recommended: Record<string, unknown>, prefix = ""): SettingDiff[] {
  const diffs: SettingDiff[] = [];
  for (const [key, recVal] of Object.entries(recommended)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const curVal = current[key];
    if (isPlainRecord(recVal)) {
      diffs.push(...findDiffs(asRecord(curVal), recVal, fullKey));
    } else if (curVal !== recVal) {
      diffs.push({ key: fullKey, current: curVal, recommended: recVal });
    }
  }
  return diffs;
}

interface YamlApi {
  parse(text: string): Record<string, unknown>;
  stringify(data: unknown): string;
}

function getYaml(): YamlApi | null {
  const value = (globalThis as { YAML?: YamlApi }).YAML;
  return value ?? null;
}

function loadYaml(path: string): Record<string, unknown> {
  try {
    const raw = readFileSync(path, "utf-8");
    const yaml = getYaml();
    if (yaml) return yaml.parse(raw);
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function asRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function formatScalar(value: string | number | boolean): string {
  if (typeof value === "string") {
    if (value === "" || /[:#\-\n\r\t]|^\s|\s$/.test(value)) {
      return JSON.stringify(value);
    }
    return value;
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
        } else if (
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean"
        ) {
          lines.push(`${pad}  - ${formatScalar(item)}`);
        }
      }
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      lines.push(`${pad}${key}: ${formatScalar(value)}`);
    }
  }

  return lines.join("\n");
}
function normalizeNoesisCompactionSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...settings };
  const compaction = asRecord(merged.compaction);

  delete compaction.reserveTokens;
  delete compaction.keepRecentTokens;
  delete compaction.idleThresholdTokens;

  merged.compaction = compaction;
  return merged;
}

function mergeSettings(
  current: Record<string, unknown>,
  recommended: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current };

  for (const [key, recommendedValue] of Object.entries(recommended)) {
    const currentValue = current[key];
    merged[key] = isPlainRecord(recommendedValue)
      ? mergeSettings(asRecord(currentValue), recommendedValue)
      : recommendedValue;
  }

  return merged;
}
function saveYaml(path: string, data: Record<string, unknown>): void {
  const yaml = getYaml();
  const content = yaml ? yaml.stringify(data) : `${toYaml(data)}\n`;
  writeFileSync(path, content);
}

export function createInitCommandHandler() {
  return async function handleInit(_args: string, ctx: InitCommandContext) {
    const configPath = join(ctx.cwd, ".omp", "config.yml");
    const existed = existsSync(configPath);
    const current = existed ? loadYaml(configPath) : {};
    const diffs = findDiffs(current, RECOMMENDED);

    if (diffs.length === 0) {
      ctx.ui.notify("[noesis] Project OMP settings are already optimal for noesis.");
      return;
    }

    ensureDir(dirname(configPath));

    if (existed) {
      copyFileSync(configPath, `${configPath}.noesis-backup`);
    }

    const updated = normalizeNoesisCompactionSettings(
      mergeSettings(current, RECOMMENDED),
    );
    saveYaml(configPath, updated);

    const diffSummary = diffs
      .map((diff) => `  ${diff.key}: ${diff.current ?? "(missing)"} → ${diff.recommended}`)
      .join("\n");

    const action = existed ? "Updated" : "Created";
    const backupNote = existed ? ` (backup: ${configPath}.noesis-backup)` : "";
    ctx.ui.notify(
      `[noesis] ${action} project OMP config at ${configPath}${backupNote}\n` +
      `Applied settings:\n${diffSummary}\n\n` +
      "Restart OMP or start a new session to ensure the updated project settings are reloaded.",
    );
  };
}
