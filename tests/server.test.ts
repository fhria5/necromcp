import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server';

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

describe('REST + MCP endpoints (Phase 1)', () => {
  it('GET /api/health reports the local simulator honestly', async () => {
    const res = await fetch(base + '/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('phase-1');
    expect(body.simulator).toBe('local');
    expect(body.note).toContain('simulator lokal');
  });

  it('GET /api/graveyard lists corpse-01 available and the rest as phase-2', async () => {
    const res = await fetch(base + '/api/graveyard');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.corpses).toHaveLength(3);
    const [c1, c2, c3] = body.corpses;
    expect(c1.artifactId).toBe('corpse-01-banking-soap');
    expect(c1.status).toBe('available');
    expect(c1.fileExists).toBe(true);
    expect(c1.operations).toEqual(['banking_get_balance', 'banking_wire_transfer']);
    expect(c2.status).toBe('phase-2');
    expect(c3.status).toBe('phase-2');
  });

  it('POST /api/resurrect returns the corpse-01 AST', async () => {
    const { status, json } = await post('/api/resurrect', {
      artifactId: 'corpse-01-banking-soap',
    });
    expect(status).toBe(200);
    expect(json.operations).toHaveLength(2);
    expect(json.generatedEarsSpec).toContain('banking_get_balance');
  });

  it('POST /api/resurrect returns 501 for a Phase 2 corpse and 404 for unknown', async () => {
    const p2 = await post('/api/resurrect', { artifactId: 'corpse-02-inventory-sql' });
    expect(p2.status).toBe(501);
    const bad = await post('/api/resurrect', { artifactId: 'nope' });
    expect(bad.status).toBe(404);
  });

  it('GET /mcp/tools lists both resurrected tools with JSON Schemas', async () => {
    const res = await fetch(base + '/mcp/tools');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.jsonrpc).toBe('2.0');
    expect(body.result.tools.map((t: any) => t.name)).toEqual([
      'banking_get_balance',
      'banking_wire_transfer',
    ]);
    const balance = body.result.tools[0];
    expect(balance.inputSchema.properties.accountNumber).toBeDefined();
    expect(balance.inputSchema.properties.routingCode).toBeDefined();
  });

  it('POST /mcp/call banking_get_balance returns SUCCESS with wire + JSON', async () => {
    const { status, json } = await post('/mcp/call', {
      artifactId: 'corpse-01-banking-soap',
      toolName: 'banking_get_balance',
      arguments: { accountNumber: '88412007', routingCode: '021000021' },
    });
    expect(status).toBe(200);
    expect(json.status).toBe('SUCCESS');
    expect(json.toolName).toBe('banking_get_balance');
    expect(json.mcpRequestJson.method).toBe('tools/call');
    expect(json.legacyWirePayload).toContain('<ACCT_NUM_STR>88412007</ACCT_NUM_STR>');
    expect(json.legacyRawResponse).toContain('<tns:GetAccountBalanceResponse>');
    expect(json.normalizedJsonResponse).toEqual({
      ledgerBalanceCents: 483433,
      availableBalanceCents: 480933,
      currencyCode: 'USD',
    });
    expect(typeof json.latencyMs).toBe('number');
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
