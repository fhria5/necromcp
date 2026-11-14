import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { CorpseCorruptionError, cobolDataRows, parseCOBOL } from '../src/engine/parser';

const DAT = fs.readFileSync(
  path.resolve(process.cwd(), 'graveyard/corpse-03-cobol-flatfile.dat'),
  'utf-8',
);

function parse() {
  return parseCOBOL(DAT, {
    artifactId: 'corpse-03-cobol-claims',
    title: '1989 COBOL Claims Ledger',
    era: '1989',
  });
}

describe('COBOL fixed-width parser (Phase 2)', () => {
  it('parses the copybook into 6 fields with byte ranges', () => {
    const schema = parse();
    expect(schema.format).toBe('FIXED_WIDTH');
    expect(schema.cobolFields).toHaveLength(6);
    expect(schema.cobolFields.map((f) => f.semanticName)).toEqual([
      'patientId',
      'claimDate',
      'diagnosisCode',
      'claimAmountUsd',
      'adjustmentStatus',
      'memo',
    ]);
    const byName = new Map(schema.cobolFields.map((f) => [f.semanticName, f]));
    expect(byName.get('patientId')!.byteRange).toEqual([1, 10]);
    expect(byName.get('patientId')!.pic).toBe('X(10)');
    expect(byName.get('claimDate')!.type).toBe('iso_date');
    expect(byName.get('claimDate')!.byteRange).toEqual([11, 15]);
    expect(byName.get('claimAmountUsd')!.pic).toBe('9(07)V99');
    expect(byName.get('claimAmountUsd')!.decimals).toBe(2);
    expect(byName.get('claimAmountUsd')!.byteRange).toEqual([24, 32]);
    expect(byName.get('memo')!.byteRange).toEqual([34, 80]);
  });

  it('derives one lookup operation with the patient id as input', () => {
    const schema = parse();
    expect(schema.operations).toHaveLength(1);
    const [op] = schema.operations;
    expect(op.mcpToolName).toBe('claims_lookup_patient');
    expect(op.riskLevel).toBe('LOW');
    expect(op.inputs.map((f) => f.semanticName)).toEqual(['patientId']);
    expect(op.outputs.map((f) => f.semanticName)).toEqual([
      'patientId',
      'claimDate',
      'diagnosisCode',
      'claimAmountUsd',
      'adjustmentStatus',
      'memo',
    ]);
  });

  it('reads the 3 data rows (right-trimmed, not 80 bytes)', () => {
    const rows = cobolDataRows(DAT);
    expect(rows).toHaveLength(3);
    expect(rows[0].startsWith('PT00088412')).toBe(true);
    expect(rows[1].startsWith('PT00091204')).toBe(true);
    expect(rows[2].startsWith('PT00077319')).toBe(true);
  });

  it('generates EARS + Zod for the lookup', () => {
    const schema = parse();
    expect(schema.generatedEarsSpec).toContain('claims_lookup_patient');
    expect(schema.generatedZodCode).toContain('ClaimsLookupPatientInput');
  });

  it('throws CorpseCorruptionError without copybook layout lines', () => {
    expect(() =>
      parseCOBOL('PT0008841289245ICD410.9000145075A', {
        artifactId: 'x',
        title: 'x',
        era: '1989',
      }),
    ).toThrow(CorpseCorruptionError);
  });

  it('throws CorpseCorruptionError when byte ranges disagree with PIC', () => {
    expect(() =>
      parseCOBOL(
        '* BYTES 01-05 : PT-ID-NUM PIC X(10) [Patient Identifier]\nPT00088412',
        { artifactId: 'x', title: 'x', era: '1989' },
      ),
    ).toThrow(CorpseCorruptionError);
  });

  it('throws CorpseCorruptionError on a data row shorter than the last fixed field', () => {
    expect(() =>
      parseCOBOL(
        '* BYTES 01-10 : PT-ID-NUM PIC X(10) [Patient Identifier]\n* BYTES 11-15 : CLM-JUL-DT PIC 9(05) [Julian Date]\nPT0008841',
        { artifactId: 'x', title: 'x', era: '1989' },
      ),
    ).toThrow(CorpseCorruptionError);
  });
});
