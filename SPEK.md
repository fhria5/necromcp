# NECROMCP — MASTER SPECIFICATION, PRD, DESIGN & ONE-SHOT BUILD PROMPT
**Project Name:** NecroMCP (The Lazarus Protocol for Legacy Systems)  
**Target Event:** Kiroween Hackathon (Kiro IDE)  
**Target Tracks:** Grand Prize ($30,000), Best Resurrection / Frankenstein ($5,000), Best Startup Project ($10,000)  
**Execution Mode:** Autonomous End-to-End Full-Stack + Dual-Mode Deployment (Local Node.js Server & Static GitHub Pages Client Fallback)

---

## PART 0: AUTONOMOUS AGENT EXECUTION DIRECTIVES (YOLO MODE)

You are an autonomous Principal Systems Architect and Full-Stack Engineer. Build **NecroMCP** from scratch to 100% completion in a single uninterrupted run following every specification in this document:

1. **Zero Placeholders or Stubs:** Never leave `// TODO`, `// implement later`, or empty handlers. Every parser, bidirectional protocol translator, Property-Based Test (`fast-check`), Model Context Protocol (MCP) JSON-RPC endpoint, security guardrail, and UI interaction must be fully functional.
2. **No Confirmation Pauses:** Do not ask questions. Make decisive technical choices, create all directories, install dependencies, run the test suite, and verify the build autonomously.
3. **Complete `.kiro/` Implementation:** Judges directly evaluate the `.kiro/` directory. Generate all 9 specification, steering, hook, and MCP configuration files detailed in **Part 4**.
4. **Dual-Mode Portability (Server + GitHub Pages Ready):**
   - **Mode A (Full Stack Local):** Express + TypeScript backend (`src/server.ts`) serving REST APIs, MCP JSON-RPC endpoints, and live `fast-check` property testing.
   - **Mode B (Static Live Demo Fallback):** The frontend (`public/app.js`) must include an embedded deterministic execution engine so that if hosted statically on GitHub Pages (`/docs` or `/public`), all 1-click presets, AST extraction, PBT Exorcism shrinking, Demon Bug injection, Auto-Patching, and MCP Wire Translations still run 100% interactively in the browser without `fetch` failures.

---

## PART 1: PRODUCT REQUIREMENTS DOCUMENT (PRD)

### 1.1 Executive Summary
Enterprise AI adoption faces a massive wall: modern AI agents communicate via JSON and the **Model Context Protocol (MCP)**, while over 70% of core banking, healthcare, and manufacturing records remain trapped inside 1980s–2000s legacy interfaces (SOAP/WSDL XML envelopes, cryptic SQL dumps, and 80-byte COBOL fixed-width flat files).

**NecroMCP** is an autonomous resurrection engine that ingests legacy artifacts from `/graveyard` and synthesizes:
1. **Modern REST APIs** with strict runtime Zod validation.
2. **Live MCP Servers** (`tools/list`, `tools/call`, `resources/read`) enabling AI agents to query and mutate legacy mainframes safely.
3. **Mathematical Parity Verification ("The Exorcism")** powered by **Property-Based Testing (`fast-check`)** that fires 100+ randomized edge-case payloads against both the legacy simulator and the resurrected adapter, shrinking any discrepancy to a minimal counterexample.
4. **Sentinel Security Guardrails** that sanitize XXE/SQLi payloads and enforce Human-in-the-Loop (HITL) approval gates for high-risk mutations.

### 1.2 Judging Criteria Alignment (20% Each)
* **Potential Impact (20%):** Solves a multi-billion-dollar enterprise integration bottleneck without requiring risky mainframe rewrites.
* **Technological Implementation (20%):** Showcases complete mastery of Kiro IDE: EARS syntax in `.kiro/specs/`, architectural & security rules in `.kiro/steering/`, automated file-watcher triggers in `.kiro/hooks/`, native MCP server synthesis, and Property-Based Testing (PBT).
* **Design (20%):** **"The Necromancer’s Altar"**—an intentional dark-mode Gothic-Cyberpunk telemetry workspace with zero visual bloat, real-time schema transformation nodes, and a 3-layer wire payload inspector.
* **Innovation (20%):** Introduces automated Property-Based Testing as a live verification & self-healing gate ("Exorcism") for AI agent tool synthesis.
* **Presentation (20%):** Features **1-Click Graveyard Presets** and a **Demon Bug Toggle** allowing judges to experience resurrection, fuzzing failure, counterexample shrinking, auto-patching, and MCP agent execution in under 60 seconds.

### 1.3 Functional Requirements (Kiro EARS Format)

#### Requirement 1: Legacy Artifact Ingestion & AST Synthesis
**User Story:** As a platform engineer, I want to drop legacy schemas (SOAP XML, SQL DDL, or COBOL fixed-width definitions) into the Graveyard so that the system automatically extracts a normalized Abstract Syntax Tree (AST) and Kiro EARS specifications.
* **1.1** **WHEN** a legacy artifact is selected in the UI or saved into `/graveyard`, **THE SYSTEM SHALL** detect the format (`SOAP_XML`, `SQL_DDL`, or `FIXED_WIDTH`) within 500ms.
* **1.2** **WHEN** parsing completes, **THE SYSTEM SHALL** normalize all operations, cryptic field names, byte offsets, and constraints into a canonical `NecroIntermediateSchema` AST.
* **1.3** **IF** a legacy artifact contains malformed syntax, **THEN THE SYSTEM SHALL** isolate the corrupted line and return a structured `CorpseCorruptionError` without crashing the service.

#### Requirement 2: Dynamic REST & MCP Server Generation
**User Story:** As an AI agent builder, I want the system to automatically expose modern REST routes and MCP tools from the normalized AST so that LLM agents can interact with legacy systems seamlessly.
* **2.1** **WHEN** a `NecroIntermediateSchema` is synthesized, **THE SYSTEM SHALL** generate runtime Zod validation schemas and mount REST endpoints under `/api/resurrected/:artifactId/*`.
* **2.2** **WHEN** endpoints are mounted, **THE SYSTEM SHALL** expose MCP-compliant tool definitions via JSON-RPC 2.0 `tools/list` with clear semantic parameter names mapped to legacy fields.
* **2.3** **WHEN** an AI agent calls `tools/call`, **THE SYSTEM SHALL** marshal the modern JSON arguments into the exact legacy wire format (SOAP XML envelope, parameterized SQL, or 80-byte COBOL fixed-width record), execute it against the legacy simulator, and unmarshal the response into clean JSON.

#### Requirement 3: Property-Based "Exorcism" Verification & Self-Healing
**User Story:** As a reliability engineer, I want every resurrected adapter to pass automated Property-Based Testing (PBT) so that I have mathematical proof of behavioral equivalence between old and new systems.
* **3.1** **WHEN** an Exorcism test is triggered, **THE SYSTEM SHALL** run 100 randomized `fast-check` property arbitraries (boundary numbers, floating-point cents, Unicode strings, XML metacharacters, leap-year dates) against both the legacy simulator and the resurrected adapter.
* **3.2** **IF** a discrepancy occurs (such as when the Demon Bug toggle is active), **THEN THE SYSTEM SHALL** shrink the failing input to its minimal counterexample, halt MCP tool exposure, and generate an automated code patch diff.
* **3.3** **WHEN** the user applies the Auto-Patch, **THE SYSTEM SHALL** update the adapter transformation logic and re-run the 100-run PBT suite to confirm 100% parity.

#### Requirement 4: Sentinel Security Guardrails & HITL Approval
**User Story:** As a SecOps lead, I want all resurrected MCP tools wrapped in strict security guardrails so that AI agents cannot exploit legacy vulnerabilities or execute unauthorized financial transfers.
* **4.1** **WHERE** inputs map to XML or SQL execution layers, **THE SYSTEM SHALL** block XML External Entity (`<!ENTITY` / `SYSTEM`), SQL injection (`' OR 1=1`, `DROP TABLE`), and command injection payloads prior to legacy translation.
* **4.2** **IF** an AI agent invokes a mutation exceeding safety thresholds (such as a wire transfer greater than $10,000 USD), **THEN THE SYSTEM SHALL** pause execution, return status `PENDING_HITL_APPROVAL`, and surface an interactive approval card in the UI.

---

## PART 2: TECHNICAL SYSTEM DESIGN (`design.md`)

### 2.1 High-Level Architecture
```
+-----------------------------------------------------------------------------------+
|                        THE NECROMANCER'S ALTAR (Web UI)                           |
|  [1-Click Corpse Presets]  [AST & .kiro Spec Viewer]  [PBT Exorcism]  [MCP Chat]  |
+-------------------+-----------------------+-----------------------+---------------+
                    |                       |                       |
                    v                       v                       v
+-----------------------------------------------------------------------------------+
|                         NECROMCP CORE ENGINE (Node.js / TS)                       |
|                                                                                   |
|  1. Parser Engine        2. Synthesizer          3. Exorcist PBT Runner           |
|  - SOAP/WSDL Extractor   - Zod Code Generator    - fast-check Arbitraries (100x)  |
|  - SQL DDL Extractor     - EARS Spec Generator   - Minimal Counterexample Shrink  |
|  - COBOL Byte Slicer     - MCP Schema Builder    - Self-Healing Auto-Patcher      |
|                                                                                   |
|  4. Sentinel Guardrail                           5. Bidirectional Wire Translator |
|  - XXE / SQLi Blocker                            - JSON <-> SOAP Envelope         |
|  - >$10,000 HITL Gate                            - JSON <-> SQL / 80-Byte COBOL   |
+-----------------------------------------------------------------------------------+
```

### 2.2 Core TypeScript Interfaces (`src/types/necro.ts`)
```typescript
export type LegacyFormat = 'SOAP_XML' | 'SQL_DDL' | 'FIXED_WIDTH';

export interface NormalizedField {
  legacyName: string;
  semanticName: string;
  type: 'string' | 'number' | 'boolean' | 'iso_date';
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
}
```

### 2.3 Deterministic "Demon Bug" & PBT Counterexample Mechanics
* **Why This Wins Judges Over:** Most testing demos only show a static green checkmark. NecroMCP lets judges toggle **`[🔥 Inject Demon Bug]`** and click **`[⚡ Run PBT Exorcism]`**:
  1. When `injectDemonBug === true`, the legacy-to-modern currency adapter uses naive `Math.floor(amountUsd * 100)` instead of `Math.round(amountUsd * 100)` and leaves XML ampersands (`&`) unescaped.
  2. `fast-check` runs randomized floats and strings, immediately catching that `amountUsd = 0.29` evaluates to `0.29 * 100 = 28.999999999999996` $\rightarrow$ `28` cents in the buggy adapter versus `29` cents in the mainframe decimal ledger.
  3. `fast-check` shrinks a complex generated input (e.g., `{ fromAcct: "99481023", amountUsd: 1842.29, memo: "INV & TAX #9921" }`) down in 6 shrink steps to the minimal counterexample (`{ amountUsd: 0.29, memo: "&" }`).
  4. Clicking **`[✨ Apply Auto-Patch & Re-Verify]`** applies `Math.round((val + Number.EPSILON) * 100)` and XML entity escaping, turning all 100/100 property checks neon green.

### 2.4 Backend HTTP & MCP API Specification
* `GET /api/graveyard` — Returns all 3 pre-loaded legacy corpses plus any custom uploaded artifacts.
* `POST /api/resurrect` — Body: `{ artifactId, customSource?, format? }`. Returns `NecroIntermediateSchema`.
* `POST /api/exorcise` — Body: `{ artifactId, injectDemonBug: boolean, applyPatch: boolean }`. Executes 100 `fast-check` runs and returns `PBTExorcismReport`.
* `GET /api/kiro-files` — Returns the full tree and raw file contents of `.kiro/specs/*`, `.kiro/steering/*`, `.kiro/hooks/*`, and `.kiro/settings/mcp.json` for in-browser inspection.
* `GET /mcp/tools` — JSON-RPC 2.0 `tools/list` response exposing all resurrected tools.
* `POST /mcp/call` — Body: `{ artifactId, toolName, arguments, bypassHitlToken? }`. Runs Sentinel Guardrail $\rightarrow$ Legacy Wire Translator $\rightarrow$ Mainframe Simulator $\rightarrow$ Normalized JSON response.

---

## PART 3: UI/UX DESIGN SYSTEM ("THE NECROMANCER'S ALTAR")

### 3.1 Visual Direction & Color Tokens
* **Aesthetic Persona:** Obsidian Crypt & Ectoplasm Telemetry (High-craft dark UI inspired by Linear, Raycast, and Gothic Cybernetics).
* **CSS Custom Properties (`public/styles.css`):**
  - `--bg-abyss: #08090C;`
  - `--bg-crypt: #10131A;`
  - `--bg-altar: #161B26;`
  - `--border-crypt: rgba(0, 255, 157, 0.16);`
  - `--border-subtle: rgba(148, 163, 184, 0.12);`
  - `--ectoplasm: #00FF9D;` (Primary neon green — verified parity, active MCP nodes)
  - `--necrotic: #A855F7;` (Secondary purple — AST extraction & Kiro Spec synthesis)
  - `--crimson: #FF2A54;` (Danger red — PBT counterexample, XXE/SQLi blocked)
  - `--amber: #F59E0B;` (Warning gold — HITL approval gate)
  - `--text-primary: #F8FAFC;`
  - `--text-secondary: #94A3B8;`
* **Typography:**
  - Google Fonts: `'Space Grotesk'` (headers), `'Inter'` (UI controls), `'JetBrains Mono'` (code, byte rulers, wire logs, `tabular-nums` metrics).

### 3.2 4-Zone Command Center Layout (`public/index.html`)
1. **Top Telemetry Bar:**
   - Logo + Live status pills (`KIRO SPECS: SYNCED`, `AGENT HOOKS: 2 ARMED`, `MCP JSON-RPC: ONLINE`, `PBT ENGINE: FAST-CHECK`).
   - **1-Click Graveyard Preset Selector:**
     - `⚰️ 1998 SOAP Core Bank`
     - `🦴 2004 SQL Warehouse`
     - `📜 1989 COBOL Claims Ledger`
     - `➕ Summon Custom Corpse` (Modal to paste custom XML/SQL/COBOL).
2. **Left Panel — The Graveyard & `.kiro` Spec Inspector:**
   - **Tab 1 (`Raw Corpse`):** Syntax-highlighted legacy source code with line numbers and an 80-byte column ruler for COBOL files.
   - **Tab 2 (`Kiro EARS & Zod`):** Displays the synthesized EARS requirements (`WHEN... THE SYSTEM SHALL...`) alongside the generated TypeScript Zod schema.
   - **Tab 3 (`.kiro/ Vault`):** Interactive explorer allowing judges to click and read all 9 files inside `.kiro/` directly in the browser.
3. **Center Panel — The Altar of Resurrection & PBT Exorcism:**
   - **4-Node Ritual Pipeline:** Visual flow (`1. Legacy Fossil` $\rightarrow$ `2. AST + Steering` $\rightarrow$ `3. MCP Bridge` $\rightarrow$ `4. PBT Verified`) with live latency badges.
   - **Exorcism Control Deck:**
     - Toggle: `[🔥 Inject Demon Bug (IEEE-754 Float & XML Escape Bug)]`
     - Primary Button: **`[⚡ RUN PBT EXORCISM (100 FAST-CHECK RUNS)]`**
     - **Live Fuzzing Telemetry:** Animated progress bar, pass/fail counter (`100/100` vs `93/100`), Latency Delta (`148ms Legacy SOAP` $\rightarrow$ `11ms NecroMCP`), and the **Counterexample Shrinker Card** showing Original Failing Payload, Shrunk Minimal Payload, Root Cause, Git Diff, and the **`[✨ Apply Auto-Patch & Re-Verify]`** button.
4. **Right Panel — Live MCP Agent Playground & 3-Layer Wire Inspector:**
   - **1-Click Scenario Chips** (dynamically tailored to the active corpse):
     - *Chip 1 (Standard Execution):* e.g., `"Check Acct #88412 balance & wire $450.00"`
     - *Chip 2 (HITL Threshold Test):* e.g., `"Wire $50,000.00 to offshore account (Triggers >$10k Gate)"` $\rightarrow$ Renders interactive **`[✅ Approve HITL Override]`** / **`[🛑 Reject Transaction]`** banner.
     - *Chip 3 (Adversarial Attack):* e.g., `"Inject XXE / SQLi: ' OR 1=1; <!ENTITY xxe SYSTEM 'file:///etc/passwd'>"` $\rightarrow$ Renders **Sentinel Security Block Forensics**.
   - **3-Layer Wire Translation Inspector:**
     - **Layer 1:** `MCP JSON-RPC 2.0 Request (tools/call)`
     - **Layer 2:** `Translated Legacy Mainframe Wire Payload` (Actual generated `<soapenv:Envelope>`, parameterized SQL, or 80-byte fixed-width string)
     - **Layer 3:** `Normalized Modern JSON Output`

---

## PART 4: MANDATORY `.KIRO/` DIRECTORY BLUEPRINTS

Generate all 9 files below on disk AND embed them in the frontend `.kiro/ Vault` inspector:

### 4.1 `.kiro/specs/necro-engine/requirements.md`
Contains the complete EARS requirements defined in **Part 1.3** (`WHEN`, `WHILE`, `WHERE`, `IF... THEN THE SYSTEM SHALL`) covering Legacy Ingestion, MCP Synthesis, Property-Based Exorcism, and Sentinel Guardrails.

### 4.2 `.kiro/specs/necro-engine/design.md`
Contains the complete Technical Architecture, Sequence Diagrams, TypeScript AST interfaces (`NecroIntermediateSchema`, `PBTExorcismReport`), and PBT Invariant properties defined in **Part 2**.

### 4.3 `.kiro/specs/necro-engine/tasks.md`
```markdown
# Implementation & Verification Tasks — NecroMCP

- [x] **Task 1: Multi-Format Legacy AST Parser (`src/engine/parser.ts`)**
  - [x] 1.1 Implement SOAP/WSDL XML operation and XSD type extractor (`SOAP_XML`).
  - [x] 1.2 Implement SQL DDL table, column, and constraint parser (`SQL_DDL`).
  - [x] 1.3 Implement 80-byte COBOL `PIC` clause and Julian date byte-offset parser (`FIXED_WIDTH`).
- [x] **Task 2: Spec & Schema Synthesizer (`src/engine/synthesizer.ts`)**
  - [x] 2.1 Auto-generate Kiro EARS `requirements.md` clauses per extracted operation.
  - [x] 2.2 Synthesize strict runtime `Zod` validation schemas and semantic field mappings.
  - [x] 2.3 Generate MCP JSON-RPC 2.0 `tools/list` definitions.
- [x] **Task 3: Bidirectional Wire Translator (`src/engine/translator.ts`)**
  - [x] 3.1 Build JSON-to-SOAP XML envelope marshaler and fault unmarshaler.
  - [x] 3.2 Build JSON-to-SQL parameterized query generator.
  - [x] 3.3 Build JSON-to-80-byte ASCII fixed-width record packer with `PIC 9(7)V99` implied decimals.
- [x] **Task 4: Exorcist Property-Based Testing Engine (`src/engine/exorcist-pbt.ts`)**
  - [x] 4.1 Configure `fast-check` arbitraries for round-trip parity invariants.
  - [x] 4.2 Implement deterministic Demon Bug injection and minimal counterexample shrinking.
  - [x] 4.3 Implement self-healing Auto-Patch state transition.
- [x] **Task 5: Sentinel Security Guardrails (`src/engine/sentinel.ts`)**
  - [x] 5.1 Enforce XXE (`<!ENTITY`), SQLi, and shell metacharacter sanitization.
  - [x] 5.2 Enforce Human-in-the-Loop (HITL) approval state machine for transactions exceeding $10,000.
- [x] **Task 6: "The Necromancer's Altar" Dashboard (`public/`)**
  - [x] 6.1 Build 4-zone Gothic-Cyberpunk UI with 1-Click Graveyard Presets.
  - [x] 6.2 Integrate live PBT fuzzing telemetry, shrinker inspector, and 3-layer MCP wire viewer.
  - [x] 6.3 Bundle standalone client-side fallback engine for zero-backend GitHub Pages portability.
```

### 4.4 `.kiro/steering/legacy-translation.md`
```markdown
# Kiro Steering Rules: Legacy Protocol Translation Standards

1. **Cryptic Identifier Normalization:**
   - Always map archaic uppercase identifiers (e.g., `INV_QTY_OH`, `ACCT_BAL_CENTS`, `PT_CLM_AMT`) to camelCase semantic names (`quantityOnHand`, `balanceUsd`, `claimAmountUsd`) in MCP tool schemas while preserving exact original names in the internal wire marshaler.
2. **COBOL Implied Decimal Handling (`PIC 9(n)V99`):**
   - Never use IEEE-754 floating-point division without rounding. Always convert currency values using `Math.round((value + Number.EPSILON) * 100)` before formatting fixed-width zero-padded strings.
3. **Julian Date Conversion (`YYDDD`):**
   - Convert 5-digit mainframe Julian dates (`89245`) into ISO-8601 strings (`1989-09-02`) before returning responses to MCP agents.
```

### 4.5 `.kiro/steering/security-exorcism.md`
```markdown
# Kiro Steering Rules: Sentinel Security & HITL Guardrails

1. **Zero-Trust Legacy Wrapping:**
   - Legacy SOAP and SQL systems lack modern input sanitization. Every synthesized MCP tool MUST pass arguments through `SentinelGuard.inspect()` before wire marshaling.
2. **Forbidden Patterns:**
   - Reject any payload matching XML External Entity declarations (`<!DOCTYPE`, `<!ENTITY`, `SYSTEM`), SQL tautologies (`' OR 1=1`, `UNION SELECT`, `DROP TABLE`), or null-byte injections (`\0`).
3. **Human-in-the-Loop (HITL) Financial Gate:**
   - Any operation marked `riskLevel: 'CRITICAL'` with an amount exceeding `hitlThreshold.maxAllowed` ($10,000 USD) MUST halt execution and require an explicit cryptographic approval token from the operator UI.
```

### 4.6 `.kiro/steering/gothic-ui-standards.md`
```markdown
# Kiro Steering Rules: "The Necromancer's Altar" UI Standards

1. **Intentional Dark Mode:** Use Abyssal Obsidian (`#08090C`) and Crypt Slate (`#10131A`) surfaces with Ectoplasm Neon (`#00FF9D`) and Necrotic Purple (`#A855F7`) accents.
2. **Tabular Telemetry:** All latency counters, byte offsets, and PBT run metrics must use `JetBrains Mono` with `font-variant-numeric: tabular-nums`.
3. **Zero Dead Interactions:** Every preset button, tab, PBT toggle, Auto-Patch button, and MCP scenario chip must produce immediate visual and data feedback.
```

### 4.7 `.kiro/hooks/graveyard-watcher.json`
```json
{
  "name": "Graveyard Corpse Auto-Resurrector",
  "description": "Automatically extracts AST, updates EARS specs, and synthesizes MCP tools whenever a legacy file is added or modified in /graveyard",
  "trigger": {
    "event": "onFileSave",
    "filePattern": "graveyard/**/*.*"
  },
  "actions": [
    {
      "type": "command",
      "command": "npm run resurrect:all"
    },
    {
      "type": "agentPrompt",
      "prompt": "A legacy artifact in /graveyard was updated. Re-parse the schema, update .kiro/specs/necro-engine/requirements.md using EARS syntax, and regenerate the MCP tool bindings."
    }
  ],
  "enabled": true
}
```

### 4.8 `.kiro/hooks/pbt-gatekeeper.json`
```json
{
  "name": "Exorcist PBT Parity Gatekeeper",
  "description": "Executes 100 fast-check property-based parity tests automatically whenever any adapter or translator code is saved",
  "trigger": {
    "event": "onFileSave",
    "filePattern": "src/engine/**/*.ts"
  },
  "actions": [
    {
      "type": "command",
      "command": "npm run test:pbt"
    }
  ],
  "enabled": true
}
```

### 4.9 `.kiro/settings/mcp.json`
```json
{
  "mcpServers": {
    "necro-mcp-lazarus": {
      "command": "npx",
      "args": ["tsx", "src/engine/mcp-stdio.ts"],
      "env": {
        "NECRO_GRAVEYARD_DIR": "./graveyard",
        "NECRO_SENTINEL_MODE": "STRICT",
        "NECRO_HITL_LIMIT_USD": "10000"
      },
      "disabled": false,
      "autoApprove": [
        "banking_get_balance",
        "inventory_query_stock",
        "claims_lookup_patient"
      ]
    }
  }
}
```

---

## PART 5: PRE-LOADED `/GRAVEYARD` ARTIFACT CONTENTS

Create these three files in `/graveyard/`:

### 5.1 `graveyard/corpse-01-banking-soap.xml`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- 1998 FIRST NATIONAL MAINFRAME CORE BANKING WSDL/SOAP SPECIFICATION -->
<definitions name="CoreBankingLegacyService"
  targetNamespace="urn:mainframe:banking:1998"
  xmlns:tns="urn:mainframe:banking:1998"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/">

  <message name="GetAccountBalanceRequest">
    <part name="ACCT_NUM_STR" type="xsd:string" doc="8-digit customer account number"/>
    <part name="ROUTING_ABA_CD" type="xsd:string" doc="9-digit ABA routing code"/>
  </message>
  <message name="GetAccountBalanceResponse">
    <part name="LEDGER_BAL_CENTS" type="xsd:long" doc="Current balance in integer cents"/>
    <part name="AVAIL_BAL_CENTS" type="xsd:long" doc="Available balance in integer cents"/>
    <part name="CCY_ISO_CD" type="xsd:string" doc="3-letter ISO currency"/>
  </message>

  <message name="ExecuteWireTransferRequest">
    <part name="SRC_ACCT_NUM" type="xsd:string" doc="Origin account number"/>
    <part name="DST_ACCT_NUM" type="xsd:string" doc="Beneficiary account number"/>
    <part name="XFER_AMT_USD" type="xsd:decimal" doc="Transfer amount in USD (HITL Gate > 10000)"/>
    <part name="WIRE_MEMO_TXT" type="xsd:string" doc="Payment remittance remarks"/>
  </message>
  <message name="ExecuteWireTransferResponse">
    <part name="FEDWIRE_REF_ID" type="xsd:string" doc="Mainframe settlement reference"/>
    <part name="SETTLE_STATUS_CD" type="xsd:string" doc="00=SETTLED, 99=FAULT"/>
    <part name="POSTED_CENTS" type="xsd:long" doc="Exact integer cents posted to ledger"/>
  </message>
</definitions>
```

### 5.2 `graveyard/corpse-02-inventory-dump.sql`
```sql
-- 2004 AS/400 MANUFACTURING WAREHOUSE DDL & STORED PROCEDURES
CREATE TABLE TBL_WH_INV_MSTR (
    SKU_CD_V2 VARCHAR(16) NOT NULL PRIMARY KEY, -- Part SKU Identifier
    PART_DESC_TXT VARCHAR(64) NOT NULL,         -- Nomenclature description
    INV_QTY_OH INT NOT NULL DEFAULT 0,          -- Quantity on hand
    REORD_THRSH_NUM INT NOT NULL DEFAULT 25,    -- Minimum reorder threshold
    UNIT_CST_USD DECIMAL(10, 2) NOT NULL,       -- Unit manufacturing cost USD
    LOC_WH_AISLE VARCHAR(12) NOT NULL           -- Physical warehouse bin location
);

-- PROCEDURE: SP_QUERY_STOCK (Inputs: @P_SKU_CD, @P_WH_AISLE)
-- PROCEDURE: SP_AUDIT_LOW_STOCK (Inputs: @P_MAX_RATIO)
-- PROCEDURE: SP_MUTATE_INV_QTY (Inputs: @P_SKU_CD, @P_DELTA_QTY, @P_AUTH_NOTE)
```

### 5.3 `graveyard/corpse-03-cobol-flatfile.dat`
```text
* 1989 IBM 3090 HEALTHCARE CLAIMS FIXED-WIDTH COPYBOOK & DATA LEDGER (80-BYTE)
* LAYOUT:
* BYTES 01-10 : PT-ID-NUM       PIC X(10)   [Patient Identifier]
* BYTES 11-15 : CLM-JUL-DT      PIC 9(05)   [Julian Date YYDDD]
* BYTES 16-23 : ICD9-DIAG-CD    PIC X(08)   [Diagnosis Code]
* BYTES 24-32 : CLM-AMT-CENTS   PIC 9(07)V99 [Claim Amount Implied Decimal]
* BYTES 33-33 : ADJ-STAT-FLG    PIC X(01)   [A=Approved, P=Pending, D=Denied]
* BYTES 34-80 : FILLER-MEMO     PIC X(47)   [Mainframe Operator Remarks]
PT0008841289245ICD410.9000145075ACORONARY CARE UNIT ADMISSION VERIFIED          
PT0009120489312ICD250.0000032050PROUTINE ENDOCRINE PANEL LAB CLAIM             
PT0007731989340ICD820.8001890000ATRAUMA ORTHOPEDIC SURGICAL INTERVENTION        
```

---

## PART 6: REPOSITORY STRUCTURE & EXECUTION CHECKLIST

```text
necro-mcp/
├── .kiro/
│   ├── specs/necro-engine/
│   │   ├── requirements.md
│   │   ├── design.md
│   │   └── tasks.md
│   ├── steering/
│   │   ├── legacy-translation.md
│   │   ├── security-exorcism.md
│   │   └── gothic-ui-standards.md
│   ├── hooks/
│   │   ├── graveyard-watcher.json
│   │   └── pbt-gatekeeper.json
│   └── settings/
│       └── mcp.json
├── graveyard/
│   ├── corpse-01-banking-soap.xml
│   ├── corpse-02-inventory-dump.sql
│   └── corpse-03-cobol-flatfile.dat
├── src/
│   ├── types/necro.ts
│   ├── engine/
│   │   ├── parser.ts
│   │   ├── synthesizer.ts
│   │   ├── translator.ts
│   │   ├── sentinel.ts
│   │   ├── exorcist-pbt.ts
│   │   ├── mcp-server.ts
│   │   └── mcp-stdio.ts
│   └── server.ts
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── tests/
│   ├── necro-engine.test.ts
│   └── exorcist.pbt.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

### Step-by-Step Build & Verification Plan
1. Initialize `package.json` with scripts:
   - `"start": "tsx src/server.ts"`
   - `"dev": "tsx watch src/server.ts"`
   - `"test": "vitest run"`
   - `"test:pbt": "vitest run tests/exorcist.pbt.test.ts"`
   - `"resurrect:all": "tsx src/engine/cli-resurrect.ts"`
2. Generate all 9 `.kiro/` files and all 3 `/graveyard` files with exact fidelity.
3. Implement the TypeScript backend modules in `src/engine/` and Express server in `src/server.ts`.
4. Build the complete "Necromancer's Altar" UI in `public/index.html`, `public/styles.css`, and `public/app.js` (including the embedded client-side engine so static hosting works out-of-the-box).
5. Write comprehensive unit and `fast-check` property-based tests in `tests/` and run `npm test` to confirm 100% pass rate.

---

## PART 7: 3-MINUTE HACKATHON DEMO VIDEO SCRIPT

* **0:00 – 0:25 | The Enterprise Problem:**
  "AI agents speak JSON and MCP, but the world's banks, hospitals, and supply chains still run on 1990s SOAP XML, legacy SQL, and 80-byte COBOL flat files. Rewriting mainframes takes years. **NecroMCP** resurrects them into verified MCP servers in seconds."
* **0:25 – 1:10 | Kiro Spec-Driven Resurrection:**
  Select **`1998 SOAP Core Bank`** in *The Necromancer's Altar*. Show the raw WSDL in the Graveyard panel, then switch to the **`.kiro/ Vault`** and **`Kiro EARS & Zod`** tabs to demonstrate how `.kiro/hooks` and `.kiro/steering` automatically synthesize EARS requirements, Zod schemas, and live MCP tools.
* **1:10 – 2:05 | Live Property-Based Exorcism & Counterexample Shrinking:**
  Click **`[⚡ Run PBT Exorcism]`**—100 randomized `fast-check` runs verify 100% parity. Next, toggle **`[🔥 Inject Demon Bug]`** and run again. Watch the UI flash crimson as `fast-check` catches an IEEE-754 float truncation bug, shrinks it in 6 steps to `{ amountUsd: 0.29 }`, and displays the exact root cause. Click **`[✨ Apply Auto-Patch & Re-Verify]`** to heal the adapter back to 100/100 green parity.
* **2:05 – 2:45 | Live MCP Agent Playground & Sentinel Guardrails:**
  Click Scenario 1 to execute a live wire transfer and inspect the 3-layer translation (`MCP JSON-RPC` $\rightarrow$ `<soapenv:Envelope>` $\rightarrow$ `Normalized JSON`). Click Scenario 2 (`$50,000 Transfer`) to show the **Sentinel HITL Gate** pausing execution for human approval, and Scenario 3 to watch **Sentinel Security** block an XXE/SQLi payload in real time.
* **2:45 – 3:00 | Closing:**
  Switch between the **2004 SQL Warehouse** and **1989 COBOL Ledger** presets to prove multi-era versatility. Conclude with how NecroMCP turns Kiro IDE into an enterprise legacy modernization powerhouse.