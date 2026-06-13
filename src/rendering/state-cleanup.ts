import type { NoesisState } from "../schema.js";

export function stripTransientState(state: NoesisState): NoesisState {
  delete state.attention.graphFindings;
  delete state.attention.__graphFindings;
  return state;
}
