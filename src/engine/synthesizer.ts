// Synthesizer: NecroIntermediateSchema -> EARS spec text + Zod schemas + Zod code.
// The Zod schemas are the runtime validation used by POST /mcp/call.
import { z } from 'zod';
import type {
  NecroIntermediateSchema,
  NormalizedField,
  NormalizedOperation,
} from '../types/necro';

function zodField(field: NormalizedField): z.ZodTypeAny {
  switch (field.type) {
    case 'string':
      return field.constraints.required ? z.string().min(1) : z.string().optional();
    case 'number': {
      let n = z.number().finite();
      // A transfer amount must be a positive, finite number.
      if (field.semanticName === 'amountUsd') n = n.positive();
      // A stock ratio is a fraction between 0 and 1.
      if (field.semanticName === 'maxRatio') n = n.min(0).max(1);
      return field.constraints.required ? n : n.optional();
    }
    case 'boolean':
      return field.constraints.required ? z.boolean() : z.boolean().optional();
    case 'iso_date':
      return field.constraints.required
        ? z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'expected ISO-8601 date')
        : z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'expected ISO-8601 date').optional();
  }
}

/** Runtime Zod object schema for one operation's inputs (semantic names). */
export function zodSchemaForOperation(op: NormalizedOperation): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of op.inputs) shape[f.semanticName] = zodField(f);
  return z.object(shape);
}

/** Runtime Zod object schemas for every operation, keyed by MCP tool name. */
export function zodSchemasForSchema(
  schema: NecroIntermediateSchema,
): Record<string, z.ZodObject<any>> {
  const out: Record<string, z.ZodObject<any>> = {};
  for (const op of schema.operations) out[op.mcpToolName] = zodSchemaForOperation(op);
  return out;
}

/** Const-name stem from the MCP tool name: banking_get_balance -> BankingGetBalance. */
function constStem(op: NormalizedOperation): string {
  return op.mcpToolName
    .split('_')
    .map((p) => p.replace(/^[a-z]/, (c) => c.toUpperCase()))
    .join('');
}

function zodFieldCode(field: NormalizedField): string {
  switch (field.type) {
    case 'string':
      return `z.string().min(1)`;
    case 'number':
      return field.semanticName === 'amountUsd'
        ? `z.number().finite().positive()`
        : field.semanticName === 'maxRatio'
          ? `z.number().finite().min(0).max(1)`
          : `z.number().finite()`;
    case 'boolean':
      return `z.boolean()`;
    case 'iso_date':
      return `z.string().regex(/^\\d{4}-\\d{2}-\\d{2}/, 'expected ISO-8601 date')`;
  }
}

/** Generated TypeScript Zod source for the schema (shown in the UI, EARS & Zod tab). */
export function generateZodCode(schema: NecroIntermediateSchema): string {
  const blocks: string[] = [`import { z } from 'zod';`, ''];
  for (const op of schema.operations) {
    const name = constStem(op);
    const inputLines = op.inputs.map(
      (f) => `  ${f.semanticName}: ${zodFieldCode(f)}, // ${f.legacyName}`,
    );
    const outputLines = op.outputs.map(
      (f) => `  ${f.semanticName}: ${zodFieldCode(f)}, // ${f.legacyName}`,
    );
    blocks.push(`export const ${name}Input = z.object({`);
    blocks.push(...inputLines);
    blocks.push(`});`, '');
    blocks.push(`export const ${name}Output = z.object({`);
    blocks.push(...outputLines);
    blocks.push(`});`, '');
  }
  return blocks.join('\n').trimEnd() + '\n';
}

/** Generated EARS requirements for the schema (shown in the UI, EARS & Zod tab). */
export function generateEarsSpec(schema: NecroIntermediateSchema): string {
  const lines: string[] = [];
  for (const op of schema.operations) {
    const inNames = op.inputs.map((f) => f.semanticName).join(', ');
    const outNames = op.outputs.map((f) => f.semanticName).join(', ');
    lines.push(
      `WHEN an agent calls ${op.mcpToolName}, THE SYSTEM SHALL validate (${inNames}) and return (${outNames}) as normalized JSON.`,
    );
    if (op.riskLevel === 'CRITICAL' && op.hitlThreshold) {
      lines.push(
        `IF ${op.hitlThreshold.field} exceeds ${op.hitlThreshold.maxAllowed}, THEN THE SYSTEM SHALL pause execution and return PENDING_HITL_APPROVAL.`,
      );
    }
  }
  return lines.join('\n') + '\n';
}
