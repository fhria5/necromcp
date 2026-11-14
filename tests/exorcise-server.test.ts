/**
 * Exorcise API + quarantine tests — Phase 3.
 *
 * Separate file from server.test.ts on purpose: the quarantine state is
 * per-app, and a DEMON_DETECTED run here would block banking_wire_transfer
 * for the $450 wire test in the other file.
 */
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server';
import type { PBTExorcismReport } from '../src/types/necro';

let base = '';

beforeAll(async () => {
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
  (globalThis as any).__exorciseServer = server;
});

afterAll(async () => {
  await new Promise<void>((resolve) =>
    (globalThis as any).__exorciseServer.close(() => resolve()),
  );
});

async function post(path: string, body: unknown) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

async function get(path: string) {
  const res = await fetch(base + path);
  return { status: res.status, json: (await res.json()) as any };
}

async function toolNames(): Promise<string[]> {
  const { json } = await get('/mcp/tools');
  return (json.result.tools as Array<{ name: string }>).map((t) => t.name);
}

const WIRE_450 = {
  sourceAccountNumber: '88412007',
  destinationAccountNumber: '99887766',
  amountUsd: 450,
  memo: 'test',
};

describe('POST /api/exorcise', () => {
  it('clean corpse-01: VERIFIED_PURE, 100/100', async () => {
    const { status, json } = await post('/api/exorcise', {
      artifactId: 'corpse-01-banking-soap',
    });
    expect(status).toBe(200);
    const report = json as PBTExorcismReport;
    expect(report.status).toBe('VERIFIED_PURE');
    expect(report.totalRuns).toBe(100);
    expect(report.passedRuns).toBe(100);
    expect(report.failedRuns).toBe(0);
    expect(report.blockedTools).toEqual([]);
    expect(typeof report.legacyAvgLatencyMs).toBe('number');
    expect(typeof report.modernAvgLatencyMs).toBe('number');
  });

  it('clean corpse-02 and corpse-03: VERIFIED_PURE, 100/100', async () => {
    for (const artifactId of ['corpse-02-inventory-sql', 'corpse-03-cobol-claims']) {
      const { status, json } = await post('/api/exorcise', { artifactId });
      expect(status).toBe(200);
      expect(json.status).toBe('VERIFIED_PURE');
      expect(json.passedRuns).toBe(100);
    }
  });

  it('demon corpse-01: DEMON_DETECTED + shrunk counterexample, tool quarantined', async () => {
    const { status, json } = await post('/api/exorcise', {
      artifactId: 'corpse-01-banking-soap',
      injectDemonBug: true,
    });
    expect(status).toBe(200);
    const report = json as PBTExorcismReport;
    expect(report.status).toBe('DEMON_DETECTED');
    expect(report.counterexample!.shrunkMinimalInput).toEqual(
      expect.objectContaining({ amountUsd: 0.29, memo: '&' }),
    );
    expect(report.blockedTools).toContain('banking_wire_transfer');

    // The tool is no longer listed…
    const names = await toolNames();
    expect(names).not.toContain('banking_wire_transfer');
    expect(names).toContain('banking_get_balance');

    // …and calling it is rejected with DEMON_DETECTED.
    const call = await post('/mcp/call', {
      artifactId: 'corpse-01-banking-soap',
      toolName: 'banking_wire_transfer',
      arguments: WIRE_450,
    });
    expect(call.status).toBe(200);
    expect(call.json.status).toBe('BLOCKED_SECURITY');
    expect(call.json.securityAlert.ruleId).toBe('DEMON_DETECTED');
  });

  it('auto-patch corpse-01: PATCHED, 100/100, tool restored', async () => {
    const { status, json } = await post('/api/exorcise', {
      artifactId: 'corpse-01-banking-soap',
      injectDemonBug: true,
      applyPatch: true,
    });
    expect(status).toBe(200);
    const report = json as PBTExorcismReport;
    expect(report.status).toBe('PATCHED');
    expect(report.passedRuns).toBe(100);
    expect(report.failedRuns).toBe(0);
    expect(report.blockedTools).toEqual([]);

    const names = await toolNames();
    expect(names).toContain('banking_wire_transfer');

    // The $450 wire works again after the patch.
    const call = await post('/mcp/call', {
      artifactId: 'corpse-01-banking-soap',
      toolName: 'banking_wire_transfer',
      arguments: WIRE_450,
    });
    expect(call.json.status).toBe('SUCCESS');
    expect(call.json.normalizedJsonResponse.postedCents).toBe(45000);
  });

  it('demon corpse-03 then patch: DEMON_DETECTED -> PATCHED, claims tool restored', async () => {
    const demon = await post('/api/exorcise', {
      artifactId: 'corpse-03-cobol-claims',
      injectDemonBug: true,
    });
    expect(demon.json.status).toBe('DEMON_DETECTED');
    expect(demon.json.blockedTools).toContain('claims_lookup_patient');
    expect(await toolNames()).not.toContain('claims_lookup_patient');

    const patched = await post('/api/exorcise', {
      artifactId: 'corpse-03-cobol-claims',
      injectDemonBug: true,
      applyPatch: true,
    });
    expect(patched.json.status).toBe('PATCHED');
    expect(patched.json.passedRuns).toBe(100);
    expect(await toolNames()).toContain('claims_lookup_patient');
  });

  it('400 on bad body, 404 on unknown artifact', async () => {
    const bad = await post('/api/exorcise', { injectDemonBug: true });
    expect(bad.status).toBe(400);
    const missing = await post('/api/exorcise', { artifactId: 'corpse-99' });
    expect(missing.status).toBe(404);
  });
});
