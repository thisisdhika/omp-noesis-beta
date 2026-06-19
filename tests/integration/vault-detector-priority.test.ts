import { expect, describe, it, afterEach } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createVaultStore, detectMemoryBackend } from "../../src/vault/vault-detector.js";
import { HindsightVaultStore } from "../../src/vault/hindsight-vault-store.js";
import { LocalVaultStore } from "../../src/vault/local-vault-store.js";
import { CompositeVaultStore } from "../../src/vault/composite-vault-store.js";

describe("Memory Backend Priority Enforcement", () => {
  const testDir = join(process.cwd(), "tests", "fixtures", "vault-priority");

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  async function setupFixture(files: string[]) {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });

    for (const f of files) {
      const parts = f.split("/");
      parts.pop();
      if (parts.length > 0) {
        await mkdir(join(testDir, ...parts), { recursive: true });
      }
      await writeFile(join(testDir, f), "");
    }
  }

  it("prioritises Mnemopi > Hindsight > Local", async () => {
    await setupFixture([
      ".omp/mnemopi.db",
      ".omp/hindsight/somefile",
      "MEMORY.md",
      ".obsidian/workspace"
    ]);

    expect(detectMemoryBackend(testDir)).toBe("mnemopi");

    const store = await createVaultStore(testDir);
    expect(store).toBeInstanceOf(CompositeVaultStore);
  });

  it("falls back to Hindsight if Mnemopi is missing", async () => {
    await setupFixture([
      ".omp/hindsight/somefile",
      "MEMORY.md"
    ]);

    expect(detectMemoryBackend(testDir)).toBe("hindsight");
    const store = await createVaultStore(testDir);
    expect(store).toBeInstanceOf(HindsightVaultStore);
  });

  it("falls back to Local if Mnemopi and Hindsight are missing", async () => {
    await setupFixture([
      "MEMORY.md"
    ]);

    expect(detectMemoryBackend(testDir)).toBe("local");
    const store = await createVaultStore(testDir);
    expect(store).toBeInstanceOf(LocalVaultStore);
  });
});
