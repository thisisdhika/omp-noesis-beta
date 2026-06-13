import { writeObsidianNote, type ObsidianNote } from "./obsidian-writer.js";

export interface ProjectionIntent {
  type: "decision" | "learning" | "session";
  id: string;
  note: ObsidianNote;
}

export class ProjectionBatcher {
  private _intents: ProjectionIntent[] = [];

  enqueue(intent: ProjectionIntent): void {
    this._intents.push(intent);
  }

  flush(vaultPath?: string): void {
    if (!vaultPath || this._intents.length === 0) return;

    // Coalesce: same type+id → keep latest
    const coalesced = new Map<string, ProjectionIntent>();
    for (const intent of this._intents) {
      coalesced.set(`${intent.type}:${intent.id}`, intent);
    }

    for (const intent of coalesced.values()) {
      try {
        writeObsidianNote(vaultPath, intent.note);
      } catch (err) {
        console.warn(`[noesis] Projection failed for ${intent.type}/${intent.id}:`, err);
      }
    }

    this._intents = [];
  }
}
