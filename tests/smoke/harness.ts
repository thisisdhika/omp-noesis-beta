"use strict";

/**
 * Core smoke test harness for the noesis cognitive extension.
 *
 * Uses OMP's RPC mode (JSON lines over stdin/stdout) to drive agent sessions
 * WITHOUT importing the OMP SDK (which requires the pi_natives native addon).
 * Spawns `omp --mode rpc` as a subprocess and communicates via the RPC protocol.
 *
 * Protocol:
 *   stdin  → newline-delimited JSON commands ({"type":"prompt","message":"..."})
 *   stdout → newline-delimited JSON events ({"type":"tool_execution_end",...})
 *   Ready signal: {"type":"ready"}
 */

import { spawn, type Subprocess, type FileSink } from "bun";
import { WORKDIR, MODEL, STATE_PATH, PROMPT_TIMEOUT_MS } from "./config.ts";
import type { NoesisState } from "../../src/schema.ts";
import { readFile, unlink } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { accessSync } from "node:fs";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface SmokeContext {
  prompt(message: string): Promise<void>;
  /** Send a prompt and wait for the first tool_execution_end event. */
  promptAndWait(
    message: string,
    timeoutMs?: number,
  ): Promise<Record<string, unknown>>;
  events: Record<string, unknown>[];
  waitForEvent(
    predicate: (e: Record<string, unknown>) => boolean,
    timeoutMs?: number,
  ): Promise<Record<string, unknown>>;
  waitForTool(
    name: string,
    timeoutMs?: number,
  ): Promise<Record<string, unknown>>;
  readState(): Promise<NoesisState | null>;
  dispose(): Promise<void>;
}

// ---------------------------------------------------------------------------
// RPC wire helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

type RpcCommand = { type: "prompt"; message: string } | { type: "abort" };

function sendCommand(stdin: FileSink, cmd: RpcCommand): void {
  stdin.write(encoder.encode(JSON.stringify(cmd) + "\n"));
  stdin.flush();
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

function resolveCliPath(): string {
  const ompBin = "/opt/homebrew/bin/omp";
  const bundled = new URL(
    "../../node_modules/@oh-my-pi/pi-coding-agent/dist/cli.js",
    import.meta.url,
  ).pathname;
  try {
    accessSync(ompBin);
    return ompBin;
  } catch {
    return bundled;
  }
}

function resolveExtensionPath(): string {
  return new URL("../../src/index.ts", import.meta.url).pathname;
}

// ---------------------------------------------------------------------------
// Internal: spawn RPC process and await ready signal
// ---------------------------------------------------------------------------

interface RpcProcess {
  proc: Subprocess<"pipe", "pipe", "pipe">;
  events: Record<string, unknown>[];
  stdin: FileSink;
  readLoop: Promise<void>;
}

async function spawnRpcProcess(): Promise<RpcProcess> {
  const cliPath = resolveCliPath();
  const extensionPath = resolveExtensionPath();
  const isOmpBin = cliPath === "/opt/homebrew/bin/omp";

  const rpcArgs = [
    "--mode",
    "rpc",
    "--model",
    MODEL,
    "--thinking",
    "minimal",
    "--extension",
    extensionPath,
  ];
  const cmd = isOmpBin ? [cliPath, ...rpcArgs] : ["bun", cliPath, ...rpcArgs];

  const proc: Subprocess<"pipe", "pipe", "pipe"> = spawn({
    cmd,
    cwd: WORKDIR,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...Bun.env },
  });

  const events: Record<string, unknown>[] = [];
  let ready = false;
  let readyError: Error | null = null;

  const decoder = new TextDecoder();
  const stdoutReader = proc.stdout.getReader();
  let buffer = "";

  const readLoop = (async () => {
    try {
      while (true) {
        const { value, done } = await stdoutReader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          try {
            const obj = JSON.parse(line);
            if (!ready && obj.type === "ready") {
              ready = true;
            } else if (ready) {
              events.push(obj);
            }
          } catch {
            // skip non-JSON lines
          }
        }
      }
      const tail = buffer.trim();
      if (tail) {
        try {
          events.push(JSON.parse(tail));
        } catch {
          /* skip */
        }
      }
    } catch (e) {
      if (!ready) readyError = e instanceof Error ? e : new Error(String(e));
    }
  })();

  const stderrReader = proc.stderr.getReader();
  const stderrLoop = (async () => {
    try {
      while (true) {
        const { done } = await stderrReader.read();
        if (done) break;
      }
    } catch {
      /* ignore */
    }
  })();

  // Poll for ready signal
  const deadline = Date.now() + 30_000;
  while (!ready && !readyError && Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, 50));
  }

  if (readyError) {
    proc.kill();
    throw new Error(
      `RPC process failed before ready: ${(readyError as Error).message}`,
    );
  }
  if (!ready) {
    proc.kill();
    throw new Error(`Timeout waiting for RPC ready.`);
  }

  const stdin = proc.stdin;

  return { proc, events, stdin, readLoop };
}

// ---------------------------------------------------------------------------
// Context builders
// ---------------------------------------------------------------------------

function buildContext(
  proc: Subprocess<"pipe", "pipe", "pipe">,
  events: Record<string, unknown>[],
  stdin: FileSink,
  readLoop: Promise<void>,
  cleanOnDispose: boolean,
): SmokeContext {
  readLoop.catch(() => {});

  return {
    async prompt(message: string): Promise<void> {
      sendCommand(stdin, { type: "prompt", message });
    },
    async promptAndWait(
      message: string,
      timeoutMs: number = PROMPT_TIMEOUT_MS,
    ): Promise<Record<string, unknown>> {
      sendCommand(stdin, { type: "prompt", message });
      return this.waitForEvent(
        (e) => e.type === "tool_execution_end",
        timeoutMs,
      );
    },

    events,

    waitForEvent(
      predicate: (e: Record<string, unknown>) => boolean,
      timeoutMs: number = PROMPT_TIMEOUT_MS,
    ): Promise<Record<string, unknown>> {
      const { promise, resolve, reject } =
        Promise.withResolvers<Record<string, unknown>>();
      const deadline = Date.now() + timeoutMs;
      const check = () => {
        const match = events.find(predicate);
        if (match) {
          resolve(match);
          return;
        }
        if (Date.now() > deadline) {
          reject(
            new Error(
              `Timeout waiting for event after ${timeoutMs}ms. ` +
                `Events seen: [${events.map((e) => e.type).join(", ")}]`,
            ),
          );
          return;
        }
        setTimeout(check, 100);
      };
      check();
      return promise;
    },

    async waitForTool(
      name: string,
      timeoutMs?: number,
    ): Promise<Record<string, unknown>> {
      return this.waitForEvent(
        (e) => e.type === "tool_execution_end" && e.toolName === name,
        timeoutMs,
      );
    },

    async readState(): Promise<NoesisState | null> {
      try {
        const raw = await readFile(STATE_PATH, "utf-8");
        return JSON.parse(raw) as NoesisState;
      } catch {
        return null;
      }
    },

    async dispose(): Promise<void> {
      try {
        sendCommand(stdin, { type: "abort" });
      } catch {
        /* ok */
      }
      try {
        stdin.end();
      } catch {
        /* ok */
      }
      try {
        proc.kill();
      } catch {
        /* ok */
      }
      if (cleanOnDispose) {
        try {
          await unlink(STATE_PATH);
        } catch {
          /* ok */
        }
      }
    },
  };
}

/**
 * Create a fresh SmokeContext with a clean state.json.
 */
export async function createSmokeContext(): Promise<SmokeContext> {
  mkdirSync(WORKDIR, { recursive: true });
  try {
    await unlink(STATE_PATH);
  } catch {
    /* ok */
  }
  const { proc, events, stdin, readLoop } = await spawnRpcProcess();
  return buildContext(proc, events, stdin, readLoop, true);
}

/**
 * Create a SmokeContext that PRESERVES existing state.json.
 */
export async function createPersistentContext(): Promise<SmokeContext> {
  mkdirSync(WORKDIR, { recursive: true });
  const { proc, events, stdin, readLoop } = await spawnRpcProcess();
  return buildContext(proc, events, stdin, readLoop, false);
}
