/* NecroMCP Phase 1 — embedded engine (Mode B: fully static, zero fetch calls).
 * Works in the browser and in Node: all DOM access is guarded by
 * `typeof document !== 'undefined'`, and the engine is exposed as
 * globalThis.NecroEngine = { parseWSDL, buildSoapEnvelope, parseSoapResponse, simulate, CORPSE_01_WSDL }.
 */

const CORPSE_01_WSDL = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!-- 1998 FIRST NATIONAL MAINFRAME CORE BANKING WSDL/SOAP SPECIFICATION -->\n<definitions name=\"CoreBankingLegacyService\"\n  targetNamespace=\"urn:mainframe:banking:1998\"\n  xmlns:tns=\"urn:mainframe:banking:1998\"\n  xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\"\n  xmlns:soap=\"http://schemas.xmlsoap.org/wsdl/soap/\">\n\n  <message name=\"GetAccountBalanceRequest\">\n    <part name=\"ACCT_NUM_STR\" type=\"xsd:string\" doc=\"8-digit customer account number\"/>\n    <part name=\"ROUTING_ABA_CD\" type=\"xsd:string\" doc=\"9-digit ABA routing code\"/>\n  </message>\n  <message name=\"GetAccountBalanceResponse\">\n    <part name=\"LEDGER_BAL_CENTS\" type=\"xsd:long\" doc=\"Current balance in integer cents\"/>\n    <part name=\"AVAIL_BAL_CENTS\" type=\"xsd:long\" doc=\"Available balance in integer cents\"/>\n    <part name=\"CCY_ISO_CD\" type=\"xsd:string\" doc=\"3-letter ISO currency\"/>\n  </message>\n\n  <message name=\"ExecuteWireTransferRequest\">\n    <part name=\"SRC_ACCT_NUM\" type=\"xsd:string\" doc=\"Origin account number\"/>\n    <part name=\"DST_ACCT_NUM\" type=\"xsd:string\" doc=\"Beneficiary account number\"/>\n    <part name=\"XFER_AMT_USD\" type=\"xsd:decimal\" doc=\"Transfer amount in USD (HITL Gate > 10000)\"/>\n    <part name=\"WIRE_MEMO_TXT\" type=\"xsd:string\" doc=\"Payment remittance remarks\"/>\n  </message>\n  <message name=\"ExecuteWireTransferResponse\">\n    <part name=\"FEDWIRE_REF_ID\" type=\"xsd:string\" doc=\"Mainframe settlement reference\"/>\n    <part name=\"SETTLE_STATUS_CD\" type=\"xsd:string\" doc=\"00=SETTLED, 99=FAULT\"/>\n    <part name=\"POSTED_CENTS\" type=\"xsd:long\" doc=\"Exact integer cents posted to ledger\"/>\n  </message>\n</definitions>\n";

const CORPSE_02_SQL = "-- 2004 AS/400 MANUFACTURING WAREHOUSE DDL & STORED PROCEDURES\nCREATE TABLE TBL_WH_INV_MSTR (\n    SKU_CD_V2 VARCHAR(16) NOT NULL PRIMARY KEY, -- Part SKU Identifier\n    PART_DESC_TXT VARCHAR(64) NOT NULL,         -- Nomenclature description\n    INV_QTY_OH INT NOT NULL DEFAULT 0,          -- Quantity on hand\n    REORD_THRSH_NUM INT NOT NULL DEFAULT 25,    -- Minimum reorder threshold\n    UNIT_CST_USD DECIMAL(10, 2) NOT NULL,       -- Unit manufacturing cost USD\n    LOC_WH_AISLE VARCHAR(12) NOT NULL           -- Physical warehouse bin location\n);\n\n-- PROCEDURE: SP_QUERY_STOCK (Inputs: @P_SKU_CD, @P_WH_AISLE)\n-- PROCEDURE: SP_AUDIT_LOW_STOCK (Inputs: @P_MAX_RATIO)\n-- PROCEDURE: SP_MUTATE_INV_QTY (Inputs: @P_SKU_CD, @P_DELTA_QTY, @P_AUTH_NOTE)\n";

const CORPSE_03_DAT = "* 1989 IBM 3090 HEALTHCARE CLAIMS FIXED-WIDTH COPYBOOK & DATA LEDGER (80-BYTE)\n* LAYOUT:\n* BYTES 01-10 : PT-ID-NUM       PIC X(10)   [Patient Identifier]\n* BYTES 11-15 : CLM-JUL-DT      PIC 9(05)   [Julian Date YYDDD]\n* BYTES 16-23 : ICD9-DIAG-CD    PIC X(08)   [Diagnosis Code]\n* BYTES 24-32 : CLM-AMT-CENTS   PIC 9(07)V99 [Claim Amount Implied Decimal]\n* BYTES 33-33 : ADJ-STAT-FLG    PIC X(01)   [A=Approved, P=Pending, D=Denied]\n* BYTES 34-80 : FILLER-MEMO     PIC X(47)   [Mainframe Operator Remarks]\nPT0008841289245ICD410.9000145075ACORONARY CARE UNIT ADMISSION VERIFIED\nPT0009120489312ICD250.0000032050PROUTINE ENDOCRINE PANEL LAB CLAIM\nPT0007731989340ICD820.8001890000ATRAUMA ORTHOPEDIC SURGICAL INTERVENTION\n";

const TYPE_MAP = {
  'xsd:string': 'string',
  'xsd:long': 'number',
  'xsd:int': 'number',
  'xsd:decimal': 'number',
  'xsd:double': 'number',
  'xsd:boolean': 'boolean'
};

const SEMANTIC_NAMES = {
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
  POSTED_CENTS: 'postedCents'
};

const NUMBER_LEGACY = new Set(['LEDGER_BAL_CENTS', 'AVAIL_BAL_CENTS', 'POSTED_CENTS']);

const OP_META = {
  GetAccountBalance: {
    mcpToolName: 'banking_get_balance',
    zodName: 'BankingGetBalanceInput',
    description: 'Get the ledger and available balance of an account',
    riskLevel: 'LOW',
    earsBody: 'return the ledger and available balance as integer cents'
  },
  ExecuteWireTransfer: {
    mcpToolName: 'banking_wire_transfer',
    zodName: 'BankingWireTransferInput',
    description: 'Execute a wire transfer between two accounts',
    riskLevel: 'CRITICAL',
    hitlThreshold: { field: 'amountUsd', maxAllowed: 10000 },
    earsBody: 'execute a wire transfer between two accounts and return the settlement reference and posted cents'
  }
};

function toCamel(legacyName) {
  const parts = legacyName.toLowerCase().split('_').filter(Boolean);
  return parts.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join('');
}

function toSnake(pascal) {
  return pascal.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function semanticNameOf(legacyName) {
  return SEMANTIC_NAMES[legacyName] || toCamel(legacyName);
}

function parseWSDL(text) {
  const messageRe = /<message\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/message>/g;
  const messages = [];
  let m;
  while ((m = messageRe.exec(text)) !== null) {
    const parts = [];
    const partRe = /<part\b((?:"[^"]*"|[^>])*?)\/>/g;
    let p;
    while ((p = partRe.exec(m[2])) !== null) {
      const attrs = {};
      const attrRe = /(\w+)="([^"]*)"/g;
      let a;
      while ((a = attrRe.exec(p[1])) !== null) attrs[a[1]] = a[2];
      parts.push({
        legacyName: attrs.name,
        semanticName: semanticNameOf(attrs.name),
        type: TYPE_MAP[attrs.type] || 'string',
        constraints: { required: true },
        description: attrs.doc || ''
      });
    }
    messages.push({ name: m[1], parts });
  }

  if (messages.length === 0) {
    const err = new Error('CorpseCorruptionError: no <message> blocks found in WSDL');
    err.name = 'CorpseCorruptionError';
    throw err;
  }

  const byName = {};
  messages.forEach((msg) => { byName[msg.name] = msg; });

  const operations = [];
  messages.forEach((msg) => {
    if (!msg.name.endsWith('Request')) return;
    const opId = msg.name.slice(0, -'Request'.length);
    const response = byName[opId + 'Response'];
    const meta = OP_META[opId] || {};
    const op = {
      opId,
      legacyAction: msg.name,
      mcpToolName: meta.mcpToolName || ('banking_' + toSnake(opId)),
      description: meta.description || ('Call legacy operation ' + opId),
      riskLevel: meta.riskLevel || 'LOW'
    };
    if (meta.hitlThreshold) op.hitlThreshold = { field: meta.hitlThreshold.field, maxAllowed: meta.hitlThreshold.maxAllowed };
    op.inputs = msg.parts;
    op.outputs = response ? response.parts : [];
    operations.push(op);
  });

  const generatedEarsSpec = operations.map((op) => {
    const meta = OP_META[op.opId] || {};
    const body = meta.earsBody || (op.description.charAt(0).toLowerCase() + op.description.slice(1));
    return 'WHEN an agent calls ' + op.mcpToolName + ', THE SYSTEM SHALL ' + body + '.';
  }).join('\n');

  const generatedZodCode = operations.map((op) => {
    const fields = op.inputs.map((f) => {
      return f.semanticName + ': ' + (f.type === 'number' ? 'z.number()' : 'z.string().min(1)');
    }).join(', ');
    return 'export const ' + (OP_META[op.opId] && OP_META[op.opId].zodName ? OP_META[op.opId].zodName : op.opId + 'Input') + ' = z.object({ ' + fields + ' });';
  }).join('\n');

  return {
    artifactId: 'corpse-01-banking-soap',
    title: '1998 SOAP Core Bank',
    era: '1998',
    format: 'SOAP_XML',
    rawSource: text,
    extractedAt: new Date().toISOString(),
    operations,
    generatedEarsSpec,
    generatedZodCode
  };
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlUnescape(value) {
  return String(value)
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

const SOAP_NS = 'xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="urn:mainframe:banking:1998"';

function buildSoapEnvelope(op, args) {
  const parts = op.inputs.map((f) => {
    const v = args[f.semanticName] == null ? '' : args[f.semanticName];
    return '<' + f.legacyName + '>' + xmlEscape(v) + '</' + f.legacyName + '>';
  }).join('');
  return '<soapenv:Envelope ' + SOAP_NS + '><soapenv:Body><tns:' + op.legacyAction + '>' +
    parts + '</tns:' + op.legacyAction + '></soapenv:Body></soapenv:Envelope>';
}

function simulate(op, args) {
  let json;
  if (op.opId === 'GetAccountBalance') {
    const digits = String(args.accountNumber == null ? '' : args.accountNumber).replace(/\D/g, '');
    const n = parseInt(digits, 10) || 0;
    const ledgerBalanceCents = 100000 + ((n * 7919) % 900000);
    const availableBalanceCents = Math.max(0, ledgerBalanceCents - 2500);
    json = { ledgerBalanceCents, availableBalanceCents, currencyCode: 'USD' };
  } else if (op.opId === 'ExecuteWireTransfer') {
    const amountUsd = Number(args.amountUsd);
    const postedCents = Math.round((amountUsd + Number.EPSILON) * 100);
    const seedStr = String(args.sourceAccountNumber == null ? '' : args.sourceAccountNumber) +
      String(args.destinationAccountNumber == null ? '' : args.destinationAccountNumber) +
      String(args.memo == null ? '' : args.memo);
    let refSeed = postedCents;
    for (const ch of seedStr) refSeed += ch.charCodeAt(0);
    const fedwireReferenceId = 'FED' + String(refSeed % 100000000).padStart(8, '0');
    json = { fedwireReferenceId, settleStatusCode: '00', postedCents };
  } else {
    throw new Error('Unknown operation: ' + op.opId);
  }
  const body = op.outputs.map((f) => {
    return '<' + f.legacyName + '>' + xmlEscape(json[f.semanticName]) + '</' + f.legacyName + '>';
  }).join('');
  const responseXml = '<soapenv:Envelope ' + SOAP_NS + '><soapenv:Body><tns:' + op.opId + 'Response>' +
    body + '</tns:' + op.opId + 'Response></soapenv:Body></soapenv:Envelope>';
  return { responseXml, json };
}

function parseSoapResponse(xml) {
  const m = xml.match(/<tns:([A-Za-z0-9]+Response)>([\s\S]*?)<\/tns:\1>/);
  const inner = m ? m[2] : xml;
  const out = {};
  const re = /<([A-Z][A-Z0-9_]*)>([^<]*)<\/\1>/g;
  let part;
  while ((part = re.exec(inner)) !== null) {
    const legacy = part[1];
    const raw = xmlUnescape(part[2]);
    out[semanticNameOf(legacy)] = NUMBER_LEGACY.has(legacy) ? Number(raw) : raw;
  }
  return out;
}

/* ---- Phase 2 engine: SQL + COBOL parsers/translators, Sentinel, HITL ----
 * Mirrors src/engine/*.ts exactly (same formulas, same patterns, same token
 * hash) so the vitest parity suite can compare the two engines directly. */

const SQL_COLUMN_SEMANTIC = {
  SKU_CD_V2: 'skuCode',
  PART_DESC_TXT: 'partDescription',
  INV_QTY_OH: 'quantityOnHand',
  REORD_THRSH_NUM: 'reorderThreshold',
  UNIT_CST_USD: 'unitCostUsd',
  LOC_WH_AISLE: 'warehouseAisle'
};

const SQL_PARAM_SEMANTIC = {
  P_SKU_CD: 'skuCode',
  P_WH_AISLE: 'warehouseAisle',
  P_MAX_RATIO: 'maxRatio',
  P_DELTA_QTY: 'deltaQuantity',
  P_AUTH_NOTE: 'authNote'
};

const SQL_PROCEDURES = {
  SP_QUERY_STOCK: { mcpToolName: 'inventory_query_stock', riskLevel: 'LOW', description: 'Query the on-hand stock of one warehouse part' },
  SP_AUDIT_LOW_STOCK: { mcpToolName: 'inventory_audit_low_stock', riskLevel: 'LOW', description: 'Audit how many warehouse parts sit below their reorder threshold' },
  SP_MUTATE_INV_QTY: { mcpToolName: 'inventory_mutate_quantity', riskLevel: 'MEDIUM', description: 'Adjust the on-hand quantity of one warehouse part' }
};

function sqlTypeToFieldType(sqlType) {
  const t = sqlType.trim().toUpperCase();
  if (t.startsWith('VARCHAR') || t.startsWith('CHAR') || t.startsWith('TEXT')) return 'string';
  if (t === 'INT' || t === 'INTEGER' || t === 'BIGINT' || t === 'SMALLINT') return 'number';
  if (t.startsWith('DECIMAL') || t.startsWith('NUMERIC') || t.startsWith('MONEY')) return 'number';
  if (t === 'BIT' || t.startsWith('BOOLEAN')) return 'boolean';
  if (t.startsWith('DATE') || t.startsWith('DATETIME')) return 'iso_date';
  return undefined;
}

function sqlParamToSemantic(param) {
  if (SQL_PARAM_SEMANTIC[param]) return SQL_PARAM_SEMANTIC[param];
  const cleaned = param.replace(/^P_/, '');
  return toCamel(cleaned);
}

function parseSQL(text) {
  if (!text || !text.trim()) {
    const err = new Error('CorpseCorruptionError: Empty legacy artifact: nothing to parse.');
    err.name = 'CorpseCorruptionError';
    throw err;
  }
  const tableMatch = text.match(/CREATE\s+TABLE\s+([A-Z0-9_]+)\s*\(([\s\S]*?)\);/i);
  if (!tableMatch) {
    const err = new Error('CorpseCorruptionError: Not a SQL DDL dump: no CREATE TABLE statement found.');
    err.name = 'CorpseCorruptionError';
    throw err;
  }
  const tableName = tableMatch[1];
  const columnBlock = tableMatch[2];
  const columns = [];
  const lines = columnBlock.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const colMatch = line.match(/^([A-Z0-9_]+)\s+([A-Z]+(?:\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)\s*(.*?)(?:,)?\s*(?:--\s*(.*))?$/);
    if (!colMatch) {
      const err = new Error('CorpseCorruptionError: Malformed column definition in table "' + tableName + '": "' + line + '".');
      err.name = 'CorpseCorruptionError';
      throw err;
    }
    const colName = colMatch[1];
    const colType = colMatch[2];
    const modifiers = colMatch[3] || '';
    const comment = colMatch[4] || '';
    const fieldType = sqlTypeToFieldType(colType);
    if (!fieldType) {
      const err = new Error('CorpseCorruptionError: Unsupported SQL type "' + colType + '" on column "' + colName + '".');
      err.name = 'CorpseCorruptionError';
      throw err;
    }
    const maxLengthMatch = colType.match(/\((\d+)\)/);
    columns.push({
      legacyName: colName,
      semanticName: SQL_COLUMN_SEMANTIC[colName] || toCamel(colName),
      type: fieldType,
      constraints: {
        required: /NOT NULL/i.test(modifiers),
        ...(maxLengthMatch ? { maxLength: Number(maxLengthMatch[1]) } : {})
      },
      description: (comment || colName).trim()
    });
  }
  if (columns.length === 0) {
    const err = new Error('CorpseCorruptionError: Table "' + tableName + '" declares no columns.');
    err.name = 'CorpseCorruptionError';
    throw err;
  }
  const procedures = [];
  const srcLines = text.split('\n');
  for (let i = 0; i < srcLines.length; i++) {
    const m = srcLines[i].match(/PROCEDURE:\s*([A-Z0-9_]+)\s*\(Inputs:\s*([^)]*)\)/i);
    if (!m) continue;
    const params = m[2].split(',').map((p) => p.trim().replace(/^@/, '')).filter(Boolean);
    procedures.push({ name: m[1].toUpperCase(), params });
  }
  if (procedures.length === 0) {
    const err = new Error('CorpseCorruptionError: No stored PROCEDURE declarations found in SQL DDL dump.');
    err.name = 'CorpseCorruptionError';
    throw err;
  }
  const operations = [];
  for (let i = 0; i < procedures.length; i++) {
    const proc = procedures[i];
    const procMeta = SQL_PROCEDURES[proc.name];
    if (!procMeta) {
      const err = new Error('CorpseCorruptionError: Unknown stored procedure "' + proc.name + '": no MCP mapping defined.');
      err.name = 'CorpseCorruptionError';
      throw err;
    }
    const inputs = proc.params.map((p) => {
      const semantic = sqlParamToSemantic(p);
      const type = (semantic === 'maxRatio' || semantic === 'deltaQuantity') ? 'number' : 'string';
      return {
        legacyName: '@' + p,
        semanticName: semantic,
        type,
        constraints: {
          required: true,
          ...(semantic === 'maxRatio' ? { min: 0, max: 1 } : {})
        },
        description: 'Procedure parameter ' + p
      };
    });
    let outputs;
    if (proc.name === 'SP_AUDIT_LOW_STOCK') {
      outputs = [
        { legacyName: 'ITEMS_BELOW_THRSH', semanticName: 'itemsBelowThreshold', type: 'number', constraints: { required: true }, description: 'Parts below their reorder threshold' },
        { legacyName: 'TOTAL_ITEMS', semanticName: 'totalItems', type: 'number', constraints: { required: true }, description: 'Total parts in the warehouse' },
        { legacyName: 'LOW_STOCK_RATIO', semanticName: 'lowStockRatio', type: 'number', constraints: { required: true }, description: 'Share of parts below threshold (0..1)' }
      ];
    } else if (proc.name === 'SP_MUTATE_INV_QTY') {
      outputs = [
        columns.find((c) => c.semanticName === 'skuCode'),
        columns.find((c) => c.semanticName === 'quantityOnHand'),
        { legacyName: '@P_DELTA_QTY', semanticName: 'deltaQuantity', type: 'number', constraints: { required: true }, description: 'Quantity delta that was applied' }
      ];
    } else {
      outputs = columns.slice();
    }
    operations.push({
      opId: proc.name,
      legacyAction: proc.name,
      mcpToolName: procMeta.mcpToolName,
      description: procMeta.description,
      riskLevel: procMeta.riskLevel,
      inputs,
      outputs
    });
  }
  const generatedEarsSpec = operations.map((op) => {
    const inNames = op.inputs.map((f) => f.semanticName).join(', ');
    const outNames = op.outputs.map((f) => f.semanticName).join(', ');
    return 'WHEN an agent calls ' + op.mcpToolName + ', THE SYSTEM SHALL validate (' + inNames + ') and return (' + outNames + ') as normalized JSON.';
  }).join('\n');
  const generatedZodCode = operations.map((op) => {
    const stem = op.mcpToolName.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    const fields = op.inputs.map((f) => f.semanticName + ': ' + (f.type === 'number' ? 'z.number()' : 'z.string().min(1)')).join(', ');
    return 'export const ' + stem + 'Input = z.object({ ' + fields + ' });';
  }).join('\n');
  return {
    artifactId: 'corpse-02-inventory-sql',
    title: '2004 SQL Warehouse',
    era: '2004',
    format: 'SQL_DDL',
    rawSource: text,
    extractedAt: new Date().toISOString(),
    operations,
    generatedEarsSpec,
    generatedZodCode
  };
}

function buildSqlCall(op, args) {
  const placeholders = op.inputs.map((f) => {
    const raw = args[f.semanticName];
    if (raw === undefined || raw === null) {
      const err = new Error('CorpseCorruptionError: Missing argument "' + f.semanticName + '" for ' + op.mcpToolName + '.');
      err.name = 'CorpseCorruptionError';
      throw err;
    }
    return f.legacyName + ' = ?';
  }).join(', ');
  const sql = 'EXEC ' + op.legacyAction + ' ' + placeholders;
  const params = op.inputs.map((f) => args[f.semanticName]);
  return { sql, params, wireText: sql + '\n-- params: ' + JSON.stringify(params) };
}

function parseSqlResult(row, op) {
  const out = {};
  for (let i = 0; i < op.outputs.length; i++) {
    const f = op.outputs[i];
    if (!(f.legacyName in row)) {
      const err = new Error('CorpseCorruptionError: Missing result column "' + f.legacyName + '" for ' + op.mcpToolName + '.');
      err.name = 'CorpseCorruptionError';
      throw err;
    }
    const raw = row[f.legacyName];
    out[f.semanticName] = f.type === 'number' ? Number(raw) : (f.type === 'boolean' ? Boolean(raw) : raw);
  }
  return out;
}

/* ---- COBOL ---- */

const COBOL_FIELD_SEMANTIC = {
  'PT-ID-NUM': 'patientId',
  'CLM-JUL-DT': 'claimDate',
  'ICD9-DIAG-CD': 'diagnosisCode',
  'CLM-AMT-CENTS': 'claimAmountUsd',
  'ADJ-STAT-FLG': 'adjustmentStatus',
  'FILLER-MEMO': 'memo'
};

function parsePic(pic) {
  const textMatch = pic.match(/^X\((\d+)\)$/i);
  if (textMatch) return { kind: 'text', length: Number(textMatch[1]), decimals: 0 };
  const numMatch = pic.match(/^9\((\d+)\)(?:V(9+))?$/i);
  if (numMatch) {
    return {
      kind: 'number',
      length: Number(numMatch[1]) + (numMatch[2] ? numMatch[2].length : 0),
      decimals: numMatch[2] ? numMatch[2].length : 0
    };
  }
  const err = new Error('CorpseCorruptionError: Unsupported PIC clause "' + pic + '".');
  err.name = 'CorpseCorruptionError';
  throw err;
}

function cobolDataRows(text) {
  return text.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '' && l.charAt(0) !== '*');
}

function parseCOBOL(text) {
  if (!text || !text.trim()) {
    const err = new Error('CorpseCorruptionError: Empty legacy artifact: nothing to parse.');
    err.name = 'CorpseCorruptionError';
    throw err;
  }
  const fields = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\*\s*BYTES\s+(\d+)-(\d+)\s*:\s*([A-Z0-9-]+)\s+PIC\s+(X\(\d+\)|9\(\d+\)(?:V9+)?)\s*\[(.*?)\]/);
    if (!m) continue;
    const start = Number(m[1]);
    const end = Number(m[2]);
    const name = m[3];
    const pic = m[4];
    const description = m[5];
    const parsed = parsePic(pic);
    if (end - start + 1 !== parsed.length) {
      const err = new Error('CorpseCorruptionError: Copybook field "' + name + '" declares BYTES ' + start + '-' + end + ' (' + (end - start + 1) + ' bytes) but PIC ' + pic + ' is ' + parsed.length + ' bytes.');
      err.name = 'CorpseCorruptionError';
      throw err;
    }
    const isJulian = /JUL/i.test(name);
    fields.push({
      legacyName: name,
      semanticName: COBOL_FIELD_SEMANTIC[name] || toCamel(name.replace(/-/g, '_')),
      type: isJulian ? 'iso_date' : (parsed.kind === 'text' ? 'string' : 'number'),
      constraints: { required: true, byteOffset: [start - 1, end] },
      byteOffset: [start - 1, end],
      description: description.trim(),
      byteRange: [start, end],
      pic,
      decimals: parsed.decimals
    });
  }
  if (fields.length === 0) {
    const err = new Error('CorpseCorruptionError: Not a COBOL copybook: no BYTES layout lines found.');
    err.name = 'CorpseCorruptionError';
    throw err;
  }
  const rows = cobolDataRows(text);
  if (rows.length === 0) {
    const err = new Error('CorpseCorruptionError: COBOL flat file contains no data rows.');
    err.name = 'CorpseCorruptionError';
    throw err;
  }
  const minLength = Math.max.apply(null, fields.filter((f) => f.semanticName !== 'memo').map((f) => f.byteRange[1]));
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length < minLength) {
      const err = new Error('CorpseCorruptionError: COBOL data row too short (' + rows[i].length + ' bytes, need at least ' + minLength + '): "' + rows[i] + '".');
      err.name = 'CorpseCorruptionError';
      throw err;
    }
  }
  const op = {
    opId: 'LookupClaimByPatient',
    legacyAction: 'LOOKUP-CLAIM-BY-PATIENT',
    mcpToolName: 'claims_lookup_patient',
    description: 'Look up one healthcare claim record by patient identifier',
    riskLevel: 'LOW',
    inputs: [
      { legacyName: 'PT-ID-NUM', semanticName: 'patientId', type: 'string', constraints: { required: true, maxLength: 10 }, description: 'Patient Identifier' }
    ],
    outputs: fields.map((f) => ({
      legacyName: f.legacyName,
      semanticName: f.semanticName,
      type: f.type,
      constraints: f.constraints,
      description: f.description
    }))
  };
  const generatedEarsSpec = 'WHEN an agent calls claims_lookup_patient, THE SYSTEM SHALL validate (patientId) and return (' +
    op.outputs.map((f) => f.semanticName).join(', ') + ') as normalized JSON.';
  const generatedZodCode = 'export const ClaimsLookupPatientInput = z.object({ patientId: z.string().min(1) });';
  return {
    artifactId: 'corpse-03-cobol-claims',
    title: '1989 COBOL Claims Ledger',
    era: '1989',
    format: 'FIXED_WIDTH',
    rawSource: text,
    extractedAt: new Date().toISOString(),
    operations: [op],
    generatedEarsSpec,
    generatedZodCode,
    cobolFields: fields
  };
}

function julianToISO(julian) {
  const m = /^(\d{2})(\d{3})$/.exec(julian);
  if (!m) {
    const err = new Error('CorpseCorruptionError: Invalid Julian date "' + julian + '": expected YYDDD.');
    err.name = 'CorpseCorruptionError';
    throw err;
  }
  const year = 1900 + Number(m[1]);
  const dayOfYear = Number(m[2]);
  if (dayOfYear < 1 || dayOfYear > 366) {
    const err = new Error('CorpseCorruptionError: Invalid Julian day "' + julian + '": day out of range.');
    err.name = 'CorpseCorruptionError';
    throw err;
  }
  const date = new Date(Date.UTC(year, 0, dayOfYear));
  if (date.getUTCFullYear() !== year) {
    const err = new Error('CorpseCorruptionError: Invalid Julian date "' + julian + '".');
    err.name = 'CorpseCorruptionError';
    throw err;
  }
  return date.toISOString().slice(0, 10);
}

function isoToJulian(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) {
    const err = new Error('CorpseCorruptionError: Invalid ISO date "' + isoDate + '".');
    err.name = 'CorpseCorruptionError';
    throw err;
  }
  const year = Number(m[1]);
  if (year < 1900 || year > 1999) {
    const err = new Error('CorpseCorruptionError: ISO date "' + isoDate + '" is outside the mainframe Julian range 1900-1999.');
    err.name = 'CorpseCorruptionError';
    throw err;
  }
  const date = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3])));
  const start = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.round((date.getTime() - start.getTime()) / 86400000) + 1;
  return String(year - 1900).padStart(2, '0') + String(dayOfYear).padStart(3, '0');
}

function packCobolRecord(fields, args) {
  const record = [];
  for (let i = 0; i < 80; i++) record.push(' ');
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const raw = args[f.semanticName];
    if (raw === undefined || raw === null) {
      const err = new Error('CorpseCorruptionError: Missing field "' + f.semanticName + '" for COBOL record.');
      err.name = 'CorpseCorruptionError';
      throw err;
    }
    const start = f.byteOffset[0];
    const end = f.byteOffset[1];
    const width = end - start;
    let text;
    if (f.type === 'iso_date') {
      text = isoToJulian(String(raw));
    } else if (f.type === 'number' && f.decimals > 0) {
      const scaled = Math.round((Number(raw) + Number.EPSILON) * Math.pow(10, f.decimals));
      text = String(scaled).padStart(width, '0');
    } else if (f.type === 'number') {
      text = String(Math.trunc(Number(raw))).padStart(width, '0');
    } else {
      if (String(raw).length > width) {
        const err = new Error('CorpseCorruptionError: Field "' + f.semanticName + '" value "' + String(raw) + '" exceeds ' + width + ' bytes.');
        err.name = 'CorpseCorruptionError';
        throw err;
      }
      text = String(raw).padEnd(width, ' ');
    }
    if (text.length > width) {
      const err = new Error('CorpseCorruptionError: Field "' + f.semanticName + '" value "' + text + '" exceeds ' + width + ' bytes.');
      err.name = 'CorpseCorruptionError';
      throw err;
    }
    for (let j = 0; j < width; j++) record[start + j] = text[j];
  }
  return record.join('');
}

function parseCobolRecord(line, fields) {
  const padded = line.padEnd(80, ' ');
  const out = {};
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const raw = padded.slice(f.byteOffset[0], f.byteOffset[1]);
    if (f.type === 'iso_date') {
      out[f.semanticName] = julianToISO(raw);
    } else if (f.type === 'number' && f.decimals > 0) {
      out[f.semanticName] = Number(raw) / Math.pow(10, f.decimals);
    } else if (f.type === 'number') {
      out[f.semanticName] = Number(raw);
    } else {
      out[f.semanticName] = raw.trimEnd();
    }
  }
  return out;
}

/* ---- Sentinel + HITL (same rules and token hash as the TS engine) ---- */

const SENTINEL_RULES = [
  { ruleId: 'SENTINEL_XXE', severity: 'CRITICAL', reason: 'XML External Entity declaration blocked (XXE).', patterns: [/<!entity/i, /<!doctype/i] },
  { ruleId: 'SENTINEL_SQLI', severity: 'CRITICAL', reason: 'SQL injection pattern blocked.', patterns: [/'\s*or\s+1\s*=\s*1/i, /\bor\s+1\s*=\s*1/i, /or\s+'[^']+'\s*=\s*'[^']+'/i, /drop\s+table/i, /union\s+select/i, /'\s*--/, /\/\*/, /;\s*(drop|delete|update|insert|alter)\b/i] },
  { ruleId: 'SENTINEL_CMDI', severity: 'HIGH', reason: 'Command injection pattern blocked.', patterns: [/\$\(/, /`[^`]*`/, /\0/, /;\s*(rm|curl|wget|sh|bash|nc|chmod)\b/i, /&&\s*(rm|curl|wget|sh|bash)\b/i, /\|\s*(rm|curl|wget|sh|bash|cat)\b/i] }
];

function sentinelInspect(args) {
  const values = [];
  (function collect(value, path) {
    if (typeof value === 'string') {
      values.push({ field: path, value });
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => collect(v, path + '[' + i + ']'));
    } else if (value !== null && typeof value === 'object') {
      Object.keys(value).forEach((k) => collect(value[k], path ? path + '.' + k : k));
    }
  })(args, '');
  for (let i = 0; i < values.length; i++) {
    for (let r = 0; r < SENTINEL_RULES.length; r++) {
      const rule = SENTINEL_RULES[r];
      for (let p = 0; p < rule.patterns.length; p++) {
        if (rule.patterns[p].test(values[i].value)) {
          return {
            blocked: true,
            ruleId: rule.ruleId,
            severity: rule.severity,
            reason: rule.reason,
            field: values[i].field,
            matched: values[i].value.length > 80 ? values[i].value.slice(0, 80) + '…' : values[i].value
          };
        }
      }
    }
  }
  return { blocked: false };
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function computeHitlToken(artifactId, toolName, args) {
  const text = artifactId + '|' + toolName + '|' + stableStringify(args);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return 'HITL-' + hash.toString(16).toUpperCase().padStart(8, '0');
}

/* ---- SQL + COBOL simulation (same deterministic formulas as TS) ---- */

function seedFromString(value) {
  let seed = 0;
  for (let i = 0; i < value.length; i++) seed += value.charCodeAt(i);
  return seed;
}

function deriveStockQuantity(skuCode) {
  return 10 + ((seedFromString(skuCode) * 37) % 400);
}

function deriveUnitCost(skuCode) {
  return ((seedFromString(skuCode) * 13) % 9000 + 100) / 100;
}

function simulateSql(op, args) {
  let json;
  if (op.opId === 'SP_QUERY_STOCK') {
    const skuCode = String(args.skuCode);
    json = {
      skuCode,
      partDescription: 'Legacy part ' + skuCode,
      quantityOnHand: deriveStockQuantity(skuCode),
      reorderThreshold: 25,
      unitCostUsd: deriveUnitCost(skuCode),
      warehouseAisle: String(args.warehouseAisle)
    };
  } else if (op.opId === 'SP_AUDIT_LOW_STOCK') {
    const totalItems = 240;
    const itemsBelowThreshold = Math.floor(totalItems * Number(args.maxRatio) * 0.42);
    json = {
      itemsBelowThreshold,
      totalItems,
      lowStockRatio: Number((itemsBelowThreshold / totalItems).toFixed(4))
    };
  } else if (op.opId === 'SP_MUTATE_INV_QTY') {
    const skuCode = String(args.skuCode);
    const delta = Number(args.deltaQuantity);
    const newQty = Math.max(0, deriveStockQuantity(skuCode) + delta);
    json = { skuCode, quantityOnHand: newQty, deltaQuantity: delta };
  } else {
    throw new Error('Unknown operation: ' + op.opId);
  }
  const legacyRow = {};
  for (let i = 0; i < op.outputs.length; i++) {
    const f = op.outputs[i];
    legacyRow[f.legacyName] = json[f.semanticName];
  }
  return { wireResponse: JSON.stringify([legacyRow], null, 2), json };
}

function simulateCobol(op, args, rows, fields) {
  const patientId = String(args.patientId);
  const idField = fields.find((f) => f.semanticName === 'patientId');
  if (!idField) throw new Error('COBOL layout has no patientId field.');
  const start = idField.byteOffset[0];
  const end = idField.byteOffset[1];
  let match = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].slice(start, end).trimEnd() === patientId) { match = rows[i]; break; }
  }
  if (!match) throw new Error('No claim record found for patient "' + patientId + '".');
  return { wireResponse: match.padEnd(80, ' '), json: parseCobolRecord(match, fields) };
}

globalThis.NecroEngine = { parseWSDL, buildSoapEnvelope, parseSoapResponse, simulate, CORPSE_01_WSDL, CORPSE_02_SQL, CORPSE_03_DAT, parseSQL, parseCOBOL, cobolDataRows, buildSqlCall, parseSqlResult, packCobolRecord, parseCobolRecord, julianToISO, isoToJulian, sentinelInspect, computeHitlToken, simulateSql, simulateCobol, seedFromString, deriveStockQuantity, deriveUnitCost };

/* ---- Browser UI (guarded: skipped entirely under Node) ---- */
if (typeof document !== 'undefined') {
  const CORPSES = {
    'corpse-01-banking-soap': {
      source: CORPSE_01_WSDL,
      parse: parseWSDL,
      isXml: true,
      wireLabel: 'SOAP Envelope',
      defaults: {
        GetAccountBalance: { accountNumber: '88412007', routingCode: '021000021' },
        ExecuteWireTransfer: {
          sourceAccountNumber: '88412007',
          destinationAccountNumber: '11223344',
          amountUsd: '250',
          memo: 'NecroMCP test transfer'
        }
      }
    },
    'corpse-02-inventory-sql': {
      source: CORPSE_02_SQL,
      parse: parseSQL,
      isXml: false,
      wireLabel: 'SQL Call',
      defaults: {
        SP_QUERY_STOCK: { skuCode: 'SKU-001', warehouseAisle: 'A-12' },
        SP_AUDIT_LOW_STOCK: { maxRatio: '0.5' },
        SP_MUTATE_INV_QTY: { skuCode: 'SKU-001', deltaQuantity: '-5', authNote: 'cycle count' }
      }
    },
    'corpse-03-cobol-claims': {
      source: CORPSE_03_DAT,
      parse: parseCOBOL,
      isXml: false,
      wireLabel: 'COBOL Record',
      defaults: {
        LookupClaimByPatient: { patientId: 'PT00088412' }
      }
    }
  };

  const COBOL_ROWS = cobolDataRows(CORPSE_03_DAT);

  let ast = null;
  let corpseId = 'corpse-01-banking-soap';
  let callCount = 0;
  let pendingHitl = null;

  function el(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlightXmlLine(escaped) {
    let out = escaped;
    out = out.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="c-comment">$1</span>');
    out = out.replace(/(&lt;\/?)([A-Za-z][\w:.-]*)/g, '$1<span class="c-tag">$2</span>');
    out = out.replace(/([\w:.-]+)=(&quot;.*?&quot;)/g, '<span class="c-attr">$1</span>=<span class="c-str">$2</span>');
    return out;
  }

  function renderRawCorpse() {
    const container = el('raw-corpse');
    const lines = CORPSES[corpseId].source.replace(/\n$/, '').split('\n');
    container.innerHTML = lines.map((line, i) => {
      const code = CORPSES[corpseId].isXml
        ? highlightXmlLine(escapeHtml(line))
        : escapeHtml(line);
      return '<div class="code-line"><span class="line-no">' + (i + 1) + '</span><code class="line-code">' +
        code + '</code></div>';
    }).join('');
  }

  function setNodeState(num, state, label) {
    const node = el('node-' + num);
    if (!node) return;
    node.setAttribute('data-state', state);
    const stateEl = node.querySelector('.node-state');
    if (stateEl && label) stateEl.textContent = label;
  }

  function currentOp() {
    const select = el('op-select');
    return ast.operations.find((op) => op.opId === select.value) || ast.operations[0];
  }

  function renderForm(op) {
    const container = el('tool-inputs');
    const defaults = (CORPSES[corpseId].defaults[op.opId] || {});
    container.innerHTML = '';
    op.inputs.forEach((f) => {
      const group = document.createElement('div');
      group.className = 'field-group';
      const label = document.createElement('label');
      label.className = 'field-label';
      label.textContent = f.semanticName + '  (' + f.legacyName + ')';
      label.setAttribute('for', 'input-' + f.semanticName);
      const input = document.createElement('input');
      input.className = 'text-input';
      input.id = 'input-' + f.semanticName;
      input.name = f.semanticName;
      input.type = f.type === 'number' ? 'number' : 'text';
      if (f.type === 'number') input.step = 'any';
      input.value = defaults[f.semanticName] != null ? String(defaults[f.semanticName]) : '';
      input.required = true;
      const hint = document.createElement('span');
      hint.className = 'field-hint';
      hint.textContent = f.description;
      group.appendChild(label);
      group.appendChild(input);
      group.appendChild(hint);
      container.appendChild(group);
    });
  }

  function fillArgs(op, args) {
    op.inputs.forEach((f) => {
      const input = el('input-' + f.semanticName);
      if (input && args[f.semanticName] !== undefined) {
        input.value = String(args[f.semanticName]);
      }
    });
  }

  function setOp(opId) {
    const select = el('op-select');
    select.value = opId;
    renderForm(currentOp());
  }

  function selectCorpse(id) {
    corpseId = id;
    const def = CORPSES[id];
    ['preset-soap-bank', 'preset-sql-warehouse', 'preset-cobol-ledger'].forEach((btnId) => {
      const btn = el(btnId);
      const active = btnId === 'preset-soap-bank' && id === 'corpse-01-banking-soap' ||
        btnId === 'preset-sql-warehouse' && id === 'corpse-02-inventory-sql' ||
        btnId === 'preset-cobol-ledger' && id === 'corpse-03-cobol-claims';
      btn.classList.toggle('preset-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    ast = def.parse(def.source);
    renderRawCorpse();
    el('ears-spec').textContent = ast.generatedEarsSpec;
    el('zod-code').textContent = ast.generatedZodCode;
    const select = el('op-select');
    select.innerHTML = '';
    ast.operations.forEach((op) => {
      const opt = document.createElement('option');
      opt.value = op.opId;
      opt.textContent = op.opId + ' — ' + op.mcpToolName + (op.riskLevel === 'CRITICAL' ? '  [CRITICAL]' : (op.riskLevel === 'MEDIUM' ? '  [MEDIUM]' : ''));
      select.appendChild(opt);
    });
    select.value = ast.operations[0].opId;
    renderForm(ast.operations[0]);
    hideHitlCard();
    setNodeState(1, 'done', 'Done');
    setNodeState(2, 'done', 'Done');
    setNodeState(3, 'active', 'Ready');
    setNodeState(4, 'locked', 'Phase 3');
  }

  function logSentinel(verdict, op) {
    const log = el('sentinel-log');
    const entry = document.createElement('div');
    entry.className = 'log-entry log-blocked';
    const time = new Date().toLocaleTimeString('en-GB');
    entry.innerHTML = '<span class="log-time">' + escapeHtml(time) + '</span> ' +
      '<strong>' + escapeHtml(verdict.ruleId) + '</strong> — ' + escapeHtml(verdict.reason) +
      ' <span class="log-field">' + escapeHtml(op.mcpToolName + ' · ' + verdict.field) + '</span>';
    log.prepend(entry);
    while (log.children.length > 6) log.removeChild(log.lastChild);
    const empty = log.querySelector('.log-empty');
    if (empty) empty.remove();
  }

  function showHitlCard(op, args, token) {
    pendingHitl = { op, args, token };
    el('hitl-amount').textContent = '$' + Number(args[op.hitlThreshold.field]).toLocaleString('en-US') +
      ' (limit $' + Number(op.hitlThreshold.maxAllowed).toLocaleString('en-US') + ')';
    el('hitl-tool').textContent = op.mcpToolName;
    el('hitl-token').textContent = token;
    el('hitl-status').textContent = '';
    el('hitl-card').hidden = false;
  }

  function hideHitlCard() {
    pendingHitl = null;
    const card = el('hitl-card');
    if (card) card.hidden = true;
  }

  function renderOutcome(outcome, op, args, latencyMs) {
    const mcpRequest = {
      jsonrpc: '2.0',
      id: callCount,
      method: 'tools/call',
      params: { name: op.mcpToolName, arguments: args }
    };
    el('wire-mcp').textContent = JSON.stringify(mcpRequest, null, 2);
    el('wire-soap').textContent = outcome.wirePayload || '—';
    el('wire-json').textContent = JSON.stringify(outcome.json, null, 2);
    el('wire-layer2-title').textContent = CORPSES[corpseId].wireLabel;
    el('latency').textContent = latencyMs.toFixed(1) + ' ms';
    const resultEl = el('tool-result');
    if (outcome.status === 'SUCCESS') {
      resultEl.innerHTML =
        '<span class="result-ok">' + escapeHtml(op.mcpToolName) + ' &mdash; settled ' + latencyMs.toFixed(1) + ' ms</span>\n' +
        escapeHtml(JSON.stringify(outcome.json, null, 2));
      setNodeState(3, 'done', 'Done');
    } else if (outcome.status === 'BLOCKED_SECURITY') {
      resultEl.innerHTML =
        '<span class="result-blocked">BLOCKED by Sentinel — ' + escapeHtml(outcome.verdict.ruleId) + '</span>\n' +
        escapeHtml(outcome.verdict.reason) + '\nField: ' + escapeHtml(outcome.verdict.field);
      setNodeState(3, 'active', 'Blocked');
    } else if (outcome.status === 'PENDING_HITL') {
      resultEl.innerHTML =
        '<span class="result-pending">PENDING_HITL_APPROVAL — amount exceeds $10,000</span>\n' +
        'Approve the transfer in the card below to execute it.';
      setNodeState(3, 'active', 'Awaiting approval');
    } else {
      resultEl.innerHTML =
        '<span class="result-blocked">' + escapeHtml(outcome.error || 'Call failed.') + '</span>';
    }
  }

  function executeCall(op, args, hitlToken) {
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    callCount += 1;
    // 1. Sentinel FIRST: blocked calls never reach the wire marshaler.
    const verdict = sentinelInspect(args);
    if (verdict.blocked) {
      const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      logSentinel(verdict, op);
      renderOutcome({ status: 'BLOCKED_SECURITY', verdict, wirePayload: '', json: {} }, op, args, t1 - t0);
      return { status: 'BLOCKED_SECURITY', verdict };
    }
    // 2. HITL gate for mutations above the threshold.
    if (op.hitlThreshold && Number(args[op.hitlThreshold.field]) > op.hitlThreshold.maxAllowed) {
      const token = computeHitlToken(ast.artifactId, op.mcpToolName, args);
      if (hitlToken !== token) {
        const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        showHitlCard(op, args, token);
        renderOutcome({ status: 'PENDING_HITL', wirePayload: '', json: {} }, op, args, t1 - t0);
        return { status: 'PENDING_HITL', token };
      }
    }
    // 3. Marshal, simulate locally, unmarshal.
    let wirePayload;
    let wireResponse;
    let json;
    try {
      if (ast.format === 'SOAP_XML') {
        wirePayload = buildSoapEnvelope(op, args);
        const result = simulate(op, args);
        wireResponse = result.responseXml;
        json = result.json;
      } else if (ast.format === 'SQL_DDL') {
        wirePayload = buildSqlCall(op, args).wireText;
        const result = simulateSql(op, args);
        wireResponse = result.wireResponse;
        json = result.json;
      } else {
        wirePayload = String(args.patientId).padEnd(10, ' ').padEnd(80, ' ');
        const result = simulateCobol(op, args, COBOL_ROWS, ast.cobolFields);
        wireResponse = result.wireResponse;
        json = result.json;
      }
    } catch (e) {
      const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      el('wire-mcp').textContent = JSON.stringify({ jsonrpc: '2.0', id: callCount, method: 'tools/call', params: { name: op.mcpToolName, arguments: args } }, null, 2);
      el('wire-soap').textContent = wirePayload || '—';
      el('wire-json').textContent = '{}';
      el('latency').textContent = (t1 - t0).toFixed(1) + ' ms';
      el('tool-result').innerHTML = '<span class="result-blocked">' + escapeHtml(e.message || String(e)) + '</span>';
      return { status: 'ERROR', error: e.message || String(e) };
    }
    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    renderOutcome({ status: 'SUCCESS', wirePayload, json }, op, args, t1 - t0);
    // Keep the raw legacy response visible in the wire inspector's third layer
    // only when it differs from the normalized JSON (SQL result sets, COBOL rows).
    if (ast.format !== 'SOAP_XML') {
      el('wire-json').textContent = wireResponse + '\n\n' + JSON.stringify(json, null, 2);
    }
    return { status: 'SUCCESS', json };
  }

  function callTool() {
    const op = currentOp();
    const args = {};
    op.inputs.forEach((f) => {
      const input = el('input-' + f.semanticName);
      const raw = input ? input.value : '';
      args[f.semanticName] = f.type === 'number' ? Number(raw) : raw;
    });
    executeCall(op, args);
  }

  function runScenario(which) {
    if (which === 'standard') {
      selectCorpse('corpse-01-banking-soap');
      setOp('ExecuteWireTransfer');
      fillArgs(currentOp(), {
        sourceAccountNumber: '88412007',
        destinationAccountNumber: '11223344',
        amountUsd: '450',
        memo: 'NecroMCP test transfer'
      });
      const out = executeCall(currentOp(), {
        sourceAccountNumber: '88412007',
        destinationAccountNumber: '11223344',
        amountUsd: 450,
        memo: 'NecroMCP test transfer'
      });
      return out;
    }
    if (which === 'hitl') {
      selectCorpse('corpse-01-banking-soap');
      setOp('ExecuteWireTransfer');
      fillArgs(currentOp(), {
        sourceAccountNumber: '88412007',
        destinationAccountNumber: '11223344',
        amountUsd: '50000',
        memo: 'Big transfer'
      });
      const out = executeCall(currentOp(), {
        sourceAccountNumber: '88412007',
        destinationAccountNumber: '11223344',
        amountUsd: 50000,
        memo: 'Big transfer'
      });
      return out;
    }
    // attack: two payloads, both must be blocked by Sentinel.
    selectCorpse('corpse-01-banking-soap');
    setOp('ExecuteWireTransfer');
    const op = currentOp();
    const xxe = executeCall(op, {
      sourceAccountNumber: '88412007',
      destinationAccountNumber: '11223344',
      amountUsd: 450,
      memo: '<!ENTITY xxe SYSTEM "file:///etc/passwd">'
    });
    fillArgs(op, { memo: '\' OR 1=1 --' });
    const sqli = executeCall(op, {
      sourceAccountNumber: '88412007',
      destinationAccountNumber: '11223344',
      amountUsd: 450,
      memo: '\' OR 1=1 --'
    });
    return { xxe, sqli };
  }

  function approveHitl() {
    if (!pendingHitl) return;
    const pending = pendingHitl;
    hideHitlCard();
    const out = executeCall(pending.op, pending.args, pending.token);
    if (out.status === 'SUCCESS') {
      el('hitl-status').textContent = '';
    }
  }

  function denyHitl() {
    if (!pendingHitl) return;
    const op = pendingHitl.op;
    hideHitlCard();
    el('tool-result').innerHTML =
      '<span class="result-blocked">Transfer denied by operator — ' + escapeHtml(op.mcpToolName) + ' was not executed.</span>';
    setNodeState(3, 'active', 'Denied');
  }

  function switchTab(which) {
    const rawTab = el('tab-raw');
    const earsTab = el('tab-ears');
    const rawPanel = el('panel-raw');
    const earsPanel = el('panel-ears');
    if (which === 'raw') {
      rawTab.classList.add('tab-active');
      rawTab.setAttribute('aria-selected', 'true');
      earsTab.classList.remove('tab-active');
      earsTab.setAttribute('aria-selected', 'false');
      rawPanel.hidden = false;
      earsPanel.hidden = true;
    } else {
      earsTab.classList.add('tab-active');
      earsTab.setAttribute('aria-selected', 'true');
      rawTab.classList.remove('tab-active');
      rawTab.setAttribute('aria-selected', 'false');
      earsPanel.hidden = false;
      rawPanel.hidden = true;
    }
  }

  function init() {
    el('preset-soap-bank').addEventListener('click', () => selectCorpse('corpse-01-banking-soap'));
    el('preset-sql-warehouse').addEventListener('click', () => selectCorpse('corpse-02-inventory-sql'));
    el('preset-cobol-ledger').addEventListener('click', () => selectCorpse('corpse-03-cobol-claims'));
    el('tab-raw').addEventListener('click', () => switchTab('raw'));
    el('tab-ears').addEventListener('click', () => switchTab('ears'));
    el('op-select').addEventListener('change', () => renderForm(currentOp()));
    el('call-tool-btn').addEventListener('click', callTool);
    el('scenario-standard').addEventListener('click', () => runScenario('standard'));
    el('scenario-hitl').addEventListener('click', () => runScenario('hitl'));
    el('scenario-attack').addEventListener('click', () => runScenario('attack'));
    el('hitl-approve').addEventListener('click', approveHitl);
    el('hitl-deny').addEventListener('click', denyHitl);
    selectCorpse('corpse-01-banking-soap');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
