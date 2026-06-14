/**
 * LocalVaultStore — OMP memory backend backed by MEMORY.md.
 *
 * Persists vault artifacts as append-only entries in a MEMORY.md file
 * under the root directory. Pull re-reads the file for project-tagged
 * sections. Search greps the file line-by-line.
 *
 * This is a structurally correct but basic implementation suitable for
 * development and environments where an external vault is unavailable.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { VaultArtifact, VaultPullOptions, VaultPullResult } from "../schema.js";
import type { VaultStore } from "./vault-store.js";

const MEMORY_FILE = "MEMORY.md";

export class LocalVaultStore implements VaultStore {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async push(artifact: VaultArtifact): Promise<void> {
    const path = join(this.root, MEMORY_FILE);
    const header = `## ${artifact.kind}:${artifact.id}`;
    const body = [
      `- **projectPath**: ${artifact.projectPath}`,
      `- **pushedAt**: ${artifact.pushedAt}`,
      `- **content**: ${artifact.content}`,
      `- **metadata**: ${JSON.stringify(artifact.metadata)}`,
    ];
    const entry = `\n${header}\n${body.join("\n")}\n`;
    appendFileSync(path, entry, "utf-8");
  }

  async pull(projectPath: string, _options: VaultPullOptions): Promise<VaultPullResult> {
    const path = join(this.root, MEMORY_FILE);
    if (!existsSync(path)) {
      return { decisions: [], beliefs: [], learnings: [], patterns: [] };
    }

    const text = readFileSync(path, "utf-8");
    const lines = text.split("\n");
    const result: VaultPullResult = {
      decisions: [],
      beliefs: [],
      learnings: [],
      patterns: [],
    };

    let currentKind: VaultArtifact["kind"] | null = null;
    let currentId: string | null = null;
    let currentProjectPath: string | null = null;
    let currentContent: string | null = null;
    let currentMetadata: Record<string, unknown> | null = null;
    let currentPushedAt: string | null = null;

    for (const line of lines) {
      const headerMatch = line.match(/^## (decision|belief|learning|pattern):(\S+)$/);
      if (headerMatch) {
        // flush previous artifact if it matches the target project
        if (
          currentId &&
          currentProjectPath === projectPath &&
          currentKind &&
          currentPushedAt
        ) {
          const artifact: VaultArtifact = {
            kind: currentKind,
            projectPath: currentProjectPath,
            id: currentId,
            content: currentContent ?? "",
            metadata: currentMetadata ?? {},
            pushedAt: currentPushedAt,
          };
          const bucket = kindToBucket(result, currentKind);
          if (bucket) bucket.push(artifact);
        }

        currentKind = headerMatch[1] as VaultArtifact["kind"];
        currentId = headerMatch[2] ?? null;
        currentProjectPath = null;
        currentContent = null;
        currentMetadata = null;
        currentPushedAt = null;
        continue;
      }

      if (currentId !== null) {
        const kv = line.match(/^\*\*(\w+)\*\*:\s*(.*)$/);
        if (kv) {
          const key = kv[1];
          const value = kv[2] ?? null;
          switch (key) {
            case "projectPath":
              currentProjectPath = value;
              break;
            case "pushedAt":
              currentPushedAt = value;
              break;
            case "content":
              currentContent = value ?? null;
              break;
            case "metadata":
              try {
                currentMetadata = JSON.parse(value ?? "") as Record<string, unknown>;
              } catch {
                currentMetadata = {};
              }
              break;
          }
        }
      }
    }

    // flush last artifact
    if (
      currentId &&
      currentProjectPath === projectPath &&
      currentKind &&
      currentPushedAt
    ) {
      const artifact: VaultArtifact = {
        kind: currentKind,
        projectPath: currentProjectPath,
        id: currentId,
        content: currentContent ?? "",
        metadata: currentMetadata ?? {},
        pushedAt: currentPushedAt,
      };
      const bucket = kindToBucket(result, currentKind);
      if (bucket) bucket.push(artifact);
    }

    return result;
  }

  async search(query: string, _projectPath: string, maxResults: number): Promise<VaultArtifact[]> {
    const path = join(this.root, MEMORY_FILE);
    if (!existsSync(path)) return [];

    const text = readFileSync(path, "utf-8");
    const lines = text.split("\n");
    const matches: VaultArtifact[] = [];

    const lowerQuery = query.toLowerCase();
    let currentKind: VaultArtifact["kind"] | null = null;
    let currentId: string | null = null;
    let currentProjectPath: string | null = null;
    let currentContent: string | null = null;
    let currentMetadata: Record<string, unknown> | null = null;
    let currentPushedAt: string | null = null;
    let hit = false;

    for (const line of lines) {
      const headerMatch = line.match(/^## (decision|belief|learning|pattern):(\S+)$/);
      if (headerMatch) {
        // flush previous artifact if it matched
        if (hit && currentId && currentKind && currentPushedAt) {
          matches.push({
            kind: currentKind,
            projectPath: currentProjectPath ?? "",
            id: currentId,
            content: currentContent ?? "",
            metadata: currentMetadata ?? {},
            pushedAt: currentPushedAt,
          });
          if (matches.length >= maxResults) break;
        }

        currentKind = headerMatch[1] as VaultArtifact["kind"];
        currentId = headerMatch[2] ?? null;
        currentProjectPath = null;
        currentContent = null;
        currentMetadata = null;
        currentPushedAt = null;
        hit = false;
        continue;
      }

      if (currentId !== null) {
        const kv = line.match(/^\*\*(\w+)\*\*:\s*(.*)$/);
        if (kv) {
          const key = kv[1];
          const value = kv[2] ?? null;
          switch (key) {
            case "projectPath":
              currentProjectPath = value;
              break;
            case "pushedAt":
              currentPushedAt = value;
              break;
            case "content":
              currentContent = value ?? null;
              break;
            case "metadata":
              try {
                currentMetadata = JSON.parse(value ?? "") as Record<string, unknown>;
              } catch {
                currentMetadata = {};
              }
              break;
          }
        }

        if (!hit && line.toLowerCase().includes(lowerQuery)) {
          hit = true;
        }
      }
    }

    // flush last matched artifact
    if (hit && currentId && currentKind && currentPushedAt) {
      matches.push({
        kind: currentKind,
        projectPath: currentProjectPath ?? "",
        id: currentId,
        content: currentContent ?? "",
        metadata: currentMetadata ?? {},
        pushedAt: currentPushedAt,
      });
    }

    return matches.slice(0, maxResults);
  }

  async validate(): Promise<boolean> {
    const path = join(this.root, MEMORY_FILE);
    // The backend is valid if the directory exists; MEMORY.md is created on first push
    return existsSync(this.root);
  }
}

/** Convenience helper to pick the right bucket on VaultPullResult by kind. */
function kindToBucket(
  result: VaultPullResult,
  kind: VaultArtifact["kind"],
): VaultArtifact[] | undefined {
  switch (kind) {
    case "decision":
      return result.decisions;
    case "belief":
      return result.beliefs;
    case "learning":
      return result.learnings;
    case "pattern":
      return result.patterns;
  }
}
