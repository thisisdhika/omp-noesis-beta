import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphifyClient } from "../../src/infrastructure/graphify-client.js";

describe("GraphifyClient async operations", () => {
  let workDir: string;
  let previousPath: string | undefined;
  let client: GraphifyClient;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "graphify-async-test-"));
    previousPath = process.env.PATH;

    const graphifyPath = join(workDir, "graphify");
    writeFileSync(
      graphifyPath,
      [
        "#!/bin/sh",
        "cmd=\"$1\"",
        "shift",
        "case \"$cmd\" in",
        "  --version)",
        "    echo 'graphify 1.0'",
        "    ;;",
        "  query)",
        "    echo 'found: ComponentA -> ComponentB'",
        "    ;;",
        "  update)",
        "    mkdir -p graphify-out",
        "    touch graphify-out/graph.json",
        "    echo 'updated'",
        "    ;;",
        "  explain)",
        "    echo 'explain output'",
        "    ;;",
        "  path)",
        "    echo 'path output'",
        "    ;;",
        "  *)",
        "    exit 1",
        "    ;;",
        "esac",
      ].join("\n"),
      "utf8",
    );
    chmodSync(graphifyPath, 0o755);
    process.env.PATH = `${workDir}:${previousPath ?? ""}`;
    client = new GraphifyClient(workDir);
  });

  afterEach(() => {
    process.env.PATH = previousPath;
    rmSync(workDir, { recursive: true, force: true });
  });

  it("query resolves with a string when execFile succeeds", async () => {
    const result = await client.query("trace data flow");

    expect(result).toBe("found: ComponentA -> ComponentB\n");
  });

  it("capability falls back to DEGRADED when graphify is unavailable", () => {
    const unavailable = new GraphifyClient(join(workDir, "missing-root"));

    expect(unavailable.capability).toBe("DEGRADED");
  });

  it("staleRecover awaits updateGraph and refreshes capability", async () => {
    expect(existsSync(join(workDir, "graphify-out", "graph.json"))).toBe(false);

    const cap = await client.staleRecover();

    expect(cap).toBe("FULL");
    expect(existsSync(join(workDir, "graphify-out", "graph.json"))).toBe(true);
  });

  it("explain and path return stdout", async () => {
    await client.updateGraph();
    mkdirSync(join(workDir, "src"), { recursive: true });

    await expect(client.explain("ComponentA")).resolves.toBe("explain output\n");
    await expect(client.path("ComponentA", "ComponentB")).resolves.toBe("path output\n");
  });
});
