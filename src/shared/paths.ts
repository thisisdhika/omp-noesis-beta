import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

export function statePath(root: string): string {
  return join(root, ".omp", "noesis", "state.json");
}

export function noesisDir(root: string): string {
  return join(root, ".omp", "noesis");
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
