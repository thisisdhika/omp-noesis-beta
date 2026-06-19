"use strict";

/**
 * Vault store interface for omp-noesis.
 * Version: 0.1.0
 *
 * Defines the contract for persisting and retrieving cognitive vault
 * artifacts.  Implementations may back onto local files, Obsidian vaults,
 * or other storage.
 *
 * @module vault/vault-store
 */


import type { VaultArtifact, VaultPullResult } from "../shared/schema.js";
export type { VaultArtifact, VaultPullResult };

// ============================================================================
// VAULT STORE INTERFACE
// ============================================================================

export interface VaultStore {
  /**
   * Persist a single artifact.
   * The store MAY append, upsert, or reject — callers expect best-effort
   * write semantics and MUST NOT assume uniqueness by id.
   */
  push(artifact: VaultArtifact): Promise<void>;

  /**
   * Retrieve artifacts, optionally filtered by kind.
   * Results are ordered most-recent-first.
   *
   * @param kind         Optional kind filter (e.g. "decision", "learning").
   * @param maxResults   Maximum number of artifacts to return (default 10).
   */
  pull(kind?: string, maxResults?: number): Promise<VaultPullResult>;

  /**
   * Search artifact content (and id/kind) for a case-insensitive substring.
   * Results are ordered most-recent-first.
   *
   * @param query        Substring to search for (case-insensitive).
   * @param kind         Optional kind filter.
   * @param maxResults   Maximum number of artifacts to return (default 10).
   */
  search(query: string, kind?: string, maxResults?: number): Promise<VaultArtifact[]>;

  /**
   * Verify the store is reachable and usable.
   * Returns `true` when the store is able to accept writes.
   */
  validate(): Promise<boolean>;

  /**
   * Flush any pending or buffered writes (e.g. retry queue).
   * Implementations that do not buffer can omit this method.
   */
  flush?(): Promise<void>;

  /**
   * Synchronize artifacts from a projection backend back into the memory backend.
   */
  sync?(): Promise<void>;
}
