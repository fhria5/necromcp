# Rencana Per Phase — NecroMCP (Kiroween, Resurrection)

**Keputusan user 14 Nov ~18:23:** NecroMCP MENGGANTIKAN SignBridge sebagai app
kedua Kiroween. SignBridge + FoundIt + SkillSwap jadi cadangan.
**Aturan mengikat:** build HANYA setelah FreshTrack dinyatakan sempurna oleh user.
**Koreksi atas blueprint:** klaim "selesai 100% dalam satu run tanpa jeda (YOLO)"
DITOLAK — scope ini (dual-mode server + fallback statis) terlalu besar untuk
one-shot. Build bertahap per phase, seperti FreshTrack, tiap phase punya exit
criteria dan verifikasi live.
**Batas jujur (wajib di write-up):** "mainframe" adalah simulator lokal, bukan
mainframe sungguhan. Demo membuktikan pipeline (parse → AST → MCP → PBT),
bukan akses ke sistem legacy nyata. Guardrail Sentinel + HITL adalah aturan
aplikasi demo, bukan sertifikasi keamanan.

## Phase 0 — Spek + repo (SELESAI 14 Nov)
Spek blueprint disalin verbatim jadi SPEK.md; 9 file .kiro + 3 file graveyard
ditulis; repo https://github.com/fhria5/necromcp dibuat (MIT, TANPA kode aplikasi).
Exit: semua file ter-push + terverifikasi via GitHub API.

## Phase 1 — MVP: 1 corpse end-to-end (SELESAI 14 Nov ~18:35)
Parser SOAP + AST + REST + UI skeleton (Mode B statis dulu: engine di browser).
Exit TERCAPAI: preset "1998 SOAP Core Bank" jalan end-to-end di browser: pilih corpse →
lihat AST → panggil 1 tool → lihat wire payload + JSON.
- Tes: **42/42 vitest lolos** (parser 8, translator 7, simulator 7, synthesizer 7,
  server 8, browser-engine parity 5). `tsc` bersih.
- Playwright E2E independen (server Express lokal): **13/13 lolos** — preset →
  AST → EARS & Zod → call tool → 3 layer wire (MCP JSON, SOAP envelope, JSON hasil).
- Live curl (server lokal): health OK, resurrect AST 2 tool, `mcp/call` balance
  SUCCESS 483433/480933/USD, wire $450 SUCCESS `FED00047025` 45000 sen, argumen
  salah → 400, `GET /mcp/tools` daftar 2 tool + JSON Schema.
- Demo live: https://fhria5.github.io/necromcp/ (Pages, source `docs/` — salinan
  `public/` yang dibuat ulang tiap deploy).
- Catatan build: parser sempat kehilangan `XFER_AMT_USD` karena `>` di dalam
  `doc="...Gate > 10000"` — regex `<part>` diperbaiki agar tahan `>` dalam atribut
  ber-quote (ketemu lewat tes, bukan laporan user).

## Phase 2 — 3 corpse + MCP + Sentinel + HITL
Translator JSON↔SOAP/SQL/COBOL, MCP tools/list + tools/call, guardrail Sentinel
(XXE/SQLi block), gate HITL >$10.000, 3 skenario playground.
Exit: 3 skenario (eksekusi standar, HITL $50.000, serangan XXE/SQLi) jalan live.

## Phase 3 — PBT Exorcism + Demon Bug + Auto-Patch
fast-check 100 run, shrinking counterexample, Demon Bug toggle, auto-patch +
re-verify 100/100.
Exit: bug 0.29 ter-shrink ke minimal counterexample + patch mengembalikan
100/100, terverifikasi di browser.

## Phase 4 — Polish + uji HP user
.kiro lengkap + terverifikasi, UI gothic final, tes regresi, uji HP user.
Exit: user menyatakan sempurna.

## Phase 5 — Video + submit
Video <3 mnt YouTube Public (naskah ada di SPEK.md Part 7), submit kategori
Resurrection. Target 30 Nov–2 Des; deadline 5 Des 2026 06:00 WITA.
Catatan aturan: satu proyek hanya bisa menang 1 Overall ATAU 1 Category prize
(+ bonus prize tak terbatas) — target "Grand + Resurrection + Startup" di spek
adalah aspirasi, bukan ketiganya sekaligus.
