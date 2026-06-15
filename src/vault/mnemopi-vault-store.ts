"use strict";

/**
 * Mnemopi vault store — persistent artifact storage backed by Bun.sqlite.
 *
 * Table and indexes are created automatically on first construction.
 * All public methods are async per the VaultStore contract.
 */

import { z } from "zod";
import { VaultArtifactSchema } from "../schema.js";
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
type SearchStmt = "searchAll" | "searchByKind";

const PULL_STMTS: Record<PullStmt, string> = {
  pullAll:
    "SELECT * FROM vault_artifacts ORDER BY pushed_at DESC LIMIT ?",
  pullByKind:
    "SELECT * FROM vault_artifacts WHERE kind = ? ORDER BY pushed_at DESC LIMIT ?",
};

const SEARCH_STMTS: Record<SearchStmt, string> = {
  searchAll:
    "SELECT * FROM vault_artifacts WHERE content LIKE ? ORDER BY pushed_at DESC LIMIT ?",
  searchByKind:
    "SELECT * FROM vault_artifacts WHERE content LIKE ? AND kind = ? ORDER BY pushed_at DESC LIMIT ?",
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
  private db: Database;

  constructor(projectRoot: string) {
    const dbPath = join(projectRoot, ".omp", "mnemopi.db");
    this.db = new Database(dbPath, { create: true });

    // Enable WAL mode for better concurrent-read performance.
    this.db.run("PRAGMA journal_mode = WAL");

    this.ensureSchema();
  }

  // -----------------------------------------------------------------------
  // Schema initialisation
  // -----------------------------------------------------------------------

  private ensureSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS vault_artifacts (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        project_path TEXT NOT NULL,
        pushed_at TEXT NOT NULL,
        metadata TEXT,
        content TEXT NOT NULL
      )
    `);
    this.db.run(
      "CREATE INDEX IF NOT EXISTS idx_kind ON vault_artifacts(kind)",
    );
    this.db.run(
      "CREATE INDEX IF NOT EXISTS idx_pushed_at ON vault_artifacts(pushed_at)",
    );
  }

  // -----------------------------------------------------------------------
  // VaultStore
  // -----------------------------------------------------------------------

  async push(artifact: VaultArtifact): Promise<void> {
    const stmt = this.db.query(`
      INSERT OR REPLACE INTO vault_artifacts
        (id, kind, project_path, pushed_at, metadata, content)
      VALUES (?, ?, ?, ?, ?, ?)
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

    const raw = this.db
      .query(PULL_STMTS[stmtKey])
      .all(...params);
    const rows = VaultArtifactRowSchema.array().parse(raw);

    return {
      artifacts: rows.map(rowToArtifact),
      source: "mnemopi",
      timestamp: new Date().toISOString(),
    };
  }

  async search(
    query: string,
    kind?: string,
    maxResults = 10,
  ): Promise<VaultArtifact[]> {
    let stmtKey: SearchStmt;
    let params: (string | number)[];

    if (kind !== undefined) {
      stmtKey = "searchByKind";
      params = [`%${query}%`, kind, maxResults];
    } else {
      stmtKey = "searchAll";
      params = [`%${query}%`, maxResults];
    }
    const raw = this.db
      .query(SEARCH_STMTS[stmtKey])
      .all(...params);
    const rows = VaultArtifactRowSchema.array().parse(raw);

    return rows.map(rowToArtifact);
  }

  async validate(): Promise<boolean> {
    try {
      this.db.query("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }
}
