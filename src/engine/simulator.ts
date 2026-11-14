// Local mainframe SIMULATOR. This is NOT a real mainframe: it is a deterministic
// in-process stand-in for the 1998 core banking ledger, so the resurrection
// pipeline (parse -> AST -> MCP -> wire translation) can be demonstrated and
// tested without access to any real legacy system. Every formula here is
// duplicated exactly in public/app.js (Mode B browser engine); keep them in sync.
import type { NormalizedOperation } from '../types/necro';
import { buildSoapResponse } from './translator';

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
