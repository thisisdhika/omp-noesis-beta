"use strict";

/**
 * Cross-Session Recall Behavioral Tests
 *
 * Verifies that cognitive state persists across session boundaries:
 * init -> mutate -> destroy -> re-init -> verify data survives.
 */

import { describe, it, expect } from "bun:test";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createTempDir } from "../helpers/temp-dir.js";
import { StateManager } from "../../src/infrastructure/state-manager.js";
import { addFact, getActiveFacts } from "../../src/domains/belief/belief-domain.js";
import { EMPTY_STATE } from "../../src/schema.js";
import type { NoesisState } from "../../src/schema.js";

describe("cross-session recall — state survival", () => {
  it("survives init -> mutate -> destroy -> re-init cycle", async () => {
    const dir = createTempDir();
    try {
      // --- Session 1: init and mutate ---
      const sm1 = new StateManager(dir.path);
      await sm1.initialize();
      const state1 = await sm1.mutate((s: NoesisState) => {
        addFact(s, {
          content: "Cross-session fact should persist",
          confidence: 0.9,
          tags: ["persistence"],
          source: "user",
        });
      });

      const session1Facts = getActiveFacts(state1);
      expect(session1Facts).toHaveLength(1);
      expect(session1Facts[0]!.content).toBe("Cross-session fact should persist");

      // --- Session 2: new StateManager, same directory ---
      const sm2 = new StateManager(dir.path);
      await sm2.initialize();
      const state2 = sm2.read();

      // The fact added in session 1 should be present
      const session2Facts = getActiveFacts(state2);
      expect(session2Facts).toHaveLength(1);
      expect(session2Facts[0]!.content).toBe("Cross-session fact should persist");
      expect(session2Facts[0]!.id).toBe(session1Facts[0]!.id);

      // General state shape should match (timestamps may differ on lastPersisted)
      expect(state2.belief.facts).toHaveLength(1);
      expect(state2.commitment.workflow.goal).toBe(EMPTY_STATE.commitment.workflow.goal);
    } finally {
      dir.cleanup();
    }
  });

  it("restores from EMPTY_STATE when no prior state exists", async () => {
    const dir = createTempDir();
    try {
      const sm = new StateManager(dir.path);
      await sm.initialize();
      const state = sm.read();

      // Should match EMPTY_STATE structure
      expect(state.belief.facts).toBeEmpty();
      expect(state.attention.focus).toBe("");
      expect(state.lastPersisted).toBeDefined();
    } finally {
      dir.cleanup();
    }
  });

  it("recovers from EMPTY_STATE after corrupt state file", async () => {
    const dir = createTempDir();
    try {
      // Write malformed JSON to the state path (create parent dirs first)
      const statePath = join(dir.path, ".omp", "noesis", "state.json");
      mkdirSync(join(dir.path, ".omp", "noesis"), { recursive: true });
      writeFileSync(statePath, "not valid json{broken", "utf-8");

      const sm = new StateManager(dir.path);
      await sm.initialize();
      const state = sm.read();

      // Should have recovered to EMPTY_STATE
      expect(state.belief.facts).toBeEmpty();
      expect(state.attention.focus).toBe("");
      expect(state.lastPersisted).toBeDefined();
    } finally {
      dir.cleanup();
    }
  });
});
