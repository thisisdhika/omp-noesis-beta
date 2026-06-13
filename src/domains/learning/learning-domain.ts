import { rankLearning } from "./ranking-strategy.js";
import { evictLearning } from "./eviction-strategy.js";
import { generateId } from "../../shared/ids.js";
import { nowISO } from "../../shared/time.js";
import { truncate } from "../../shared/text.js";
import type { NoesisState, LearningEntry } from "../../schema.js";

function createEntry(toolName: string, description: string, skillScope?: string): LearningEntry {
  return {
    id: generateId("le"),
    description: truncate(description, 500),
    skillScope,
    toolName,
    capturedAt: nowISO(),
  };
}

export function captureFailure(
  state: NoesisState,
  toolName: string,
  description: string,
  skillScope?: string,
): LearningEntry {
  const entry = createEntry(toolName, description, skillScope);
  state.learning.failures.push(entry);
  state.learning.summary.failureCount++;
  return entry;
}

export function captureSuccess(
  state: NoesisState,
  toolName: string,
  description: string,
  skillScope?: string,
): LearningEntry {
  const entry = createEntry(toolName, description, skillScope);
  state.learning.successes.push(entry);
  state.learning.summary.successCount++;
  return entry;
}

export function applyRetentionPolicy(
  state: NoesisState,
  maxEntries: number = 50,
): void {
  const combined = [
    ...state.learning.failures,
    ...state.learning.successes,
  ];
  const kept = evictLearning(combined, maxEntries);

  const keptIds = new Set(kept.map((e) => e.id));
  state.learning.failures = state.learning.failures.filter((e) =>
    keptIds.has(e.id),
  );
  state.learning.successes = state.learning.successes.filter((e) =>
    keptIds.has(e.id),
  );

  state.learning.summary.failureCount = state.learning.failures.length;
  state.learning.summary.successCount = state.learning.successes.length;
  state.learning.summary.resolvedCount = kept.filter(
    (e) => e.rootCause !== undefined && e.fix !== undefined,
  ).length;
}

export function getTopLearning(
  state: NoesisState,
  count: number,
  skillScope?: string,
): LearningEntry[] {
  const combined = [
    ...state.learning.failures,
    ...state.learning.successes,
  ];
  const ranked = rankLearning(combined, skillScope);
  return ranked.slice(0, count);
}
