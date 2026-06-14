import type { NoesisState } from "../schema.js";

/**
 * Simple string hash for cache keying.
 */
function hashState(state: NoesisState): string {
  let hash = 0;
  const str = JSON.stringify(state);
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}


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
    if (this.preambleHash === hashState(state)) {
      return this.preamble;
    }
    this.preamble = builder();
    this.preambleHash = hashState(state);
    return this.preamble;
  }
  get(state: NoesisState): string | undefined {
    if (this.preambleHash !== hashState(state)) return undefined;
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
    const key = `${hashState(state)}:${taskFilter}`;
    const cached = this.subagentCache.get(key);
    if (cached !== undefined) return cached;
    const built = builder();
    this.subagentCache.set(key, built);
    return built;
  }
  getSubagent(state: NoesisState, taskFilter: string): string | undefined {
    return this.subagentCache.get(`${hashState(state)}:${taskFilter}`);
  }
}
