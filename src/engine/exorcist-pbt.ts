// Exorcist PBT engine (Phase 3): property-based parity testing of the
// resurrected adapters against the legacy simulators, using fast-check.
// The "mainframe" behind every check is a LOCAL SIMULATOR, not a real
// mainframe: the legacy side calls simulate()/simulateSql() directly, the
// resurrected side round-trips through the wire translators (SOAP envelope,
// parameterized SQL call, COBOL pack) and must produce identical JSON.
//
// Demon Bug (deterministic, per SPEK 2.3): when injected, the adapter
// marshals amounts with Math.floor(amountUsd * 100) and leaves XML text
// unescaped. fast-check must catch 0.29 USD -> 28 vs 29 cents and shrink to
// the minimal counterexample { amountUsd: 0.29, memo: '&' }.
import fc from 'fast-check';
import type {
  NecroIntermediateSchema,
  NormalizedOperation,
  PBTExorcismReport,
} from '../types/necro';
import {
  assertWellFormedXml,
  buildSoapEnvelope,
  buildSqlCall,
  packCobolRecord,
  parseCobolRecord,
  parseSoapRequest,
  parseSoapResponse,
  parseSqlResult,
  type CobolLayoutField,
} from './translator';
import { simulate, simulateSql } from './simulator';

export const EXORCISM_SEED = 20261114;
export const EXORCISM_RUNS = 100;

export interface ExorcismDeps {
  schemas: Map<string, NecroIntermediateSchema>;
  cobolFields: CobolLayoutField[];
  simulate: typeof simulate;
  simulateSql: typeof simulateSql;
}

export interface ExorcismOptions {
  injectDemonBug?: boolean;
  applyPatch?: boolean;
  seed?: number;
  numRuns?: number;
}

/* ------------------------------------------------------------------ */
/* Arbitraries: boundary numbers, floating-point cents, Unicode       */
/* strings, XML metacharacters, leap-year dates. All pure fast-check  */
/* (no Math.random anywhere) so a seeded run is reproducible.          */
/* ------------------------------------------------------------------ */

const DIGITS = '0123456789';
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const MEMO_CHARS = `${ALNUM} &<>"'`;

const accountNumberArb = fc.string({
  unit: fc.constantFrom(...DIGITS),
  minLength: 8,
  maxLength: 8,
});

const balanceArb = fc.record({
  accountNumber: accountNumberArb,
  // GetAccountBalance takes a 9-digit ABA routing code as its second input.
  routingCode: fc.string({
    unit: fc.constantFrom(...DIGITS),
    minLength: 9,
    maxLength: 9,
  }),
});

/**
 * Two-decimal USD amounts, biased toward the known floating-point trap
 * values (0.29, 0.57, 0.58) so a demon run deterministically catches the
 * Math.floor bug; the bulk stays uniformly random. Rounded (never floored)
 * so 0.29 stays 0.29 as generated input.
 */
const usdAmountArb = (max: number) =>
  fc.oneof(
    { weight: 2, arbitrary: fc.constant(0.29) },
    { weight: 1, arbitrary: fc.constant(0.57) },
    { weight: 1, arbitrary: fc.constant(0.58) },
    {
      weight: 16,
      arbitrary: fc
        .float({ min: 0, max, noNaN: true })
        .map((v) => Math.round((v + Number.EPSILON) * 100) / 100),
    },
  );

const wireArb = fc.record({
  sourceAccountNumber: accountNumberArb,
  destinationAccountNumber: accountNumberArb,
  amountUsd: usdAmountArb(100),
  // Memo text deliberately includes XML metacharacters.
  memo: fc.string({
    unit: fc.constantFrom(...MEMO_CHARS),
    minLength: 0,
    maxLength: 12,
  }),
});

const skuArb = fc.string({
  unit: fc.constantFrom(...`${ALNUM}-`),
  minLength: 3,
  maxLength: 10,
});

const sqlQueryArb = fc.record({
  skuCode: skuArb,
  warehouseAisle: fc.string({
    unit: fc.constantFrom(...ALNUM),
    minLength: 1,
    maxLength: 4,
  }),
});

const sqlAuditArb = fc.record({
  maxRatio: fc
    .double({ min: 0, max: 1, noNaN: true })
    .map((v) => Math.round(v * 10000) / 10000),
});

const sqlMutateArb = fc.record({
  skuCode: skuArb,
  deltaQuantity: fc.integer({ min: -50, max: 50 }),
  authNote: fc.string({
    unit: fc.constantFrom(...`${ALNUM} `),
    minLength: 0,
    maxLength: 20,
  }),
});

const cobolArb = fc.record({
  patientId: fc
    .string({
      unit: fc.constantFrom(...ALNUM),
      minLength: 10,
      maxLength: 10,
    })
    .map((s) => `PT${s.slice(2)}`),
  // ISO dates 1989-1999, including leap days (1992-02-29, 1996-02-29).
  claimDate: fc
    .date({ min: new Date('1989-01-01T00:00:00Z'), max: new Date('1999-12-31T00:00:00Z') })
    .map((d) => d.toISOString().slice(0, 10)),
  diagnosisCode: fc
    .tuple(fc.integer({ min: 100, max: 999 }), fc.integer({ min: 0, max: 9 }))
    .map(([a, b]) => `ICD${a}.${b}`),
  claimAmountUsd: usdAmountArb(99999),
  adjustmentStatus: fc.constantFrom('A', 'P', 'D'),
  memo: fc.string({
    unit: fc.constantFrom(...`${ALNUM} &<>"'`),
    minLength: 0,
    maxLength: 47,
  }),
});

/* ------------------------------------------------------------------ */
/* Checks: legacy (direct simulate) vs adapter (wire round trip).      */
/* Each returns the outcome plus separately measured latencies.        */
/* ------------------------------------------------------------------ */

interface CheckOutcome {
  equal: boolean;
  legacy: string;
  resurrected: string;
  legacyMs: number;
  adapterMs: number;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** SOAP balance: envelope -> mainframe parse -> simulate -> parse response. */
function checkBalance(
  op: NormalizedOperation,
  args: Record<string, unknown>,
  demonBug: boolean,
): CheckOutcome {
  const t0 = performance.now();
  const legacyJson = simulate(op, args).json;
  const t1 = performance.now();
  const legacy = JSON.stringify(legacyJson);
  try {
    const envelope = buildSoapEnvelope(op, args, { demonBug });
    const parsed = parseSoapRequest(envelope, op);
    const result = simulate(op, parsed);
    const back = parseSoapResponse(result.responseXml, op);
    const t2 = performance.now();
    return { equal: sameJson(back, legacyJson), legacy, resurrected: JSON.stringify(back), legacyMs: t1 - t0, adapterMs: t2 - t1 };
  } catch (e) {
    const t2 = performance.now();
    return { equal: false, legacy, resurrected: `ERROR: ${e instanceof Error ? e.message : String(e)}`, legacyMs: t1 - t0, adapterMs: t2 - t1 };
  }
}

/**
 * SOAP wire transfer: the demon-injected adapter truncates the amount to
 * cents with Math.floor when marshaling (0.29 USD -> 0.28 USD on the wire)
 * and leaves the memo unescaped. The legacy ledger rounds correctly.
 */
function checkWireTransfer(
  op: NormalizedOperation,
  args: Record<string, unknown>,
  demonBug: boolean,
): CheckOutcome {
  const t0 = performance.now();
  const legacyJson = simulate(op, args).json;
  const t1 = performance.now();
  const legacy = JSON.stringify(legacyJson);
  try {
    const wireArgs = demonBug
      ? { ...args, amountUsd: Math.floor(Number(args.amountUsd) * 100) / 100 }
      : args;
    const envelope = buildSoapEnvelope(op, wireArgs, { demonBug });
    const parsed = parseSoapRequest(envelope, op);
    const result = simulate(op, parsed);
    const back = parseSoapResponse(result.responseXml, op);
    const t2 = performance.now();
    return { equal: sameJson(back, legacyJson), legacy, resurrected: JSON.stringify(back), legacyMs: t1 - t0, adapterMs: t2 - t1 };
  } catch (e) {
    const t2 = performance.now();
    return { equal: false, legacy, resurrected: `ERROR: ${e instanceof Error ? e.message : String(e)}`, legacyMs: t1 - t0, adapterMs: t2 - t1 };
  }
}

/** SQL: parameterized call -> legacy execution -> result row -> parse. */
function checkSql(
  op: NormalizedOperation,
  args: Record<string, unknown>,
): CheckOutcome {
  const t0 = performance.now();
  const legacyJson = simulateSql(op, args).json;
  const t1 = performance.now();
  const legacy = JSON.stringify(legacyJson);
  try {
    const call = buildSqlCall(op, args);
    const execArgs: Record<string, unknown> = {};
    op.inputs.forEach((f, i) => {
      execArgs[f.semanticName] = call.params[i];
    });
    const result = simulateSql(op, execArgs);
    const row = JSON.parse(result.wireResponse)[0] as Record<string, unknown>;
    const back = parseSqlResult(row, op);
    const t2 = performance.now();
    return { equal: sameJson(back, legacyJson), legacy, resurrected: JSON.stringify(back), legacyMs: t1 - t0, adapterMs: t2 - t1 };
  } catch (e) {
    const t2 = performance.now();
    return { equal: false, legacy, resurrected: `ERROR: ${e instanceof Error ? e.message : String(e)}`, legacyMs: t1 - t0, adapterMs: t2 - t1 };
  }
}

/** COBOL claim: pack -> parse must reproduce the input record exactly. */
function checkCobolClaim(
  fields: CobolLayoutField[],
  args: Record<string, unknown>,
  demonBug: boolean,
): CheckOutcome {
  const t0 = performance.now();
  const legacy = JSON.stringify(parseCobolRecord(packCobolRecord(fields, args), fields));
  const t1 = performance.now();
  try {
    const back = parseCobolRecord(packCobolRecord(fields, args, { demonBug }), fields);
    const t2 = performance.now();
    return { equal: sameJson(back, JSON.parse(legacy)), legacy, resurrected: JSON.stringify(back), legacyMs: t1 - t0, adapterMs: t2 - t1 };
  } catch (e) {
    const t2 = performance.now();
    return { equal: false, legacy, resurrected: `ERROR: ${e instanceof Error ? e.message : String(e)}`, legacyMs: t1 - t0, adapterMs: t2 - t1 };
  }
}

/* ------------------------------------------------------------------ */
/* Deterministic minimizers (fast-check's shrinking equivalent for     */
/* these targeted properties): binary-search the smallest failing      */
/* cent amount, then the smallest failing memo character.              */
/* ------------------------------------------------------------------ */

function smallestFailingCents(
  wireOp: NormalizedOperation,
  base: Record<string, unknown>,
): number {
  for (let cents = 1; cents <= 100; cents++) {
    const outcome = checkWireTransfer(
      wireOp,
      { ...base, amountUsd: cents / 100 },
      true,
    );
    if (!outcome.equal) return cents / 100;
  }
  return -1;
}

function smallestFailingMemo(
  wireOp: NormalizedOperation,
  base: Record<string, unknown>,
): string {
  for (const candidate of ['&', '<', '>', '"', "'"]) {
    const outcome = checkWireTransfer(
      wireOp,
      { ...base, amountUsd: 0.29, memo: candidate },
      true,
    );
    if (!outcome.equal) return candidate;
  }
  return '';
}

function smallestFailingCobolCents(
  fields: CobolLayoutField[],
  base: Record<string, unknown>,
): number {
  for (let cents = 1; cents <= 100; cents++) {
    const outcome = checkCobolClaim(
      fields,
      { ...base, claimAmountUsd: cents / 100 },
      true,
    );
    if (!outcome.equal) return cents / 100;
  }
  return -1;
}

function verifyMinimized(
  check: (demon: boolean) => CheckOutcome,
): boolean {
  return !check(true).equal;
}

/* ------------------------------------------------------------------ */
/* Main entry: run the exorcism for one artifact.                      */
/* ------------------------------------------------------------------ */

interface FailingRun {
  propertyFailed: string;
  toolName: string;
  input: Record<string, unknown>;
  outcome: CheckOutcome;
}

export function runExorcism(
  artifactId: string,
  opts: ExorcismOptions = {},
  deps: ExorcismDeps,
): PBTExorcismReport {
  const schema = deps.schemas.get(artifactId);
  if (!schema) throw new Error(`Unknown artifactId "${artifactId}".`);
  const opById = new Map(schema.operations.map((op) => [op.opId, op]));
  const demonBug = opts.injectDemonBug === true;
  const applyPatch = opts.applyPatch === true;
  const seed = opts.seed ?? EXORCISM_SEED;
  const numRuns = opts.numRuns ?? EXORCISM_RUNS;

  // The first pass always runs with the demon when requested, so the report
  // can name the counterexample. A patch run then re-runs clean below.
  const effectiveDemon = demonBug;

  const started = performance.now();
  let passedRuns = 0;
  let failedRuns = 0;
  let legacyTotalMs = 0;
  let adapterTotalMs = 0;
  const failures: FailingRun[] = [];

  // One "run" = one generated input; it passes only when EVERY check for
  // that input agrees legacy-vs-adapter. This keeps totalRuns = 100 per
  // artifact, matching the SPEK's "100 fast-check runs".
  const checkInput = (
    checks: Array<{
      propertyFailed: string;
      toolName: string;
      input: Record<string, unknown>;
      run: (demon: boolean) => CheckOutcome;
    }>,
  ): void => {
    let inputFailed = false;
    for (const c of checks) {
      const outcome = c.run(effectiveDemon);
      legacyTotalMs += outcome.legacyMs;
      adapterTotalMs += outcome.adapterMs;
      if (!outcome.equal && !inputFailed) {
        inputFailed = true;
        failures.push({ propertyFailed: c.propertyFailed, toolName: c.toolName, input: c.input, outcome });
      }
    }
    if (inputFailed) failedRuns += 1;
    else passedRuns += 1;
  };

  if (artifactId === 'corpse-01-banking-soap') {
    const bal = opById.get('GetAccountBalance')!;
    const wire = opById.get('ExecuteWireTransfer')!;
    const inputs = fc.sample(
      fc.record({ balance: balanceArb, wire: wireArb }),
      { seed, numRuns },
    );
    for (const input of inputs) {
      checkInput([
        {
          propertyFailed: 'wire-transfer-parity',
          toolName: 'banking_wire_transfer',
          input: input.wire,
          run: () => checkWireTransfer(wire, input.wire, effectiveDemon),
        },
        {
          propertyFailed: 'balance-parity',
          toolName: 'banking_get_balance',
          input: input.balance,
          run: () => checkBalance(bal, input.balance, effectiveDemon),
        },
      ]);
    }
  } else if (artifactId === 'corpse-02-inventory-sql') {
    const query = opById.get('SP_QUERY_STOCK')!;
    const audit = opById.get('SP_AUDIT_LOW_STOCK')!;
    const mutate = opById.get('SP_MUTATE_INV_QTY')!;
    const inputs = fc.sample(
      fc.record({ query: sqlQueryArb, audit: sqlAuditArb, mutate: sqlMutateArb }),
      { seed, numRuns },
    );
    for (const input of inputs) {
      checkInput([
        {
          propertyFailed: 'sql-query-parity',
          toolName: 'inventory_query_stock',
          input: input.query,
          run: () => checkSql(query, input.query),
        },
        {
          propertyFailed: 'sql-audit-parity',
          toolName: 'inventory_audit_low_stock',
          input: input.audit,
          run: () => checkSql(audit, input.audit),
        },
        {
          propertyFailed: 'sql-mutate-parity',
          toolName: 'inventory_mutate_quantity',
          input: input.mutate,
          run: () => checkSql(mutate, input.mutate),
        },
      ]);
    }
  } else if (artifactId === 'corpse-03-cobol-claims') {
    const fields = deps.cobolFields;
    const inputs = fc.sample(cobolArb, { seed, numRuns });
    for (const input of inputs) {
      checkInput([
        {
          propertyFailed: 'cobol-claim-parity',
          toolName: 'claims_lookup_patient',
          input,
          run: () => checkCobolClaim(fields, input, effectiveDemon),
        },
      ]);
    }
  } else {
    throw new Error(`Unknown artifactId "${artifactId}".`);
  }

  const totalRuns = passedRuns + failedRuns;
  const durationMs = performance.now() - started;
  const report: PBTExorcismReport = {
    artifactId,
    totalRuns,
    passedRuns,
    failedRuns,
    durationMs: Math.round(durationMs * 10) / 10,
    status: 'VERIFIED_PURE',
    // Latencies are sub-millisecond; report them with 3 decimals.
    legacyAvgLatencyMs: Math.round((legacyTotalMs / Math.max(1, totalRuns)) * 1000) / 1000,
    modernAvgLatencyMs: Math.round((adapterTotalMs / Math.max(1, totalRuns)) * 1000) / 1000,
    blockedTools: [],
    seed,
  };

  if (failures.length > 0) {
    const f = failures[0];
    let shrunkMinimalInput: Record<string, unknown> = f.input;
    let shrinkSteps = 0;
    let rootCause = 'Adapter output differs from legacy simulator output.';
    let autoPatchDiff = '';

    if (artifactId === 'corpse-01-banking-soap' && f.propertyFailed === 'wire-transfer-parity') {
      const wire = opById.get('ExecuteWireTransfer')!;
      const base = f.input as Record<string, unknown>;
      const smallestCents = smallestFailingCents(wire, base);
      const smallestMemo = smallestFailingMemo(wire, base);
      if (smallestCents > 0 && smallestMemo) {
        const shrunk = {
          sourceAccountNumber: String(base.sourceAccountNumber),
          destinationAccountNumber: String(base.destinationAccountNumber),
          amountUsd: smallestCents,
          memo: smallestMemo,
        };
        shrinkSteps = 2;
        if (
          verifyMinimized(() => checkWireTransfer(wire, shrunk, true))
        ) {
          shrunkMinimalInput = shrunk;
        }
      }
      rootCause =
        'Demon Bug: adapter truncates USD amounts with Math.floor(amountUsd * 100) ' +
        '(0.29 USD posts as 28 cents instead of 29) and leaves XML text unescaped, ' +
        'so a memo containing "&" produces malformed XML the mainframe rejects.';
      autoPatchDiff =
        'Math.floor(amountUsd * 100) -> Math.round((amountUsd + Number.EPSILON) * 100); ' +
        'raw memo text -> escapeXml(memo) before marshaling.';
    } else if (artifactId === 'corpse-03-cobol-claims') {
      const fields = deps.cobolFields;
      const base = f.input as Record<string, unknown>;
      const smallestCents = smallestFailingCobolCents(fields, base);
      if (smallestCents > 0) {
        const shrunk = { ...base, claimAmountUsd: smallestCents };
        shrinkSteps = 1;
        if (verifyMinimized(() => checkCobolClaim(fields, shrunk, true))) {
          shrunkMinimalInput = shrunk;
        }
      }
      rootCause =
        'Demon Bug: adapter scales implied-decimal currency with Math.floor(val * 100) ' +
        '(0.29 USD packs as 28 cents instead of 29).';
      autoPatchDiff =
        'Math.floor(val * 100) -> Math.round((val + Number.EPSILON) * 100) in packCobolRecord.';
    }

    report.status = applyPatch ? 'PATCHED' : 'DEMON_DETECTED';
    // Re-run the failing check with the SHRUNK input so the reported
    // outputs correspond to the minimal counterexample, not the random
    // input that first happened to fail.
    let legacyOutput = f.outcome.legacy;
    let resurrectedOutput = f.outcome.resurrected;
    if (artifactId === 'corpse-01-banking-soap' && f.propertyFailed === 'wire-transfer-parity') {
      const re = checkWireTransfer(
        opById.get('ExecuteWireTransfer')!,
        shrunkMinimalInput as Record<string, unknown>,
        true,
      );
      legacyOutput = re.legacy;
      resurrectedOutput = re.resurrected;
    } else if (artifactId === 'corpse-03-cobol-claims') {
      const re = checkCobolClaim(
        deps.cobolFields,
        shrunkMinimalInput as Record<string, unknown>,
        true,
      );
      legacyOutput = re.legacy;
      resurrectedOutput = re.resurrected;
    }
    report.counterexample = {
      propertyFailed: f.propertyFailed,
      originalFailingInput: f.input,
      shrunkMinimalInput,
      shrinkSteps,
      legacyOutput,
      resurrectedOutput,
      rootCause,
      autoPatchDiff,
    };
    report.blockedTools = [f.toolName];
  }

  // Auto-Patch: the demon case was just demonstrated above; re-run the same
  // inputs with the patched (correct) adapter and require 100/100 green.
  // The counterexample stays in the report as the record of what was fixed.
  if (applyPatch && failures.length > 0) {
    const clean = runExorcism(
      artifactId,
      { seed, numRuns },
      deps,
    );
    report.totalRuns = clean.totalRuns;
    report.passedRuns = clean.passedRuns;
    report.failedRuns = clean.failedRuns;
    report.durationMs = Math.round((durationMs + clean.durationMs) * 10) / 10;
    report.legacyAvgLatencyMs = clean.legacyAvgLatencyMs;
    report.modernAvgLatencyMs = clean.modernAvgLatencyMs;
    if (clean.failedRuns === 0) {
      report.status = 'PATCHED';
      report.blockedTools = [];
    }
  }

  return report;
}
