export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
};

export function jsonToolResult(details: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    details,
  };
}
