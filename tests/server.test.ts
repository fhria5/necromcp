import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server';
import { computeHitlToken } from '../src/engine/hitl';

let base = '';

beforeAll(async () => {
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
  (globalThis as any).__server = server;
});

afterAll(async () => {
  await new Promise<void>((resolve) => (globalThis as any).__server.close(() => resolve()));
});

async function post(path: string, body: unknown) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

const WIRE_450 = {
  sourceAccountNumber: '88412007',
  destinationAccountNumber: '11223344',
  amountUsd: 450,
  memo: 'NecroMCP test transfer',
};
const WIRE_50000 = {
  sourceAccountNumber: '88412007',
  destinationAccountNumber: '11223344',
  amountUsd: 50000,
  memo: 'Big transfer',
};

describe('REST + MCP endpoints (Phase 2)', () => {
  it('GET /api/health reports the local simulator honestly', async () => {
    const res = await fetch(base + '/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('phase-4');
    expect(body.simulator).toBe('local');
    expect(body.note).toContain('simulator lokal');
  });

  it('GET /api/graveyard lists all three corpses as available', async () => {
    const res = await fetch(base + '/api/graveyard');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.corpses).toHaveLength(3);
    const [c1, c2, c3] = body.corpses;
    expect(c1.status).toBe('available');
    expect(c1.operations).toEqual(['banking_get_balance', 'banking_wire_transfer']);
    expect(c2.status).toBe('available');
    expect(c2.operations).toEqual([
      'inventory_query_stock',
      'inventory_audit_low_stock',
      'inventory_mutate_quantity',
    ]);
    expect(c3.status).toBe('available');
    expect(c3.operations).toEqual(['claims_lookup_patient']);
  });

  it('POST /api/resurrect returns the AST for all three corpses', async () => {
    for (const [artifactId, opCount, tool] of [
      ['corpse-01-banking-soap', 2, 'banking_get_balance'],
      ['corpse-02-inventory-sql', 3, 'inventory_query_stock'],
      ['corpse-03-cobol-claims', 1, 'claims_lookup_patient'],
    ] as const) {
      const { status, json } = await post('/api/resurrect', { artifactId });
      expect(status).toBe(200);
      expect(json.operations).toHaveLength(opCount);
      expect(json.generatedEarsSpec).toContain(tool);
    }
    const bad = await post('/api/resurrect', { artifactId: 'nope' });
    expect(bad.status).toBe(404);
  });

  it('GET /mcp/tools lists all 6 resurrected tools', async () => {
    const res = await fetch(base + '/mcp/tools');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.jsonrpc).toBe('2.0');
    expect(body.result.tools.map((t: any) => t.name)).toEqual([
      'banking_get_balance',
      'banking_wire_transfer',
      'inventory_query_stock',
      'inventory_audit_low_stock',
      'inventory_mutate_quantity',
      'claims_lookup_patient',
    ]);
    const query = body.result.tools[2];
    expect(query.inputSchema.properties.skuCode).toBeDefined();
  });

  it('POST /mcp/call banking_get_balance still returns SUCCESS (Phase 1 intact)', async () => {
    const { status, json } = await post('/mcp/call', {
      artifactId: 'corpse-01-banking-soap',
      toolName: 'banking_get_balance',
      arguments: { accountNumber: '88412007', routingCode: '021000021' },
    });
    expect(status).toBe(200);
    expect(json.status).toBe('SUCCESS');
    expect(json.normalizedJsonResponse).toEqual({
      ledgerBalanceCents: 483433,
      availableBalanceCents: 480933,
      currencyCode: 'USD',
    });
  });

  it('POST /mcp/call wire $450 still succeeds (below the HITL threshold)', async () => {
    const { status, json } = await post('/mcp/call', {
      artifactId: 'corpse-01-banking-soap',
      toolName: 'banking_wire_transfer',
      arguments: WIRE_450,
    });
    expect(status).toBe(200);
    expect(json.status).toBe('SUCCESS');
    expect(json.normalizedJsonResponse.postedCents).toBe(45000);
  });

  it('POST /mcp/call inventory_query_stock returns SUCCESS with SQL wire', async () => {
    const { status, json } = await post('/mcp/call', {
      artifactId: 'corpse-02-inventory-sql',
      toolName: 'inventory_query_stock',
      arguments: { skuCode: 'SKU-001', warehouseAisle: 'A-12' },
    });
    expect(status).toBe(200);
    expect(json.status).toBe('SUCCESS');
    expect(json.legacyWirePayload).toContain('EXEC SP_QUERY_STOCK @P_SKU_CD = ?');
    // The statement itself carries no values; values ride in the params list.
    expect(json.legacyWirePayload.split('\n')[0]).not.toContain('SKU-001');
    expect(json.legacyWirePayload).toContain('-- params: ["SKU-001","A-12"]');
    expect(json.legacyRawResponse).toContain('SKU_CD_V2');
    expect(json.normalizedJsonResponse).toEqual({
      skuCode: 'SKU-001',
      partDescription: 'Legacy part SKU-001',
      quantityOnHand: 31,
      reorderThreshold: 25,
      unitCostUsd: 57.29,
      warehouseAisle: 'A-12',
    });
  });

  it('POST /mcp/call inventory_mutate_quantity adjusts stock', async () => {
    const { status, json } = await post('/mcp/call', {
      artifactId: 'corpse-02-inventory-sql',
      toolName: 'inventory_mutate_quantity',
      arguments: { skuCode: 'SKU-001', deltaQuantity: -5, authNote: 'cycle count' },
    });
    expect(status).toBe(200);
    expect(json.status).toBe('SUCCESS');
    expect(json.normalizedJsonResponse).toEqual({
      skuCode: 'SKU-001',
      quantityOnHand: 26,
      deltaQuantity: -5,
    });
  });

  it('POST /mcp/call claims_lookup_patient returns the 1989 claim', async () => {
    const { status, json } = await post('/mcp/call', {
      artifactId: 'corpse-03-cobol-claims',
      toolName: 'claims_lookup_patient',
      arguments: { patientId: 'PT00088412' },
    });
    expect(status).toBe(200);
    expect(json.status).toBe('SUCCESS');
    expect(json.legacyWirePayload.length).toBe(80);
    expect(json.legacyWirePayload.startsWith('PT00088412')).toBe(true);
    expect(json.legacyRawResponse.length).toBe(80);
    expect(json.normalizedJsonResponse).toEqual({
      patientId: 'PT00088412',
      claimDate: '1989-09-02',
      diagnosisCode: 'ICD410.9',
      claimAmountUsd: 1450.75,
      adjustmentStatus: 'A',
      memo: 'CORONARY CARE UNIT ADMISSION VERIFIED',
    });
  });

  it('POST /mcp/call returns 404 for an unknown patient instead of inventing data', async () => {
    const { status, json } = await post('/mcp/call', {
      artifactId: 'corpse-03-cobol-claims',
      toolName: 'claims_lookup_patient',
      arguments: { patientId: 'PT99999999' },
    });
    expect(status).toBe(404);
    expect(json.error).toContain('No claim record found');
  });

  it('POST /mcp/call blocks XXE before any wire is marshaled', async () => {
    const { status, json } = await post('/mcp/call', {
      artifactId: 'corpse-01-banking-soap',
      toolName: 'banking_wire_transfer',
      arguments: {
        ...WIRE_450,
        memo: '<!ENTITY xxe SYSTEM "file:///etc/passwd">',
      },
    });
    expect(status).toBe(200);
    expect(json.status).toBe('BLOCKED_SECURITY');
    expect(json.securityAlert.ruleId).toBe('SENTINEL_XXE');
    expect(json.securityAlert.severity).toBe('CRITICAL');
    expect(json.legacyWirePayload).toBe('');
    expect(json.legacyRawResponse).toBe('');
  });

  it('POST /mcp/call blocks SQL injection in the memo', async () => {
    const { status, json } = await post('/mcp/call', {
      artifactId: 'corpse-02-inventory-sql',
      toolName: 'inventory_mutate_quantity',
      arguments: {
        skuCode: "SKU-001'; DROP TABLE TBL_WH_INV_MSTR; --",
        deltaQuantity: 1,
        authNote: 'x',
      },
    });
    expect(status).toBe(200);
    expect(json.status).toBe('BLOCKED_SECURITY');
    expect(json.securityAlert.ruleId).toBe('SENTINEL_SQLI');
    expect(json.legacyWirePayload).toBe('');
  });

  it('POST /mcp/call pauses a $50,000 wire as PENDING_HITL with a token', async () => {
    const { status, json } = await post('/mcp/call', {
      artifactId: 'corpse-01-banking-soap',
      toolName: 'banking_wire_transfer',
      arguments: WIRE_50000,
    });
    expect(status).toBe(200);
    expect(json.status).toBe('PENDING_HITL');
    expect(json.hitl.field).toBe('amountUsd');
    expect(json.hitl.value).toBe(50000);
    expect(json.hitl.maxAllowed).toBe(10000);
    expect(json.hitl.approvalToken).toMatch(/^HITL-[0-9A-F]{8}$/);
    expect(json.legacyWirePayload).toBe('');
  });

  it('POST /mcp/call executes the $50,000 wire only with the right token', async () => {
    const token = computeHitlToken(
      'corpse-01-banking-soap',
      'banking_wire_transfer',
      WIRE_50000,
    );
    const wrong = await post('/mcp/call', {
      artifactId: 'corpse-01-banking-soap',
      toolName: 'banking_wire_transfer',
      arguments: WIRE_50000,
      bypassHitlToken: 'HITL-DEADBEEF',
    });
    expect(wrong.json.status).toBe('PENDING_HITL');
    const ok = await post('/mcp/call', {
      artifactId: 'corpse-01-banking-soap',
      toolName: 'banking_wire_transfer',
      arguments: WIRE_50000,
      bypassHitlToken: token,
    });
    expect(ok.status).toBe(200);
    expect(ok.json.status).toBe('SUCCESS');
    expect(ok.json.normalizedJsonResponse.postedCents).toBe(5000000);
  });

  it('POST /mcp/call rejects invalid arguments with 400', async () => {
    const { status, json } = await post('/mcp/call', {
      artifactId: 'corpse-01-banking-soap',
      toolName: 'banking_get_balance',
      arguments: { accountNumber: '88412007' },
    });
    expect(status).toBe(400);
    expect(json.issues.length).toBeGreaterThan(0);
  });

  it('POST /mcp/call returns 404 for an unknown tool', async () => {
    const { status } = await post('/mcp/call', {
      artifactId: 'corpse-01-banking-soap',
      toolName: 'banking_nope',
      arguments: {},
    });
    expect(status).toBe(404);
  });
});
