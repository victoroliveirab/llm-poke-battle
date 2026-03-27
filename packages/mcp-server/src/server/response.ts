export type ToolResponse = {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: true;
};

export function jsonResult(payload: unknown): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function errorResult(message: string): ToolResponse {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

export function jsonRpcError(
  status: number,
  code: number,
  message: string,
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code, message },
      id: null,
    }),
    {
      status,
      headers: { 'content-type': 'application/json' },
    },
  );
}
