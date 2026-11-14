# Implementation & Verification Tasks — NecroMCP

Phase 0 (spec only) is done. All build tasks below are UNCHECKED — nothing is
built yet. (The user-supplied blueprint marks these [x]; that is corrected here.)

- [ ] **Task 1: Multi-Format Legacy AST Parser (`src/engine/parser.ts`)**
  - [ ] 1.1 Implement SOAP/WSDL XML operation and XSD type extractor (`SOAP_XML`).
  - [ ] 1.2 Implement SQL DDL table, column, and constraint parser (`SQL_DDL`).
  - [ ] 1.3 Implement 80-byte COBOL `PIC` clause and Julian date byte-offset parser (`FIXED_WIDTH`).
- [ ] **Task 2: Spec & Schema Synthesizer (`src/engine/synthesizer.ts`)**
  - [ ] 2.1 Auto-generate Kiro EARS `requirements.md` clauses per extracted operation.
  - [ ] 2.2 Synthesize strict runtime `Zod` validation schemas and semantic field mappings.
  - [ ] 2.3 Generate MCP JSON-RPC 2.0 `tools/list` definitions.
- [ ] **Task 3: Bidirectional Wire Translator (`src/engine/translator.ts`)**
  - [ ] 3.1 Build JSON-to-SOAP XML envelope marshaler and fault unmarshaler.
  - [ ] 3.2 Build JSON-to-SQL parameterized query generator.
  - [ ] 3.3 Build JSON-to-80-byte ASCII fixed-width record packer with `PIC 9(7)V99` implied decimals.
- [ ] **Task 4: Exorcist Property-Based Testing Engine (`src/engine/exorcist-pbt.ts`)**
  - [ ] 4.1 Configure `fast-check` arbitraries for round-trip parity invariants.
  - [ ] 4.2 Implement deterministic Demon Bug injection and minimal counterexample shrinking.
  - [ ] 4.3 Implement self-healing Auto-Patch state transition.
- [ ] **Task 5: Sentinel Security Guardrails (`src/engine/sentinel.ts`)**
  - [ ] 5.1 Enforce XXE (`<!ENTITY`), SQLi, and shell metacharacter sanitization.
  - [ ] 5.2 Enforce Human-in-the-Loop (HITL) approval state machine for transactions exceeding $10,000.
- [ ] **Task 6: "The Necromancer's Altar" Dashboard (`public/`)**
  - [ ] 6.1 Build 4-zone Gothic-Cyberpunk UI with 1-Click Graveyard Presets.
  - [ ] 6.2 Integrate live PBT fuzzing telemetry, shrinker inspector, and 3-layer MCP wire viewer.
  - [ ] 6.3 Bundle standalone client-side fallback engine for zero-backend GitHub Pages portability.
