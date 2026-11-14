# Requirements — NecroMCP (EARS)

## Requirement 1: Legacy Artifact Ingestion & AST Synthesis
**User Story:** As a platform engineer, I want to drop legacy schemas (SOAP XML,
SQL DDL, or COBOL fixed-width definitions) into the Graveyard so that the system
automatically extracts a normalized Abstract Syntax Tree (AST) and Kiro EARS
specifications.
- **1.1** WHEN a legacy artifact is selected in the UI or saved into `/graveyard`,
  THE SYSTEM SHALL detect the format (`SOAP_XML`, `SQL_DDL`, or `FIXED_WIDTH`)
  within 500ms.
- **1.2** WHEN parsing completes, THE SYSTEM SHALL normalize all operations,
  cryptic field names, byte offsets, and constraints into a canonical
  `NecroIntermediateSchema` AST.
- **1.3** IF a legacy artifact contains malformed syntax, THEN THE SYSTEM SHALL
  isolate the corrupted line and return a structured `CorpseCorruptionError`
  without crashing the service.

## Requirement 2: Dynamic REST & MCP Server Generation
**User Story:** As an AI agent builder, I want the system to automatically expose
modern REST routes and MCP tools from the normalized AST so that LLM agents can
interact with legacy systems seamlessly.
- **2.1** WHEN a `NecroIntermediateSchema` is synthesized, THE SYSTEM SHALL
  generate runtime Zod validation schemas and mount REST endpoints under
  `/api/resurrected/:artifactId/*`.
- **2.2** WHEN endpoints are mounted, THE SYSTEM SHALL expose MCP-compliant tool
  definitions via JSON-RPC 2.0 `tools/list` with clear semantic parameter names
  mapped to legacy fields.
- **2.3** WHEN an AI agent calls `tools/call`, THE SYSTEM SHALL marshal the modern
  JSON arguments into the exact legacy wire format (SOAP XML envelope,
  parameterized SQL, or 80-byte COBOL fixed-width record), execute it against
  the legacy simulator, and unmarshal the response into clean JSON.

## Requirement 3: Property-Based "Exorcism" Verification & Self-Healing
**User Story:** As a reliability engineer, I want every resurrected adapter to pass
automated Property-Based Testing (PBT) so that I have mathematical proof of
behavioral equivalence between old and new systems.
- **3.1** WHEN an Exorcism test is triggered, THE SYSTEM SHALL run 100 randomized
  `fast-check` property arbitraries (boundary numbers, floating-point cents,
  Unicode strings, XML metacharacters, leap-year dates) against both the legacy
  simulator and the resurrected adapter.
- **3.2** IF a discrepancy occurs (such as when the Demon Bug toggle is active),
  THEN THE SYSTEM SHALL shrink the failing input to its minimal counterexample,
  halt MCP tool exposure, and generate an automated code patch diff.
- **3.3** WHEN the user applies the Auto-Patch, THE SYSTEM SHALL update the adapter
  transformation logic and re-run the 100-run PBT suite to confirm 100% parity.

## Requirement 4: Sentinel Security Guardrails & HITL Approval
**User Story:** As a SecOps lead, I want all resurrected MCP tools wrapped in strict
security guardrails so that AI agents cannot exploit legacy vulnerabilities or
execute unauthorized financial transfers.
- **4.1** WHERE inputs map to XML or SQL execution layers, THE SYSTEM SHALL block
  XML External Entity (`<!ENTITY` / `SYSTEM`), SQL injection (`' OR 1=1`,
  `DROP TABLE`), and command injection payloads prior to legacy translation.
- **4.2** IF an AI agent invokes a mutation exceeding safety thresholds (such as a
  wire transfer greater than $10,000 USD), THEN THE SYSTEM SHALL pause execution,
  return status `PENDING_HITL_APPROVAL`, and surface an interactive approval card
  in the UI.
