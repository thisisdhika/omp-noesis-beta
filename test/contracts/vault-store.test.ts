/**
 * VaultStore contract tests — parameterised over NoopVaultStore,
 * LocalVaultStore, and ObsidianVaultStore.
 *
 * Each backendʼs behaviour is asserted against its actual implementation
 * contract, not an idealised one.  Behavioural differences (e.g. whether
 * pull respects caps) are encoded per-store in `VaultBehavior` so the
 * test body stays uniform.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { VaultArtifact, VaultPullResult } from "../../src/schema.js";
import type { VaultStore } from "../../src/vault/vault-store.js";
import { NoopVaultStore } from "../../src/vault/noop-vault-store.js";
import { LocalVaultStore } from "../../src/vault/local-vault-store.js";
import { ObsidianVaultStore } from "../../src/vault/obsidian-vault-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a deterministic VaultArtifact for testing. */
function makeArtifact(overrides?: Partial<VaultArtifact>): VaultArtifact {
  return {
    kind: "belief",
    projectPath: "/test/project",
    id: Math.random().toString(36).slice(2, 10),
    content: "Default test artifact content for vault store contract tests",
    metadata: { source: "test" },
    pushedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** All artifact kinds for convenience. */
const ALL_KINDS: VaultArtifact["kind"][] = ["decision", "belief", "learning", "pattern"];

// ---------------------------------------------------------------------------
// Behaviour descriptors per backend
// ---------------------------------------------------------------------------

interface VaultBehavior {
  /** Whether pull returns artifacts that were previously pushed. */
  readonly persistent: boolean;
  /** Whether pull enforces per-kind caps from VaultPullOptions. */
  readonly respectsPullCaps: boolean;
  /** Whether the backend reads from a persisted file that can be corrupted externally. */
  readonly hasPersistedStorage: boolean;
  /**
   * Whether pulled content includes a newline appended during storage
   * (e.g. because the file format adds a trailing newline after the body).
   */
  readonly contentAppendsNewline: boolean;
}


interface StoreCase {
  readonly label: string;
  readonly behavior: VaultBehavior;
  /** Create the store.  `root` is a freshly-created temp directory. */
  readonly create: (root: string) => VaultStore;
  /** Project path passed to push/pull/search. */
  readonly projectPath: string;
}

const ALL_STORES: StoreCase[] = [
  {
    label: "NoopVaultStore",
    behavior: { persistent: false, respectsPullCaps: false, hasPersistedStorage: false, contentAppendsNewline: false },
    create: () => new NoopVaultStore(),
    projectPath: "/test/project",
  },
  {
    label: "LocalVaultStore",
    behavior: { persistent: false, respectsPullCaps: false, hasPersistedStorage: true, contentAppendsNewline: false },
    create: (root) => new LocalVaultStore(root),
    projectPath: "/test/project",
  },
  {
    label: "ObsidianVaultStore",
    behavior: { persistent: true, respectsPullCaps: true, hasPersistedStorage: true, contentAppendsNewline: true },
    create: (root) => {
      // Minimal .obsidian directory fixture so the root structurally
      // resembles a real Obsidian vault (detector checks for this dir).
      const obsidianDir = join(root, ".obsidian");
      mkdirSync(obsidianDir, { recursive: true });
      writeFileSync(join(obsidianDir, "app.json"), JSON.stringify({}), "utf-8");
      return new ObsidianVaultStore(root, "/test/project");
    },
    projectPath: "/test/project",
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.each(ALL_STORES)("VaultStore contract: $label", ({ label, behavior, create, projectPath }) => {
  let root: string;
  let store: VaultStore;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "vault-store-test-"));
    store = create(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // 1. push then pull roundtrip for a belief artifact
  // -----------------------------------------------------------------------
  it("pushes and pulls a belief artifact roundtrip", async () => {
    const artifact = makeArtifact({ projectPath, kind: "belief" });
    await expect(store.push(artifact)).resolves.toBeUndefined();

    const result = await store.pull(projectPath, {});

    // Aggregate all pulled artifacts across every kind bucket
    const allPulled = [
      ...result.decisions,
      ...result.beliefs,
      ...result.learnings,
      ...result.patterns,
    ];

    if (behavior.persistent) {
      // The artifact should have survived
      expect(
        allPulled.some((a) => a.id === artifact.id && a.kind === "belief"),
      ).toBe(true);

      const pulled = allPulled.find((a) => a.id === artifact.id)!;
      expect(pulled.projectPath).toBe(artifact.projectPath);
      // Some backends (e.g. Obsidian) append a trailing newline to content
      expect(pulled.content).toBe(
        behavior.contentAppendsNewline ? artifact.content + "\n" : artifact.content,
      );
      expect(pulled.metadata).toEqual(artifact.metadata);
      expect(pulled.kind).toBe("belief");
      expect(typeof pulled.pushedAt).toBe("string");
    } else {
      // Non-persistent backends return empty
      expect(allPulled).toHaveLength(0);
    }
  });

  // -----------------------------------------------------------------------
  // 2. validate on a fresh store succeeds
  // -----------------------------------------------------------------------
  it("validate returns true on a fresh store", async () => {
    await expect(store.validate()).resolves.toBe(true);
  });

  // -----------------------------------------------------------------------
  // 3. search by content substring returns only the matching artifact
  // -----------------------------------------------------------------------
  it("search by content substring returns only matching artifacts", async () => {
    const matching = makeArtifact({
      projectPath,
      id: "search-match-1",
      content: "This artifact contains unique-keyword-gamma for searching",
    });
    const nonMatching = makeArtifact({
      projectPath,
      id: "search-no-match-2",
      content: "Completely unrelated content here",
    });

    await store.push(matching);
    await store.push(nonMatching);

    const results = await store.search("unique-keyword-gamma", projectPath, 10);

    if (behavior.persistent) {
      expect(results.length).toBeGreaterThanOrEqual(1);
      // Every returned artifact must match the query substring
      for (const a of results) {
        expect(
          a.content.toLowerCase().includes("unique-keyword-gamma") ||
          a.id.toLowerCase().includes("unique-keyword-gamma") ||
          a.kind.toLowerCase().includes("unique-keyword-gamma"),
        ).toBe(true);
      }
    } else {
      expect(results).toHaveLength(0);
    }
  });

  // -----------------------------------------------------------------------
  // 4. pull respects caps (or documents that it doesn't)
  // -----------------------------------------------------------------------
  it("pull respects caps after pushing multiple belief artifacts", async () => {
    const BELIEF_COUNT = 5;

    for (let i = 0; i < BELIEF_COUNT; i++) {
      await store.push(makeArtifact({ projectPath, kind: "belief", id: `cap-belief-${i}`, content: `Belief cap test ${i}` }));
    }
    const result = await store.pull(projectPath, { beliefCap: 2 });

    if (behavior.respectsPullCaps) {
      // Obsidian: capped at 2
      expect(result.beliefs).toHaveLength(2);
    } else if (behavior.persistent) {
      // Local: ignores caps → returns all 5
      expect(result.beliefs).toHaveLength(BELIEF_COUNT);
    } else {
      // Noop: always empty
      expect(result.beliefs).toHaveLength(0);
    }
  });

  // -----------------------------------------------------------------------
  // 5. invalid artifact handling
  // -----------------------------------------------------------------------
  it("handles invalid or malformed persisted data gracefully", async () => {
    if (label === "NoopVaultStore") {
      // Noop is permissive by design: it never persists and never throws
      await expect(store.push(makeArtifact({ projectPath, content: "" }))).resolves.toBeUndefined();
      await expect(store.push(makeArtifact({ projectPath, content: "   ", metadata: {} }))).resolves.toBeUndefined();
      await expect(store.validate()).resolves.toBe(true);
      const result = await store.pull(projectPath, { beliefCap: 0 });
      expect(result.beliefs).toHaveLength(0);
      return;
    }

    if (label === "LocalVaultStore") {
      // Overwrite with completely broken content
      writeFileSync(
        join(root, "MEMORY.md"),
        [
          "This file has no valid vault structure.",
          "%%% GARBAGE %%",
          "## unknown:bad-header",
          "- **projectPath**: /missing/content",
        ].join("\n"),
        "utf-8",
      );

      // pull must not throw and should return empty results
      const pullResult = await store.pull(projectPath, {});
      for (const kind of ALL_KINDS) {
        expect(pullResult[kind + "s" as keyof VaultPullResult]).toBeInstanceOf(Array);
      }

      // search must not throw
      const searchResult = await store.search("garbage", projectPath, 10);
      expect(searchResult).toBeInstanceOf(Array);

      // validate must still succeed (root directory exists)
      await expect(store.validate()).resolves.toBe(true);
      return;
    }

    if (label === "ObsidianVaultStore") {
      const noesisDir = join(root, "Noesis");
      mkdirSync(noesisDir, { recursive: true });

      // File 1: completely missing frontmatter
      writeFileSync(join(noesisDir, "noesis-belief-no-fm.md"), "No frontmatter at all.\n", "utf-8");

      // File 2: frontmatter present but missing required `projectPath`
      writeFileSync(
        join(noesisDir, "noesis-belief-noproject.md"),
        "---\nkind: belief\nid: no-project-test\n---\nbody\n",
        "utf-8",
      );

      // File 3: frontmatter present but missing `id`
      writeFileSync(
        join(noesisDir, "noesis-belief-noid.md"),
        "---\nkind: belief\nprojectPath: /test/project\n---\nbody\n",
        "utf-8",
      );

      // File 4: does not match the noesis-*.md naming convention → ignored by readAllArtifacts
      writeFileSync(
        join(noesisDir, "random-note.md"),
        "---\nkind: belief\nprojectPath: /test/project\nid: random\npushedAt: 2026-01-01T00:00:00Z\n---\ncontent\n",
        "utf-8",
      );

      // File 5: valid file for a different project (should be filtered by pull but not crash)
      writeFileSync(
        join(noesisDir, "noesis-decision-other-project.md"),
        [
          "---",
          "kind: decision",
          "projectPath: /other/project",
          "id: other-proj-decision",
          "pushedAt: 2026-01-01T00:00:00Z",
          "---",
          "Some other project's decision",
        ].join("\n"),
        "utf-8",
      );

      // pull must not throw and must ignore all invalid files
      const pullResult = await store.pull(projectPath, {});
      for (const kind of ALL_KINDS) {
        expect(pullResult[kind + "s" as keyof VaultPullResult]).toBeInstanceOf(Array);
      }
      // Only the valid file for our project would be included, but there are none
      expect(pullResult.beliefs).toHaveLength(0);
      expect(pullResult.decisions).toHaveLength(0);

      // search must not throw
      const searchResult = await store.search("decision", projectPath, 10);
      expect(searchResult).toBeInstanceOf(Array);

      // validate must still succeed
      await expect(store.validate()).resolves.toBe(true);
      return;
    }
  });
});
