# NecroMCP — The Lazarus Protocol for Legacy Systems

Resurrection engine for Kiroween 2026 (category: **Resurrection**).
Feed it a legacy artifact — 1998 SOAP/WSDL banking, 2004 SQL warehouse DDL,
1989 COBOL 80-byte fixed-width ledger — and it resurrects it into a modern
REST API + live MCP server, then proves behavioral parity with Property-Based
Testing ("Exorcism": 100 fast-check runs, counterexample shrinking, auto-patch).

- **Status:** Phase 4 SELESAI 14 Nov — polish gothic final + persiapan uji HP.
  Demo live: https://fhria5.github.io/necromcp/ (favicon ☠ sendiri, tap target
  ≥44px di HP 390px, tanpa overflow horizontal, `:focus-visible` +
  `prefers-reduced-motion`; footer tetap menyebut simulator lokal).
  Tes: 143/143 vitest (129 lama + 14 baru Phase 4: polish/favicon/.kiro),
  Playwright E2E Phase 4 16/16 + Phase 3 25/25 + Phase 2 25/25,
  live curl terverifikasi. Phase 3 (PBT Exorcism + Demon Bug + Auto-Patch)
  tetap live: deck Exorcism di panel tengah — toggle Demon Bug, Run PBT
  100 run, counterexample ter-shrink {0.29, "&"}, Auto-Patch → 100/100
  hijau lagi; tool yang tertangkap dikarantina dari /mcp/tools dan
  /mcp/call sampai di-patch.
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
