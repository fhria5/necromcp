// Bidirectional wire translator: JSON <-> SOAP envelope.
// Phase 1 scope: SOAP_XML only. Values are XML-escaped on the way out and
// unescaped on the way back. Field order always follows the WSDL part order.
import { CorpseCorruptionError, NormalizedOperation } from '../types/necro';

export const SOAP_NS = 'urn:mainframe:banking:1998';
export const SOAPENV_NS = 'http://schemas.xmlsoap.org/soap/envelope/';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function unescapeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/** Build a SOAP request envelope from semantic-name args (input order = WSDL order). */
export function buildSoapEnvelope(
  op: NormalizedOperation,
  args: Record<string, unknown>,
): string {
  const parts = op.inputs
    .map((f) => {
      const raw = args[f.semanticName];
      if (raw === undefined || raw === null) {
        throw new CorpseCorruptionError(
          `Missing argument "${f.semanticName}" for ${op.mcpToolName}.`,
        );
      }
      return `<${f.legacyName}>${escapeXml(String(raw))}</${f.legacyName}>`;
    })
    .join('');
  return (
    `<soapenv:Envelope xmlns:soapenv="${SOAPENV_NS}" xmlns:tns="${SOAP_NS}">` +
    `<soapenv:Body><tns:${op.legacyAction}>${parts}</tns:${op.legacyAction}>` +
    `</soapenv:Body></soapenv:Envelope>`
  );
}

/** Build a SOAP response envelope from legacy-name values (output order = WSDL order). */
export function buildSoapResponse(
  op: NormalizedOperation,
  legacyValues: Record<string, unknown>,
): string {
  const responseName = op.legacyAction.replace(/Request$/, 'Response');
  const parts = op.outputs
    .map((f) => {
      const raw = legacyValues[f.legacyName];
      if (raw === undefined || raw === null) {
        throw new CorpseCorruptionError(
          `Missing output "${f.legacyName}" for ${op.mcpToolName}.`,
        );
      }
      return `<${f.legacyName}>${escapeXml(String(raw))}</${f.legacyName}>`;
    })
    .join('');
  return (
    `<soapenv:Envelope xmlns:soapenv="${SOAPENV_NS}" xmlns:tns="${SOAP_NS}">` +
    `<soapenv:Body><tns:${responseName}>${parts}</tns:${responseName}>` +
    `</soapenv:Body></soapenv:Envelope>`
  );
}

/** Parse a SOAP response envelope back into a semantic-name JSON object. */
export function parseSoapResponse(
  xml: string,
  op: NormalizedOperation,
): Record<string, unknown> {
  const responseName = op.legacyAction.replace(/Request$/, 'Response');
  const bodyRe = new RegExp(
    `<tns:${responseName}>([\\s\\S]*?)</tns:${responseName}>`,
  );
  const bodyMatch = xml.match(bodyRe);
  if (!bodyMatch) {
    throw new CorpseCorruptionError(
      `No <tns:${responseName}> block found in SOAP response.`,
    );
  }
  const body = bodyMatch[1];
  const out: Record<string, unknown> = {};
  for (const f of op.outputs) {
    const m = body.match(new RegExp(`<${f.legacyName}>([\\s\\S]*?)</${f.legacyName}>`));
    if (!m) {
      throw new CorpseCorruptionError(
        `Missing output part "${f.legacyName}" in SOAP response.`,
      );
    }
    const raw = unescapeXml(m[1]);
    out[f.semanticName] = f.type === 'number' ? Number(raw) : raw;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* SQL translator (Phase 2): JSON <-> parameterized stored-procedure   */
/* call. Values NEVER interpolate into the SQL text: the wire payload  */
/* is the statement with '?' placeholders plus a separate params list.*/
/* ------------------------------------------------------------------ */

export interface SqlCall {
  /** Statement text with '?' placeholders only — no values inside. */
  sql: string;
  /** Parameter values, in placeholder order. */
  params: unknown[];
  /** Human-readable wire form: statement + params list (for the inspector). */
  wireText: string;
}

/** Build a parameterized EXEC call for a stored-procedure operation. */
export function buildSqlCall(
  op: NormalizedOperation,
  args: Record<string, unknown>,
): SqlCall {
  const placeholders = op.inputs
    .map((f) => {
      const raw = args[f.semanticName];
      if (raw === undefined || raw === null) {
        throw new CorpseCorruptionError(
          `Missing argument "${f.semanticName}" for ${op.mcpToolName}.`,
        );
      }
      return `${f.legacyName} = ?`;
    })
    .join(', ');
  const sql = `EXEC ${op.legacyAction} ${placeholders}`;
  const params = op.inputs.map((f) => args[f.semanticName]);
  return {
    sql,
    params,
    wireText: `${sql}\n-- params: ${JSON.stringify(params)}`,
  };
}

/** Map one result row (legacy column names) to semantic-name JSON. */
export function parseSqlResult(
  row: Record<string, unknown>,
  op: NormalizedOperation,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of op.outputs) {
    if (!(f.legacyName in row)) {
      throw new CorpseCorruptionError(
        `Missing result column "${f.legacyName}" for ${op.mcpToolName}.`,
      );
    }
    const raw = row[f.legacyName];
    out[f.semanticName] =
      f.type === 'number' ? Number(raw) : f.type === 'boolean' ? Boolean(raw) : raw;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* COBOL translator (Phase 2): JSON <-> 80-byte fixed-width record.   */
/* Currency uses Math.round((val + EPSILON) * 100): 0.29 USD is 29     */
/* cents, never 28. Julian dates are YYDDD (e.g. 89245 = 1989-09-02).  */
/* ------------------------------------------------------------------ */

/** Convert a 5-digit mainframe Julian date (YYDDD) to ISO-8601. */
export function julianToISO(julian: string): string {
  const m = /^(\d{2})(\d{3})$/.exec(julian);
  if (!m) {
    throw new CorpseCorruptionError(`Invalid Julian date "${julian}": expected YYDDD.`);
  }
  const year = 1900 + Number(m[1]);
  const dayOfYear = Number(m[2]);
  if (dayOfYear < 1 || dayOfYear > 366) {
    throw new CorpseCorruptionError(`Invalid Julian day "${julian}": day out of range.`);
  }
  const date = new Date(Date.UTC(year, 0, dayOfYear));
  if (date.getUTCFullYear() !== year) {
    throw new CorpseCorruptionError(`Invalid Julian date "${julian}".`);
  }
  return date.toISOString().slice(0, 10);
}

/** Convert an ISO-8601 date to a 5-digit mainframe Julian date (YYDDD). */
export function isoToJulian(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) {
    throw new CorpseCorruptionError(`Invalid ISO date "${isoDate}".`);
  }
  const year = Number(m[1]);
  if (year < 1900 || year > 1999) {
    throw new CorpseCorruptionError(
      `ISO date "${isoDate}" is outside the mainframe Julian range 1900-1999.`,
    );
  }
  const date = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3])));
  const start = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.round((date.getTime() - start.getTime()) / 86400000) + 1;
  return String(year - 1900).padStart(2, '0') + String(dayOfYear).padStart(3, '0');
}

export interface CobolLayoutField {
  legacyName: string;
  semanticName: string;
  type: 'string' | 'number' | 'iso_date';
  /** 0-based [start, end) byte offsets in the 80-byte record. */
  byteOffset: [number, number];
  decimals: number;
}

/**
 * Pack semantic-name args into an 80-byte fixed-width record.
 * Text is left-justified, space-padded; numbers are zero-padded; currency
 * with implied decimals is scaled by 10^decimals with correct rounding.
 */
export function packCobolRecord(
  fields: CobolLayoutField[],
  args: Record<string, unknown>,
): string {
  const record = new Array<string>(80).fill(' ');
  for (const f of fields) {
    const raw = args[f.semanticName];
    if (raw === undefined || raw === null) {
      throw new CorpseCorruptionError(
        `Missing field "${f.semanticName}" for COBOL record.`,
      );
    }
    const [start, end] = f.byteOffset;
    const width = end - start;
    let text: string;
    if (f.type === 'iso_date') {
      text = isoToJulian(String(raw));
    } else if (f.type === 'number' && f.decimals > 0) {
      const scaled = Math.round(
        (Number(raw) + Number.EPSILON) * Math.pow(10, f.decimals),
      );
      text = String(scaled).padStart(width, '0');
    } else if (f.type === 'number') {
      text = String(Math.trunc(Number(raw))).padStart(width, '0');
    } else {
      // Text is left-justified, space-padded. Overflowing an identifier is
      // data corruption, never silent truncation: throw instead.
      if (String(raw).length > width) {
        throw new CorpseCorruptionError(
          `Field "${f.semanticName}" value "${String(raw)}" exceeds ${width} bytes.`,
        );
      }
      text = String(raw).padEnd(width, ' ');
    }
    if (text.length > width) {
      throw new CorpseCorruptionError(
        `Field "${f.semanticName}" value "${text}" exceeds ${width} bytes.`,
      );
    }
    for (let i = 0; i < width; i++) record[start + i] = text[i];
  }
  return record.join('');
}

/** Parse one 80-byte (or right-trimmed) record into semantic-name JSON. */
export function parseCobolRecord(
  line: string,
  fields: CobolLayoutField[],
): Record<string, unknown> {
  const padded = line.padEnd(80, ' ');
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const [start, end] = f.byteOffset;
    const raw = padded.slice(start, end);
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
