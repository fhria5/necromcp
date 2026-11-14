# Design — NecroMCP

## Architecture
Web UI "The Necromancer's Altar" (4 zones: telemetry bar, Graveyard + .kiro
inspector, Altar of Resurrection + PBT Exorcism, MCP playground + 3-layer wire
inspector) over the NecroMCP Core Engine (Node.js/TypeScript):
1. Parser Engine (SOAP/WSDL, SQL DDL, COBOL byte slicer)
2. Synthesizer (Zod codegen, EARS specgen, MCP schema builder)
3. Exorcist PBT Runner (fast-check arbitraries 100x, shrinking, auto-patcher)
4. Sentinel Guardrail (XXE/SQLi blocker, >$10k HITL gate)
5. Bidirectional Wire Translator (JSON <-> SOAP envelope, JSON <-> SQL,
   JSON <-> 80-byte COBOL)

Dual-mode: Mode A full-stack local (Express + TS, REST + MCP JSON-RPC);
Mode B static GitHub Pages fallback (embedded deterministic engine in
`public/app.js`, all presets / PBT / patching / wire translation run in-browser).

## Core types
`LegacyFormat = 'SOAP_XML' | 'SQL_DDL' | 'FIXED_WIDTH'`.
`NormalizedField { legacyName, semanticName, type, constraints, description }`.
`NormalizedOperation { opId, legacyAction, mcpToolName, description,
riskLevel, hitlThreshold?, inputs, outputs }`.
`NecroIntermediateSchema { artifactId, title, era, format, rawSource,
extractedAt, operations, generatedEarsSpec, generatedZodCode }`.
`PBTExorcismReport { artifactId, totalRuns, passedRuns, failedRuns, durationMs,
status: VERIFIED_PURE | DEMON_DETECTED | PATCHED, legacyAvgLatencyMs,
modernAvgLatencyMs, counterexample? }`.
`MCPToolCallOutcome { status: SUCCESS | BLOCKED_SECURITY | PENDING_HITL,
toolName, mcpRequestJson, legacyWirePayload, legacyRawResponse,
normalizedJsonResponse, latencyMs, securityAlert? }`.

## Demon Bug mechanics (deterministic)
When injected: currency adapter uses `Math.floor(amountUsd * 100)` (not
`Math.round`) and leaves XML `&` unescaped. `0.29 * 100 = 28.999...` becomes
28 cents vs 29 in the ledger; fast-check shrinks
`{ fromAcct, amountUsd: 1842.29, memo: "INV & TAX #9921" }` to
`{ amountUsd: 0.29, memo: "&" }`. Auto-patch applies
`Math.round((val + Number.EPSILON) * 100)` + XML entity escaping, re-verifies
100/100.

## API
- `GET /api/graveyard` — all pre-loaded corpses + custom uploads
- `POST /api/resurrect` — `{ artifactId, customSource?, format? }` → schema
- `POST /api/exorcise` — `{ artifactId, injectDemonBug, applyPatch }` → report
- `GET /api/kiro-files` — full `.kiro/` tree + contents
- `GET /mcp/tools` — JSON-RPC 2.0 `tools/list`
- `POST /mcp/call` — `{ artifactId, toolName, arguments, bypassHitlToken? }`
  → Sentinel → Translator → Simulator → normalized JSON

## UI tokens
`--bg-abyss #08090C`, `--bg-crypt #10131A`, `--bg-altar #161B26`,
`--ectoplasm #00FF9D`, `--necrotic #A855F7`, `--crimson #FF2A54`,
`--amber #F59E0B`, text `#F8FAFC` / `#94A3B8`.
Fonts: Space Grotesk (headers), Inter (UI), JetBrains Mono (code/wire logs).
