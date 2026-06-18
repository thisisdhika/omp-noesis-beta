"use strict";

/**
 * Unit tests for vault-search-tool.ts — noesis_vault_search tool.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createMockPi, type MockPi } from "../../helpers/mock-pi.js";
import { createRuntime, type NoesisRuntime } from "../../../src/runtime.js";
import { registerVaultSearchTool } from "../../../src/tools/vault-search-tool.js";
import { LocalVaultStore } from "../../../src/vault/local-vault-store.js";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MEMORY_FILE = "MEMORY.md";
const MEMORY_FILE_BAK = "MEMORY.md.bak";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolExecuteResult {
  content: Array<{ type: string; text: string }>;
  isError: boolean;
  details: Record<string, unknown>;
}

interface MockPiExtended extends MockPi {
  _getTool(name: string): Record<string, unknown> | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Remove MEMORY.md and any backup file created during tests. */
function cleanMemoryFiles(): void {
  for (const name of [MEMORY_FILE, MEMORY_FILE_BAK]) {
    const p = join(process.cwd(), name);
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {
      // best-effort cleanup
    }
  }
}

/** Create a tool executor for a registered tool. */
function toolExecutor(
  pi: MockPiExtended,
  name: string,
): (params: Record<string, unknown>) => Promise<ToolExecuteResult> {
  const def = pi._getTool(name);
  const exec = def?.execute as
    | ((...args: unknown[]) => Promise<ToolExecuteResult>)
    | undefined;
  return async (params: Record<string, unknown>) => {
    return exec!("t-id", params, null, () => {}, {});
  };
}

// ---------------------------------------------------------------------------
// Test: Vault unavailable (NoopVaultStore)
// ---------------------------------------------------------------------------

describe("noesis_vault_search — vault unavailable", () => {
  let pi: MockPiExtended;
  let runtime: NoesisRuntime;

  beforeEach(async () => {
    cleanMemoryFiles();
    const raw = createMockPi();
    pi = raw as unknown as MockPiExtended;
    runtime = await createRuntime(pi as unknown as ExtensionAPI);
    registerVaultSearchTool(pi as unknown as ExtensionAPI, runtime);
  });

  afterEach(() => {
    cleanMemoryFiles();
  });

  it("returns error when vault backend is not available", async () => {
    const execute = toolExecutor(pi, "noesis_vault_search");
    const result = await execute({ query: "test", maxResults: 10 });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBe("Vault not available or not writable");
    expect(result.details.error).toBe("vault_unavailable");
  });
});

// ---------------------------------------------------------------------------
// Test: Vault available (LocalVaultStore with MEMORY.md)
// ---------------------------------------------------------------------------

describe("noesis_vault_search — vault available", () => {
  let pi: MockPiExtended;
  let runtime: NoesisRuntime;

  beforeEach(async () => {
    cleanMemoryFiles();
    const raw = createMockPi();
    pi = raw as unknown as MockPiExtended;
    runtime = await createRuntime(pi as unknown as ExtensionAPI);
    registerVaultSearchTool(pi as unknown as ExtensionAPI, runtime);
  });

  afterEach(() => {
    cleanMemoryFiles();
  });

  it("returns empty results message when no artifacts match the query", async () => {
    // Create a valid vault store with MEMORY.md (empty)
    const store = new LocalVaultStore(process.cwd());
    await store.validate();

    const execute = toolExecutor(pi, "noesis_vault_search");
    const result = await execute({ query: "nonexistent", maxResults: 10 });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toBe(
      'No vault artifacts found matching "nonexistent"',
    );
    expect(result.details.count).toBe(0);
  });

  it("returns formatted results when artifacts match", async () => {
    // Push test artifacts via LocalVaultStore
    const store = new LocalVaultStore(process.cwd());
    await store.validate();
    await store.push({
      kind: "decision",
      projectPath: process.cwd(),
      id: "test-dec-1",
      pushedAt: "2026-06-17T12:00:00.000Z",
      content: "Use MCP as primary Graphify integration",
    });
    await store.push({
      kind: "belief",
      projectPath: process.cwd(),
      id: "test-bel-1",
      pushedAt: "2026-06-17T12:01:00.000Z",
      content: "Markdown headers are more token-efficient than XML",
    });

    const execute = toolExecutor(pi, "noesis_vault_search");
    const result = await execute({ query: "Graphify", maxResults: 10 });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain("Found 1 vault artifact(s):");
    expect(result.content[0]!.text).toContain("[decision]");
    expect(result.content[0]!.text).toContain("test-dec-1");
    expect(result.content[0]!.text).toContain("Graphify");
    expect(result.details.count).toBe(1);
  });

  it("returns matches from multiple artifacts", async () => {
    const store = new LocalVaultStore(process.cwd());
    await store.validate();
    await store.push({
      kind: "decision",
      projectPath: process.cwd(),
      id: "dec-mcp",
      pushedAt: "2026-06-17T12:00:00.000Z",
      content: "Use MCP for Graphify",
    });
    await store.push({
      kind: "belief",
      projectPath: process.cwd(),
      id: "bel-mcp",
      pushedAt: "2026-06-17T12:01:00.000Z",
      content: "MCP is the preferred integration pattern",
    });
    await store.push({
      kind: "learning",
      projectPath: process.cwd(),
      id: "lrn-other",
      pushedAt: "2026-06-17T12:02:00.000Z",
      content: "Unrelated learning entry",
    });

    const execute = toolExecutor(pi, "noesis_vault_search");
    const result = await execute({ query: "MCP", maxResults: 10 });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain("Found 2 vault artifact(s):");
    expect(result.content[0]!.text).toContain("dec-mcp");
    expect(result.content[0]!.text).toContain("bel-mcp");
    expect(result.content[0]!.text).not.toContain("lrn-other");
    expect(result.details.count).toBe(2);
  });

  it("filters results by kind", async () => {
    const store = new LocalVaultStore(process.cwd());
    await store.validate();
    await store.push({
      kind: "decision",
      projectPath: process.cwd(),
      id: "dec-graph",
      pushedAt: "2026-06-17T12:00:00.000Z",
      content: "Use Graphify for knowledge graphs",
    });
    await store.push({
      kind: "belief",
      projectPath: process.cwd(),
      id: "bel-graph",
      pushedAt: "2026-06-17T12:01:00.000Z",
      content: "Graphify is our knowledge graph tool",
    });

    const execute = toolExecutor(pi, "noesis_vault_search");
    // Both match "Graph", but filter to only "belief"
    const result = await execute({
      query: "Graph",
      kind: "belief",
      maxResults: 10,
    });

    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toContain("Found 1 vault artifact(s):");
    expect(result.content[0]!.text).toContain("[belief]");
    expect(result.content[0]!.text).toContain("bel-graph");
    expect(result.content[0]!.text).not.toContain("dec-graph");
    expect(result.details.count).toBe(1);
  });

  it("respects maxResults limit", async () => {
    const store = new LocalVaultStore(process.cwd());
    await store.validate();
    await store.push({
      kind: "decision",
      projectPath: process.cwd(),
      id: "dec-a",
      pushedAt: "2026-06-17T12:00:00.000Z",
      content: "Alpha decision",
    });
    await store.push({
      kind: "decision",
      projectPath: process.cwd(),
      id: "dec-b",
      pushedAt: "2026-06-17T12:01:00.000Z",
      content: "Beta decision",
    });

    const execute = toolExecutor(pi, "noesis_vault_search");
    const result = await execute({
      query: "decision",
      maxResults: 1,
    });

    expect(result.isError).toBe(false);
    expect(result.details.count).toBe(1);
    expect(result.content[0]!.text).toContain("Found 1 vault artifact(s):");
  });

  it("truncates content longer than 200 characters with ellipsis", async () => {
    const store = new LocalVaultStore(process.cwd());
    await store.validate();
    const longContent = "A".repeat(250);
    await store.push({
      kind: "decision",
      projectPath: process.cwd(),
      id: "long-dec",
      pushedAt: "2026-06-17T12:00:00.000Z",
      content: longContent,
    });

    const execute = toolExecutor(pi, "noesis_vault_search");
    const result = await execute({ query: "AAAAAAAAA", maxResults: 10 });

    expect(result.isError).toBe(false);
    expect(result.details.count).toBe(1);

    // The formatted text should have exactly 200 chars of content + "..."
    const text = result.content[0]!.text as string;
    const contentLine = text.split("\n")[1]!; // second line has the artifact
    // Content is after the "[decision] long-dec: " prefix
    const prefix = "1. [decision] long-dec: ";
    expect(contentLine.startsWith(prefix)).toBe(true);
    const displayedContent = contentLine.slice(prefix.length);
    expect(displayedContent.length).toBe(203); // 200 chars + "..."
    expect(displayedContent.endsWith("...")).toBe(true);
  });

  it("does not truncate content exactly 200 characters", async () => {
    const store = new LocalVaultStore(process.cwd());
    await store.validate();
    const exactContent = "B".repeat(200);
    await store.push({
      kind: "belief",
      projectPath: process.cwd(),
      id: "exact-dec",
      pushedAt: "2026-06-17T12:00:00.000Z",
      content: exactContent,
    });

    const execute = toolExecutor(pi, "noesis_vault_search");
    const result = await execute({ query: "BBBB", maxResults: 10 });

    expect(result.isError).toBe(false);
    expect(result.details.count).toBe(1);

    const text = result.content[0]!.text as string;
    expect(text).not.toContain("...");
  });

  it("searches across artifact id", async () => {
    const store = new LocalVaultStore(process.cwd());
    await store.validate();
    await store.push({
      kind: "decision",
      projectPath: process.cwd(),
      id: "find-me-by-id",
      pushedAt: "2026-06-17T12:00:00.000Z",
      content: "This artifact has a distinctive id",
    });

    const execute = toolExecutor(pi, "noesis_vault_search");
    const result = await execute({ query: "find-me", maxResults: 10 });

    expect(result.isError).toBe(false);
    expect(result.details.count).toBe(1);
    expect(result.content[0]!.text).toContain("find-me-by-id");
  });

  it("searches across artifact kind", async () => {
    const store = new LocalVaultStore(process.cwd());
    await store.validate();
    await store.push({
      kind: "learning",
      projectPath: process.cwd(),
      id: "lrn-kind-search",
      pushedAt: "2026-06-17T12:00:00.000Z",
      content: "Some learning content",
    });

    const execute = toolExecutor(pi, "noesis_vault_search");
    // Search for "learning" as query text — matches the kind field
    const result = await execute({ query: "learning", maxResults: 10 });

    expect(result.isError).toBe(false);
    expect(result.details.count).toBe(1);
    expect(result.content[0]!.text).toContain("lrn-kind-search");
  });

  it("handles default maxResults when not provided", async () => {
    const store = new LocalVaultStore(process.cwd());
    await store.validate();
    // Push 15 artifacts — more than the default 10
    for (let i = 0; i < 15; i++) {
      await store.push({
        kind: "decision",
        projectPath: process.cwd(),
        id: `dec-${i}`,
        pushedAt: `2026-06-17T1${String(i).padStart(2, "0")}:00:00.000Z`,
        content: `Decision number ${i}`,
      });
    }

    const execute = toolExecutor(pi, "noesis_vault_search");
    // Without maxResults, the tool receives undefined → store defaults to 10
    const result = await execute({ query: "Decision" });

    expect(result.isError).toBe(false);
    // The store.search defaults to maxResults=10 when undefined,
    // so we'll get at most 10 results
    expect(result.details.count).toBeLessThanOrEqual(10);
  });
});
