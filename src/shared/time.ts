"use strict";

/**
 * Time utilities for staleness checks and timestamp generation.
 */

/** ISO 8601 timestamp for now. */
export function now(): string {
  return new Date().toISOString();
}

/** True if `timestamp` is older than `hours` from now. */
export function isStaleHours(timestamp: string, hours: number): boolean {
  const ts = Date.parse(timestamp);
  if (Number.isNaN(ts)) return true; // unparseable = stale
  const ageMs = Date.now() - ts;
  const maxMs = hours * 60 * 60 * 1000;
  return ageMs > maxMs;
}
