import type { NoesisState } from "../schema.js";

export function resolveFocus(state: NoesisState, explicitFocus?: string): string {
  if (explicitFocus && explicitFocus.trim().length > 0) {
    return explicitFocus.trim();
  }
  if (state.commitment.workflow.goal && state.commitment.workflow.goal.trim().length > 0) {
    return state.commitment.workflow.goal.trim();
  }
  if (state.attention.focus && state.attention.focus.trim().length > 0) {
    return state.attention.focus.trim();
  }
  return "No active focus. Use noesis_attend to set one.";
}
