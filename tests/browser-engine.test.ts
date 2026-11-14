// Parity tests: the Mode B browser engine (public/app.js) must behave EXACTLY
// like the TypeScript engine for corpse-01. app.js exposes globalThis.NecroEngine
// and guards all DOM access, so it can be imported in Node.
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseWSDL } from '../src/engine/parser';
import { buildSoapEnvelope } from '../src/engine/translator';
import { simulate } from '../src/engine/simulator';

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

async function browserEngine(): Promise<any> {
  await import('../public/app.js');
  const eng = (globalThis as any).NecroEngine;
  if (!eng) throw new Error('public/app.js did not expose globalThis.NecroEngine');
  return eng;
}

describe('browser engine parity (public/app.js vs TypeScript engine)', () => {
  it('parses the embedded WSDL into the same 2 operations', async () => {
    const eng = await browserEngine();
    expect(eng.CORPSE_01_WSDL).toBe(WSDL);
    const ast = eng.parseWSDL(eng.CORPSE_01_WSDL);
    expect(ast.artifactId).toBe('corpse-01-banking-soap');
    expect(ast.operations.map((o: any) => o.opId)).toEqual([
      'GetAccountBalance',
      'ExecuteWireTransfer',
    ]);
    expect(ast.operations.map((o: any) => o.mcpToolName)).toEqual([
      'banking_get_balance',
      'banking_wire_transfer',
    ]);
    expect(ast.generatedEarsSpec).toContain('banking_get_balance');
    expect(ast.generatedZodCode).toContain('BankingGetBalanceInput');
  });

  it('builds byte-identical SOAP envelopes for both operations', async () => {
    const eng = await browserEngine();
    const balArgs = { accountNumber: '88412007', routingCode: '021000021' };
    expect(eng.buildSoapEnvelope(BAL, balArgs)).toBe(buildSoapEnvelope(BAL, balArgs));
    const wireArgs = {
      sourceAccountNumber: '88412007',
      destinationAccountNumber: '11223344',
      amountUsd: 450,
      memo: 'INV & TAX #9921',
    };
    expect(eng.buildSoapEnvelope(WIRE, wireArgs)).toBe(buildSoapEnvelope(WIRE, wireArgs));
  });

  it('simulates identical balances and wire settlements', async () => {
    const eng = await browserEngine();
    const balArgs = { accountNumber: '88412007', routingCode: '021000021' };
    const tsBal = simulate(BAL, balArgs);
    const jsBal = eng.simulate(BAL, balArgs);
    expect(jsBal.json).toEqual(tsBal.json);
    expect(jsBal.json).toEqual({
      ledgerBalanceCents: 483433,
      availableBalanceCents: 480933,
      currencyCode: 'USD',
    });
    expect(jsBal.responseXml).toBe(tsBal.responseXml);
    const wireArgs = {
      sourceAccountNumber: '88412007',
      destinationAccountNumber: '11223344',
      amountUsd: 450,
      memo: 'Rent payment',
    };
    const tsWire = simulate(WIRE, wireArgs);
    const jsWire = eng.simulate(WIRE, wireArgs);
    expect(jsWire.json).toEqual(tsWire.json);
    expect(jsWire.json.postedCents).toBe(45000);
    expect(jsWire.responseXml).toBe(tsWire.responseXml);
  });

  it('round-trips SOAP responses back to the same JSON', async () => {
    const eng = await browserEngine();
    const balArgs = { accountNumber: '88412007', routingCode: '021000021' };
    const { responseXml, json } = eng.simulate(BAL, balArgs);
    expect(eng.parseSoapResponse(responseXml, BAL)).toEqual(json);
  });

  it('throws CorpseCorruptionError on a WSDL with no messages', async () => {
    const eng = await browserEngine();
    expect(() => eng.parseWSDL('<definitions name="Empty"></definitions>')).toThrow(
      /CorpseCorruptionError/,
    );
  });
});
