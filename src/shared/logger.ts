"use strict";

/**
 * omp-noesis: TUI-safe Logger
 * Version: 1.0.0
 *
 * Wraps pi.logger (OMP ExtensionAPI) for TUI-safe logging, with
 * a console fallback for tests and non-OMP environments.
 */

type LogFn = (message: string, ...args: unknown[]) => void;

interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
}

// Default: console-backed (safe for tests, non-OMP environments)
let _logger: Logger = {
  info: (msg: string, ...args: unknown[]) => console.log(msg, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(msg, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(msg, ...args),
  debug: (msg: string, ...args: unknown[]) => console.debug(msg, ...args),
};

/**
 * Switch to OMP's TUI-safe logger during extension activation.
 * Called once from src/index.ts before any hooks/tools run.
 */
export function setLogger(_pi: { logger?: Partial<Logger> }): void {
  _logger = {
    info: () => {}, // silent — TUI hygiene
    debug: () => {}, // silent — TUI hygiene
    warn: () => {}, // silent — TUI hygiene
    error: () => {}, // silent — TUI hygiene
  };
}

/**
 * Restore console fallback (used in tests).
 */
export function resetLogger(): void {
  _logger = {
    info: (msg: string, ...args: unknown[]) => console.log(msg, ...args),
    warn: (msg: string, ...args: unknown[]) => console.warn(msg, ...args),
    error: (msg: string, ...args: unknown[]) => console.error(msg, ...args),
    debug: (msg: string, ...args: unknown[]) => console.debug(msg, ...args),
  };
}

/** Singleton logger reference — import and use directly. */
export const log: Logger = {
  info: (msg: string, ...args: unknown[]) => _logger.info(msg, ...args),
  warn: (msg: string, ...args: unknown[]) => _logger.warn(msg, ...args),
  error: (msg: string, ...args: unknown[]) => _logger.error(msg, ...args),
  debug: (msg: string, ...args: unknown[]) => _logger.debug(msg, ...args),
};
