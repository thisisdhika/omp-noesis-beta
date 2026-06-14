import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectVault } from "../../src/vault/vault-detector.js";
import { NoopVaultStore } from "../../src/vault/noop-vault-store.js";
import { ObsidianVaultStore } from "../../src/vault/obsidian-vault-store.js";
import { LocalVaultStore } from "../../src/vault/local-vault-store.js";

describe("detectVault", () => {
  let root: string;
  const cleanupDirs: string[] = [];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "detect-vault-test-"));
    cleanupDirs.length = 0;
    cleanupDirs.push(root);
  });

  afterEach(() => {
    for (const dir of cleanupDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns NoopVaultStore and none label when no config exists", () => {
    const result = detectVault(root);

    expect(result.store).toBeInstanceOf(NoopVaultStore);
    expect(result.label).toBe("none (memory.backend: off)");
  });

  it("returns ObsidianVaultStore when obsidianVaultPath points to a valid dir", () => {
    const vaultDir = mkdtempSync(join(tmpdir(), "obsidian-vault-"));
    cleanupDirs.push(vaultDir);

    const ompDir = join(root, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(
      join(ompDir, "config.yml"),
      `noesis:\n  obsidianVaultPath: ${vaultDir}\n`,
      "utf-8",
    );

    const result = detectVault(root);

    expect(result.store).toBeInstanceOf(ObsidianVaultStore);
    expect(result.label).toBe(`Obsidian (${vaultDir})`);
  });

  it("returns LocalVaultStore when memory.backend is local", () => {
    const ompDir = join(root, ".omp");
    mkdirSync(ompDir, { recursive: true });
    writeFileSync(
      join(ompDir, "config.yml"),
      "settings:\n  memory:\n    backend: local\n",
      "utf-8",
    );

    const result = detectVault(root);

    expect(result.store).toBeInstanceOf(LocalVaultStore);
    expect(result.label).toBe("local");
  });
});
