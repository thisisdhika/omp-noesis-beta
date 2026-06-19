"use strict";

/**
 * Mnemopi vault store — persistent artifact storage backed by Bun.sqlite.
 * Version: 0.1.0
 *
 * Table and indexes are created automatically on first construction.
 * All public methods are async per the VaultStore contract.
 */

import { z } from "zod";
import { VaultArtifactSchema } from "../shared/schema.js";
import type { VaultStore, VaultArtifact, VaultPullResult } from "./vault-store.js";
import { join } from "node:path";
import { Database } from "bun:sqlite";

// ---------------------------------------------------------------------------
// Types for raw SQLite row deserialisation
// ---------------------------------------------------------------------------

interface VaultArtifactRow {
  id: string;
  kind: string;
  project_path: string;
  pushed_at: string;
  metadata: string | null;
  content: string;
}

/** Zod schema for raw SQLite row validation at the DB boundary. */
const VaultArtifactRowSchema = z.object({
  id: z.string(),
  kind: z.string(),
  project_path: z.string(),
  pushed_at: z.string(),
  metadata: z.string().nullable(),
  content: z.string(),
});

// ---------------------------------------------------------------------------
// Prepared statement keys
// ---------------------------------------------------------------------------

type PullStmt = "pullAll" | "pullByKind";

const PULL_STMTS: Record<PullStmt, string> = {
  pullAll:
    "SELECT * FROM vault_artifacts ORDER BY pushed_at DESC LIMIT ?",
  pullByKind:
    "SELECT * FROM vault_artifacts WHERE kind = ? ORDER BY pushed_at DESC LIMIT ?",
};

// ---------------------------------------------------------------------------
// Row → VaultArtifact mapper
// ---------------------------------------------------------------------------

function rowToArtifact(row: VaultArtifactRow): VaultArtifact {
  return {
    id: row.id,
    kind: VaultArtifactSchema.shape.kind.parse(row.kind),
    projectPath: row.project_path,
    pushedAt: row.pushed_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    content: row.content,
  };
}

// ---------------------------------------------------------------------------
// MnemopiVaultStore
// ---------------------------------------------------------------------------

export class MnemopiVaultStore implements VaultStore {
  #db: Database;

  constructor(projectRoot: string) {
    const dbPath = join(projectRoot, ".omp", "mnemopi.db");
    this.#db = new Database(dbPath, { create: true });

    // Enable WAL mode for better concurrent-read performance.
    this.#db.run("PRAGMA journal_mode = WAL");

    this.#ensureSchema();
  }

  // -----------------------------------------------------------------------
  // Schema initialisation
  // -----------------------------------------------------------------------

  #ensureSchema(): void {
    this.#db.run(`
      CREATE TABLE IF NOT EXISTS vault_artifacts (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        project_path TEXT NOT NULL,
        pushed_at TEXT NOT NULL,
        metadata TEXT,
        content TEXT NOT NULL
      )
    `);
    this.#db.run(
      "CREATE INDEX IF NOT EXISTS idx_kind ON vault_artifacts(kind)",
    );
    this.#db.run(
      "CREATE INDEX IF NOT EXISTS idx_pushed_at ON vault_artifacts(pushed_at)",
    );

    // FTS5 virtual table for full-text search
    this.#db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vault_fts USING fts5(
        id, content, kind,
        content=vault_artifacts,
        content_rowid=rowid
      )
    `);
    // Populate FTS index from existing data (idempotent)
    this.#db.run(`
      INSERT OR IGNORE INTO vault_fts(rowid, id, content, kind)
      SELECT rowid, id, content, kind FROM vault_artifacts
    `);

    // Access tracking columns — added idempotently
    for (const col of [
      "ALTER TABLE vault_artifacts ADD COLUMN last_accessed TEXT DEFAULT ''",
      "ALTER TABLE vault_artifacts ADD COLUMN access_count INTEGER DEFAULT 0",
    ]) {
      try {
        this.#db.run(col);
      } catch {
        // Column already exists — safe to ignore
      }
    }
  }

  // -----------------------------------------------------------------------
  // VaultStore
  // -----------------------------------------------------------------------

  async push(artifact: VaultArtifact): Promise<void> {
    const stmt = this.#db.query(`
      INSERT INTO vault_artifacts (id, kind, project_path, pushed_at, metadata, content)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        metadata = excluded.metadata,
        pushed_at = excluded.pushed_at
    `);

    stmt.run(
      artifact.id,
      artifact.kind,
      artifact.projectPath,
      artifact.pushedAt,
      artifact.metadata !== undefined
        ? JSON.stringify(artifact.metadata)
        : null,
      artifact.content,
    );

    // Keep FTS index in sync (INSERT OR REPLACE handles both new and updated artifacts)
    this.#db.run(`
      INSERT OR REPLACE INTO vault_fts(rowid, id, content, kind)
      SELECT rowid, id, content, kind FROM vault_artifacts WHERE id = ?
    `, [artifact.id]);
  }

  async pull(kind?: string, maxResults = 10): Promise<VaultPullResult> {
    let stmtKey: PullStmt;
    let params: (string | number)[];

    if (kind !== undefined) {
      stmtKey = "pullByKind";
      params = [kind, maxResults];
    } else {
      stmtKey = "pullAll";
      params = [maxResults];
    }

    const raw = this.#db
      .query(PULL_STMTS[stmtKey])
      .all(...params);
    const rows = VaultArtifactRowSchema.array().parse(raw);

    // Update access tracking
    const now = new Date().toISOString();
    for (const row of rows) {
      this.#db.run(
        `UPDATE vault_artifacts SET last_accessed = ?, access_count = access_count + 1 WHERE id = ?`,
        [now, row.id],
      );
    }

    return {
      artifacts: rows.map(rowToArtifact),
      source: "mnemopi",
      timestamp: now,
    };
  }

  async search(
    query: string,
    kind?: string,
    maxResults = 10,
  ): Promise<VaultArtifact[]> {
    // Strip FTS5 special characters to prevent syntax errors
    // Keep only alphanumeric, spaces, and basic punctuation
    const sanitized = query.replace(/[^a-zA-Z0-9\s]/g, "").trim();
    if (!sanitized) return [];

    let raw: unknown[];
    if (kind !== undefined) {
      raw = this.#db.prepare(`
        SELECT a.* FROM vault_artifacts a
        JOIN vault_fts f ON a.rowid = f.rowid
        WHERE vault_fts MATCH ? AND a.kind = ?
        ORDER BY rank
        LIMIT ?
      `).all(sanitized, kind, maxResults);
    } else {
      raw = this.#db.prepare(`
        SELECT a.* FROM vault_artifacts a
        JOIN vault_fts f ON a.rowid = f.rowid
        WHERE vault_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(sanitized, maxResults);
    }
    const rows = VaultArtifactRowSchema.array().parse(raw);

    // Update access tracking
    const now = new Date().toISOString();
    for (const row of rows) {
      this.#db.run(
        `UPDATE vault_artifacts SET last_accessed = ?, access_count = access_count + 1 WHERE id = ?`,
        [now, row.id],
      );
    }

    return rows.map(rowToArtifact);
  }

  async validate(): Promise<boolean> {
    try {
      this.#db.query("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }
}
