import { z } from "zod";

const toolArgumentsSchema = z.object({}).catchall(z.unknown());
const optionalNonEmptyStringSchema = z.preprocess(
  (value) => (typeof value === "string" ? value : undefined),
  z.string().trim().min(1).optional()
);

export function asRecord(input: unknown): Record<string, unknown> {
  const parsed = toolArgumentsSchema.safeParse(input);
  return parsed.success ? parsed.data : {};
}

export function asOptionalString(value: unknown): string | undefined {
  const parsed = optionalNonEmptyStringSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function asRequiredString(value: unknown, field: string): string {
  return z
    .string({
      required_error: `'${field}' is required and must be a non-empty string.`,
      invalid_type_error: `'${field}' is required and must be a non-empty string.`
    })
    .trim()
    .min(1, `'${field}' is required and must be a non-empty string.`)
    .parse(value);
}
