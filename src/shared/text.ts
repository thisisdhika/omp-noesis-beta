"use strict";

/**
 * Text transformation utilities.
 * Version: 1.0.0
 */

/** Truncate to `max` chars, appending `suffix` if cut. */
export function truncate(text: string, max: number, suffix = "…"): string {
  if (text.length <= max) return text;
  return text.slice(0, max - suffix.length) + suffix;
}

/** Escape XML special characters for `<noesis-state>` embedding. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Strip common Markdown formatting for plain-text rendering. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .trim();
}
