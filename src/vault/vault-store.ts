import type { VaultArtifact, VaultPullOptions, VaultPullResult } from "../schema.js";

/**
 * VaultStore — the memory abstraction layer.
 *
 * Noesis pushes cognitive artifacts (decisions, beliefs, learnings, patterns)
 * to the vault and pulls them back on session start for enrichment. Each
 * backend (Obsidian, Hindsight, Mnemopi, Local, Noop) implements this
 * interface so noesis never cares which backend is active.
 */
export interface VaultStore {
  /** Push an artifact to long-term memory. Fire-and-forget; errors go to retry buffer. */
  push(artifact: VaultArtifact): Promise<void>;

  /** Pull artifacts for a project, capped per kind. Used for session-start enrichment. */
  pull(projectPath: string, options: VaultPullOptions): Promise<VaultPullResult>;

  /** Search vault for artifacts matching a natural-language query. */
  search(query: string, projectPath: string, maxResults: number): Promise<VaultArtifact[]>;

  /** Check whether the backend is reachable / functional. */
  validate(): Promise<boolean>;
}
