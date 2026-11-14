import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseWSDL } from '../src/engine/parser';
import { deriveBalance, deriveWireTransfer, simulate } from '../src/engine/simulator';
import { parseSoapResponse } from '../src/engine/translator';

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

describe('deriveBalance (local simulator)', () => {
  it('returns the exact deterministic balance for account 88412007', () => {
    expect(deriveBalance('88412007')).toEqual({
      ledgerBalanceCents: 483433,
      availableBalanceCents: 480933,
      currencyCode: 'USD',
    });
  });

  it('is deterministic and account-dependent', () => {
    expect(deriveBalance('88412007')).toEqual(deriveBalance('88412007'));
    expect(deriveBalance('11111111').ledgerBalanceCents).not.toBe(483433);
    const b = deriveBalance('00000001');
    expect(b.availableBalanceCents).toBe(b.ledgerBalanceCents - 2500);
    expect(b.ledgerBalanceCents).toBeGreaterThanOrEqual(100000);
    expect(b.ledgerBalanceCents).toBeLessThanOrEqual(999999);
  });
});

describe('deriveWireTransfer (local simulator)', () => {
  it('posts exact cents and a deterministic Fedwire reference', () => {
    const out = deriveWireTransfer({
      sourceAccountNumber: '88412007',
      destinationAccountNumber: '11223344',
      amountUsd: 450,
      memo: 'Rent payment',
    });
    expect(out).toEqual({
      fedwireReferenceId: 'FED00047025',
      settleStatusCode: '00',
      postedCents: 45000,
    });
  });

  it('never loses a cent to IEEE-754 (0.29 USD -> 29 cents)', () => {
    const out = deriveWireTransfer({
      sourceAccountNumber: '88412007',
      destinationAccountNumber: '11223344',
      amountUsd: 0.29,
      memo: '&',
    });
    expect(out.postedCents).toBe(29);
  });

  it('is deterministic', () => {
    const args = {
      sourceAccountNumber: '88412007',
      destinationAccountNumber: '11223344',
      amountUsd: 450,
      memo: 'Rent payment',
    };
    expect(deriveWireTransfer(args)).toEqual(deriveWireTransfer(args));
  });
});

describe('simulate() end-to-end', () => {
  it('simulates a balance call with a parseable SOAP response', () => {
    const { responseXml, json } = simulate(BAL, {
      accountNumber: '88412007',
      routingCode: '021000021',
    });
    expect(json).toEqual({
      ledgerBalanceCents: 483433,
      availableBalanceCents: 480933,
      currencyCode: 'USD',
    });
    expect(responseXml).toContain('<tns:GetAccountBalanceResponse>');
    expect(parseSoapResponse(responseXml, BAL)).toEqual(json);
  });

  it('simulates a wire transfer with a parseable SOAP response', () => {
    const { responseXml, json } = simulate(WIRE, {
      sourceAccountNumber: '88412007',
      destinationAccountNumber: '11223344',
      amountUsd: 450,
      memo: 'Rent payment',
    });
    expect(json).toEqual({
      fedwireReferenceId: 'FED00047025',
      settleStatusCode: '00',
      postedCents: 45000,
    });
    expect(parseSoapResponse(responseXml, WIRE)).toEqual(json);
  });
});
