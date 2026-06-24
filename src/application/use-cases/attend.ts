import type { IUnitOfWork } from "../../infrastructure/unit-of-work.js";
import type { GraphFinding, AttentionLayer } from "../../domains/attention/schema.js";

export interface AttendInput {
  focus: string;
  priority?: "critical" | "high" | "normal" | "low";
  files?: string[];
  graphQueries?: string[];
  findings?: GraphFinding[];
  clearExistingQueries?: boolean;
}

export class AttendUseCase {
  constructor(private uow: IUnitOfWork) {}

  async execute(input: AttendInput): Promise<void> {
    const attentionRepo = this.uow.attention;
    const attention = attentionRepo.get();
    const timestamp = new Date().toISOString();

    const updates: Partial<AttentionLayer> = {
      focus: input.focus.slice(0, 200), // Enforce CAPS
      updatedAt: timestamp,
    };

    if (input.priority) {
      updates.priority = input.priority;
    }

    if (input.files) {
      updates.files = input.files.slice(0, 10); // CAPS.files
    }

    if (input.clearExistingQueries) {
      updates.graphQueries = [];
      updates.graphFindings = [];
    }

    if (input.graphQueries) {
      updates.graphQueries = input.graphQueries.slice(0, 5); // CAPS.graphQueries
    }

    if (input.findings && input.findings.length > 0) {
      const existingQueries = new Set(
        (input.clearExistingQueries ? [] : attention.graphFindings).map(f => f.query)
      );
      const mergedFindings = input.clearExistingQueries ? [] : [...attention.graphFindings];

      for (const finding of input.findings) {
        if (!existingQueries.has(finding.query)) {
          mergedFindings.push(finding);
          existingQueries.add(finding.query);
        }
      }
      updates.graphFindings = mergedFindings;

      // Add to pending evidence
      const newPending = [...attention.pendingEvidence];
      newPending.push({
        findings: input.findings,
        query: input.graphQueries?.join(", ") ?? "",
        turnAdded: Date.now(), // Turn count tracked at runtime
        turnsRemaining: 3,
      });
      updates.pendingEvidence = newPending;
    }

    attentionRepo.update(updates);
    await this.uow.commit();
  }
}
