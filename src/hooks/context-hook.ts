import type { StateManager } from "../infrastructure/state-manager.js";
import type { GraphifyClient } from "../infrastructure/graphify-client.js";
import type { PreambleCache } from "../state/state-cache.js";
import { generateId } from "../shared/ids.js";
import { perceive } from "../infrastructure/graphify-engine.js";
import { parseQueryOutput } from "../infrastructure/graphify-parser.js";
import { buildPreamble, buildSubagentPreamble } from "../rendering/preamble-builder.js";
import { computeStaleReviewNotes } from "../domains/belief/belief-domain.js";
import { getTopLearning } from "../domains/learning/learning-domain.js";
import { checkConsistency } from "../domains/commitment/commitment-domain.js";
import { estimateTokens } from "../shared/tokens.js";

const SUBAGENT_MARKERS = ["# Target", "# Change"];
const DEFAULT_LEARNING_COUNT = 10;

/**
 * Context hook — injects the cognitive preamble into every LLM call.
 *
 * The preamble is a compact summary of the agent's current cognitive state
 * (beliefs, decisions, learning, hypotheses, workflow) that keeps the agent
 * oriented across turns.  A state-version cache avoids re-reading and
 * re-formatting the state between turns when no structural mutation has
 * occurred.
 *
 * Subagent calls receive a trimmed preamble (via buildSubagentPreamble) to
 * minimise overhead for internal delegation.
 */
export function createContextHook(
  deps: {
    state: StateManager;
    graphify: GraphifyClient;
    vaultLabel: string;
    projectName: string;
    stateCache: PreambleCache;
  },
): (event: { messages: unknown[] }) => Promise<{ messages: unknown[] }> {
  return async (event: { messages: unknown[] }) => {
    try {
      const snapshot = deps.state.read();
      const isSubAgent = detectSubAgent(event.messages);
      const taskFilter = isSubAgent ? extractSubagentTaskFilter(event.messages) : "";
      const cached = isSubAgent
        ? deps.stateCache.getSubagent(snapshot, taskFilter)
        : deps.stateCache.get(snapshot);

      if (cached !== undefined) {
        const tokens = estimateTokens(cached);
        deps.state.mutate((s) => {
          s.attention.contextUsage = tokens;
        });
        return { messages: prependPreamble(event.messages, cached) };
      }

      const question = snapshot.attention.focus || "What changed?";
      let communities: string[] | undefined;
      let godNodes: string[] | undefined;

      const report = deps.graphify.readReport();
      if (report !== null) {
        const parsed = parseQueryOutput(report);
        if (parsed.communities.length > 0) communities = parsed.communities;
        if (parsed.godNodes.length > 0) godNodes = parsed.godNodes;
      }

      const perception = await perceive(deps.graphify, question);
      if (!perception.error && perception.beliefs.length > 0) {
        deps.state.mutate((s) => {
          for (const belief of perception.beliefs) {
            const exists = s.belief.facts.some(
              (fact) => fact.content === belief.content && fact.source === "graph",
            );
            if (!exists) {
              const now = new Date().toISOString();
              s.belief.facts.push({
                id: generateId("bf"),
                content: belief.content,
                confidence: belief.confidence,
                source: belief.source,
                tags: belief.tags,
                communityScope: belief.communityScope,
                evidenceNodes:
                  typeof belief.metadata.nodeName === "string"
                    ? [belief.metadata.nodeName]
                    : undefined,
                createdAt: now,
                updatedAt: now,
                status: "active",
              });
            }
          }
        });
      }

      const current = deps.state.read();
      const learningEntries = [
        ...current.learning.failures,
        ...current.learning.successes,
      ];
      const effectiveCommunities =
        communities && communities.length > 0
          ? communities
          : perception.communities.length > 0
            ? perception.communities
            : undefined;
      const effectiveGodNodes =
        godNodes && godNodes.length > 0
          ? godNodes
          : perception.godNodes.length > 0
            ? perception.godNodes
            : undefined;

      const preamble = isSubAgent
        ? deps.stateCache.getSubagentOrBuild(current, taskFilter, () =>
            buildSubagentPreamble(current, taskFilter || undefined),
          )
        : deps.stateCache.getOrBuild(current, () =>
            buildPreamble(current, {
              capability: perception.capability,
              vaultLabel: deps.vaultLabel,
              learningRanked: getTopLearning(learningEntries, DEFAULT_LEARNING_COUNT),
              staleNotes: computeStaleReviewNotes(
                current.belief.facts,
                perception.capability,
                current.attention.updatedAt,
              ),
              projectName: deps.projectName,
              consistencyWarnings: checkConsistency(current.commitment.workflow),
              communities: effectiveCommunities,
              godNodes: effectiveGodNodes,
            }),
          );

      const tokens = estimateTokens(preamble);
      deps.state.mutate((s) => {
        s.attention.contextUsage = tokens;
      });

      return { messages: prependPreamble(event.messages, preamble) };
    } catch (err) {
      // Error isolation: never let noesis crash the agent turn
      console.error("[noesis] context hook error:", err);
      return { messages: event.messages };
    }
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Scan messages for subagent-specific section markers.
 * A message containing "# Target" or "# Change" indicates the conversation
 * is being routed to a subagent, so we emit a leaner preamble.
 */
function detectSubAgent(messages: unknown[]): boolean {
  return extractSubagentTaskFilter(messages) !== "";
}

function extractSubagentTaskFilter(messages: unknown[]): string {
  for (const msg of messages) {
    if (typeof msg !== "object" || msg === null) continue;
    const content = (msg as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part !== "object" || part === null) continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text !== "string") continue;
      for (const marker of SUBAGENT_MARKERS) {
        const markerIndex = text.indexOf(marker);
        if (markerIndex === -1) continue;
        const afterMarker = text.slice(markerIndex + marker.length);
        const firstMeaningful = afterMarker
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.length > 0 && !line.startsWith("#"));
        if (firstMeaningful) return firstMeaningful.toLowerCase();
        return marker.toLowerCase();
      }
    }
  }
  return "";
}

/**
 * Prepend the preamble as the first user-role message.
 *
 * If the first message is already a user text message the preamble is
 * merged into its content block so the preamble always comes first.
 */
function prependPreamble(messages: unknown[], preamble: string): unknown[] {
  if (messages.length === 0) {
    return [
      {
        role: "user",
        content: [
          { type: "text", text: `<noesis-state>\n${preamble}\n</noesis-state>` },
        ],
      },
    ];
  }

  const first = messages[0];
  if (isUserTextMessage(first)) {
    const textParts = first.content
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("");
    return [
      {
        ...first,
        content: [
          {
            type: "text",
            text: `<noesis-state>\n${preamble}\n</noesis-state>\n\n${textParts}`,
          },
        ],
      },
      ...messages.slice(1),
    ];
  }

  return [
    {
      role: "user",
      content: [
        { type: "text", text: `<noesis-state>\n${preamble}\n</noesis-state>` },
      ],
    },
    ...messages,
  ];
}

function isUserTextMessage(
  value: unknown,
): value is { role: "user"; content: Array<{ type: string; text?: string }> } {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.role === "user" && Array.isArray(obj.content);
}
