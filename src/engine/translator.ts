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
