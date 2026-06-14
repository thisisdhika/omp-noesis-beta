import type { NoesisState } from "../schema.js";

/**
 * Caches the preamble text between state mutations.
 *
 * The cache is keyed on `state.stateVersion.hash` so any structural change
 * to the cognitive state automatically invalidates the cached preamble.
 */
export class PreambleCache {
  private preambleHash = "";
  private preamble = "";
  private readonly subagentCache = new Map<string, string>();

  /**
   * Return the cached preamble if it is still valid for the given state,
   * otherwise invoke `builder()`, cache the result, and return it.
   */
  getOrBuild(state: NoesisState, builder: () => string): string {
    if (this.preambleHash === state.stateVersion.hash) {
      return this.preamble;
    }
    this.preamble = builder();
    this.preambleHash = state.stateVersion.hash;
    return this.preamble;
  }
  get(state: NoesisState): string | undefined {
    if (this.preambleHash !== state.stateVersion.hash) return undefined;
    return this.preamble;
  }

  /** Force the next `getOrBuild` call to rebuild the preamble. */
  invalidate(): void {
    this.preambleHash = "";
    this.preamble = "";
    this.subagentCache.clear();
  }

  /**
   * Same cache pattern for subagent-specific preamble text.
   * The cache key combines `state.stateVersion.hash` and `taskFilter` so
   * different subagent tasks (with different filters) are cached separately.
   */
  getSubagentOrBuild(
    state: NoesisState,
    taskFilter: string,
    builder: () => string,
  ): string {
    const key = `${state.stateVersion.hash}:${taskFilter}`;
    const cached = this.subagentCache.get(key);
    if (cached !== undefined) return cached;
    const built = builder();
    this.subagentCache.set(key, built);
    return built;
  }
  getSubagent(state: NoesisState, taskFilter: string): string | undefined {
    return this.subagentCache.get(`${state.stateVersion.hash}:${taskFilter}`);
  }
}
