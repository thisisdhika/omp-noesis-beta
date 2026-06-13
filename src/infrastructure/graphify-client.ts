import { execFileSync } from "node:child_process";
import { existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { CapabilityLevel } from "../schema.js";

export class GraphifyClient {
  private _capability: CapabilityLevel | undefined;

  constructor(private root: string) {}

  get capability(): CapabilityLevel {
    if (this._capability === undefined) {
      this._capability = this.detectCapability();
    }
    return this._capability;
  }

  detectCapability(): CapabilityLevel {
    try {
      execFileSync("graphify", ["--version"], { timeout: 5000, cwd: this.root });
    } catch {
      return (this._capability = "DEGRADED");
    }

    const graphPath = join(this.root, "graphify-out", "graph.json");
    if (!existsSync(graphPath)) {
      return (this._capability = "NO_GRAPH");
    }

    // Check freshness: graph mtime vs newest source mtime
    const graphMtime = statSync(graphPath).mtimeMs;
    const newestSource = this.getNewestSourceMtime();
    if (graphMtime < newestSource) {
      return (this._capability = "STALE");
    }

    return (this._capability = "FULL");
  }

  refreshCapability(): CapabilityLevel {
    return this.detectCapability();
  }

  query(question: string): string {
    const result = execFileSync("graphify", [
      "query", question, "--graph", "graphify-out/graph.json",
    ], { timeout: 30000, cwd: this.root });
    return result.toString("utf-8");
  }

  updateGraph(): void {
    execFileSync("graphify", ["update", "."], { timeout: 120000, cwd: this.root });
  }

  buildGraph(): void {
    execFileSync("graphify", ["."], { timeout: 300000, cwd: this.root });
  }

  explain(node: string): string {
    const result = execFileSync("graphify", [
      "explain", node, "--graph", "graphify-out/graph.json",
    ], { timeout: 30000, cwd: this.root });
    return result.toString("utf-8");
  }

  path(source: string, target: string): string {
    const result = execFileSync("graphify", [
      "path", source, target, "--graph", "graphify-out/graph.json",
    ], { timeout: 30000, cwd: this.root });
    return result.toString("utf-8");
  }

  private getNewestSourceMtime(): number {
    let newest = 0;
    try {
      for (const dir of [this.root, join(this.root, "src")]) {
        if (!existsSync(dir)) continue;
        for (const entry of readdirSync(dir)) {
          if (entry.endsWith(".ts") || entry.endsWith(".js") || entry.endsWith(".json")) {
            try {
              const mtime = statSync(join(dir, entry)).mtimeMs;
              if (mtime > newest) newest = mtime;
            } catch { /* skip unreadable */ }
          }
        }
      }
    } catch { /* if stat fails, treat as stale */ }
    return newest;
  }
}
