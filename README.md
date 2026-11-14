# NecroMCP — The Lazarus Protocol for Legacy Systems

Resurrection engine for Kiroween 2026 (category: **Resurrection**).
Feed it a legacy artifact — 1998 SOAP/WSDL banking, 2004 SQL warehouse DDL,
1989 COBOL 80-byte fixed-width ledger — and it resurrects it into a modern
REST API + live MCP server, then proves behavioral parity with Property-Based
Testing ("Exorcism": 100 fast-check runs, counterexample shrinking, auto-patch).

- **Status:** Phase 2 SELESAI 14 Nov — 3 corpse + MCP + Sentinel + HITL.
  Demo live: https://fhria5.github.io/necromcp/ (ketiga preset jalan end-to-end
  di browser; 3 skenario playground: eksekusi standar, HITL $50.000,
  serangan XXE/SQLi yang diblokir Sentinel).
  Tes: 100/100 vitest (42 Phase 1 + 58 Phase 2), Playwright E2E + live curl
  terverifikasi.
- **Build rule:** build langsung di Muse atas perintah user 'Langsung jalan'
  (14 Nov ~18:27); Kiro Web TIDAK dipakai untuk build.
- **Honesty rule:** the "mainframes" are local simulators, not real mainframes.
  The write-up must say so plainly. The demo proves the pipeline
  (parse → AST → MCP → PBT), not access to a real mainframe.
- **Spec:** `SPEK.md` (user-supplied master blueprint, verbatim).
- **Plan:** `rencana-per-phase.md`.

## Layout

```
.kiro/specs/necro-engine/   requirements.md (EARS), design.md, tasks.md
.kiro/steering/             legacy-translation, security-exorcism, gothic-ui-standards
.kiro/hooks/                graveyard-watcher, pbt-gatekeeper
.kiro/settings/mcp.json     necro-mcp-lazarus MCP server
graveyard/                  corpse-01-banking-soap.xml
                            corpse-02-inventory-dump.sql
                            corpse-03-cobol-flatfile.dat
```
