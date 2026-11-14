import { describe, expect, it } from 'vitest';
import { computeHitlToken, verifyHitlToken } from '../src/engine/hitl';

const ARTIFACT = 'corpse-01-banking-soap';
const TOOL = 'banking_wire_transfer';
const ARGS = {
  sourceAccountNumber: '88412007',
  destinationAccountNumber: '11223344',
  amountUsd: 50000,
  memo: 'Big transfer',
};

describe('HITL approval tokens (Phase 2)', () => {
  it('computes a deterministic token for the same call', () => {
    const a = computeHitlToken(ARTIFACT, TOOL, ARGS);
    const b = computeHitlToken(ARTIFACT, TOOL, ARGS);
    expect(a).toBe(b);
    expect(a).toMatch(/^HITL-[0-9A-F]{8}$/);
  });

  it('is insensitive to argument key order', () => {
    const reordered = {
      memo: 'Big transfer',
      amountUsd: 50000,
      destinationAccountNumber: '11223344',
      sourceAccountNumber: '88412007',
    };
    expect(computeHitlToken(ARTIFACT, TOOL, reordered)).toBe(
      computeHitlToken(ARTIFACT, TOOL, ARGS),
    );
  });

  it('changes the token when any argument changes', () => {
    const other = computeHitlToken(ARTIFACT, TOOL, { ...ARGS, amountUsd: 49999 });
    expect(other).not.toBe(computeHitlToken(ARTIFACT, TOOL, ARGS));
    const otherTool = computeHitlToken(ARTIFACT, 'banking_get_balance', ARGS);
    expect(otherTool).not.toBe(computeHitlToken(ARTIFACT, TOOL, ARGS));
  });

  it('verifies the correct token and rejects anything else', () => {
    const token = computeHitlToken(ARTIFACT, TOOL, ARGS);
    expect(verifyHitlToken(token, ARTIFACT, TOOL, ARGS)).toBe(true);
    expect(verifyHitlToken('HITL-DEADBEEF', ARTIFACT, TOOL, ARGS)).toBe(false);
    expect(verifyHitlToken(token, ARTIFACT, TOOL, { ...ARGS, amountUsd: 1 })).toBe(
      false,
    );
    expect(verifyHitlToken('', ARTIFACT, TOOL, ARGS)).toBe(false);
  });
});
