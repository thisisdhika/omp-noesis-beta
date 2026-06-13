import type { NoesisState } from "../schema.js";
import { loadState, saveState } from "./filesystem-store.js";

/**
 * Repository — the single mutation boundary for Noesis cognitive state.
 *
 * - All reads go through `read()`.
 * - All writes go through `mutate()` or `checkpointAttention()`.
 * - No domain module, tool, or command touches the filesystem directly.
 */
export class StateManager {
  private _state: NoesisState;
  private _attentionDirty = false;

  constructor(private root: string) {
    this._state = loadState(root);
  }

  /** Return a read-only snapshot of the current state. */
  read(): NoesisState {
    return this._state;
  }

  /**
   * Apply a mutation function to the live state.
   *
   * - If only `attention.*` fields changed, the write is deferred (marks
   *   `_attentionDirty`) and flushed by `checkpointAttention()`.
   * - If any non-attention field changed, persistence happens immediately.
   * - If the mutation is a no-op (before === after), nothing happens.
   */
  mutate(fn: (s: NoesisState) => void): void {
    const before = JSON.stringify(this._state);

    fn(this._state);

    const after = JSON.stringify(this._state);
    if (before === after) return; // no-op

    // Compare snapshots with `attention` zeroed to detect scope.
    const beforeClean = { ...JSON.parse(before), attention: null };
    const afterClean = { ...JSON.parse(after), attention: null };
    if (JSON.stringify(beforeClean) === JSON.stringify(afterClean)) {
      this._attentionDirty = true;
    } else {
      saveState(this.root, this._state);
    }
  }

  /** Flush deferred attention changes to disk, if any. */
  checkpointAttention(): void {
    if (this._attentionDirty) {
      saveState(this.root, this._state);
      this._attentionDirty = false;
    }
  }

  /** Reload state from disk after compaction. */
  invalidateAfterCompaction(): void {
    this._state = loadState(this.root);
    this._attentionDirty = false;
  }
}
