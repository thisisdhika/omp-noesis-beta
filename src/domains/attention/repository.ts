import type { AttentionLayer } from "./schema.js";

export interface IAttentionRepository {
  get(): AttentionLayer;
  set(attention: AttentionLayer): void;
  update(updates: Partial<AttentionLayer>): void;
}
