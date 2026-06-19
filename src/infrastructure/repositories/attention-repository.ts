import type { IAttentionRepository } from "../../domains/attention/repository.js";
import type { AttentionLayer } from "../../domains/attention/schema.js";
import { now } from "../../shared/time.js";

export class AttentionRepository implements IAttentionRepository {
  constructor(private segment: AttentionLayer) {}

  get(): AttentionLayer {
    return { ...this.segment };
  }

  set(attention: AttentionLayer): void {
    this.segment.focus = attention.focus;
    this.segment.priority = attention.priority;
    this.segment.graphQueries = [...attention.graphQueries];
    this.segment.files = [...attention.files];
    this.segment.graphFindings = [...attention.graphFindings];
    this.segment.pendingEvidence = [...attention.pendingEvidence];
    this.segment.updatedAt = attention.updatedAt;
  }

  update(updates: Partial<AttentionLayer>): void {
    if (updates.focus !== undefined) this.segment.focus = updates.focus;
    if (updates.priority !== undefined) this.segment.priority = updates.priority;
    if (updates.graphQueries !== undefined) this.segment.graphQueries = [...updates.graphQueries];
    if (updates.files !== undefined) this.segment.files = [...updates.files];
    if (updates.graphFindings !== undefined) this.segment.graphFindings = [...updates.graphFindings];
    if (updates.pendingEvidence !== undefined) this.segment.pendingEvidence = [...updates.pendingEvidence];
    this.segment.updatedAt = updates.updatedAt ?? now();
  }
}
