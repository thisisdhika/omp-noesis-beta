"use strict";

/**
 * Hindsight vault store — session reflection backend.
 * Version: 0.1.0
 *
 * Provides a VaultStore implementation backed by the Hindsight API
 * for session-level reflection and memory consolidation.
 *
 * Currently a stub implementation that stores artifacts locally
 * until the Hindsight API client is fully implemented.
 *
 * @module vault/hindsight-vault-store
 */

import type { VaultStore, VaultArtifact, VaultPullResult } from "./vault-store.js";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

/** Subdirectory within .omp that holds hindsight artifacts. */
const HINDSIGHT_DIR = ".omp/hindsight";

/** JSON file that stores all artifacts in the hindsight directory. */
const ARTIFACTS_FILE = "artifacts.json";

// ---------------------------------------------------------------------------
// HINDSIGHT VAULT STORE
// ---------------------------------------------------------------------------

export class HindsightVaultStore implements VaultStore {
  /** Absolute path to the .omp/hindsight directory. */
  readonly #dirPath: string;

  /** Absolute path to the artifacts.json file. */
  readonly #filePath: string;

  constructor(projectRoot: string) {
    this.#dirPath = join(projectRoot, HINDSIGHT_DIR);
    this.#filePath = join(this.#dirPath, ARTIFACTS_FILE);
  }

  // ==========================================================================
  // VAULT STORE IMPLEMENTATION
  // ==========================================================================

  /**
   * Persist a single artifact.
   * Upserts by id — if an artifact with the same id already exists,
   * it is replaced; otherwise it is appended.
   */
  async push(artifact: VaultArtifact): Promise<void> {
    const artifacts = this.#readAll();
    const idx = artifacts.findIndex(a => a.id === artifact.id);
    if (idx >= 0) {
      artifacts[idx] = artifact;
    } else {
      artifacts.push(artifact);
    }
    this.#writeAll(artifacts);
  }

  /**
   * Retrieve artifacts, optionally filtered by kind.
   * Results are ordered most-recent-first.
   */
  async pull(kind?: string, maxResults = 10): Promise<VaultPullResult> {
    let artifacts = this.#readAll();
    if (kind) {
      artifacts = artifacts.filter(a => a.kind === kind);
    }
    artifacts.sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
    return {
      artifacts: artifacts.slice(0, maxResults),
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
    let artifacts = this.#readAll();
    if (kind) {
      artifacts = artifacts.filter(a => a.kind === kind);
    }
    const q = query.toLowerCase();
    artifacts = artifacts.filter(a =>
      a.content.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q) ||
      a.kind.toLowerCase().includes(q)
    );
    return artifacts.slice(0, maxResults);
  }

  /**
   * Verify the store is reachable and usable.
   * Creates the .omp/hindsight directory if it does not exist.
   */
  async validate(): Promise<boolean> {
    try {
      if (!existsSync(this.#dirPath)) {
        mkdirSync(this.#dirPath, { recursive: true });
      }
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // INTERNAL
  // ==========================================================================

  /**
   * Read all artifacts from the JSON file.
   * Returns an empty array if the file does not exist or is unparseable.
   */
  #readAll(): VaultArtifact[] {
    try {
      const raw = readFileSync(this.#filePath, "utf-8");
      return JSON.parse(raw) as VaultArtifact[];
    } catch {
      return [];
    }
  }

  /**
   * Write all artifacts to the JSON file.
   * Creates the .omp/hindsight directory if it does not exist.
   */
  #writeAll(artifacts: VaultArtifact[]): void {
    if (!existsSync(this.#dirPath)) {
      mkdirSync(this.#dirPath, { recursive: true });
    }
    writeFileSync(this.#filePath, JSON.stringify(artifacts, null, 2));
  }
}
