import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseWSDL } from '../src/engine/parser';
import { CorpseCorruptionError } from '../src/types/necro';

const WSDL = fs.readFileSync(
  path.resolve(process.cwd(), 'graveyard/corpse-01-banking-soap.xml'),
  'utf-8',
);
const META = { artifactId: 'corpse-01-banking-soap', title: '1998 SOAP Core Bank', era: '1998' };

describe('parseWSDL (corpse-01)', () => {
  it('parses the WSDL into a 2-operation AST', () => {
    const ast = parseWSDL(WSDL, META);
    expect(ast.artifactId).toBe('corpse-01-banking-soap');
    expect(ast.title).toBe('1998 SOAP Core Bank');
    expect(ast.era).toBe('1998');
    expect(ast.format).toBe('SOAP_XML');
    expect(ast.rawSource).toBe(WSDL);
    expect(ast.operations).toHaveLength(2);
    expect(ast.operations.map((o) => o.opId)).toEqual([
      'GetAccountBalance',
      'ExecuteWireTransfer',
    ]);
  });

  it('maps fields to semantic names with WSDL order preserved', () => {
    const ast = parseWSDL(WSDL, META);
    const [bal, wire] = ast.operations;
    expect(bal.mcpToolName).toBe('banking_get_balance');
    expect(bal.riskLevel).toBe('LOW');
    expect(bal.inputs.map((f) => f.semanticName)).toEqual(['accountNumber', 'routingCode']);
    expect(bal.inputs.map((f) => f.legacyName)).toEqual(['ACCT_NUM_STR', 'ROUTING_ABA_CD']);
    expect(bal.outputs.map((f) => f.semanticName)).toEqual([
      'ledgerBalanceCents',
      'availableBalanceCents',
      'currencyCode',
    ]);
    expect(bal.inputs[0].type).toBe('string');
    expect(bal.outputs[0].type).toBe('number');
    expect(wire.mcpToolName).toBe('banking_wire_transfer');
    expect(wire.riskLevel).toBe('CRITICAL');
    expect(wire.hitlThreshold).toEqual({ field: 'amountUsd', maxAllowed: 10000 });
    expect(wire.inputs.map((f) => f.semanticName)).toEqual([
      'sourceAccountNumber',
      'destinationAccountNumber',
      'amountUsd',
      'memo',
    ]);
    expect(wire.outputs.map((f) => f.semanticName)).toEqual([
      'fedwireReferenceId',
      'settleStatusCode',
      'postedCents',
    ]);
  });

  it('generates EARS spec and Zod code from the AST', () => {
    const ast = parseWSDL(WSDL, META);
    expect(ast.generatedEarsSpec).toContain('banking_get_balance');
    expect(ast.generatedEarsSpec).toContain('banking_wire_transfer');
    expect(ast.generatedEarsSpec).toContain('PENDING_HITL_APPROVAL');
    expect(ast.generatedZodCode).toContain('BankingGetBalanceInput');
    expect(ast.generatedZodCode).toContain('BankingWireTransferInput');
    expect(ast.generatedZodCode).toContain('accountNumber: z.string().min(1)');
  });

  it('rejects empty input', () => {
    expect(() => parseWSDL('', META)).toThrow(CorpseCorruptionError);
    expect(() => parseWSDL('   ', META)).toThrow(CorpseCorruptionError);
  });

  it('rejects non-WSDL input', () => {
    expect(() => parseWSDL('<html><body>hello</body></html>', META)).toThrow(
      CorpseCorruptionError,
    );
  });

  it('rejects a WSDL with no messages', () => {
    expect(() => parseWSDL('<definitions name="Empty"></definitions>', META)).toThrow(
      CorpseCorruptionError,
    );
  });

  it('rejects a Request without its Response', () => {
    const broken = WSDL.replace(
      /<message name="GetAccountBalanceResponse">[\s\S]*?<\/message>/,
      '',
    );
    expect(() => parseWSDL(broken, META)).toThrow(CorpseCorruptionError);
  });

  it('rejects an unknown XSD type', () => {
    const broken = WSDL.replace('xsd:long', 'xsd:weirdtype');
    expect(() => parseWSDL(broken, META)).toThrow(CorpseCorruptionError);
  });
});
