import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export const MODEL_ID = "opencode-zen/deepseek-v4-flash-free:off";
const STARTUP_MS = 20_000;
const CMD_MS = 120_000;
const CLOSE_MS = 10_000;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type RpcFrame = {
  type: string;
  id?: string;
  success?: boolean;
  command?: string;
  data?: JsonValue;
  error?: string;
  toolName?: string;
  toolCallId?: string;
  content?: JsonValue;
  [key: string]: JsonValue | undefined;
};

interface Pending {
  command: string;
  resolve: (f: RpcFrame) => void;
  reject: (e: Error) => void;
  timer: Timer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRpcFrame(value: unknown): value is RpcFrame {
  return isRecord(value) && typeof value.type === "string";
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
    this.child = spawn("omp", ["--mode", "rpc", "--model", modelId, "--extension", extensionPath], {
      cwd: workDir,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    this.readyPromise = promise;
    this.#readyResolve = resolve;
    this.#readyReject = reject;
    this.#readyTimer = setTimeout(() => reject(new Error("RPC ready timeout")), STARTUP_MS);

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (data: string) => this.#feed(data));
    this.child.stderr.on("data", () => {});
    this.child.on("error", (error) => { if (!this.closed) this.#bail(new Error(`child error: ${String(error)}`)); });
    this.child.on("exit", (code) => { if (code !== 0 && code !== null && !this.closed) this.#bail(new Error(`omp exited code=${String(code)}`)); });
  }

  async ready(): Promise<void> { await this.readyPromise; }
  async call(cmd: Record<string, JsonValue> & { type: string }): Promise<RpcFrame> { const id = `req_${this.nextId++}`; const { promise, resolve, reject } = Promise.withResolvers<RpcFrame>(); const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`RPC timeout: ${cmd.type}`)); }, CMD_MS); this.pending.set(id, { command: cmd.type, resolve, reject, timer }); this.child.stdin.write(`${JSON.stringify({ ...cmd, id })}\n`); const resp = await promise; if (!resp.success) throw new Error(`${cmd.type} failed: ${resp.error ?? "unknown"}`); return resp; }
  async prompt(msg: string): Promise<void> { await this.call({ type: "prompt", message: msg }); }
  async compact(instructions?: string): Promise<void> { await this.call({ type: "compact", ...(instructions ? { customInstructions: instructions } : {}) }); }
  async handoff(instructions?: string): Promise<void> { await this.call({ type: "handoff", ...(instructions ? { customInstructions: instructions } : {}) }); }
  async newSession(parentSession?: string): Promise<void> { await this.call({ type: "new_session", ...(parentSession ? { parentSession } : {}) }); }
  hasEvent(type: string): boolean { return this.frames.some((frame) => frame.type === type); }
  toolStarted(name: string): boolean {
    return this.frames.some(
      (frame) => frame.type === "tool_execution_start" && frame.toolName === name,
    );
  }
  getSessionFile(): string | undefined {
    const state = this.frames.find((frame) => frame.type === "response" && frame.command === "get_state");
    const data = isRecord(state?.data) ? state.data : undefined;
    const sessionFile = typeof data?.sessionFile === "string" ? data.sessionFile : undefined;
    return sessionFile;
  }
  async waitIdle(): Promise<void> { const deadline = Date.now() + CMD_MS; let lastEndIdx = -1; while (Date.now() < deadline) { let end = -1; let start = -1; for (let i = this.frames.length - 1; i >= 0; i--) { if (end < 0 && this.frames[i]?.type === "agent_end") end = i; if (start < 0 && this.frames[i]?.type === "agent_start") start = i; if (end >= 0 && start >= 0) break; } if (end >= 0 && end > start) { if (lastEndIdx < 0) lastEndIdx = end; else if (end === lastEndIdx) return; else lastEndIdx = end; } await sleep(500); } }
  async close(): Promise<void> { this.closed = true; for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("closed")); } this.pending.clear(); if (!this.child.stdin.destroyed) this.child.stdin.end(); const { promise, resolve } = Promise.withResolvers<void>(); const killer = setTimeout(() => { if (!this.child.killed) this.child.kill("SIGTERM"); resolve(); }, CLOSE_MS); this.child.once("exit", () => { clearTimeout(killer); resolve(); }); await promise; }
  #feed(data: string): void { this.buf += data; for (;;) { const nl = this.buf.indexOf("\n"); if (nl < 0) break; const raw = this.buf.slice(0, nl).trim(); this.buf = this.buf.slice(nl + 1); if (raw.length === 0) continue; const parsed = JSON.parse(raw); if (!isRpcFrame(parsed)) continue; const frame = parsed; this.frames.push(frame); if (frame.type === "ready") { clearTimeout(this.#readyTimer); this.#readyResolve?.(); this.#readyResolve = undefined; this.#readyReject = undefined; continue; } if (frame.type === "response" && frame.id) { const p = this.pending.get(frame.id); if (p) { clearTimeout(p.timer); this.pending.delete(frame.id); p.resolve(frame); } } } }
  #bail(err: Error): void { if (this.#readyReject) { clearTimeout(this.#readyTimer); this.#readyReject(err); this.#readyReject = undefined; this.#readyResolve = undefined; } for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(err); } this.pending.clear(); }
}

function sleep(ms: number): Promise<void> { const { promise, resolve } = Promise.withResolvers<void>(); const timer = setTimeout(() => { clearTimeout(timer); resolve(); }, ms); return promise; }
