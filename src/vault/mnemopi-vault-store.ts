import { Database } from "bun:sqlite";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type {
  VaultArtifact,
  VaultArtifactKind,
  VaultPullOptions,
  VaultPullResult,
} from "../schema.js";
import type { VaultStore } from "./vault-store.js";

const TABLE = "vault_artifacts";

function openDb(root: string): Database {
  const dir = join(root, ".omp", "noesis");
  mkdirSync(dir, { recursive: true });
  const db = new Database(join(dir, "mnemopi.sqlite"));
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id         TEXT PRIMARY KEY,
      kind       TEXT NOT NULL,
      project_path TEXT NOT NULL,
      content    TEXT NOT NULL,
      metadata   TEXT NOT NULL DEFAULT '{}',
      pushed_at  TEXT NOT NULL
    ) STRICT
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_${TABLE}_project_kind
    ON ${TABLE}(project_path, kind)
  `);
  return db;
}

function rowToArtifact(row: Record<string, unknown>): VaultArtifact {
  return {
    id: row.id as string,
    kind: row.kind as VaultArtifactKind,
    projectPath: row.project_path as string,
    content: row.content as string,
    metadata: JSON.parse(row.metadata as string),
    pushedAt: row.pushed_at as string,
  };
}

export class MnemopiVaultStore implements VaultStore {
  private db: Database;

  constructor(public readonly root: string) {
    this.db = openDb(root);
  }

  async push(artifact: VaultArtifact): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ${TABLE}
        (id, kind, project_path, content, metadata, pushed_at)
      VALUES
        (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      artifact.id,
      artifact.kind,
      artifact.projectPath,
      artifact.content,
      JSON.stringify(artifact.metadata),
      artifact.pushedAt,
    );
  }

  async pull(
    projectPath: string,
    options: VaultPullOptions,
  ): Promise<VaultPullResult> {
    const rows = this.db
      .query(`SELECT * FROM ${TABLE} WHERE project_path = ? ORDER BY pushed_at DESC`)
      .all(projectPath) as Array<Record<string, unknown>>;
    const artifacts = rows.map(rowToArtifact);

    const cap = (kind: VaultArtifactKind, max: number): VaultArtifact[] =>
      artifacts.filter((a) => a.kind === kind).slice(0, max);

    return {
      decisions: cap("decision", options.decisionCap),
      beliefs: cap("belief", options.beliefCap),
      learnings: cap("learning", options.learningCap),
      patterns: cap("pattern", options.patternCap),
    };
  }

  async search(
    query: string,
    projectPath: string,
    maxResults: number,
  ): Promise<VaultArtifact[]> {
    const rows = this.db
      .query(
        `SELECT * FROM ${TABLE}
         WHERE project_path = ?
           AND (content LIKE ? OR metadata LIKE ?)
         ORDER BY pushed_at DESC
         LIMIT ?`,
      )
      .all(projectPath, `%${query}%`, `%${query}%`, maxResults) as Array<
      Record<string, unknown>
    >;
    return rows.map(rowToArtifact);
  }

  async validate(): Promise<boolean> {
    try {
      this.db.query(`SELECT 1 FROM ${TABLE} LIMIT 1`).all();
      return true;
    } catch {
      return false;
    }
  }
}
