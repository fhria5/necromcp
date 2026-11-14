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

/* ------------------------------------------------------------------ */
/* SQL DDL parser (Phase 2): CREATE TABLE + stored-procedure comments  */
/* ------------------------------------------------------------------ */

/** Curated semantic names for the warehouse table columns. */
const SQL_COLUMN_SEMANTIC: Record<string, string> = {
  SKU_CD_V2: 'skuCode',
  PART_DESC_TXT: 'partDescription',
  INV_QTY_OH: 'quantityOnHand',
  REORD_THRSH_NUM: 'reorderThreshold',
  UNIT_CST_USD: 'unitCostUsd',
  LOC_WH_AISLE: 'warehouseAisle',
};

/** Curated semantic names for stored-procedure parameters (@P_...). */
const SQL_PARAM_SEMANTIC: Record<string, string> = {
  P_SKU_CD: 'skuCode',
  P_WH_AISLE: 'warehouseAisle',
  P_MAX_RATIO: 'maxRatio',
  P_DELTA_QTY: 'deltaQuantity',
  P_AUTH_NOTE: 'authNote',
};

/** Procedure metadata: MCP tool name, risk, and human description. */
const SQL_PROCEDURES: Record<
  string,
  { mcpToolName: string; riskLevel: 'LOW' | 'MEDIUM' | 'CRITICAL'; description: string }
> = {
  SP_QUERY_STOCK: {
    mcpToolName: 'inventory_query_stock',
    riskLevel: 'LOW',
    description: 'Query the on-hand stock of one warehouse part',
  },
  SP_AUDIT_LOW_STOCK: {
    mcpToolName: 'inventory_audit_low_stock',
    riskLevel: 'LOW',
    description: 'Audit how many warehouse parts sit below their reorder threshold',
  },
  SP_MUTATE_INV_QTY: {
    mcpToolName: 'inventory_mutate_quantity',
    riskLevel: 'MEDIUM',
    description: 'Adjust the on-hand quantity of one warehouse part',
  },
};

function sqlTypeToFieldType(sqlType: string): NormalizedField['type'] | undefined {
  const t = sqlType.trim().toUpperCase();
  if (t.startsWith('VARCHAR') || t.startsWith('CHAR') || t.startsWith('TEXT')) return 'string';
  if (t === 'INT' || t === 'INTEGER' || t === 'BIGINT' || t === 'SMALLINT') return 'number';
  if (t.startsWith('DECIMAL') || t.startsWith('NUMERIC') || t.startsWith('MONEY')) return 'number';
  if (t === 'BIT' || t.startsWith('BOOLEAN')) return 'boolean';
  if (t.startsWith('DATE') || t.startsWith('DATETIME')) return 'iso_date';
  return undefined;
}

function sqlParamToSemantic(param: string): string {
  const known = SQL_PARAM_SEMANTIC[param];
  if (known) return known;
  const cleaned = param.replace(/^P_/, '');
  const parts = cleaned.toLowerCase().split('_').filter(Boolean);
  return parts.map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join('');
}

/** Parse one stored-procedure comment line into name + parameter names. */
function parseProcedureLine(
  line: string,
): { name: string; params: string[] } | undefined {
  const m = line.match(/PROCEDURE:\s*([A-Z0-9_]+)\s*\(Inputs:\s*([^)]*)\)/i);
  if (!m) return undefined;
  const params = m[2]
    .split(',')
    .map((p) => p.trim().replace(/^@/, ''))
    .filter(Boolean);
  return { name: m[1].toUpperCase(), params };
}

export function parseSQL(rawSource: string, meta: ParseMeta): NecroIntermediateSchema {
  if (!rawSource || !rawSource.trim()) {
    throw new CorpseCorruptionError('Empty legacy artifact: nothing to parse.');
  }
  const tableMatch = rawSource.match(
    /CREATE\s+TABLE\s+([A-Z0-9_]+)\s*\(([\s\S]*?)\);/i,
  );
  if (!tableMatch) {
    throw new CorpseCorruptionError(
      'Not a SQL DDL dump: no CREATE TABLE statement found.',
    );
  }
  const [, tableName, columnBlock] = tableMatch;

  // Columns: NAME TYPE [NOT NULL] [PRIMARY KEY] [DEFAULT x], -- comment
  const columns: NormalizedField[] = [];
  for (const rawLine of columnBlock.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const colMatch = line.match(
      /^([A-Z0-9_]+)\s+([A-Z]+(?:\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)\s*(.*?)(?:,)?\s*(?:--\s*(.*))?$/,
    );
    if (!colMatch) {
      throw new CorpseCorruptionError(
        `Malformed column definition in table "${tableName}": "${line}".`,
      );
    }
    const [, colName, colType, modifiers, comment] = colMatch;
    const fieldType = sqlTypeToFieldType(colType);
    if (!fieldType) {
      throw new CorpseCorruptionError(
        `Unsupported SQL type "${colType}" on column "${colName}".`,
      );
    }
    const maxLengthMatch = colType.match(/\((\d+)\)/);
    columns.push({
      legacyName: colName,
      semanticName: SQL_COLUMN_SEMANTIC[colName] ?? toSemanticName(colName),
      type: fieldType,
      constraints: {
        required: /NOT NULL/i.test(modifiers ?? ''),
        ...(maxLengthMatch ? { maxLength: Number(maxLengthMatch[1]) } : {}),
      },
      description: (comment ?? colName).trim(),
    });
  }
  if (columns.length === 0) {
    throw new CorpseCorruptionError(`Table "${tableName}" declares no columns.`);
  }

  const procedures: { name: string; params: string[] }[] = [];
  for (const line of rawSource.split('\n')) {
    const proc = parseProcedureLine(line);
    if (proc) procedures.push(proc);
  }
  if (procedures.length === 0) {
    throw new CorpseCorruptionError(
      'No stored PROCEDURE declarations found in SQL DDL dump.',
    );
  }

  const operations: NormalizedOperation[] = [];
  for (const proc of procedures) {
    const procMeta = SQL_PROCEDURES[proc.name];
    if (!procMeta) {
      throw new CorpseCorruptionError(
        `Unknown stored procedure "${proc.name}": no MCP mapping defined.`,
      );
    }
    const inputs: NormalizedField[] = proc.params.map((p) => {
      const semantic = sqlParamToSemantic(p);
      // maxRatio is a 0..1 fraction; deltaQuantity is an integer delta.
      const type: NormalizedField['type'] =
        semantic === 'maxRatio' || semantic === 'deltaQuantity' ? 'number' : 'string';
      return {
        legacyName: `@${p}`,
        semanticName: semantic,
        type,
        constraints: {
          required: true,
          ...(semantic === 'maxRatio' ? { min: 0, max: 1 } : {}),
        },
        description: `Procedure parameter ${p}`,
      };
    });
    // Result shape is the documented procedure result: query returns the full
    // table row, audit returns a summary, mutate returns the updated row.
    const outputs: NormalizedField[] =
      proc.name === 'SP_AUDIT_LOW_STOCK'
        ? [
            {
              legacyName: 'ITEMS_BELOW_THRSH',
              semanticName: 'itemsBelowThreshold',
              type: 'number',
              constraints: { required: true },
              description: 'Parts below their reorder threshold',
            },
            {
              legacyName: 'TOTAL_ITEMS',
              semanticName: 'totalItems',
              type: 'number',
              constraints: { required: true },
              description: 'Total parts in the warehouse',
            },
            {
              legacyName: 'LOW_STOCK_RATIO',
              semanticName: 'lowStockRatio',
              type: 'number',
              constraints: { required: true },
              description: 'Share of parts below threshold (0..1)',
            },
          ]
        : proc.name === 'SP_MUTATE_INV_QTY'
          ? [
              columns.find((c) => c.semanticName === 'skuCode')!,
              columns.find((c) => c.semanticName === 'quantityOnHand')!,
              {
                legacyName: '@P_DELTA_QTY',
                semanticName: 'deltaQuantity',
                type: 'number',
                constraints: { required: true },
                description: 'Quantity delta that was applied',
              },
            ]
          : [...columns];
    operations.push({
      opId: proc.name,
      legacyAction: proc.name,
      mcpToolName: procMeta.mcpToolName,
      description: procMeta.description,
      riskLevel: procMeta.riskLevel,
      inputs,
      outputs,
    });
  }

  const schema: NecroIntermediateSchema = {
    artifactId: meta.artifactId,
    title: meta.title,
    era: meta.era,
    format: 'SQL_DDL',
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

/* ------------------------------------------------------------------ */
/* COBOL fixed-width parser (Phase 2): copybook layout + data rows    */
/* ------------------------------------------------------------------ */

/** Curated semantic names for the copybook fields. */
const COBOL_FIELD_SEMANTIC: Record<string, string> = {
  'PT-ID-NUM': 'patientId',
  'CLM-JUL-DT': 'claimDate',
  'ICD9-DIAG-CD': 'diagnosisCode',
  'CLM-AMT-CENTS': 'claimAmountUsd',
  'ADJ-STAT-FLG': 'adjustmentStatus',
  'FILLER-MEMO': 'memo',
};

export interface CobolField extends NormalizedField {
  /** 1-based inclusive byte range in the 80-byte record. */
  byteRange: [number, number];
  /** Raw PIC clause, e.g. "X(10)" or "9(07)V99". */
  pic: string;
  /** Number of implied decimal places (from V99), 0 for plain integers/text. */
  decimals: number;
}

function parsePic(pic: string): { kind: 'text' | 'number'; length: number; decimals: number } {
  const textMatch = pic.match(/^X\((\d+)\)$/i);
  if (textMatch) return { kind: 'text', length: Number(textMatch[1]), decimals: 0 };
  const numMatch = pic.match(/^9\((\d+)\)(?:V(9+))?$/i);
  if (numMatch) {
    return {
      kind: 'number',
      length: Number(numMatch[1]) + (numMatch[2] ? numMatch[2].length : 0),
      decimals: numMatch[2] ? numMatch[2].length : 0,
    };
  }
  throw new CorpseCorruptionError(`Unsupported PIC clause "${pic}".`);
}

/** Data rows of the flat file: every non-comment, non-empty line. */
export function cobolDataRows(rawSource: string): string[] {
  return rawSource
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() !== '' && !l.startsWith('*'));
}

export function parseCOBOL(
  rawSource: string,
  meta: ParseMeta,
): NecroIntermediateSchema & { cobolFields: CobolField[] } {
  if (!rawSource || !rawSource.trim()) {
    throw new CorpseCorruptionError('Empty legacy artifact: nothing to parse.');
  }
  const fields: CobolField[] = [];
  for (const line of rawSource.split('\n')) {
    const m = line.match(
      /^\*\s*BYTES\s+(\d+)-(\d+)\s*:\s*([A-Z0-9-]+)\s+PIC\s+(X\(\d+\)|9\(\d+\)(?:V9+)?)\s*\[(.*?)\]/,
    );
    if (!m) continue;
    const [, startS, endS, name, pic, description] = m;
    const start = Number(startS);
    const end = Number(endS);
    const parsed = parsePic(pic);
    if (end - start + 1 !== parsed.length) {
      throw new CorpseCorruptionError(
        `Copybook field "${name}" declares BYTES ${start}-${end} (${end - start + 1} bytes) but PIC ${pic} is ${parsed.length} bytes.`,
      );
    }
    const isJulian = /JUL/i.test(name);
    fields.push({
      legacyName: name,
      semanticName: COBOL_FIELD_SEMANTIC[name] ?? toSemanticName(name.replace(/-/g, '_')),
      type: isJulian ? 'iso_date' : parsed.kind === 'text' ? 'string' : 'number',
      constraints: {
        required: true,
        byteOffset: [start - 1, end] as [number, number],
      },
      description: description.trim(),
      byteRange: [start, end],
      pic,
      decimals: parsed.decimals,
    });
  }
  if (fields.length === 0) {
    throw new CorpseCorruptionError(
      'Not a COBOL copybook: no BYTES layout lines found.',
    );
  }
  const rows = cobolDataRows(rawSource);
  if (rows.length === 0) {
    throw new CorpseCorruptionError('COBOL flat file contains no data rows.');
  }
  // Rows are right-trimmed in the file (trailing spaces stripped), so only the
  // bytes up to the last non-space field must be present.
  const minLength = Math.max(
    ...fields
      .filter((f) => f.semanticName !== 'memo')
      .map((f) => f.byteRange[1]),
  );
  for (const row of rows) {
    if (row.length < minLength) {
      throw new CorpseCorruptionError(
        `COBOL data row too short (${row.length} bytes, need at least ${minLength}): "${row}".`,
      );
    }
  }

  const op: NormalizedOperation = {
    opId: 'LookupClaimByPatient',
    legacyAction: 'LOOKUP-CLAIM-BY-PATIENT',
    mcpToolName: 'claims_lookup_patient',
    description: 'Look up one healthcare claim record by patient identifier',
    riskLevel: 'LOW',
    inputs: [
      {
        legacyName: 'PT-ID-NUM',
        semanticName: 'patientId',
        type: 'string',
        constraints: { required: true, maxLength: 10 },
        description: 'Patient Identifier',
      },
    ],
    outputs: fields.map((f) => ({
      legacyName: f.legacyName,
      semanticName: f.semanticName,
      type: f.type,
      constraints: f.constraints,
      description: f.description,
    })),
  };

  const schema: NecroIntermediateSchema & { cobolFields: CobolField[] } = {
    artifactId: meta.artifactId,
    title: meta.title,
    era: meta.era,
    format: 'FIXED_WIDTH',
    rawSource,
    extractedAt: new Date().toISOString(),
    operations: [op],
    generatedEarsSpec: '',
    generatedZodCode: '',
    cobolFields: fields,
  };
  schema.generatedEarsSpec = generateEarsSpec(schema);
  schema.generatedZodCode = generateZodCode(schema);
  return schema;
}
