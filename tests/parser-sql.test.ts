import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { CorpseCorruptionError, parseSQL } from '../src/engine/parser';

const SQL = fs.readFileSync(
  path.resolve(process.cwd(), 'graveyard/corpse-02-inventory-dump.sql'),
  'utf-8',
);

function parse() {
  return parseSQL(SQL, {
    artifactId: 'corpse-02-inventory-sql',
    title: '2004 SQL Warehouse',
    era: '2004',
  });
}

describe('SQL DDL parser (Phase 2)', () => {
  it('parses the warehouse table into 6 typed columns', () => {
    const schema = parse();
    expect(schema.format).toBe('SQL_DDL');
    expect(schema.artifactId).toBe('corpse-02-inventory-sql');
    const query = schema.operations.find((o) => o.opId === 'SP_QUERY_STOCK')!;
    expect(query.outputs.map((f) => f.semanticName)).toEqual([
      'skuCode',
      'partDescription',
      'quantityOnHand',
      'reorderThreshold',
      'unitCostUsd',
      'warehouseAisle',
    ]);
    const byName = new Map(query.outputs.map((f) => [f.semanticName, f]));
    expect(byName.get('skuCode')!.type).toBe('string');
    expect(byName.get('skuCode')!.constraints.required).toBe(true);
    expect(byName.get('skuCode')!.constraints.maxLength).toBe(16);
    expect(byName.get('quantityOnHand')!.type).toBe('number');
    expect(byName.get('unitCostUsd')!.type).toBe('number');
  });

  it('derives 3 operations from the stored procedures', () => {
    const schema = parse();
    expect(schema.operations.map((o) => o.mcpToolName)).toEqual([
      'inventory_query_stock',
      'inventory_audit_low_stock',
      'inventory_mutate_quantity',
    ]);
    const [query, audit, mutate] = schema.operations;
    expect(query.riskLevel).toBe('LOW');
    expect(query.inputs.map((f) => f.semanticName)).toEqual(['skuCode', 'warehouseAisle']);
    expect(audit.inputs.map((f) => f.semanticName)).toEqual(['maxRatio']);
    expect(audit.inputs[0].constraints.min).toBe(0);
    expect(audit.inputs[0].constraints.max).toBe(1);
    expect(audit.outputs.map((f) => f.semanticName)).toEqual([
      'itemsBelowThreshold',
      'totalItems',
      'lowStockRatio',
    ]);
    expect(mutate.riskLevel).toBe('MEDIUM');
    expect(mutate.inputs.map((f) => f.semanticName)).toEqual([
      'skuCode',
      'deltaQuantity',
      'authNote',
    ]);
    expect(mutate.outputs.map((f) => f.semanticName)).toEqual([
      'skuCode',
      'quantityOnHand',
      'deltaQuantity',
    ]);
  });

  it('generates EARS + Zod for the SQL operations', () => {
    const schema = parse();
    expect(schema.generatedEarsSpec).toContain('inventory_query_stock');
    expect(schema.generatedZodCode).toContain('InventoryQueryStockInput');
    expect(schema.generatedZodCode).toContain('skuCode');
  });

  it('throws CorpseCorruptionError without a CREATE TABLE', () => {
    expect(() =>
      parseSQL('-- PROCEDURE: SP_QUERY_STOCK (Inputs: @P_SKU_CD)', {
        artifactId: 'x',
        title: 'x',
        era: '2004',
      }),
    ).toThrow(CorpseCorruptionError);
  });

  it('throws CorpseCorruptionError without procedures', () => {
    expect(() =>
      parseSQL('CREATE TABLE T (A INT NOT NULL);', {
        artifactId: 'x',
        title: 'x',
        era: '2004',
      }),
    ).toThrow(CorpseCorruptionError);
  });

  it('throws CorpseCorruptionError on an unknown procedure', () => {
    expect(() =>
      parseSQL(
        'CREATE TABLE T (A INT NOT NULL);\n-- PROCEDURE: SP_NOPE (Inputs: @P_A)',
        { artifactId: 'x', title: 'x', era: '2004' },
      ),
    ).toThrow(CorpseCorruptionError);
  });

  it('throws CorpseCorruptionError on an unsupported SQL type', () => {
    expect(() =>
      parseSQL('CREATE TABLE T (A GEOMETRY NOT NULL);', {
        artifactId: 'x',
        title: 'x',
        era: '2004',
      }),
    ).toThrow(CorpseCorruptionError);
  });
});
