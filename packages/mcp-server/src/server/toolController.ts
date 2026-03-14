import type { ToolResponse } from "./response";
import type { SessionState } from "./sessionState";

export type ToolContext = {
  sessionState: SessionState;
};

export type ToolInputSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export type ToolController = {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  handle: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResponse> | ToolResponse;
};
