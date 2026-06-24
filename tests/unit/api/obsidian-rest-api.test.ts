"use strict";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startRestApi, type RestApiServer } from "../../../src/api/obsidian-rest-api.js";
import { ObsidianVaultStore } from "../../../src/vault/obsidian-vault-store.js";
import { createTempDir } from "../../../tests/helpers/temp-dir.js";

/** Helper: write a vault artifact file with YAML frontmatter. */
function writeArtifact(
  dir: string,
  kind: string,
  id: string,
  overrides: Record<string, unknown> = {},
): void {
  const kindDir = join(dir, ".obsidian/noesis", kind);
  mkdirSync(kindDir, { recursive: true });
  const frontmatter: Record<string, unknown> = {
    kind,
    id,
    pushedAt: "2026-06-24T12:00:00.000Z",
    projectPath: ".",
    tags: "[noesis, noesis/belief]",
    status: "active",
    ...overrides,
  };
  const fmLines = Object.entries(frontmatter).map(
    ([k, v]) => `${k}: ${typeof v === "string" && v.includes(" ") ? `"${v}"` : v}`,
  );
  const content = `---\n${fmLines.join("\n")}\n---\n\n${overrides.content || ""}`;
  writeFileSync(join(kindDir, `${id}.md`), content, "utf-8");
}

describe("ObsidianRestAPI", () => {
  let tmp: { path: string; cleanup(): void };
  let server: RestApiServer | null;
  let baseUrl: string;

  const origEnv = process.env.NOESIS_REST_API;

  beforeEach(() => {
    process.env.NOESIS_REST_API = "true";
    tmp = createTempDir();
  });

  afterEach(() => {
    process.env.NOESIS_REST_API = origEnv;
    if (server) server.stop();
    tmp.cleanup();
  });

  function start(port = 0): string {
    const vaultStore = new ObsidianVaultStore(tmp.path);
    server = startRestApi({ vaultStore, port });
    if (!server) throw new Error("Failed to start server");
    return `http://localhost:${server.port}`;
  }

  // ====================================================================
  // Health
  // ====================================================================

  describe("GET /health", () => {
    it("returns ok status with empty vault", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.status).toBe("ok");
      expect(body.vault).toBe(true);
      expect(body.artifactCount).toBe(0);
      expect(body.kinds).toEqual(["decision", "learning", "belief", "pattern", "session"]);
    });

    it("returns correct artifact count", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      writeArtifact(tmp.path, "decision", "d1", { content: "Decision 1" });
      writeArtifact(tmp.path, "belief", "b1", { content: "Belief 1" });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/health`);
      const body = await res.json() as Record<string, unknown>;
      expect(body.artifactCount).toBe(2);
    });

    it("returns degraded when vault missing", async () => {
      baseUrl = start();
      const res = await fetch(`${baseUrl}/health`);
      const body = await res.json() as Record<string, unknown>;
      expect(body.status).toBe("degraded");
      expect(body.vault).toBe(false);
    });
  });

  // ====================================================================
  // GET /artifacts
  // ====================================================================

  describe("GET /artifacts", () => {
    it("returns all artifacts", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      writeArtifact(tmp.path, "decision", "d1", { content: "Decision 1" });
      writeArtifact(tmp.path, "belief", "b1", { content: "Belief 1" });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/artifacts`);
      const body = await res.json() as Record<string, unknown>;
      expect(body.total).toBe(2);
      expect(Array.isArray(body.artifacts)).toBe(true);
    });

    it("filters by kind", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      writeArtifact(tmp.path, "decision", "d1", { content: "Decision 1" });
      writeArtifact(tmp.path, "belief", "b1", { content: "Belief 1" });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/artifacts?kind=decision`);
      const body = await res.json() as Record<string, unknown>;
      expect(body.total).toBe(1);
      expect((body.artifacts as Array<Record<string, unknown>>)[0]!.kind).toBe("decision");
    });

    it("returns empty for invalid kind", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/artifacts?kind=invalid`);
      expect(res.status).toBe(400);
    });
  });

  // ====================================================================
  // GET /artifacts/:kind
  // ====================================================================

  describe("GET /artifacts/:kind", () => {
    it("returns artifacts of a specific kind", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      writeArtifact(tmp.path, "decision", "d1", { content: "Decision 1" });
      writeArtifact(tmp.path, "decision", "d2", { content: "Decision 2" });
      writeArtifact(tmp.path, "belief", "b1", { content: "Belief 1" });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/artifacts/decision`);
      const body = await res.json() as Record<string, unknown>;
      expect(body.total).toBe(2);
    });

    it("returns 400 for invalid kind", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/artifacts/nope`);
      expect(res.status).toBe(400);
    });
  });

  // ====================================================================
  // GET /artifacts/:kind/:id
  // ====================================================================

  describe("GET /artifacts/:kind/:id", () => {
    it("returns a specific artifact", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      writeArtifact(tmp.path, "decision", "d1", { content: "Decision 1" });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/artifacts/decision/d1`);
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.id).toBe("d1");
      expect(body.kind).toBe("decision");
    });

    it("returns 404 for missing artifact", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/artifacts/decision/nonexistent`);
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid kind", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/artifacts/nope/id1`);
      expect(res.status).toBe(400);
    });
  });

  // ====================================================================
  // GET /search
  // ====================================================================

  describe("GET /search", () => {
    it("searches artifact content", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      writeArtifact(tmp.path, "decision", "d1", { content: "Use TypeScript" });
      writeArtifact(tmp.path, "belief", "b1", { content: "Rust is fast" });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/search?q=TypeScript`);
      const body = await res.json() as Record<string, unknown>;
      expect(body.total).toBe(1);
      expect(body.query).toBe("TypeScript");
    });

    it("returns empty for no matches", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      writeArtifact(tmp.path, "decision", "d1", { content: "Use TypeScript" });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/search?q=Python`);
      const body = await res.json() as Record<string, unknown>;
      expect(body.total).toBe(0);
    });

    it("returns 400 when q is missing", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/search`);
      expect(res.status).toBe(400);
    });
  });

  // ====================================================================
  // 404
  // ====================================================================

  describe("Unknown routes", () => {
    it("returns 404 for unknown paths", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/unknown`);
      expect(res.status).toBe(404);
      const body = await res.json() as Record<string, unknown>;
      expect(body.error).toBe("Not found");
    });
  });

  // ====================================================================
  // Lifecycle
  // ====================================================================

  describe("Lifecycle", () => {
    it("returns null when NOESIS_REST_API is not set", () => {
      delete process.env.NOESIS_REST_API;
      const vaultStore = new ObsidianVaultStore(tmp.path);
      const result = startRestApi({ vaultStore });
      expect(result).toBeNull();
    });

    it("stops cleanly", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      server!.stop();
      server = null;
    });
  });

  // ====================================================================
  // Graceful degradation
  // ====================================================================

  describe("Graceful degradation", () => {
    it("handles missing vault directory gracefully", async () => {
      // No .obsidian directory created
      baseUrl = start();
      const res = await fetch(`${baseUrl}/health`);
      const body = await res.json() as Record<string, unknown>;
      expect(body.status).toBe("degraded");
    });

    it("handles search on empty vault", async () => {
      mkdirSync(join(tmp.path, ".obsidian"), { recursive: true });
      baseUrl = start();
      const res = await fetch(`${baseUrl}/search?q=anything`);
      const body = await res.json() as Record<string, unknown>;
      expect(body.total).toBe(0);
    });
  });
});
