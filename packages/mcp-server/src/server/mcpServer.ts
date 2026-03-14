import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { asOptionalString, asRecord } from "./parse";
import { errorResult, type ToolResponse } from "./response";
import type { SessionState } from "./sessionState";
import { logger } from "./logger";
import { toolControllerByName, toolControllers } from "./tools";

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

type NormalizedToolResponse = {
  isError: boolean;
  content: Array<{
    type: string;
    payload?: unknown;
  }>;
};

function normalizeResponseForLog(response: ToolResponse): NormalizedToolResponse {
  return {
    isError: response.isError === true,
    content: response.content.map((entry) => {
      if (entry.type !== "text") {
        return entry;
      }

      return {
        type: "text",
        payload: parseMaybeJson(entry.text),
      };
    }),
  };
}

function extractPlayerIdFromResponse(response: NormalizedToolResponse): string | undefined {
  for (const entry of response.content) {
    const payload = entry.payload;
    if (!payload || typeof payload !== "object") {
      continue;
    }

    const maybePlayerId = (payload as Record<string, unknown>).player_id;
    if (typeof maybePlayerId === "string" && maybePlayerId.length > 0) {
      return maybePlayerId;
    }
  }

  return undefined;
}

function resolveCallerForLog(
  args: Record<string, unknown>,
  sessionState: SessionState,
  normalizedResponse: NormalizedToolResponse,
) {
  const roomHandle = asOptionalString(args.room_handle) ?? null;
  const membership = roomHandle ? sessionState.joinedRooms.get(roomHandle) : undefined;

  const callerPlayerId =
    membership?.playerId ?? extractPlayerIdFromResponse(normalizedResponse) ?? null;
  const callerPublicName = membership?.publicName ?? null;

  return {
    roomHandle,
    callerPlayerId,
    callerPublicName,
  };
}

function logToolExecution(params: {
  name: string;
  args: Record<string, unknown>;
  response: ToolResponse;
  elapsedMs: number;
  status: "ok" | "error" | "unknown_tool";
  sessionState: SessionState;
}) {
  const normalizedResponse = normalizeResponseForLog(params.response);
  const caller = resolveCallerForLog(
    params.args,
    params.sessionState,
    normalizedResponse,
  );

  logger.info(
    {
      event: "mcp_tool_call",
      tool: params.name,
      status: params.status,
      elapsed_ms: params.elapsedMs,
      room_handle: caller.roomHandle,
      caller_player_id: caller.callerPlayerId,
      caller_public_name: caller.callerPublicName,
      args: params.args,
      response: normalizedResponse,
    },
    "MCP tool handled",
  );
}

export function createMcpServer(sessionState: SessionState): Server {
  const server = new Server(
    {
      name: "poke-battle",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolControllers.map((controller) => ({
        name: controller.name,
        description: controller.description,
        inputSchema: controller.inputSchema
      }))
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const startedAt = Date.now();
    const args = asRecord(request.params.arguments);
    const toolName = request.params.name;

    try {
      const controller = toolControllerByName.get(toolName);

      if (!controller) {
        const response = errorResult(`Unknown tool '${toolName}'.`);
        logToolExecution({
          name: toolName,
          args,
          response,
          elapsedMs: Date.now() - startedAt,
          status: "unknown_tool",
          sessionState,
        });
        return response;
      }

      const response = await controller.handle(args, { sessionState });
      logToolExecution({
        name: toolName,
        args,
        response,
        elapsedMs: Date.now() - startedAt,
        status: "ok",
        sessionState,
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      const response = errorResult(message);
      logToolExecution({
        name: toolName,
        args,
        response,
        elapsedMs: Date.now() - startedAt,
        status: "error",
        sessionState,
      });
      return response;
    }
  });

  return server;
}
