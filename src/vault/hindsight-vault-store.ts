import type { VaultStore } from "./vault-store.js";
import type {
  VaultArtifact,
  VaultArtifactKind,
  VaultPullOptions,
  VaultPullResult,
} from "../schema.js";

/**
 * Simple deterministic hash for deriving Hindsight bank_id from projectPath.
 */
function hashProjectPath(path: string): string {
  let hash = 0x811c9dc5; // FNV-1a offset basis
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV-1a prime
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * VaultStore backed by Hindsight — a hosted semantic-memory API.
 *
 * Pushes artifacts as structured memories, pulls/recalls them via the
 * Hindsight recall endpoint, and validates connectivity via /health.
 */
export class HindsightVaultStore implements VaultStore {
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly projectPath: string;
  private readonly bankId: string;

  constructor(apiUrl: string, apiToken: string, projectPath: string) {
    this.apiUrl = apiUrl.replace(/\/+$/, "");
    this.apiToken = apiToken;
    this.projectPath = projectPath;
    this.bankId = hashProjectPath(projectPath);
  }

  async push(artifact: VaultArtifact): Promise<void> {
    const url = `${this.apiUrl}/v1/default/banks/${this.bankId}/memories`;
    const body = JSON.stringify({
      text: artifact.content,
      metadata: {
        kind: artifact.kind,
        projectPath: artifact.projectPath,
        id: artifact.id,
        pushedAt: artifact.pushedAt,
        ...artifact.metadata,
      },
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(
        `Hindsight push failed: ${response.status} ${response.statusText}`,
      );
    }
  }

  async pull(
    projectPath: string,
    options: VaultPullOptions,
  ): Promise<VaultPullResult> {
    const url = `${this.apiUrl}/v1/default/banks/${this.bankId}/memories/recall`;
    const body = JSON.stringify({
      text: `project:${projectPath}`,
      max_results: Math.max(
        options.decisionCap,
        options.beliefCap,
        options.learningCap,
        options.patternCap,
        10,
      ),
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(
        `Hindsight pull failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      memories?: Array<Record<string, unknown>>;
    };
    const artifacts = this.parseMemories(data.memories ?? []);
    return this.categorizeArtifacts(artifacts, options);
  }

  async search(
    query: string,
    projectPath: string,
    maxResults: number,
  ): Promise<VaultArtifact[]> {
    const url = `${this.apiUrl}/v1/default/banks/${this.bankId}/memories/recall`;
    const body = JSON.stringify({
      text: `project:${projectPath} ${query}`,
      max_results: maxResults,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(
        `Hindsight search failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      memories?: Array<Record<string, unknown>>;
    };
    return this.parseMemories(data.memories ?? []);
  }

  async validate(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/health`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiToken}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Map raw Hindsight memory objects to VaultArtifact instances.
   */
  private parseMemories(
    memories: Array<Record<string, unknown>>,
  ): VaultArtifact[] {
    return memories.map((m) => {
      const meta = (m.metadata as Record<string, unknown>) ?? {};
      const kind = (meta.kind as VaultArtifactKind) ?? "learning";
      return {
        kind,
        projectPath: (meta.projectPath as string) ?? this.projectPath,
        id: (m.id as string) ?? (meta.id as string) ?? "",
        content: (m.text as string) ?? (m.content as string) ?? "",
        metadata: meta,
        pushedAt:
          (meta.pushedAt as string) ??
          (m.created_at as string) ??
          new Date().toISOString(),
      };
    });
  }

  /**
   * Split artifacts by kind and cap each group per pull options.
   */
  private categorizeArtifacts(
    artifacts: VaultArtifact[],
    options: VaultPullOptions,
  ): VaultPullResult {
    const decisions: VaultArtifact[] = [];
    const beliefs: VaultArtifact[] = [];
    const learnings: VaultArtifact[] = [];
    const patterns: VaultArtifact[] = [];

    for (const a of artifacts) {
      switch (a.kind) {
        case "decision":
          decisions.push(a);
          break;
        case "belief":
          beliefs.push(a);
          break;
        case "learning":
          learnings.push(a);
          break;
        case "pattern":
          patterns.push(a);
          break;
      }
    }

    return {
      decisions: decisions.slice(0, options.decisionCap),
      beliefs: beliefs.slice(0, options.beliefCap),
      learnings: learnings.slice(0, options.learningCap),
      patterns: patterns.slice(0, options.patternCap),
    };
  }
}
