// Core types for NecroMCP (Phase 1: SOAP only).
// The "mainframe" behind these types is a LOCAL SIMULATOR, not a real mainframe.

export type LegacyFormat = 'SOAP_XML' | 'SQL_DDL' | 'FIXED_WIDTH';

export type FieldType = 'string' | 'number' | 'boolean' | 'iso_date';

export interface NormalizedField {
  legacyName: string;
  semanticName: string;
  type: FieldType;
  constraints: {
    required: boolean;
    min?: number;
    max?: number;
    maxLength?: number;
    byteOffset?: [number, number];
  };
  description: string;
}

export interface NormalizedOperation {
  opId: string;
  legacyAction: string;
  mcpToolName: string;
  description: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'CRITICAL';
  hitlThreshold?: { field: string; maxAllowed: number };
  inputs: NormalizedField[];
  outputs: NormalizedField[];
}

export interface NecroIntermediateSchema {
  artifactId: string;
  title: string;
  era: string;
  format: LegacyFormat;
  rawSource: string;
  extractedAt: string;
  operations: NormalizedOperation[];
  generatedEarsSpec: string;
  generatedZodCode: string;
}

export interface MCPToolCallOutcome {
  status: 'SUCCESS' | 'BLOCKED_SECURITY' | 'PENDING_HITL';
  toolName: string;
  mcpRequestJson: Record<string, unknown>;
  legacyWirePayload: string;
  legacyRawResponse: string;
  normalizedJsonResponse: Record<string, unknown>;
  latencyMs: number;
  securityAlert?: {
    ruleId: string;
    severity: 'CRITICAL' | 'HIGH';
    reason: string;
    ApprovalToken?: string;
  };
  /** Present only when status is PENDING_HITL: what must be approved and how. */
  hitl?: {
    field: string;
    value: number;
    maxAllowed: number;
    approvalToken: string;
  };
}

/** Error thrown when a legacy artifact is malformed. Carries the offending line when known. */
export class CorpseCorruptionError extends Error {
  line?: number;
  constructor(message: string, line?: number) {
    super(message);
    this.name = 'CorpseCorruptionError';
    this.line = line;
  }
}

/* ------------------------------------------------------------------ */
/* PBT Exorcism report (Phase 3, per SPEK Part 2.2). The "legacy" side */
/* is the local simulator; the "resurrected" side is the adapter that  */
/* marshals JSON to the legacy wire format and back.                    */
/* ------------------------------------------------------------------ */

export interface PBTExorcismReport {
  artifactId: string;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  durationMs: number;
  status: 'VERIFIED_PURE' | 'DEMON_DETECTED' | 'PATCHED';
  legacyAvgLatencyMs: number;
  modernAvgLatencyMs: number;
  counterexample?: {
    propertyFailed: string;
    originalFailingInput: Record<string, unknown>;
    shrunkMinimalInput: Record<string, unknown>;
    shrinkSteps: number;
    legacyOutput: string;
    resurrectedOutput: string;
    rootCause: string;
    autoPatchDiff: string;
  };
  /** MCP tools quarantined while the demon is detected (exposure halted). */
  blockedTools: string[];
  /** fast-check / PRNG seed, so a run is reproducible. */
  seed: number;
}
