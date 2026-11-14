// Parity tests: the Mode B browser engine's runExorcism (public/app.js)
// must produce the same verdicts as the TypeScript engine (src/engine/
// exorcist-pbt.ts) — same statuses, same shrunk counterexample, same
// blocked tools. The random inputs differ (mulberry32 vs fast-check), but
// the minimizers are deterministic, so the shrunk counterexample must match.
import { describe, expect, it } from 'vitest';

async function browserEngine(): Promise<any> {
  await import('../public/app.js');
  const eng = (globalThis as any).NecroEngine;
  if (!eng) throw new Error('public/app.js did not expose globalThis.NecroEngine');
  return eng;
}

describe('browser runExorcism parity (public/app.js vs TypeScript engine)', () => {
  it('clean corpse-01: VERIFIED_PURE, 100/100', async () => {
    const eng = await browserEngine();
    const r = eng.runExorcism('corpse-01-banking-soap', {});
    expect(r.status).toBe('VERIFIED_PURE');
    expect(r.totalRuns).toBe(100);
    expect(r.passedRuns).toBe(100);
    expect(r.failedRuns).toBe(0);
    expect(r.counterexample).toBeUndefined();
    expect(r.blockedTools).toEqual([]);
    expect(r.seed).toBe(eng.EXORCISM_SEED);
  });

  it('clean corpse-02 and corpse-03: VERIFIED_PURE, 100/100', async () => {
    const eng = await browserEngine();
    for (const artifactId of ['corpse-02-inventory-sql', 'corpse-03-cobol-claims']) {
      const r = eng.runExorcism(artifactId, {});
      expect(r.status).toBe('VERIFIED_PURE');
      expect(r.passedRuns).toBe(100);
      expect(r.failedRuns).toBe(0);
    }
  });

  it('demon corpse-01: DEMON_DETECTED, shrunk to { amountUsd: 0.29, memo: "&" }', async () => {
    const eng = await browserEngine();
    const r = eng.runExorcism('corpse-01-banking-soap', { injectDemonBug: true });
    expect(r.status).toBe('DEMON_DETECTED');
    expect(r.failedRuns).toBeGreaterThan(0);
    expect(r.counterexample.shrunkMinimalInput).toEqual(
      expect.objectContaining({ amountUsd: 0.29, memo: '&' }),
    );
    expect(r.counterexample.propertyFailed).toBe('wire-transfer-parity');
    expect(r.blockedTools).toContain('banking_wire_transfer');
    expect(r.counterexample.legacyOutput).toContain('29');
    expect(r.counterexample.resurrectedOutput).toMatch(/28|bare "&"/);
  });

  it('demon corpse-02: VERIFIED_PURE (bug does not touch SQL)', async () => {
    const eng = await browserEngine();
    const r = eng.runExorcism('corpse-02-inventory-sql', { injectDemonBug: true });
    expect(r.status).toBe('VERIFIED_PURE');
    expect(r.passedRuns).toBe(100);
  });

  it('demon corpse-03: DEMON_DETECTED, shrunk to claimAmountUsd 0.29', async () => {
    const eng = await browserEngine();
    const r = eng.runExorcism('corpse-03-cobol-claims', { injectDemonBug: true });
    expect(r.status).toBe('DEMON_DETECTED');
    expect(r.counterexample.shrunkMinimalInput).toEqual(
      expect.objectContaining({ claimAmountUsd: 0.29 }),
    );
    expect(r.blockedTools).toContain('claims_lookup_patient');
    expect(r.counterexample.legacyOutput).toContain('0.29');
    expect(r.counterexample.resurrectedOutput).toContain('0.28');
  });

  it('demon run is deterministic for a fixed seed', async () => {
    const eng = await browserEngine();
    const a = eng.runExorcism('corpse-01-banking-soap', { injectDemonBug: true, seed: 20261114 });
    const b = eng.runExorcism('corpse-01-banking-soap', { injectDemonBug: true, seed: 20261114 });
    expect(a.status).toBe(b.status);
    expect(a.passedRuns).toBe(b.passedRuns);
    expect(a.failedRuns).toBe(b.failedRuns);
    expect(a.counterexample.shrunkMinimalInput).toEqual(b.counterexample.shrunkMinimalInput);
    expect(a.counterexample.legacyOutput).toBe(b.counterexample.legacyOutput);
    expect(a.counterexample.resurrectedOutput).toBe(b.counterexample.resurrectedOutput);
  });

  it('auto-patch corpse-01: PATCHED, 100/100', async () => {
    const eng = await browserEngine();
    const r = eng.runExorcism('corpse-01-banking-soap', { injectDemonBug: true, applyPatch: true });
    expect(r.status).toBe('PATCHED');
    expect(r.passedRuns).toBe(100);
    expect(r.failedRuns).toBe(0);
    expect(r.blockedTools).toEqual([]);
    expect(r.counterexample.shrunkMinimalInput).toEqual(
      expect.objectContaining({ amountUsd: 0.29, memo: '&' }),
    );
  });

  it('auto-patch corpse-03: PATCHED, 100/100', async () => {
    const eng = await browserEngine();
    const r = eng.runExorcism('corpse-03-cobol-claims', { injectDemonBug: true, applyPatch: true });
    expect(r.status).toBe('PATCHED');
    expect(r.passedRuns).toBe(100);
  });

  it('unknown artifactId throws', async () => {
    const eng = await browserEngine();
    expect(() => eng.runExorcism('corpse-99', {})).toThrow(/Unknown artifactId/);
  });

  it('parseSoapRequest + assertWellFormedXml mirror the TS translator', async () => {
    const eng = await browserEngine();
    const ast = eng.parseWSDL(eng.CORPSE_01_WSDL);
    const wire = ast.operations.find((o: any) => o.opId === 'ExecuteWireTransfer');
    const args = { sourceAccountNumber: '88412007', destinationAccountNumber: '99887766', amountUsd: 0.29, memo: 'A & B' };
    const clean = eng.buildSoapEnvelope(wire, args);
    expect(clean).toContain('A &amp; B');
    expect(() => eng.assertWellFormedXml(clean)).not.toThrow();
    expect(eng.parseSoapRequest(clean, wire)).toEqual(args);
    const demon = eng.buildSoapEnvelope(wire, args, { demonBug: true });
    expect(demon).toContain('A & B');
    expect(() => eng.assertWellFormedXml(demon)).toThrow(/bare "&"/);
  });
});
