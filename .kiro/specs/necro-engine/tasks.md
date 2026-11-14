# Implementation & Verification Tasks — NecroMCP

Phase 0 (spec only) is done. Phase 1 (MVP) is done 14 Nov ~18:35 — 42/42 vitest
pass, Playwright E2E 13/13, live curl verified (see rencana-per-phase.md).
Phase 2 is done 14 Nov — 100/100 vitest pass (42 Phase 1 + 58 Phase 2),
live curl + Playwright E2E verified (see rencana-per-phase.md).
(The user-supplied blueprint marks these [x]; that is corrected here.)

- [ ] **Task 1: Multi-Format Legacy AST Parser (`src/engine/parser.ts`)**
  - [x] 1.1 Implement SOAP/WSDL XML operation and XSD type extractor (`SOAP_XML`). — Phase 1
  - [x] 1.2 Implement SQL DDL table, column, and constraint parser (`SQL_DDL`). — Phase 2
  - [x] 1.3 Implement 80-byte COBOL `PIC` clause and Julian date byte-offset parser (`FIXED_WIDTH`). — Phase 2
- [ ] **Task 2: Spec & Schema Synthesizer (`src/engine/synthesizer.ts`)**
  - [x] 2.1 Auto-generate Kiro EARS `requirements.md` clauses per extracted operation. — Phase 1
  - [x] 2.2 Synthesize strict runtime `Zod` validation schemas and semantic field mappings. — Phase 1
  - [x] 2.3 Generate MCP JSON-RPC 2.0 `tools/list` definitions. — Phase 1 (`GET /mcp/tools`)
- [ ] **Task 3: Bidirectional Wire Translator (`src/engine/translator.ts`)**
  - [x] 3.1 Build JSON-to-SOAP XML envelope marshaler and fault unmarshaler. — Phase 1
  - [x] 3.2 Build JSON-to-SQL parameterized query generator. — Phase 2
  - [x] 3.3 Build JSON-to-80-byte ASCII fixed-width record packer with `PIC 9(7)V99` implied decimals. — Phase 2
- [ ] **Task 4: Exorcist Property-Based Testing Engine (`src/engine/exorcist-pbt.ts`)**
  - [x] 4.1 Configure `fast-check` arbitraries for round-trip parity invariants. — Phase 3 (100 run/artifact, seed 20261114; browser mirror: seeded mulberry32 PRNG in `public/app.js`)
  - [x] 4.2 Implement deterministic Demon Bug injection and minimal counterexample shrinking. — Phase 3 (shrunk to { amountUsd: 0.29, memo: "&" }; tool quarantined from /mcp/tools + /mcp/call)
  - [x] 4.3 Implement self-healing Auto-Patch state transition. — Phase 3 (PATCHED after re-verify 100/100; `POST /api/exorcise`)
- [ ] **Task 5: Sentinel Security Guardrails (`src/engine/sentinel.ts`)**
  - [x] 5.1 Enforce XXE (`<!ENTITY`), SQLi, and shell metacharacter sanitization. — Phase 2
  - [x] 5.2 Enforce Human-in-the-Loop (HITL) approval state machine for transactions exceeding $10,000. — Phase 2
- [ ] **Task 6: "The Necromancer's Altar" Dashboard (`public/`)**
  - [x] 6.1 Build 4-zone Gothic-Cyberpunk UI with 1-Click Graveyard Presets. — Phase 1
  - [x] 6.2 Integrate live PBT fuzzing telemetry, shrinker inspector, and 3-layer MCP wire viewer. — 3-layer wire viewer done Phase 1; **3-scenario playground + Sentinel log + HITL card done Phase 2**; **PBT telemetry + shrinker inspector + Exorcism deck done Phase 3** (progress run, counterexample, Auto-Patch, latency legacy vs adapter, node 4 status).
  - [x] 6.3 Bundle standalone client-side fallback engine for zero-backend GitHub Pages portability. — Phase 1 (Mode B engine in `public/app.js`, `docs/` is its Pages copy)
