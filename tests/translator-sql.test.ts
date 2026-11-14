import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseSQL } from '../src/engine/parser';
import { buildSqlCall, parseSqlResult } from '../src/engine/translator';

const SQL = fs.readFileSync(
  path.resolve(process.cwd(), 'graveyard/corpse-02-inventory-dump.sql'),
  'utf-8',
);
const AST = parseSQL(SQL, {
  artifactId: 'corpse-02-inventory-sql',
  title: '2004 SQL Warehouse',
  era: '2004',
});
const [QUERY, AUDIT, MUTATE] = AST.operations;

describe('SQL translator (Phase 2)', () => {
  it('builds a parameterized EXEC call — values never enter the SQL text', () => {
    const call = buildSqlCall(QUERY, { skuCode: "SKU-001'; DROP TABLE TBL_WH_INV_MSTR; --", warehouseAisle: 'A-12' });
    expect(call.sql).toBe(
      'EXEC SP_QUERY_STOCK @P_SKU_CD = ?, @P_WH_AISLE = ?',
    );
    expect(call.sql).not.toContain('DROP TABLE');
    expect(call.sql).not.toContain('SKU-001');
    expect(call.params).toEqual([
      "SKU-001'; DROP TABLE TBL_WH_INV_MSTR; --",
      'A-12',
    ]);
    expect(call.wireText).toContain('EXEC SP_QUERY_STOCK');
    expect(call.wireText).toContain('params:');
  });

  it('builds EXEC calls for audit and mutate with matching params', () => {
    const audit = buildSqlCall(AUDIT, { maxRatio: 0.5 });
    expect(audit.sql).toBe('EXEC SP_AUDIT_LOW_STOCK @P_MAX_RATIO = ?');
    expect(audit.params).toEqual([0.5]);
    const mutate = buildSqlCall(MUTATE, {
      skuCode: 'SKU-001',
      deltaQuantity: -5,
      authNote: 'cycle count',
    });
    expect(mutate.sql).toBe(
      'EXEC SP_MUTATE_INV_QTY @P_SKU_CD = ?, @P_DELTA_QTY = ?, @P_AUTH_NOTE = ?',
    );
    expect(mutate.params).toEqual(['SKU-001', -5, 'cycle count']);
  });

  it('maps a result row from legacy columns to semantic JSON', () => {
    const row = {
      SKU_CD_V2: 'SKU-001',
      PART_DESC_TXT: 'Legacy part SKU-001',
      INV_QTY_OH: 31,
      REORD_THRSH_NUM: 25,
      UNIT_CST_USD: 57.29,
      LOC_WH_AISLE: 'A-12',
    };
    expect(parseSqlResult(row, QUERY)).toEqual({
      skuCode: 'SKU-001',
      partDescription: 'Legacy part SKU-001',
      quantityOnHand: 31,
      reorderThreshold: 25,
      unitCostUsd: 57.29,
      warehouseAisle: 'A-12',
    });
  });

  it('throws when an argument or a result column is missing', () => {
    expect(() => buildSqlCall(QUERY, { skuCode: 'SKU-001' })).toThrow(
      /Missing argument "warehouseAisle"/,
    );
    expect(() =>
      parseSqlResult({ SKU_CD_V2: 'SKU-001' }, QUERY),
    ).toThrow(/Missing result column/);
  });
});
