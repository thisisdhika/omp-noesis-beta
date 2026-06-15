"use strict";

/**
 * Hindsight API vault store (forward-compatible stub).
 *
 * Hindsight is an external HTTP service that provides durable, searchable vault
 * storage for cognitive artifacts.  This stub implements the {@link VaultStore}
 * contract with no-op methods so that callers can wire up the dependency graph
 * before the real HTTP client is implemented.
 *
 * DESIGN DECISIONS
 * ----------------
 * - **Write-only, best-effort**: {@link push} logs a warning and returns
 *   without sending data.  Once the HTTP layer lands, the same method will
 *   POST artifacts to the Hindsight endpoint.
 * - **Graceful absence**: Removing the Hindsight backend (or never configuring
 *   one) causes zero degradation for callers; every method returns safe
 *   defaults.
 * - **API key stored but unused**: The constructor accepts an optional API key
 *   so the class signature does not change when the real client is plugged in.
 *
 * @module hindsight-vault-store
 */

import { NoopVaultStore } from "./noop-vault-store.js";
import type { VaultArtifact, VaultPullResult } from "../schema.js";

// ============================================================================
// HINDSIGHT VAULT STORE
// ============================================================================

/**
 * VaultStore stub backed by the Hindsight external API.
 *
 * @remarks
 * **This is a forward-compatible stub.**  Every method either logs a warning or
 * returns empty defaults.  No network calls are made.  The implementation is
 * designed to be replaced in-place once the Hindsight HTTP client is ready;
 * callers should see zero API changes.
 */
export class HindsightVaultStore extends NoopVaultStore {
  /** Optional API key for the future Hindsight HTTP client. */
  readonly #apiKey?: string;

  /**
   * @param apiKey - Optional Hindsight API key.  Currently unused; stored for
   *   forward compatibility so the constructor signature does not change.
   */
  constructor(apiKey?: string) {
    super();
    this.#apiKey = apiKey;
  }

  // --------------------------------------------------------------------------
  // push
  // --------------------------------------------------------------------------

  /**
   * Persist an artifact to the Hindsight backend.
   *
   * **Stub behaviour**: logs a warning and returns without persisting data.
   * Once the HTTP client is wired in, this method will POST `artifact` to the
   * Hindsight `/vault/push` endpoint.
   */
  async push(artifact: VaultArtifact): Promise<void> {
    console.warn(
      "[HindsightVaultStore] Hindsight backend not yet implemented. Artifact stored locally only.",
    );
    // Forward-compatible: the artifact parameter is accepted but not sent.
    // In the production implementation this method will POST to Hindsight.
    return;
  }

  // --------------------------------------------------------------------------
  // pull
  // --------------------------------------------------------------------------

  /**
   * Retrieve artifacts from the Hindsight backend.
   *
   * **Stub behaviour**: returns an empty result set with source set to
   * `"hindsight"` and the current timestamp.
   */
  async pull(kind?: string, maxResults?: number): Promise<VaultPullResult> {
    return {
      artifacts: [],
      source: "hindsight",
      timestamp: new Date().toISOString(),
    };
  }

}
