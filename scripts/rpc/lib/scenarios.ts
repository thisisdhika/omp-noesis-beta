export function toolCmd(tool: string, payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const labels: Record<string, string> = {
    noesis_attend: "ATTEND_OK",
    noesis_believe: "BELIEVE_OK",
    noesis_commit: "COMMIT_OK",
    noesis_infer: "INFER_OK",
  };
  const ok = labels[tool] ?? "DONE";
  return [
    `Call ${tool} exactly once with this JSON:`,
    json,
    `After the tool call, reply with exactly: ${ok}`,
  ].join("\n");
}

export const attendPayload = {
  focus: "RPC smoke validation for omp-noesis",
  files: ["src/index.ts", "src/commands/init-command.ts"],
};

export const commitReplacePayload = {
  mode: "replace",
  goal: "Validate omp-noesis RPC smoke path",
  status: "active",
  steps: [{ description: "Confirm noesis tools run in real OMP RPC mode", status: "active" }],
};

export const commitExtendPayload = {
  mode: "extend",
  steps: [{ description: "Add edge case coverage to smoke suite", status: "active" }],
};

export const believeFactPayload = {
  type: "fact",
  content: "OMP RPC smoke validation succeeded",
  confidence: 0.95,
  source: "execution",
  tags: ["smoke", "rpc"],
};

export const believeDecisionPayload = {
  type: "decision",
  content: "Use isolated temp directories for smoke tests",
  rationale: "Prevents pollution of the project repo during automated validation",
  tags: ["smoke", "architecture"],
};

export const inferHypothesizePayload = {
  action: "hypothesize",
  content: "Noesis tools are correctly registered in real OMP RPC mode",
  evidence: "RPC smoke test observed all four tools in get_state dump",
};

export const inferConfirmPayload = (hypothesisId: string) => ({
  action: "confirm",
  hypothesisId,
});

export const failBash = [
  "Run the bash tool exactly once with the command: false",
  "Do not recover from the failure.",
  "After the failed command, reply with exactly: FAILURE_OK",
].join("\n");

export const multiTurnSetup = (name: string): string => {
  return [
    `You are validating the omp-noesis extension in test run "${name}".`,
    "First, call noesis_attend to set focus and files.",
    `Use this payload: ${JSON.stringify(attendPayload)}`,
    "Reply with: PHASE1_OK",
  ].join("\n");
};
