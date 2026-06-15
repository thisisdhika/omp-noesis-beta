"use strict";

/**
 * omp-noesis: Obsidian Vault Store
 * Version: 0.1.0
 *
 * Implements the VaultStore interface for Obsidian vaults.
 * Projects artifacts as Markdown notes with YAML frontmatter
 * under `.obsidian/noesis/{kind}/{id}.md`.
 *
 * Writing is synchronous and atomic (temp-then-rename);
 * reading and searching use async file I/O and Bun.spawn.
 */

import type { VaultStore, VaultArtifact, VaultPullResult } from "./vault-store.js";
import { writeObsidianNote } from "./obsidian-writer.js";
import { mergeInto } from "./obsidian-merger.js";
import { join } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The vault-relative root for all noesis artifacts. */
const NOESIS_DIR = ".obsidian/noesis";

// ---------------------------------------------------------------------------
// YAML Frontmatter Helpers
// ---------------------------------------------------------------------------

/**
 * Serialize a primitive value as a YAML scalar.
 */
function yamlPrimitive(value: unknown): string {
  if (value === null || value === undefined) return "~";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") {
    // Quote strings that contain YAML-significant characters or leading whitespace
    if (/^[\s]|[:#"',\[\]{}&\*!|>%@`]/.test(value) || value === "") {
      return JSON.stringify(value);
    }
    return value;
  }
  return String(value);
}

/**
 * Serialize an object as YAML key-value pairs at the given indent level.
 * Each entry occupies its own line.
 */
function yamlObject(obj: Record<string, unknown>, indent: number): string {
  const pad = " ".repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      lines.push(`${pad}${key}: ~`);
    } else if (typeof value === "object" && !Array.isArray(value)) {
      lines.push(`${pad}${key}:`);
      lines.push(yamlObject(value as Record<string, unknown>, indent + 2));
    } else if (Array.isArray(value)) {
      lines.push(`${pad}${key}:`);
      for (const item of value) {
        lines.push(`${pad}- ${yamlPrimitive(item)}`);
      }
    } else {
      lines.push(`${pad}${key}: ${yamlPrimitive(value)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Build the full YAML frontmatter string (including `---` delimiters)
 * for a vault artifact.
 */
function formatFrontmatter(artifact: VaultArtifact): string {
  const lines = ["---"];
  lines.push(`kind: ${artifact.kind}`);
  lines.push(`id: ${artifact.id}`);
  lines.push(`pushedAt: ${artifact.pushedAt}`);
  lines.push(`projectPath: ${artifact.projectPath}`);

  if (artifact.metadata && Object.keys(artifact.metadata).length > 0) {
    lines.push("metadata:");
    lines.push(yamlObject(artifact.metadata, 2));
  }

  lines.push("---");
  return lines.join("\n");
}

/**
 * Parse a scalar YAML value (single line after the colon).
 */
function parseYamlScalar(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "~" || trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  // Number?
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isNaN(num)) return num;
  }
  // Quoted string — strip one level of quotes
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

interface ParsedNote {
  kind: VaultArtifact["kind"];
  id: string;
  pushedAt: string;
  projectPath: string;
  metadata?: Record<string, unknown>;
  content: string;
}

/**
 * Parse a markdown note with YAML frontmatter back into artifact fields.
 *
 * Expects the standard `---\n...\n---\n` delimiter pair produced by
 * `formatFrontmatter`.  Returns `null` when the frontmatter is missing,
 * malformed, or lacks required fields.
 */
function parseFrontmatter(text: string): ParsedNote | null {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;

  const fmText = match[1] as string;
  const content = text.slice(match[0].length);

  // Parse YAML line by line, tracking object nesting via indent.
  const lines = fmText.split("\n");
  const root: Record<string, unknown> = {};
  const stack: Array<{ obj: Record<string, unknown>; indent: number }> = [
    { obj: root, indent: -1 },
  ];

  for (const line of lines) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    // Pop back to the correct nesting level
    while (stack.length > 1 && stack[stack.length - 1]!.indent >= indent) {
      stack.pop();
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx);
    const valuePart = trimmed.slice(colonIdx + 1).trim();

    if (valuePart === "") {
      // Start a new sub-object
      const sub: Record<string, unknown> = {};
      stack[stack.length - 1]!.obj[key] = sub;
      stack.push({ obj: sub, indent });
    } else {
      stack[stack.length - 1]!.obj[key] = parseYamlScalar(valuePart);
    }
  }

  // Validate required fields
  if (
    typeof root.kind !== "string" ||
    typeof root.id !== "string" ||
    typeof root.pushedAt !== "string" ||
    typeof root.projectPath !== "string"
  ) {
    return null;
  }

  return {
    kind: root.kind as VaultArtifact["kind"],
    id: root.id,
    pushedAt: root.pushedAt,
    projectPath: root.projectPath,
    metadata: (root.metadata ?? undefined) as Record<string, unknown> | undefined,
    content,
  };
}

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

/**
 * List immediate subdirectory names under `dir`.
 * Returns an empty array on any I/O error.
 */
async function listSubdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// ObsidianVaultStore
// ---------------------------------------------------------------------------

/**
 * A `VaultStore` implementation that projects cognitive artifacts as
 * human-readable Markdown notes inside an Obsidian vault.
 *
 * Notes are stored at `.obsidian/noesis/{kind}/{id}.md` with YAML
 * frontmatter carrying the artifact's metadata.
 */
export class ObsidianVaultStore implements VaultStore {
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  // -----------------------------------------------------------------------
  // push
  // -----------------------------------------------------------------------

  /**
   * Write an artifact as a Markdown note with YAML frontmatter.
   *
   * The note is written atomically (temp → rename) so partial writes
   * never leave a corrupt file.
   */
  async push(artifact: VaultArtifact): Promise<void> {
    const dir = join(this.projectRoot, NOESIS_DIR, artifact.kind);
    const filename = `${artifact.id}.md`;
    const frontmatter = formatFrontmatter(artifact);
    const content = frontmatter + "\n" + artifact.content;

    await writeObsidianNote(dir, filename, content);
  }

  // -----------------------------------------------------------------------
  // pull
  // -----------------------------------------------------------------------

  /**
   * Read artifacts from the vault, optionally filtered by kind.
   *
   * When `kind` is omitted all known kind subdirectories are scanned.
   * Returns at most `maxResults` artifacts (newest first by file mtime).
   */
  async pull(kind?: string, maxResults = 10): Promise<VaultPullResult> {
    const baseDir = join(this.projectRoot, NOESIS_DIR);
    const artifacts: VaultArtifact[] = [];

    const kindDirs = kind ? [kind] : await listSubdirectories(baseDir);

    for (const k of kindDirs) {
      if (artifacts.length >= maxResults) break;
      const dir = join(baseDir, k);

      let files: string[];
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        files = entries
          .filter((e) => e.isFile() && e.name.endsWith(".md"))
          .map((e) => e.name)
          .slice(0, maxResults - artifacts.length);
      } catch {
        continue; // directory does not exist or is unreadable
      }

      for (const file of files) {
        try {
          const text = await readFile(join(dir, file), "utf-8");
          const parsed = parseFrontmatter(text);
          if (parsed) {
            artifacts.push({
              kind: parsed.kind,
              id: parsed.id,
              pushedAt: parsed.pushedAt,
              projectPath: parsed.projectPath,
              metadata: parsed.metadata,
              content: parsed.content,
            });
          }
        } catch {
          // skip unreadable or malformed files
        }
      }
    }

    return {
      artifacts,
      source: baseDir,
      timestamp: new Date().toISOString(),
    };
  }

  // -----------------------------------------------------------------------
  // search
  // -----------------------------------------------------------------------

  /**
   * Full-text search across vault notes using `grep -rl`.
   *
   * Results are limited to `maxResults` and parsed back into artifacts.
   * Returns an empty array when the vault directory does not exist or no
   * matches are found.
   */
  async search(
    query: string,
    kind?: string,
    maxResults = 10,
  ): Promise<VaultArtifact[]> {
    const baseDir = join(this.projectRoot, NOESIS_DIR);
    const searchDir = kind ? join(baseDir, kind) : baseDir;

    // Verify the search path exists
    try {
      await stat(searchDir);
    } catch {
      return [];
    }

    const proc = Bun.spawn(["grep", "-rl", query, searchDir, "--include=*.md"]);
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    const lines = stdout.trim().split("\n").filter(Boolean);
    const artifacts: VaultArtifact[] = [];

    for (const filePath of lines.slice(0, maxResults)) {
      try {
        const text = await readFile(filePath, "utf-8");
        const parsed = parseFrontmatter(text);
        if (parsed) {
          artifacts.push({
            kind: parsed.kind,
            id: parsed.id,
            pushedAt: parsed.pushedAt,
            projectPath: parsed.projectPath,
            metadata: parsed.metadata,
            content: parsed.content,
          });
        }
      } catch {
        // skip unreadable files
      }
    }

    return artifacts;
  }

  // -----------------------------------------------------------------------
  // validate
  // -----------------------------------------------------------------------

  /**
   * Check whether the Obsidian vault directory exists.
   *
   * Returns `true` when `.obsidian/` is present under the project root.
   * Does not validate the content or structure of the vault.
   */
  async validate(): Promise<boolean> {
    try {
      const s = await stat(join(this.projectRoot, ".obsidian"));
      return s.isDirectory();
    } catch {
      return false;
    }
  }
}
