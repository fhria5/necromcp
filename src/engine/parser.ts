// SOAP/WSDL parser: legacy WSDL text -> NecroIntermediateSchema AST.
// Phase 1 scope: SOAP_XML only. No external XML dependency: the WSDL subset used
// by the graveyard corpses (<definitions>/<message>/<part>) is parsed with
// targeted regular expressions. Malformed input raises CorpseCorruptionError.
import {
  CorpseCorruptionError,
  NecroIntermediateSchema,
  NormalizedField,
  NormalizedOperation,
} from '../types/necro';
import { generateEarsSpec, generateZodCode } from './synthesizer';

/** Curated semantic names: what a human calls these cryptic legacy fields. */
const SEMANTIC_NAMES: Record<string, string> = {
  ACCT_NUM_STR: 'accountNumber',
  ROUTING_ABA_CD: 'routingCode',
  LEDGER_BAL_CENTS: 'ledgerBalanceCents',
  AVAIL_BAL_CENTS: 'availableBalanceCents',
  CCY_ISO_CD: 'currencyCode',
  SRC_ACCT_NUM: 'sourceAccountNumber',
  DST_ACCT_NUM: 'destinationAccountNumber',
  XFER_AMT_USD: 'amountUsd',
  WIRE_MEMO_TXT: 'memo',
  FEDWIRE_REF_ID: 'fedwireReferenceId',
  SETTLE_STATUS_CD: 'settleStatusCode',
  POSTED_CENTS: 'postedCents',
};

/** Curated MCP tool names (domain prefix + verb), per the .kiro mcp.json. */
const MCP_TOOL_NAMES: Record<string, string> = {
  GetAccountBalance: 'banking_get_balance',
  ExecuteWireTransfer: 'banking_wire_transfer',
};

const XSD_TYPES: Record<string, NormalizedField['type']> = {
  string: 'string',
  long: 'number',
  decimal: 'number',
  int: 'number',
  boolean: 'boolean',
  date: 'iso_date',
  dateTime: 'iso_date',
};

function toSemanticName(legacyName: string): string {
  const known = SEMANTIC_NAMES[legacyName];
  if (known) return known;
  // Generic fallback: SCREAMING_SNAKE -> camelCase, dropping type-ish suffixes.
  const cleaned = legacyName.replace(/_(STR|CD|TXT|NUM|AMT|FLG)$/, '');
  const parts = cleaned.toLowerCase().split('_').filter(Boolean);
  return parts
    .map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1)))
    .join('');
}

function toMcpToolName(opId: string): string {
  const known = MCP_TOOL_NAMES[opId];
  if (known) return known;
  return opId
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`));
  return m ? m[1] : undefined;
}

interface RawMessage {
  name: string;
  parts: { name: string; type: string; doc: string }[];
}

function parseMessages(rawSource: string): RawMessage[] {
  const messages: RawMessage[] = [];
  const msgRe = /<message\s+name="([^"]+)">([\s\S]*?)<\/message>/g;
  let msgMatch: RegExpExecArray | null;
  while ((msgMatch = msgRe.exec(rawSource)) !== null) {
    const [, name, body] = msgMatch;
    const parts: RawMessage['parts'] = [];
    // Attribute values may contain '>' (e.g. doc="HITL Gate > 10000"), so the
    // tag body must allow quoted strings instead of stopping at the first '>'.
    const partRe = /<part\s+((?:[^>"']|"[^"]*"|'[^']*')*?)\/>/g;
    let partMatch: RegExpExecArray | null;
    while ((partMatch = partRe.exec(body)) !== null) {
      const tag = partMatch[1];
      const partName = attr(tag, 'name');
      const partType = attr(tag, 'type');
      if (!partName || !partType) {
        throw new CorpseCorruptionError(
          `Malformed <part> in message "${name}": missing name or type.`,
        );
      }
      const xsd = partType.replace(/^xsd:/, '');
      parts.push({ name: partName, type: xsd, doc: attr(tag, 'doc') ?? '' });
    }
    messages.push({ name, parts });
  }
  return messages;
}

function toField(part: { name: string; type: string; doc: string }): NormalizedField {
  const type = XSD_TYPES[part.type];
  if (!type) {
    throw new CorpseCorruptionError(
      `Unsupported XSD type "xsd:${part.type}" on part "${part.name}".`,
    );
  }
  return {
    legacyName: part.name,
    semanticName: toSemanticName(part.name),
    type,
    constraints: { required: true },
    description: part.doc || part.name,
  };
}

export interface ParseMeta {
  artifactId: string;
  title: string;
  era: string;
}

export function parseWSDL(rawSource: string, meta: ParseMeta): NecroIntermediateSchema {
  if (!rawSource || !rawSource.trim()) {
    throw new CorpseCorruptionError('Empty legacy artifact: nothing to parse.');
  }
  if (!/<definitions[\s>]/.test(rawSource)) {
    throw new CorpseCorruptionError(
      'Not a WSDL document: no <definitions> root element found.',
    );
  }
  const messages = parseMessages(rawSource);
  if (messages.length === 0) {
    throw new CorpseCorruptionError('No <message> blocks found in WSDL document.');
  }

  // Group Request/Response pairs by base name.
  const byBase = new Map<string, { request?: RawMessage; response?: RawMessage }>();
  for (const msg of messages) {
    const m = msg.name.match(/^(.*?)(Request|Response)$/);
    if (!m) {
      throw new CorpseCorruptionError(
        `Message "${msg.name}" does not end in Request or Response.`,
      );
    }
    const [, base, kind] = m;
    const entry = byBase.get(base) ?? {};
    if (kind === 'Request') entry.request = msg;
    else entry.response = msg;
    byBase.set(base, entry);
  }

  const operations: NormalizedOperation[] = [];
  for (const [base, pair] of byBase) {
    if (!pair.request || !pair.response) {
      throw new CorpseCorruptionError(
        `Operation "${base}" is missing its ${
          pair.request ? 'Response' : 'Request'
        } message.`,
      );
    }
    const inputs = pair.request.parts.map(toField);
    const outputs = pair.response.parts.map(toField);
    const isMutating = /transfer|wire|mutate|delete/i.test(base);
    const firstNumberInput = inputs.find((f) => f.type === 'number');
    const op: NormalizedOperation = {
      opId: base,
      legacyAction: pair.request.name,
      mcpToolName: toMcpToolName(base),
      description:
        pair.request.parts.map((p) => p.doc).find(Boolean) ||
        `${base} (legacy operation)`,
      riskLevel: isMutating ? 'CRITICAL' : 'LOW',
      inputs,
      outputs,
    };
    if (isMutating && firstNumberInput) {
      op.hitlThreshold = { field: firstNumberInput.semanticName, maxAllowed: 10000 };
    }
    // Human-readable operation description from the request doc strings.
    op.description =
      base === 'GetAccountBalance'
        ? 'Get the ledger and available balance of an account'
        : base === 'ExecuteWireTransfer'
          ? 'Execute a wire transfer between two accounts'
          : op.description;
    operations.push(op);
  }

  const schema: NecroIntermediateSchema = {
    artifactId: meta.artifactId,
    title: meta.title,
    era: meta.era,
    format: 'SOAP_XML',
    rawSource,
    extractedAt: new Date().toISOString(),
    operations,
    generatedEarsSpec: '',
    generatedZodCode: '',
  };
  schema.generatedEarsSpec = generateEarsSpec(schema);
  schema.generatedZodCode = generateZodCode(schema);
  return schema;
}
