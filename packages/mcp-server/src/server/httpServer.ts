import { randomUUID } from 'node:crypto';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { parseServerEnv } from './env';
import { logger } from './logger';
import { createMcpServer } from './mcpServer';
import { jsonRpcError } from './response';
import { createSessionState } from './sessionState';
import { handleDebugSnapshotsRoute } from './debugSnapshots';

type SessionContext = {
  server: Server;
  transport: WebStandardStreamableHTTPServerTransport;
};

export function startHttpServer() {
  const sessions = new Map<string, SessionContext>();

  const { port, host, mcpPath } = parseServerEnv(process.env);

  const httpServer = Bun.serve({
    hostname: host,
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const debugRouteResponse = handleDebugSnapshotsRoute(request, url);
      if (debugRouteResponse) {
        return debugRouteResponse;
      }

      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.pathname !== mcpPath) {
        return new Response('Not found', { status: 404 });
      }

      const sessionId = request.headers.get('mcp-session-id');
      if (sessionId) {
        const existingSession = sessions.get(sessionId);
        if (!existingSession) {
          return jsonRpcError(404, -32001, `Session '${sessionId}' not found.`);
        }

        try {
          return await existingSession.transport.handleRequest(request);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unexpected error';
          logger.error(
            {
              event: 'mcp_session_request_error',
              session_id: sessionId,
              error,
            },
            'Error handling request for existing session',
          );
          return jsonRpcError(500, -32603, message);
        }
      }

      const sessionState = createSessionState();
      const server = createMcpServer(sessionState);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (initializedSessionId) => {
          sessions.set(initializedSessionId, { server, transport });
        },
      });

      transport.onclose = () => {
        const closedSessionId = transport.sessionId;
        if (closedSessionId) {
          sessions.delete(closedSessionId);
        }
      };

      try {
        await server.connect(transport);
        const response = await transport.handleRequest(request);

        // If no session was established (for example, invalid non-initialize request),
        // close this one-off server instance immediately.
        if (!transport.sessionId) {
          await server.close();
        }

        return response;
      } catch (error) {
        void server.close();
        const message =
          error instanceof Error ? error.message : 'Unexpected error';
        logger.error(
          {
            event: 'mcp_session_create_error',
            error,
          },
          'Error creating MCP session',
        );
        return jsonRpcError(500, -32603, message);
      }
    },
  });

  logger.info(
    {
      event: 'mcp_server_started',
      url: `http://${host}:${httpServer.port}${mcpPath}`,
    },
    'MCP Streamable HTTP server listening',
  );
  logger.info(
    {
      event: 'mcp_health_endpoint',
      url: `http://${host}:${httpServer.port}/health`,
    },
    'Health check endpoint ready',
  );

  let isShuttingDown = false;

  async function shutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.warn(
      { event: 'mcp_shutdown_signal', signal },
      'Shutdown signal received',
    );
    httpServer.stop(true);

    const closePromises: Promise<unknown>[] = [];
    for (const [sessionId, context] of sessions.entries()) {
      sessions.delete(sessionId);
      closePromises.push(context.server.close());
    }

    await Promise.allSettled(closePromises);
    logger.info({ event: 'mcp_server_stopped' }, 'MCP server stopped');
    process.exit(0);
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  return httpServer;
}
