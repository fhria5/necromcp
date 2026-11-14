// Local mainframe SIMULATOR. This is NOT a real mainframe: it is a deterministic
// in-process stand-in for the 1998 core banking ledger, so the resurrection
// pipeline (parse -> AST -> MCP -> wire translation) can be demonstrated and
// tested without access to any real legacy system. Every formula here is
// duplicated exactly in public/app.js (Mode B browser engine); keep them in sync.
import type { NormalizedOperation } from '../types/necro';
import {
  buildSoapResponse,
  parseCobolRecord,
  type CobolLayoutField,
} from './translator';

/**
 * Deterministic ledger balance for an account number.
 * ledger = 100000 + ((n * 7919) % 900000) cents; available = ledger - 2500.
 * Same input always yields the same balance; nothing is stored anywhere.
 */
export function deriveBalance(accountNumber: string): {
  ledgerBalanceCents: number;
  availableBalanceCents: number;
  currencyCode: string;
} {
  const digits = accountNumber.replace(/\D/g, '');
  const n = digits ? parseInt(digits, 10) : 0;
  const ledgerBalanceCents = 100000 + ((n * 7919) % 900000);
  return {
    ledgerBalanceCents,
    availableBalanceCents: Math.max(0, ledgerBalanceCents - 2500),
    currencyCode: 'USD',
  };
}

/**
 * Deterministic wire-transfer settlement.
 * postedCents uses Math.round with an EPSILON nudge (0.29 USD -> 29 cents, never 28).
 * The Fedwire reference is derived from the inputs, so the same transfer always
 * settles under the same reference.
 */
export function deriveWireTransfer(args: {
  sourceAccountNumber: string;
  destinationAccountNumber: string;
  amountUsd: number;
  memo: string;
}): { fedwireReferenceId: string; settleStatusCode: string; postedCents: number } {
  const postedCents = Math.round((args.amountUsd + Number.EPSILON) * 100);
  const seedText =
    args.sourceAccountNumber + args.destinationAccountNumber + args.memo;
  let refSeed = postedCents;
  for (const ch of seedText) refSeed += ch.charCodeAt(0);
  return {
    fedwireReferenceId: 'FED' + String(refSeed % 100000000).padStart(8, '0'),
    settleStatusCode: '00',
    postedCents,
  };
}

export interface SimulatedResult {
  responseXml: string;
  json: Record<string, unknown>;
}

/** Run one operation against the local simulator; returns SOAP response + JSON. */
export function simulate(
  op: NormalizedOperation,
  args: Record<string, unknown>,
): SimulatedResult {
  let json: Record<string, unknown>;
  if (op.opId === 'GetAccountBalance') {
    json = deriveBalance(String(args.accountNumber));
  } else if (op.opId === 'ExecuteWireTransfer') {
    json = deriveWireTransfer({
      sourceAccountNumber: String(args.sourceAccountNumber),
      destinationAccountNumber: String(args.destinationAccountNumber),
      amountUsd: Number(args.amountUsd),
      memo: String(args.memo),
    });
  } else {
    throw new Error(`Simulator has no legacy behavior for operation "${op.opId}".`);
  }
  // Translate semantic JSON back to legacy part names for the wire response.
  const legacyValues: Record<string, unknown> = {};
  for (const f of op.outputs) legacyValues[f.legacyName] = json[f.semanticName];
  return { responseXml: buildSoapResponse(op, legacyValues), json };
}

/* ------------------------------------------------------------------ */
/* SQL + COBOL simulation (Phase 2). Deterministic, in-process, same   */
/* formulas in public/app.js (Mode B browser engine); keep in sync.    */
/* ------------------------------------------------------------------ */

/** Deterministic numeric seed from any string (sum of char codes). */
export function seedFromString(value: string): number {
  let seed = 0;
  for (const ch of value) seed += ch.charCodeAt(0);
  return seed;
}

/** Deterministic on-hand quantity for a SKU: 10..409. */
export function deriveStockQuantity(skuCode: string): number {
  return 10 + ((seedFromString(skuCode) * 37) % 400);
}

/** Deterministic unit cost for a SKU: $1.00..$91.00, two decimals. */
export function deriveUnitCost(skuCode: string): number {
  return ((seedFromString(skuCode) * 13) % 9000 + 100) / 100;
}

export interface SimulatedSqlResult {
  /** Result-set rendering shown as the legacy wire response. */
  wireResponse: string;
  json: Record<string, unknown>;
}

/** Run one SQL stored-procedure operation against the local simulator. */
export function simulateSql(
  op: NormalizedOperation,
  args: Record<string, unknown>,
): SimulatedSqlResult {
  let json: Record<string, unknown>;
  if (op.opId === 'SP_QUERY_STOCK') {
    const skuCode = String(args.skuCode);
    json = {
      skuCode,
      partDescription: `Legacy part ${skuCode}`,
      quantityOnHand: deriveStockQuantity(skuCode),
      reorderThreshold: 25,
      unitCostUsd: deriveUnitCost(skuCode),
      warehouseAisle: String(args.warehouseAisle),
    };
  } else if (op.opId === 'SP_AUDIT_LOW_STOCK') {
    const totalItems = 240;
    const itemsBelowThreshold = Math.floor(totalItems * Number(args.maxRatio) * 0.42);
    json = {
      itemsBelowThreshold,
      totalItems,
      lowStockRatio: Number((itemsBelowThreshold / totalItems).toFixed(4)),
    };
  } else if (op.opId === 'SP_MUTATE_INV_QTY') {
    const skuCode = String(args.skuCode);
    const delta = Number(args.deltaQuantity);
    const newQty = Math.max(0, deriveStockQuantity(skuCode) + delta);
    json = { skuCode, quantityOnHand: newQty, deltaQuantity: delta };
  } else {
    throw new Error(`Simulator has no legacy behavior for operation "${op.opId}".`);
  }
  // Legacy result row, keyed by legacy column names, as the wire response.
  const legacyRow: Record<string, unknown> = {};
  for (const f of op.outputs) legacyRow[f.legacyName] = json[f.semanticName];
  return { wireResponse: JSON.stringify([legacyRow], null, 2), json };
}

export interface SimulatedCobolResult {
  /** The raw 80-byte record returned by the legacy ledger. */
  wireResponse: string;
  json: Record<string, unknown>;
}

/**
 * Run the COBOL claim lookup against the local simulator: find the data row
 * whose patient id matches, parse it back to semantic JSON. A miss is an
 * error, not invented data.
 */
export function simulateCobol(
  op: NormalizedOperation,
  args: Record<string, unknown>,
  rows: string[],
  fields: CobolLayoutField[],
): SimulatedCobolResult {
  const patientId = String(args.patientId);
  const idField = fields.find((f) => f.semanticName === 'patientId');
  if (!idField) throw new Error('COBOL layout has no patientId field.');
  const [start, end] = idField.byteOffset;
  const match = rows.find(
    (row) => row.slice(start, end).trimEnd() === patientId,
  );
  if (!match) {
    throw new Error(`No claim record found for patient "${patientId}".`);
  }
  return { wireResponse: match.padEnd(80, ' '), json: parseCobolRecord(match, fields) };
}
