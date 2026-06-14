import type { ToolResultEvent } from "../schema.js";
import type { StateManager } from "../infrastructure/state-manager.js";
import { captureResult, applyRetentionPolicy } from "../domains/learning/learning-domain.js";
import { truncate } from "../shared/text.js";

const MAX_LEARNING_ENTRIES = 50;

/**
 * Infer a skill scope string from the event payload.
 *
 * Priority:
 *   1. `event.input.skill` (explicit skill name)
 *   2. `event.input.scope` (generic scope hint)
 *   3. `event.toolName` (fallback — tool identity as scope)
 */
function inferSkillScope(event: ToolResultEvent): string | undefined {
  const input = event.input;
  if (typeof input.skill === "string" && input.skill.length > 0) {
    return input.skill;
  }
  if (typeof input.scope === "string" && input.scope.length > 0) {
    return input.scope;
  }
  return event.toolName || undefined;
}

/**
 * Extract a human-readable description from the tool result event.
 *
 * Picks the `text` field of the first content chunk that has one,
 * then truncates to 200 characters.
 */
function extractDescription(event: ToolResultEvent): string {
  for (const chunk of event.content) {
    if (chunk.text && chunk.text.length > 0) {
      return truncate(chunk.text, 200);
    }
  }
  return event.toolName;
}

/**
 * Create a "tool_result" event handler that captures every tool
 * execution result as a learning entry and enforces retention policy.
 *
 * Usage:
 * ```ts
 * const onToolResult = createToolResultHook({ state });
 * events.on("tool_result", onToolResult);
 * ```
 */
export function createToolResultHook(
  deps: { state: StateManager },
): (event: ToolResultEvent) => void {
  return (event: ToolResultEvent): void => {
    try {
      const description = extractDescription(event);
      const isError = event.isError === true;
      const skillScope = inferSkillScope(event);

      deps.state.mutate((s) => {
        const all = [...s.learning.successes, ...s.learning.failures];
        const { newEntries } = captureResult(
          all,
          event.toolName,
          description,
          isError,
          skillScope,
        );
        const retained = applyRetentionPolicy(newEntries, MAX_LEARNING_ENTRIES);
        s.learning.successes = retained.filter((e) => (e.severity ?? 0) < 2);
        s.learning.failures = retained.filter((e) => (e.severity ?? 0) >= 2);
      });
    } catch (err) {
      console.error("[noesis] tool_result hook error:", err);
    }
  };
}
