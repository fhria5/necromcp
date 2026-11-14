/**
 * Exorcist PBT tests — Phase 3.
 *
 * Clean runs must be 100/100 VERIFIED_PURE for every corpse. With the demon
 * bug injected, corpse-01 must be DEMON_DETECTED with the counterexample
 * shrunk to the minimal { amountUsd: 0.29, memo: '&' }, and corpse-03 to
 * claimAmountUsd 0.29; corpse-02 is untouched by the bug. Auto-Patch must
 * bring every corpse back to 100/100 PATCHED (the counterexample stays in
 * the report as the record of what was fixed).
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  runExorcism,
  type ExorcismDeps,
} from '../src/engine/exorcist-pbt';
import { cobolDataRows, parseCOBOL, parseSQL, parseWSDL } from '../src/engine/parser';
import { buildSoapEnvelope, parseSoapRequest, assertWellFormedXml } from '../src/engine/translator';
import { simulate, simulateSql } from '../src/engine/simulator';
import type { CobolLayoutField } from '../src/engine/translator';
import type { NecroIntermediateSchema } from '../src/types/necro';

const GRAVEYARD = path.resolve(__dirname, '..', 'graveyard');

function loadDeps(): ExorcismDeps {
  const schemas = new Map<string, NecroIntermediateSchema>();
  let cobolFields: CobolLayoutField[] = [];

  const wsdl = fs.readFileSync(path.join(GRAVEYARD, 'corpse-01-banking-soap.xml'), 'utf8');
  schemas.set(
    'corpse-01-banking-soap',
    parseWSDL(wsdl, { artifactId: 'corpse-01-banking-soap', title: '1998 SOAP Core Bank', era: '1998' }),
  );

  const ddl = fs.readFileSync(path.join(GRAVEYARD, 'corpse-02-inventory-dump.sql'), 'utf8');
  schemas.set(
    'corpse-02-inventory-sql',
    parseSQL(ddl, { artifactId: 'corpse-02-inventory-sql', title: '2004 SQL Warehouse', era: '2004' }),
  );

  const copybook = fs.readFileSync(path.join(GRAVEYARD, 'corpse-03-cobol-flatfile.dat'), 'utf8');
  const cobol = parseCOBOL(copybook, {
    artifactId: 'corpse-03-cobol-claims',
    title: '1989 COBOL Claims Ledger',
    era: '1989',
  });
  schemas.set('corpse-03-cobol-claims', cobol);
  cobolFields = cobol.cobolFields.map((f) => ({
    legacyName: f.legacyName,
    semanticName: f.semanticName,
    type: f.type as 'string' | 'number' | 'iso_date',
    byteOffset: f.constraints.byteOffset!,
    decimals: f.decimals,
  }));
  void cobolDataRows;

  return { schemas, cobolFields, simulate, simulateSql };
}

describe('runExorcism — clean (no demon bug)', () => {
  const deps = loadDeps();

  it('corpse-01 SOAP: 100/100 VERIFIED_PURE', () => {
    const r = runExorcism('corpse-01-banking-soap', {}, deps);
    expect(r.status).toBe('VERIFIED_PURE');
    expect(r.totalRuns).toBe(100);
    expect(r.passedRuns).toBe(100);
    expect(r.failedRuns).toBe(0);
    expect(r.counterexample).toBeUndefined();
    expect(r.blockedTools).toEqual([]);
  });

  it('corpse-02 SQL: 100/100 VERIFIED_PURE', () => {
    const r = runExorcism('corpse-02-inventory-sql', {}, deps);
    expect(r.status).toBe('VERIFIED_PURE');
    expect(r.totalRuns).toBe(100);
    expect(r.passedRuns).toBe(100);
    expect(r.failedRuns).toBe(0);
    expect(r.counterexample).toBeUndefined();
    expect(r.blockedTools).toEqual([]);
  });

  it('corpse-03 COBOL: 100/100 VERIFIED_PURE', () => {
    const r = runExorcism('corpse-03-cobol-claims', {}, deps);
    expect(r.status).toBe('VERIFIED_PURE');
    expect(r.totalRuns).toBe(100);
    expect(r.passedRuns).toBe(100);
    expect(r.failedRuns).toBe(0);
    expect(r.counterexample).toBeUndefined();
    expect(r.blockedTools).toEqual([]);
  });
});

describe('runExorcism — demon bug injected', () => {
  const deps = loadDeps();

  it('corpse-01: DEMON_DETECTED, shrunk to { amountUsd: 0.29, memo: "&" }', () => {
    const r = runExorcism('corpse-01-banking-soap', { injectDemonBug: true }, deps);
    expect(r.status).toBe('DEMON_DETECTED');
    expect(r.failedRuns).toBeGreaterThan(0);
    expect(r.counterexample).toBeDefined();
    expect(r.counterexample!.shrunkMinimalInput).toEqual({
      sourceAccountNumber: expect.any(String),
      destinationAccountNumber: expect.any(String),
      amountUsd: 0.29,
      memo: '&',
    });
    expect(r.counterexample!.propertyFailed).toBe('wire-transfer-parity');
    expect(r.blockedTools).toContain('banking_wire_transfer');
    // The legacy ledger rounds 0.29 correctly (29 cents); the demon adapter
    // either floors it to 28 cents or chokes on the bare '&' in the memo.
    expect(r.counterexample!.legacyOutput).toContain('29');
    expect(r.counterexample!.resurrectedOutput).toMatch(/28|bare "&"/);
    // The original (unshrunk) failing input must be a real generated case.
    const orig = r.counterexample!.originalFailingInput as { amountUsd: number; memo: string };
    expect(typeof orig.amountUsd).toBe('number');
    expect(orig.amountUsd).toBeGreaterThanOrEqual(0);
    expect(orig.amountUsd).toBeLessThanOrEqual(100);
    expect(typeof orig.memo).toBe('string');
  });

  it('corpse-01 demon run is deterministic for a fixed seed', () => {
    const a = runExorcism('corpse-01-banking-soap', { injectDemonBug: true, seed: 20261114 }, deps);
    const b = runExorcism('corpse-01-banking-soap', { injectDemonBug: true, seed: 20261114 }, deps);
    expect(a.status).toBe(b.status);
    expect(a.totalRuns).toBe(b.totalRuns);
    expect(a.passedRuns).toBe(b.passedRuns);
    expect(a.failedRuns).toBe(b.failedRuns);
    expect(a.counterexample!.shrunkMinimalInput).toEqual(b.counterexample!.shrunkMinimalInput);
    expect(a.counterexample!.legacyOutput).toBe(b.counterexample!.legacyOutput);
    expect(a.counterexample!.resurrectedOutput).toBe(b.counterexample!.resurrectedOutput);
  });

  it('corpse-02 SQL: demon bug does not touch SQL — still VERIFIED_PURE', () => {
    const r = runExorcism('corpse-02-inventory-sql', { injectDemonBug: true }, deps);
    expect(r.status).toBe('VERIFIED_PURE');
    expect(r.passedRuns).toBe(100);
    expect(r.blockedTools).toEqual([]);
  });

  it('corpse-03 COBOL: DEMON_DETECTED, shrunk to claimAmountUsd 0.29', () => {
    const r = runExorcism('corpse-03-cobol-claims', { injectDemonBug: true }, deps);
    expect(r.status).toBe('DEMON_DETECTED');
    expect(r.failedRuns).toBeGreaterThan(0);
    expect(r.counterexample).toBeDefined();
    expect(r.counterexample!.shrunkMinimalInput).toEqual(
      expect.objectContaining({ claimAmountUsd: 0.29 }),
    );
    expect(r.blockedTools).toContain('claims_lookup_patient');
    // Legacy packs 0.29 as 29 cents; the demon packs it as 28.
    expect(r.counterexample!.legacyOutput).toContain('0.29');
    expect(r.counterexample!.resurrectedOutput).toContain('0.28');
  });
});

describe('runExorcism — auto-patch', () => {
  const deps = loadDeps();

  it('corpse-01: PATCHED, 100/100 after applying the fix', () => {
    const r = runExorcism(
      'corpse-01-banking-soap',
      { injectDemonBug: true, applyPatch: true },
      deps,
    );
    expect(r.status).toBe('PATCHED');
    expect(r.totalRuns).toBe(100);
    expect(r.passedRuns).toBe(100);
    expect(r.failedRuns).toBe(0);
    expect(r.blockedTools).toEqual([]);
    // The counterexample stays as the record of what the patch fixed.
    expect(r.counterexample!.shrunkMinimalInput).toEqual(
      expect.objectContaining({ amountUsd: 0.29, memo: '&' }),
    );
  });

  it('corpse-03: PATCHED, 100/100 after applying the fix', () => {
    const r = runExorcism(
      'corpse-03-cobol-claims',
      { injectDemonBug: true, applyPatch: true },
      deps,
    );
    expect(r.status).toBe('PATCHED');
    expect(r.passedRuns).toBe(100);
    expect(r.failedRuns).toBe(0);
  });

  it('applyPatch without a demon is a no-op VERIFIED_PURE', () => {
    const r = runExorcism('corpse-01-banking-soap', { applyPatch: true }, deps);
    expect(r.status).toBe('VERIFIED_PURE');
    expect(r.passedRuns).toBe(100);
  });

  it('unknown artifactId throws', () => {
    expect(() => runExorcism('corpse-99', {}, deps)).toThrow(/Unknown artifactId/);
  });
});

describe('translator — demon bug primitives', () => {
  it('buildSoapEnvelope escapes & by default; demonBug leaves it bare', () => {
    const op = loadDeps().schemas.get('corpse-01-banking-soap')!.operations.find(
      (o) => o.opId === 'ExecuteWireTransfer',
    )!;
    const args = { sourceAccountNumber: '88412007', destinationAccountNumber: '99887766', amountUsd: 0.29, memo: 'A & B' };
    const clean = buildSoapEnvelope(op, args);
    expect(clean).toContain('A &amp; B');
    expect(() => assertWellFormedXml(clean)).not.toThrow();
    const demon = buildSoapEnvelope(op, args, { demonBug: true });
    expect(demon).toContain('A & B');
    expect(() => assertWellFormedXml(demon)).toThrow(/bare "&"/);
  });

  it('parseSoapRequest round-trips a clean envelope', () => {
    const schema = loadDeps().schemas.get('corpse-01-banking-soap')!;
    const op = schema.operations.find((o) => o.opId === 'GetAccountBalance')!;
    const args = { accountNumber: '88412007', routingCode: '021000021' };
    const envelope = buildSoapEnvelope(op, args);
    expect(parseSoapRequest(envelope, op)).toEqual(args);
  });
});
