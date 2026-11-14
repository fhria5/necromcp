import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseWSDL } from '../src/engine/parser';
import {
  generateEarsSpec,
  generateZodCode,
  zodSchemaForOperation,
} from '../src/engine/synthesizer';

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

describe('zodSchemaForOperation', () => {
  it('accepts valid balance args', () => {
    const r = zodSchemaForOperation(BAL).safeParse({
      accountNumber: '88412007',
      routingCode: '021000021',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a missing field', () => {
    const r = zodSchemaForOperation(BAL).safeParse({ accountNumber: '88412007' });
    expect(r.success).toBe(false);
  });

  it('rejects a wrong-typed amount', () => {
    const r = zodSchemaForOperation(WIRE).safeParse({
      sourceAccountNumber: '88412007',
      destinationAccountNumber: '11223344',
      amountUsd: '450',
      memo: 'x',
    });
    expect(r.success).toBe(false);
  });

  it('rejects a negative or zero transfer amount', () => {
    for (const amountUsd of [-5, 0, Number.NaN]) {
      const r = zodSchemaForOperation(WIRE).safeParse({
        sourceAccountNumber: '88412007',
        destinationAccountNumber: '11223344',
        amountUsd,
        memo: 'x',
      });
      expect(r.success).toBe(false);
    }
  });

  it('accepts a valid wire transfer', () => {
    const r = zodSchemaForOperation(WIRE).safeParse({
      sourceAccountNumber: '88412007',
      destinationAccountNumber: '11223344',
      amountUsd: 450,
      memo: 'Rent payment',
    });
    expect(r.success).toBe(true);
  });
});

describe('generateZodCode / generateEarsSpec', () => {
  it('generates Zod source with both operations', () => {
    const code = generateZodCode(AST);
    expect(code).toContain("import { z } from 'zod';");
    expect(code).toContain('export const BankingGetBalanceInput = z.object({');
    expect(code).toContain('accountNumber: z.string().min(1), // ACCT_NUM_STR');
    expect(code).toContain('export const BankingWireTransferOutput = z.object({');
    expect(code).toContain('postedCents: z.number().finite(), // POSTED_CENTS');
  });

  it('generates EARS lines including the HITL gate', () => {
    const spec = generateEarsSpec(AST);
    expect(spec).toContain('WHEN an agent calls banking_get_balance, THE SYSTEM SHALL');
    expect(spec).toContain(
      'IF amountUsd exceeds 10000, THEN THE SYSTEM SHALL pause execution and return PENDING_HITL_APPROVAL.',
    );
  });
});
