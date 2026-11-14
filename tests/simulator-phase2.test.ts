import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseCOBOL, parseSQL, cobolDataRows } from '../src/engine/parser';
import {
  deriveStockQuantity,
  deriveUnitCost,
  simulateCobol,
  simulateSql,
} from '../src/engine/simulator';
import type { CobolLayoutField } from '../src/engine/translator';

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
const [QUERY, AUDIT, MUTATE] = SQL_AST.operations;
const [LOOKUP] = COBOL_AST.operations;
const ROWS = cobolDataRows(DAT);
const FIELDS: CobolLayoutField[] = COBOL_AST.cobolFields.map((f) => ({
  legacyName: f.legacyName,
  semanticName: f.semanticName,
  type: f.type,
  byteOffset: f.constraints.byteOffset!,
  decimals: f.decimals,
}));

describe('SQL simulator (Phase 2)', () => {
  it('derives deterministic stock for a SKU', () => {
    expect(deriveStockQuantity('SKU-001')).toBe(31);
    expect(deriveUnitCost('SKU-001')).toBe(57.29);
    expect(deriveStockQuantity('SKU-001')).toBe(deriveStockQuantity('SKU-001'));
    expect(deriveStockQuantity('SKU-002')).not.toBe(deriveStockQuantity('SKU-001'));
  });

  it('queries stock with a full legacy result row', () => {
    const { json, wireResponse } = simulateSql(QUERY, {
      skuCode: 'SKU-001',
      warehouseAisle: 'A-12',
    });
    expect(json).toEqual({
      skuCode: 'SKU-001',
      partDescription: 'Legacy part SKU-001',
      quantityOnHand: 31,
      reorderThreshold: 25,
      unitCostUsd: 57.29,
      warehouseAisle: 'A-12',
    });
    expect(wireResponse).toContain('SKU_CD_V2');
    expect(wireResponse).toContain('INV_QTY_OH');
  });

  it('audits low stock deterministically from the ratio', () => {
    const { json } = simulateSql(AUDIT, { maxRatio: 0.5 });
    expect(json).toEqual({
      itemsBelowThreshold: 50,
      totalItems: 240,
      lowStockRatio: 0.2083,
    });
  });

  it('mutates quantity from the derived stock, floored at zero', () => {
    const down = simulateSql(MUTATE, {
      skuCode: 'SKU-001',
      deltaQuantity: -5,
      authNote: 'cycle count',
    });
    expect(down.json).toEqual({
      skuCode: 'SKU-001',
      quantityOnHand: 26,
      deltaQuantity: -5,
    });
    const floor = simulateSql(MUTATE, {
      skuCode: 'SKU-001',
      deltaQuantity: -9999,
      authNote: 'write-off',
    });
    expect(floor.json.quantityOnHand).toBe(0);
  });

  it('throws for an unknown SQL operation', () => {
    expect(() => simulateSql({ ...QUERY, opId: 'SP_NOPE' }, {})).toThrow(
      /no legacy behavior/,
    );
  });
});

describe('COBOL simulator (Phase 2)', () => {
  it('looks up a claim by patient id and returns the raw 80-byte row', () => {
    const { json, wireResponse } = simulateCobol(
      LOOKUP,
      { patientId: 'PT00088412' },
      ROWS,
      FIELDS,
    );
    expect(json).toEqual({
      patientId: 'PT00088412',
      claimDate: '1989-09-02',
      diagnosisCode: 'ICD410.9',
      claimAmountUsd: 1450.75,
      adjustmentStatus: 'A',
      memo: 'CORONARY CARE UNIT ADMISSION VERIFIED',
    });
    expect(wireResponse.length).toBe(80);
    expect(wireResponse.startsWith('PT00088412')).toBe(true);
  });

  it('finds the other two seeded claims', () => {
    const second = simulateCobol(LOOKUP, { patientId: 'PT00091204' }, ROWS, FIELDS);
    expect(second.json.claimAmountUsd).toBe(320.5);
    expect(second.json.adjustmentStatus).toBe('P');
    const third = simulateCobol(LOOKUP, { patientId: 'PT00077319' }, ROWS, FIELDS);
    expect(third.json.claimAmountUsd).toBe(18900);
  });

  it('throws instead of inventing data for an unknown patient', () => {
    expect(() =>
      simulateCobol(LOOKUP, { patientId: 'PT99999999' }, ROWS, FIELDS),
    ).toThrow(/No claim record found for patient "PT99999999"/);
  });
});
