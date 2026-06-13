import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export const MODEL_ID = "opencode-go/deepseek-v4-flash:off";
const STARTUP_MS = 20_000;
const CMD_MS = 120_000;
const CLOSE_MS = 10_000;

export type RpcFrame = {
  type: string;
  id?: string;
  success?: boolean;
  command?: string;
  data?: unknown;
  error?: string;
  toolName?: string;
  toolCallId?: string;
  content?: unknown;
  [key: string]: unknown;
};

interface Pending {
  command: string;
  resolve: (f: RpcFrame) => void;
  reject: (e: Error) => void;
  timer: Timer;
}

export class RpcHarness {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string, Pending>();
  readonly frames: RpcFrame[] = [];
  private nextId = 1;
  private buf = "";
  #readyResolve?: () => void;
  #readyReject?: (e: Error) => void;
  #readyTimer?: Timer;
  readonly readyPromise: Promise<void>;
  closed = false;

  constructor(readonly workDir: string, extensionPath: string, modelId: string = MODEL_ID) {
    this.child = spawn("omp", [
      "--mode", "rpc",
      "--model", modelId,
      "--extension", extensionPath,
    ], { cwd: workDir, env: process.env, stdio: ["pipe", "pipe", "pipe"] });

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    this.readyPromise = promise;
    this.#readyResolve = resolve;
    this.#readyReject = reject;
    this.#readyTimer = setTimeout(() => reject(new Error("RPC ready timeout")), STARTUP_MS);

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (d: string) => this.#feed(d));
    this.child.stderr.on("data", () => {});
    this.child.on("error", (e) => { if (!this.closed) this.#bail(new Error(`child error: ${String(e)}`)); });
    this.child.on("exit", (c) => { if (c !== 0 && c !== null && !this.closed) this.#bail(new Error(`omp exited code=${String(c)}`)); });
  }

  async ready(): Promise<void> { await this.readyPromise; }

  async call(cmd: Record<string, unknown> & { type: string }): Promise<RpcFrame> {
    const id = `req_${this.nextId++}`;
    const { promise, resolve, reject } = Promise.withResolvers<RpcFrame>();
    const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`RPC timeout: ${cmd.type}`)); }, CMD_MS);
    this.pending.set(id, { command: cmd.type, resolve, reject, timer });
    this.child.stdin.write(`${JSON.stringify({ ...cmd, id })}\n`);
    const resp = await promise;
    if (!resp.success) throw new Error(`${cmd.type} failed: ${resp.error ?? "unknown"}`);
    return resp;
  }

  async prompt(msg: string): Promise<void> {
    await this.call({ type: "prompt", message: msg });
  }

  async compact(instructions?: string): Promise<void> {
    await this.call({ type: "compact", ...(instructions ? { customInstructions: instructions } : {}) });
  }

  async handoff(instructions?: string): Promise<void> {
    await this.call({ type: "handoff", ...(instructions ? { customInstructions: instructions } : {}) });
  }

  async newSession(parentSession?: string): Promise<void> {
    await this.call({ type: "new_session", ...(parentSession ? { parentSession } : {}) });
  }

  toolEvents(name: string): RpcFrame[] {
    return this.frames.filter((f) =>
      (f.type === "tool_execution_start" || f.type === "tool_execution_end") && f.toolName === name,
    );
  }

  toolStarted(name: string): boolean {
    return this.toolEvents(name).some((f) => f.type === "tool_execution_start");
  }

  hasEvent(type: string): boolean {
    return this.frames.some((f) => f.type === type);
  }

  getDumpTools(): string[] {
    for (const f of this.frames) {
      if (f.type === "response" && f.command === "get_state") {
        const data = f.data as Record<string, unknown> | undefined;
        const tools = data?.dumpTools;
        if (Array.isArray(tools)) {
          return tools.map((t: { name?: string }) => t.name).filter((n): n is string => typeof n === "string");
        }
      }
    }
    return [];
  }

  getSessionFile(): string | undefined {
    for (const f of this.frames) {
      if (f.type === "response" && f.command === "get_state") {
        const data = f.data as Record<string, unknown> | undefined;
        return typeof data?.sessionFile === "string" ? data.sessionFile : undefined;
      }
    }
    return undefined;
  }

  async waitIdle(): Promise<void> {
    const deadline = Date.now() + CMD_MS;
    let lastEndIdx = -1;
    while (Date.now() < deadline) {
      let end = -1, start = -1;
      for (let i = this.frames.length - 1; i >= 0; i--) {
        if (end < 0 && this.frames[i]?.type === "agent_end") end = i;
        if (start < 0 && this.frames[i]?.type === "agent_start") start = i;
        if (end >= 0 && start >= 0) break;
      }
      if (end >= 0 && end > start) {
        if (lastEndIdx < 0) lastEndIdx = end;
        else if (end === lastEndIdx) return;
        else lastEndIdx = end;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error("closed")); }
    this.pending.clear();
    if (!this.child.stdin.destroyed) this.child.stdin.end();
    const { promise, resolve } = Promise.withResolvers<void>();
    const killer = setTimeout(() => { if (!this.child.killed) this.child.kill("SIGTERM"); resolve(); }, CLOSE_MS);
    this.child.once("exit", () => { clearTimeout(killer); resolve(); });
    await promise;
  }

  #feed(data: string): void {
    this.buf += data;
    for (;;) {
      const nl = this.buf.indexOf("\n");
      if (nl < 0) break;
      const raw = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (raw.length === 0) continue;
      const frame = JSON.parse(raw) as RpcFrame;
      this.frames.push(frame);
      if (frame.type === "ready") {
        clearTimeout(this.#readyTimer);
        this.#readyResolve?.();
        this.#readyResolve = undefined;
        this.#readyReject = undefined;
        continue;
      }
      if (frame.type === "response" && frame.id) {
        const p = this.pending.get(frame.id);
        if (p) { clearTimeout(p.timer); this.pending.delete(frame.id); p.resolve(frame); }
      }
    }
  }

  #bail(err: Error): void {
    if (this.#readyReject) { clearTimeout(this.#readyTimer); this.#readyReject(err); this.#readyReject = undefined; this.#readyResolve = undefined; }
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(err); }
    this.pending.clear();
  }
}
