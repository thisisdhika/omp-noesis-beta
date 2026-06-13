import { randomUUID } from "node:crypto";

const VALID_PREFIXES = ["bf", "bd", "hy", "rs", "ws", "pa", "le"] as const;
type ValidPrefix = (typeof VALID_PREFIXES)[number];

export function generateId(prefix: ValidPrefix): string {
  return `${prefix}-${randomUUID()}`;
}
