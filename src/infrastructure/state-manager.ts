import type { NoesisState } from "../schema.js";
import { loadState, saveState } from "./filesystem-store.js";

/**
 * Single mutation boundary for Noesis cognitive state.
 */
export class StateManager {
  private _state: NoesisState;
  private _attentionDirty = false;

  constructor(private root: string) {
    this._state = loadState(root);
  }

  get rootPath(): string {
    return this.root;
  }

  read(): NoesisState {
    return this._state;
  }

  mutate(fn: (state: NoesisState) => void): void {
    const before = structuredClone(this._state);
    fn(this._state);

    if (stateEqual(before, this._state)) return;
    if (sameExceptAttention(before, this._state)) {
      this._attentionDirty = true;
      return;
    }

    saveState(this.root, this._state);
  }

  checkpointAttention(): void {
    if (!this._attentionDirty) return;
    saveState(this.root, this._state);
    this._attentionDirty = false;
  }

  invalidateAfterCompaction(): void {
    this._state = loadState(this.root);
    this._attentionDirty = false;
  }
}

function stateEqual(left: NoesisState, right: NoesisState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameExceptAttention(left: NoesisState, right: NoesisState): boolean {
  const leftClone: Partial<NoesisState> = structuredClone(left);
  const rightClone: Partial<NoesisState> = structuredClone(right);
  delete leftClone.attention;
  delete rightClone.attention;
  return JSON.stringify(leftClone) === JSON.stringify(rightClone);
}
