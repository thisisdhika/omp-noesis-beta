"use strict";

/**
 * Local vault store backed by a single MEMORY.md file at the project root.
 *
 * Provides a best-effort, append-only VaultStore implementation suitable
 * for simple local persistence when no external vault (Obsidian, Hindsight,
 * Mnemopi) is configured.  Removing this file or backend causes zero
 * degradation to the rest of the system.
 *
 * @module vault/local-vault-store
 */

import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { VaultArtifactSchema } from "../schema.js";
import type { VaultArtifact, VaultPullResult } from "../schema.js";
import type { VaultStore } from "./vault-store.js";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Name of the markdown vault file placed in the project root. */
const MEMORY_FILE = "MEMORY.md";

// ============================================================================
// LOCAL VAULT STORE
// ============================================================================

export class LocalVaultStore implements VaultStore {
  /** Absolute path to MEMORY.md. */
  readonly #filePath: string;

  constructor(projectRoot: string) {
    this.#filePath = join(projectRoot, MEMORY_FILE);
  }

  // ==========================================================================
  // VAULT STORE IMPLEMENTATION
  // ==========================================================================

  /**
   * Append an artifact as a new markdown section.
   *
   * Format:
   * ```
   * ## [{kind}] {id} — {pushedAt}
   * {content}
   * ```
   *
   * Writes are append-only — no deduplication or overwrite is performed.
   */
  async push(artifact: VaultArtifact): Promise<void> {
    const section = [
      `## [${artifact.kind}] ${artifact.id} — ${artifact.pushedAt}`,
      artifact.content,
      "",
    ].join("\n");
    appendFileSync(this.#filePath, section, "utf-8");
  }

  /**
   * Read all artifacts from MEMORY.md, optionally filter by kind,
   * and return the most recent entries first.
   */
  async pull(kind?: string, maxResults = 10): Promise<VaultPullResult> {
    const artifacts = this.#readArtifacts();
    const filtered = kind
      ? artifacts.filter((a) => a.kind === kind)
      : artifacts;
    return {
      artifacts: filtered.slice(-maxResults).reverse(),
      source: this.#filePath,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Search artifacts whose id, kind, or content contains the query
   * string (case-insensitive), optionally filtered by kind.
   */
  async search(
    query: string,
    kind?: string,
    maxResults = 10,
  ): Promise<VaultArtifact[]> {
    const artifacts = this.#readArtifacts();
    const lowerQuery = query.toLowerCase();
    const matches = artifacts.filter((a) => {
      if (kind !== undefined && a.kind !== kind) return false;
      return (
        a.id.toLowerCase().includes(lowerQuery) ||
        a.content.toLowerCase().includes(lowerQuery) ||
        a.kind.toLowerCase().includes(lowerQuery)
      );
    });
    return matches.slice(-maxResults).reverse();
  }

  /**
   * Verify MEMORY.md exists and is writable.
   * Creates an empty file if it does not exist.
   */
  async validate(): Promise<boolean> {
    try {
      if (!existsSync(this.#filePath)) {
        appendFileSync(this.#filePath, "", "utf-8");
      }
      // Confirm both read and write work
      readFileSync(this.#filePath, "utf-8");
      appendFileSync(this.#filePath, "", "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // INTERNAL
  // ==========================================================================

  /**
   * Read MEMORY.md and parse all artifact sections.
   *
   * Each section starts with a header of the form:
   * ```
   * ## [{kind}] {id} — {pushedAt}
   * ```
   * and continues until the next `## [` header or end of file.
   *
   * Artifacts are returned in file order (oldest first).
   */
  #readArtifacts(): VaultArtifact[] {
    if (!existsSync(this.#filePath)) return [];

    const text = readFileSync(this.#filePath, "utf-8");
    const lines = text.split("\n");
    const artifacts: VaultArtifact[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!;
      const match = line.match(
        /^## \[(\w+)\] (.+) — (.+)$/,
      );
      if (!match) {
        i++;
        continue;
      }
      const kind = match[1]!;
      const id = match[2]!;
      const pushedAt = match[3]!;
      i++;

      // Collect content lines until the next section header or EOF
      const contentLines: string[] = [];
      while (i < lines.length) {
        const contentLine = lines[i]!;
        if (contentLine.startsWith("## [")) break;
        contentLines.push(contentLine);
        i++;
      }

      // Trim trailing blank lines (inter-section separators)
      while (
        contentLines.length > 0 &&
        contentLines[contentLines.length - 1] === ""
      ) {
        contentLines.pop();
      }

      const kindResult = VaultArtifactSchema.shape.kind.safeParse(kind);
      if (!kindResult.success) continue;

      artifacts.push({
        kind: kindResult.data,
        projectPath: this.#filePath,
        id,
        pushedAt,
        content: contentLines.join("\n"),
      });
    }

    return artifacts;
  }
}
