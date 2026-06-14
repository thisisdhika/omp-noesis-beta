import { execFileSync, execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { CapabilityLevel } from "../schema.js";

// Promisified async execFile — avoids node:child_process/promises resolution issues
const execFile = promisify(execFileCb) as (
  file: string,
  args: string[],
  options: { timeout: number; cwd: string }
) => Promise<{ stdout: string; stderr: string }>;

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

    const graphMtime = statSync(graphPath).mtimeMs;
    return (this._capability = graphMtime < this.getNewestSourceMtime() ? "STALE" : "FULL");
  }

  refreshCapability(): CapabilityLevel {
    return this.detectCapability();
  }

  async staleRecover(): Promise<CapabilityLevel> {
    await this.updateGraph();
    return this.refreshCapability();
  }

  async query(question: string): Promise<string> {
    const { stdout } = await execFile("graphify", [
      "query", question, "--graph", "graphify-out/graph.json",
    ], { timeout: 30000, cwd: this.root });
    return stdout;
  }

  async updateGraph(): Promise<void> {
    await execFile("graphify", ["update", "."], { timeout: 120000, cwd: this.root });
  }

  async buildGraph(): Promise<void> {
    await execFile("graphify", ["."], { timeout: 300000, cwd: this.root });
  }

  async explain(node: string): Promise<string> {
    const { stdout } = await execFile("graphify", [
      "explain", node, "--graph", "graphify-out/graph.json",
    ], { timeout: 30000, cwd: this.root });
    return stdout;
  }

  async path(source: string, target: string): Promise<string> {
    const { stdout } = await execFile("graphify", [
      "path", source, target, "--graph", "graphify-out/graph.json",
    ], { timeout: 30000, cwd: this.root });
    return stdout;
  }
  private getNewestSourceMtime(): number {
    let newest = 0;
    for (const dir of [this.root, join(this.root, "src")]) {
      if (!existsSync(dir)) continue;
      for (const entry of readdirSync(dir)) {
        if (!entry.endsWith(".ts") && !entry.endsWith(".js") && !entry.endsWith(".json")) continue;
        try {
          const mtime = statSync(join(dir, entry)).mtimeMs;
          if (mtime > newest) newest = mtime;
        } catch {
          // skip unreadable
        }
      }
    }
    return newest;
  }
}

export function stderrOrMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
