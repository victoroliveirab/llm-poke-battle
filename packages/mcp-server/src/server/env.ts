import { z } from 'zod';

const envSchema = z
  .object({
    PORT: z
      .string()
      .optional()
      .default('6969')
      .transform((value) => Number.parseInt(value, 10))
      .pipe(z.number().int().min(1).max(65535)),
    HOST: z
      .string()
      .optional()
      .default('127.0.0.1')
      .transform((value) => value.trim())
      .pipe(z.string().min(1)),
    MCP_PATH: z
      .string()
      .optional()
      .default('/mcp')
      .transform((value) => value.trim())
      .pipe(z.string().min(1)),
  })
  .transform(({ PORT, HOST, MCP_PATH }) => ({
    port: PORT,
    host: HOST,
    mcpPath: MCP_PATH.startsWith('/') ? MCP_PATH : `/${MCP_PATH}`,
  }));

export type ServerEnv = z.infer<typeof envSchema>;

export function parseServerEnv(
  env: Record<string, string | undefined>,
): ServerEnv {
  const parsed = envSchema.safeParse(env);
  if (parsed.success) {
    return parsed.data;
  }

  const details = parsed.error.issues.map((issue) => issue.message).join('; ');
  throw new Error(`Invalid server environment configuration: ${details}`);
}
