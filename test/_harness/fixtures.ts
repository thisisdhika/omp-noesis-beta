import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MockExtensionAPI } from "./mock-extension.js";
import { StateManager } from "../../src/infrastructure/state-manager.js";
import { EMPTY_STATE, type NoesisState } from "../../src/schema.js";
import activate from "../../src/index.js";

export interface TestContext {
  workDir: string;
  extension: MockExtensionAPI;
  state: StateManager;
  emptyState: NoesisState;
}

/**
 * Creates a fresh test context with a temp directory, activated extension,
 * fresh StateManager, and an empty state snapshot.
 *
 * Cleanup: call `ctx.cleanup()` in afterEach/afterAll to remove the temp dir.
 */
export function createTestContext(): TestContext & { cleanup: () => void } {
  const workDir = mkdtempSync(join(tmpdir(), "omp-noesis-test-"));
  const extension = new MockExtensionAPI(workDir);
  activate(extension as never);
  const state = new StateManager(workDir);
  const emptyState = EMPTY_STATE();

  return {
    workDir,
    extension,
    state,
    emptyState,
    cleanup: () => {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* ok */
      }
    },
  };
}
