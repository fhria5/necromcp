import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { cobolDataRows, parseCOBOL } from '../src/engine/parser';
import {
  CorpseCorruptionError,
  isoToJulian,
  julianToISO,
  packCobolRecord,
  parseCobolRecord,
  type CobolLayoutField,
} from '../src/engine/translator';

const DAT = fs.readFileSync(
  path.resolve(process.cwd(), 'graveyard/corpse-03-cobol-flatfile.dat'),
  'utf-8',
);
const AST = parseCOBOL(DAT, {
  artifactId: 'corpse-03-cobol-claims',
  title: '1989 COBOL Claims Ledger',
  era: '1989',
});
const FIELDS: CobolLayoutField[] = AST.cobolFields.map((f) => ({
  legacyName: f.legacyName,
  semanticName: f.semanticName,
  type: f.type,
  byteOffset: f.constraints.byteOffset!,
  decimals: f.decimals,
}));
const ROWS = cobolDataRows(DAT);

describe('COBOL translator (Phase 2)', () => {
  it('converts Julian YYDDD dates to ISO and back', () => {
    expect(julianToISO('89245')).toBe('1989-09-02');
    expect(julianToISO('89312')).toBe('1989-11-08');
    expect(julianToISO('89340')).toBe('1989-12-06');
    expect(julianToISO('96060')).toBe('1996-02-29'); // 1996 is a leap year
    expect(isoToJulian('1989-09-02')).toBe('89245');
    expect(isoToJulian('1996-02-29')).toBe('96060');
    expect(isoToJulian('1989-01-01')).toBe('89001');
    expect(() => julianToISO('89367')).toThrow(CorpseCorruptionError);
    expect(() => julianToISO('89ABC')).toThrow(CorpseCorruptionError);
    expect(() => isoToJulian('2024-02-29')).toThrow(/outside the mainframe Julian range/);
  });

  it('parses the three ledger rows into semantic JSON', () => {
    expect(parseCobolRecord(ROWS[0], FIELDS)).toEqual({
      patientId: 'PT00088412',
      claimDate: '1989-09-02',
      diagnosisCode: 'ICD410.9',
      claimAmountUsd: 1450.75,
      adjustmentStatus: 'A',
      memo: 'CORONARY CARE UNIT ADMISSION VERIFIED',
    });
    expect(parseCobolRecord(ROWS[1], FIELDS)).toEqual({
      patientId: 'PT00091204',
      claimDate: '1989-11-08',
      diagnosisCode: 'ICD250.0',
      claimAmountUsd: 320.5,
      adjustmentStatus: 'P',
      memo: 'ROUTINE ENDOCRINE PANEL LAB CLAIM',
    });
    expect(parseCobolRecord(ROWS[2], FIELDS).claimAmountUsd).toBe(18900);
  });

  it('packs a record to exactly 80 bytes and round-trips it', () => {
    const args = {
      patientId: 'PT00088412',
      claimDate: '1989-09-02',
      diagnosisCode: 'ICD410.9',
      claimAmountUsd: 1450.75,
      adjustmentStatus: 'A',
      memo: 'CORONARY CARE UNIT ADMISSION VERIFIED',
    };
    const packed = packCobolRecord(FIELDS, args);
    expect(packed.length).toBe(80);
    expect(packed.slice(0, 10)).toBe('PT00088412');
    expect(packed.slice(10, 15)).toBe('89245');
    expect(packed.slice(15, 23)).toBe('ICD410.9');
    expect(packed.slice(23, 32)).toBe('000145075');
    expect(packed.slice(32, 33)).toBe('A');
    expect(parseCobolRecord(packed, FIELDS)).toEqual(args);
    // The packed first row is the stored row, space-padded to 80 bytes.
    expect(packed).toBe(ROWS[0].padEnd(80, ' '));
  });

  it('rounds implied-decimal currency correctly: 0.29 USD is 29 cents, never 28', () => {
    const args = {
      patientId: 'PT00000001',
      claimDate: '1989-01-01',
      diagnosisCode: 'ICD000.0',
      claimAmountUsd: 0.29,
      adjustmentStatus: 'P',
      memo: 'cent rounding check',
    };
    const packed = packCobolRecord(FIELDS, args);
    expect(packed.slice(23, 32)).toBe('000000029');
    expect(parseCobolRecord(packed, FIELDS).claimAmountUsd).toBe(0.29);
  });

  it('throws when a field is missing or too wide for its bytes', () => {
    expect(() =>
      packCobolRecord(FIELDS, { patientId: 'PT00088412' }),
    ).toThrow(/Missing field "claimDate"/);
    expect(() =>
      packCobolRecord(FIELDS, {
        patientId: 'PT000884121234567890',
        claimDate: '1989-09-02',
        diagnosisCode: 'ICD410.9',
        claimAmountUsd: 1,
        adjustmentStatus: 'A',
        memo: '',
      }),
    ).toThrow(/exceeds 10 bytes/);
  });
});
