"use strict";

/**
 * Consistency strategies for the commitment layer.
 * Version: 1.0.0
 * Provides cycle detection and status consistency checks for workflows.
 */

import type { Workflow, WorkflowStep } from "./schema.js";

/**
 * Detect circular dependencies in a workflow's step graph.
 * Uses DFS with a recursion stack to find cycles.
 * Returns the descriptions of every step involved in at least one cycle.
 */
export function checkCircularDeps(workflow: Workflow): string[] {
  const stepMap = new Map<string, WorkflowStep>();
  const adj = new Map<string, string[]>();

  for (const step of workflow.steps) {
    stepMap.set(step.id, step);
    adj.set(step.id, step.dependsOn ?? []);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];
  const cycleSteps = new Set<string>();

  function dfs(node: string): void {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = adj.get(node) ?? [];
    for (const neighbor of neighbors) {
      // Skip references to steps outside this workflow
      if (!stepMap.has(neighbor)) continue;

      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        // Back edge detected: neighbor -> ... -> node -> neighbor is a cycle
        const startIdx = path.indexOf(neighbor);
        for (let i = startIdx; i < path.length; i++) {
          cycleSteps.add(path[i]!);
        }
      }
    }

    path.pop();
    recStack.delete(node);
  }

  for (const step of workflow.steps) {
    if (!visited.has(step.id)) {
      dfs(step.id);
    }
  }

  // Map IDs back to descriptions, preserving insertion order
  const result: string[] = [];
  for (const step of workflow.steps) {
    if (cycleSteps.has(step.id)) {
      result.push(step.description);
    }
  }
  return result;
}

/**
 * Check workflow step status consistency.
 *
 * Rules:
 * - Every "active" step must have all its dependencies in "done" status.
 * - Every "done" step must not have dependents still stuck in "pending" status
 *   (they should have been activated since their dependency is satisfied).
 *
 * Returns `{ valid, issues }` where `issues` describes each inconsistency.
 */
export function checkStatusConsistency(workflow: Workflow): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const stepMap = new Map<string, WorkflowStep>();

  for (const step of workflow.steps) {
    stepMap.set(step.id, step);
  }

  // Reverse dependency index: stepId → [stepIds that list stepId in dependsOn]
  const dependents = new Map<string, string[]>();
  for (const step of workflow.steps) {
    for (const depId of step.dependsOn ?? []) {
      if (!stepMap.has(depId)) continue; // skip dangling refs
      if (!dependents.has(depId)) {
        dependents.set(depId, []);
      }
      dependents.get(depId)!.push(step.id);
    }
  }

  for (const step of workflow.steps) {
    // Active steps must have all dependencies done
    if (step.status === "active") {
      for (const depId of step.dependsOn ?? []) {
        const dep = stepMap.get(depId);
        if (dep && dep.status !== "done") {
          issues.push(
            `Step "${step.description}" is active but dependency "${dep.description}"` +
              ` has status "${dep.status}" (expected "done")`
          );
        }
      }
    }

    // Done steps — check dependents aren't left pending
    if (step.status === "done") {
      const deps = dependents.get(step.id) ?? [];
      for (const depId of deps) {
        const depStep = stepMap.get(depId);
        if (depStep && depStep.status === "pending") {
          issues.push(
            `Step "${depStep.description}" is pending but dependency "${step.description}"` +
              ` is done — it should have been activated`
          );
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
