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
  entries: LearningEntry[],
  maxEntries: number = 50,
): LearningEntry[] {
  return evictLearning(entries, maxEntries);
}

export function getTopLearning(
  entries: LearningEntry[],
  count: number,
  skillScope?: string,
): LearningEntry[] {
  const ranked = rankLearning(entries, skillScope);
  return ranked.slice(0, count);
}

export function captureResult(
  entries: LearningEntry[],
  toolName: string,
  description: string,
  isError: boolean,
  skillScope?: string,
): { newEntries: LearningEntry[] } {
  const entry: LearningEntry = {
    id: generateId("le"),
    description: truncate(description, 500),
    skillScope,
    toolName,
    severity: isError ? 2 : 1,
    capturedAt: nowISO(),
  };
  return { newEntries: [...entries, entry] };
}

