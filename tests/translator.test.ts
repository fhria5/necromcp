import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseWSDL } from '../src/engine/parser';
import {
  buildSoapEnvelope,
  buildSoapResponse,
  escapeXml,
  parseSoapResponse,
  unescapeXml,
} from '../src/engine/translator';
import { CorpseCorruptionError } from '../src/types/necro';

const WSDL = fs.readFileSync(
  path.resolve(process.cwd(), 'graveyard/corpse-01-banking-soap.xml'),
  'utf-8',
);
const AST = parseWSDL(WSDL, {
  artifactId: 'corpse-01-banking-soap',
  title: '1998 SOAP Core Bank',
  era: '1998',
});
const [BAL, WIRE] = AST.operations;

describe('escapeXml / unescapeXml', () => {
  it('escapes and unescapes the five XML metacharacters', () => {
    expect(escapeXml(`a & b <c> "d" 'e'`)).toBe(
      'a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;',
    );
    expect(unescapeXml('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;')).toBe(
      `a & b <c> "d" 'e'`,
    );
  });
});

describe('buildSoapEnvelope', () => {
  it('builds the exact envelope shape for GetAccountBalance', () => {
    const env = buildSoapEnvelope(BAL, {
      accountNumber: '88412007',
      routingCode: '021000021',
    });
    expect(env).toContain('<soapenv:Envelope');
    expect(env).toContain('urn:mainframe:banking:1998');
    expect(env).toContain('<tns:GetAccountBalanceRequest>');
    expect(env).toContain('<ACCT_NUM_STR>88412007</ACCT_NUM_STR>');
    expect(env).toContain('<ROUTING_ABA_CD>021000021</ROUTING_ABA_CD>');
    expect(env).toContain('</tns:GetAccountBalanceRequest>');
  });

  it('escapes memo text in a wire transfer envelope', () => {
    const env = buildSoapEnvelope(WIRE, {
      sourceAccountNumber: '88412007',
      destinationAccountNumber: '11223344',
      amountUsd: 450,
      memo: 'INV & TAX #9921',
    });
    expect(env).toContain('<WIRE_MEMO_TXT>INV &amp; TAX #9921</WIRE_MEMO_TXT>');
    expect(env).toContain('<XFER_AMT_USD>450</XFER_AMT_USD>');
  });

  it('throws CorpseCorruptionError on a missing argument', () => {
    expect(() => buildSoapEnvelope(BAL, { accountNumber: '88412007' })).toThrow(
      CorpseCorruptionError,
    );
  });
});

describe('buildSoapResponse + parseSoapResponse round-trip', () => {
  it('round-trips a balance response', () => {
    const xml = buildSoapResponse(BAL, {
      LEDGER_BAL_CENTS: 483433,
      AVAIL_BAL_CENTS: 480933,
      CCY_ISO_CD: 'USD',
    });
    expect(xml).toContain('<tns:GetAccountBalanceResponse>');
    expect(xml).toContain('<LEDGER_BAL_CENTS>483433</LEDGER_BAL_CENTS>');
    expect(parseSoapResponse(xml, BAL)).toEqual({
      ledgerBalanceCents: 483433,
      availableBalanceCents: 480933,
      currencyCode: 'USD',
    });
  });

  it('round-trips a wire response with an escaped memo-free payload', () => {
    const xml = buildSoapResponse(WIRE, {
      FEDWIRE_REF_ID: 'FED00047025',
      SETTLE_STATUS_CD: '00',
      POSTED_CENTS: 45000,
    });
    expect(parseSoapResponse(xml, WIRE)).toEqual({
      fedwireReferenceId: 'FED00047025',
      settleStatusCode: '00',
      postedCents: 45000,
    });
  });

  it('throws CorpseCorruptionError on a response without the expected block', () => {
    expect(() => parseSoapResponse('<soapenv:Envelope/>', BAL)).toThrow(
      CorpseCorruptionError,
    );
  });
});
