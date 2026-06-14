import { existsSync, readFileSync } from "node:fs";

interface YamlApi {
  parse(text: string): unknown;
  stringify(data: unknown): string;
}


function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseYamlScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number.parseFloat(trimmed);
  if (trimmed === "[]") return [];
  if (trimmed === "{}") return {};
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return trimmed;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function nextMeaningfulIndex(lines: string[], start: number): number {
  for (let index = start; index < lines.length; index += 1) {
    const trimmed = lines[index]!.trim();
    if (trimmed !== "" && !trimmed.startsWith("#")) return index;
  }
  return -1;
}

function parseBlock(
  lines: string[],
  start: number,
  indent: number,
): { value: Record<string, unknown> | unknown[]; next: number } {
  const object: Record<string, unknown> = {};
  const array: unknown[] = [];
  let mode: "object" | "array" | null = null;
  let index = start;

  while (index < lines.length) {
    const raw = lines[index]!;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      index += 1;
      continue;
    }

    const currentIndent = indentOf(raw);
    if (currentIndent < indent) break;
    if (currentIndent > indent) {
      index += 1;
      continue;
    }

    const line = raw.slice(indent);
    if (line.startsWith("- ")) {
      mode = mode ?? "array";
      if (mode !== "array") break;

      const rest = line.slice(2).trim();
      if (rest === "") {
        const child = parseBlock(lines, index + 1, indent + 2);
        array.push(child.value);
        index = child.next;
        continue;
      }

      array.push(parseYamlScalar(rest));
      index += 1;
      continue;
    }

    mode = mode ?? "object";
    if (mode !== "object") break;

    const colon = line.indexOf(":");
    if (colon === -1) {
      index += 1;
      continue;
    }

    const key = line.slice(0, colon).trim();
    const rest = line.slice(colon + 1).trim();
    if (rest !== "") {
      object[key] = parseYamlScalar(rest);
      index += 1;
      continue;
    }

    const childStart = nextMeaningfulIndex(lines, index + 1);
    if (childStart === -1 || indentOf(lines[childStart]!) <= indent) {
      object[key] = {};
      index += 1;
      continue;
    }

    const child = parseBlock(lines, index + 1, indent + 2);
    object[key] = child.value;
    index = child.next;
  }

  return { value: mode === "array" ? array : object, next: index };
}

export function parseYamlRecord(text: string): Record<string, unknown> {
  const yaml = (globalThis as { YAML?: YamlApi }).YAML;
  if (yaml) return asRecord(yaml.parse(text));
  return asRecord(parseBlock(text.split(/\r?\n/), 0, 0).value);
}

export function readYamlFile(path: string): Record<string, unknown> {
  try {
    if (!existsSync(path)) return {};
    return parseYamlRecord(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}
