import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  accessSync,
  constants,
} from "node:fs";
import { join } from "node:path";
import type { VaultStore } from "./vault-store.js";
import type {
  VaultArtifact,
  VaultArtifactKind,
  VaultPullOptions,
  VaultPullResult,
} from "../schema.js";
import { parseYamlScalar } from "../shared/simple-yaml.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FM_DELIM = "---";
const NOESIS_DIR = "Noesis";

// ---------------------------------------------------------------------------
// Internal shape (artifact + raw body for search scoring)
// ---------------------------------------------------------------------------

interface ParsedArtifact {
  artifact: VaultArtifact;
  body: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isVaultKind(v: string): v is VaultArtifactKind {
  return v === "decision" || v === "belief" || v === "learning" || v === "pattern";
}

/**
 * Escape a plain string value for YAML double-quoted form when the value
 * contains characters that would break unquoted YAML parsing.
 */
function needsQuoting(v: string): boolean {
  if (v === "") return true;
  if (/^[-:?,\[\]{}&#!|>%@`*]/.test(v)) return true;
  if (/[\s":#]/.test(v)) return true;
  return false;
}

/**
 * Serialise an arbitrary value into a YAML inline or block string,
 * returning a string that may start with "\n" for block content.
 */
function yamlValue(value: unknown, indent: number): string {
  const pad = "  ".repeat(indent);

  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `"${value}"`;
    return String(value);
  }
  if (typeof value === "string") {
    if (needsQuoting(value)) {
      const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `"${escaped}"`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value
      .map((v) => {
        const inner = yamlValue(v, indent + 1);
        return inner.startsWith("\n")
          ? `${pad}-${inner.replace(/\n/g, "\n  ")}`
          : `${pad}- ${inner}`;
      })
      .join("\n");
    return `\n${items}`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const nested = entries
      .map(([k, v]) => {
        const inner = yamlValue(v, indent + 1);
        return inner.startsWith("\n")
          ? `${pad}${k}:${inner}`
          : `${pad}${k}: ${inner}`;
      })
      .join("\n");
    return `\n${nested}`;
  }
  return String(value);
}


// ---------------------------------------------------------------------------
// ObsidianVaultStore
// ---------------------------------------------------------------------------

export class ObsidianVaultStore implements VaultStore {
  private readonly root: string;
  private readonly projectPath: string;

  constructor(root: string, projectPath: string) {
    this.root = root;
    this.projectPath = projectPath;
  }

  // -- public API -----------------------------------------------------------

  async push(artifact: VaultArtifact): Promise<void> {
    const dir = join(this.root, NOESIS_DIR);
    mkdirSync(dir, { recursive: true });

    const fileName = `noesis-${artifact.kind}-${artifact.id}.md`;
    const filePath = join(dir, fileName);
    const content = `${this.buildFrontmatter(artifact)}\n${artifact.content}\n`;

    writeFileSync(filePath, content, "utf-8");
  }

  async pull(
    projectPath: string,
    options: VaultPullOptions,
  ): Promise<VaultPullResult> {
    const result: VaultPullResult = {
      decisions: [],
      beliefs: [],
      learnings: [],
      patterns: [],
    };

    for (const { artifact } of this.readAllArtifacts()) {
      if (artifact.projectPath !== projectPath) continue;

      switch (artifact.kind) {
        case "decision":
          if (result.decisions.length < options.decisionCap) {
            result.decisions.push(artifact);
          }
          break;
        case "belief":
          if (result.beliefs.length < options.beliefCap) {
            result.beliefs.push(artifact);
          }
          break;
        case "learning":
          if (result.learnings.length < options.learningCap) {
            result.learnings.push(artifact);
          }
          break;
        case "pattern":
          if (result.patterns.length < options.patternCap) {
            result.patterns.push(artifact);
          }
          break;
      }
    }

    return result;
  }

  async search(
    query: string,
    projectPath: string,
    maxResults: number,
  ): Promise<VaultArtifact[]> {
    const q = query.toLowerCase();
    const scored: Array<{ artifact: VaultArtifact; score: number }> = [];

    for (const { artifact, body } of this.readAllArtifacts()) {
      if (artifact.projectPath !== projectPath) continue;

      let score = 0;

      // Frontmatter field matches (highest weight)
      if (artifact.kind.toLowerCase().includes(q)) score += 10;
      if (artifact.id.toLowerCase().includes(q)) score += 8;
      if (artifact.pushedAt.toLowerCase().includes(q)) score += 3;

      // Metadata value matches
      for (const v of Object.values(artifact.metadata)) {
        if (typeof v === "string" && v.toLowerCase().includes(q)) score += 5;
        else if (typeof v === "number" && String(v).includes(q)) score += 2;
      }

      // Content (body) match — count occurrences
      const lowerBody = body.toLowerCase();
      let pos = 0;
      let count = 0;
      while ((pos = lowerBody.indexOf(q, pos)) !== -1) {
        count++;
        pos += q.length;
      }
      score += count * 3;

      if (score > 0) {
        scored.push({ artifact, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).map((s) => s.artifact);
  }

  async validate(): Promise<boolean> {
    try {
      if (!existsSync(this.root)) return false;
      accessSync(this.root, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  // -- frontmatter serialisation --------------------------------------------

  private buildFrontmatter(artifact: VaultArtifact): string {
    const lines: string[] = [FM_DELIM];
    lines.push(`kind: ${artifact.kind}`);
    lines.push(`projectPath: ${artifact.projectPath}`);
    lines.push(`id: ${artifact.id}`);
    lines.push(`pushedAt: ${artifact.pushedAt}`);

    const meta = artifact.metadata;
    if (meta && typeof meta === "object" && Object.keys(meta).length > 0) {
      lines.push("metadata:");
      for (const [key, value] of Object.entries(meta)) {
        const formatted = yamlValue(value, 1);
        if (formatted.startsWith("\n")) {
          lines.push(`  ${key}:${formatted}`);
        } else {
          lines.push(`  ${key}: ${formatted}`);
        }
      }
    }

    lines.push(FM_DELIM);
    return lines.join("\n");
  }

  // -- file I/O -------------------------------------------------------------

  private readAllArtifacts(): ParsedArtifact[] {
    const dir = join(this.root, NOESIS_DIR);
    if (!existsSync(dir)) return [];

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return [];
    }

    const results: ParsedArtifact[] = [];

    for (const entry of entries) {
      if (!entry.startsWith("noesis-") || !entry.endsWith(".md")) continue;

      const filePath = join(dir, entry);
      let text: string;
      try {
        text = readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }

      const parsed = this.parseFrontmatter(text);
      if (parsed) {
        results.push(parsed);
      }
    }

    return results;
  }

  private parseFrontmatter(fullText: string): ParsedArtifact | null {
    // Must start with "---\n"
    if (!fullText.startsWith(`${FM_DELIM}\n`)) return null;

    // Find closing "---\n"
    const endIdx = fullText.indexOf(`\n${FM_DELIM}\n`, 4);
    if (endIdx === -1) return null;

    const fmBlock = fullText.slice(4, endIdx + 1); // includes trailing \n
    const body = fullText.slice(endIdx + FM_DELIM.length + 2);

    const lines = fmBlock.split("\n");

    let kind: VaultArtifactKind = "decision";
    let projectPath = "";
    let id = "";
    let pushedAt = "";
    let metadata: Record<string, unknown> = {};
    let inMetadata = false;

    for (const raw of lines) {
      const line = raw.trimEnd();

      if (line === "" || line === FM_DELIM) continue;

      // Enter metadata block
      if (!inMetadata && line === "metadata:") {
        inMetadata = true;
        continue;
      }

      if (inMetadata) {
        // A non-empty line not starting with space exits the metadata block
        if (line !== "" && !line.startsWith(" ")) {
          inMetadata = false;
          // fall through to process this line as a top-level key below
        } else {
          const match = line.match(/^ {2}(\S+):\s*(.*)$/);
          if (match) {
            const metaKey = match[1]!;
            const metaVal = match[2] ?? "";
            metadata[metaKey] = parseYamlScalar(metaVal);
          }
        }
      }

      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();

      switch (key) {
        case "kind":
          if (isVaultKind(value)) kind = value;
          break;
        case "projectPath":
          projectPath = value;
          break;
        case "id":
          id = value;
          break;
        case "pushedAt":
          pushedAt = value;
          break;
      }
    }

    if (!projectPath || !id) return null;

    return {
      artifact: { kind, projectPath, id, content: body, metadata, pushedAt },
      body,
    };
  }
}
