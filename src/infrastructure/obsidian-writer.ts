import { existsSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { slugify } from "../shared/text.js";

export interface ObsidianNote {
  type: "decision" | "learning" | "session";
  status?: string;
  title: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export function writeObsidianNote(vaultPath: string, note: ObsidianNote): void {
  if (!existsSync(vaultPath)) {
    console.warn(`[noesis] Obsidian vault not found at ${vaultPath}, skipping projection`);
    return;
  }

  const dirName = note.type === "decision" ? "Decisions" : note.type === "learning" ? "Learning" : "Sessions";
  const targetDir = join(vaultPath, dirName);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const slug = slugify(note.title, 48);
  const filename = `${slug}.md`;
  const filePath = join(targetDir, filename);

  // Build frontmatter
  const fmLines: string[] = ["---"];
  fmLines.push(`type: ${note.type}`);
  if (note.status) fmLines.push(`status: ${note.status}`);
  for (const [key, value] of Object.entries(note.frontmatter)) {
    fmLines.push(`${key}: ${JSON.stringify(value)}`);
  }
  fmLines.push("---", "");

  const content = [...fmLines, `# ${note.title}`, "", note.body].join("\n");

  // Atomic write: temp → fsync → rename
  const tempPath = `${filePath}.tmp.${process.pid}`;
  try {
    ensureDir(targetDir);
    const fd = openSync(tempPath, "w");
    writeFileSync(fd, content);
    fsyncSync(fd);
    closeSync(fd);
    renameSync(tempPath, filePath);
  } catch (err) {
    console.warn(`[noesis] Failed to write Obsidian note ${filePath}:`, err);
    // Cleanup temp file if it exists
    try { require("node:fs").unlinkSync(tempPath); } catch { /* ignore */ }
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
