// Phase 4 polish checks: favicon, Phase 4 markers, honesty footer,
// accessibility CSS, and .kiro completeness. Static file checks only.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

describe('Phase 4 polish', () => {
  it('favicon exists (SVG + ICO) and is linked from index.html', () => {
    expect(fs.existsSync(path.join(ROOT, 'public/favicon.svg'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'public/favicon.ico'))).toBe(true);
    const html = read('public/index.html');
    expect(html).toContain('href="favicon.ico"');
    expect(html).toContain('href="favicon.svg"');
  });

  it('favicon.ico is a real ICO file, not an empty stub', () => {
    const ico = fs.readFileSync(path.join(ROOT, 'public/favicon.ico'));
    expect(ico.length).toBeGreaterThan(100);
    // ICO magic: reserved 0, type 1 (icon), 1 image
    expect(ico[0]).toBe(0);
    expect(ico[1]).toBe(0);
    expect(ico[2]).toBe(1);
    expect(ico[3]).toBe(0);
  });

  it('page title, brand, pill, node 4 and footer all say Phase 4', () => {
    const html = read('public/index.html');
    expect(html).toContain('NecroMCP Phase 4</title>');
    expect(html).toContain('Phase 4</p>'); // brand-sub
    expect(html).toContain('PBT ENGINE: PHASE 4');
    expect(html).toContain('<span class="node-state">Phase 4</span>');
    expect(html).toContain('NecroMCP Phase 4 &middot;');
    expect(html).not.toContain('Phase 3');
  });

  it('footer keeps the honesty line (local simulator, not a real mainframe)', () => {
    const html = read('public/index.html');
    expect(html).toContain('Simulator lokal');
    expect(html).toContain('bukan mainframe sungguhan');
    expect(html).toContain('Local simulator, not a real mainframe');
  });

  it('browser engine resets node 4 to Phase 4', () => {
    const app = read('public/app.js');
    expect(app).toContain("setNodeState(4, 'locked', 'Phase 4')");
  });

  it('viewport meta + font fallbacks are present', () => {
    const html = read('public/index.html');
    expect(html).toContain('width=device-width, initial-scale=1.0');
    const css = read('public/styles.css');
    expect(css).toContain('"Inter", system-ui, -apple-system');
    expect(css).toContain('"Space Grotesk", "Inter", system-ui');
    expect(css).toContain('"JetBrains Mono", ui-monospace');
  });

  it('CSS has a visible focus style for keyboard users', () => {
    const css = read('public/styles.css');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('outline: 2px solid var(--ectoplasm)');
  });

  it('CSS respects prefers-reduced-motion', () => {
    const css = read('public/styles.css');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('transition: none');
  });

  it('tap targets are >=44px tall (tabs + primary buttons)', () => {
    const css = read('public/styles.css');
    // .tab padding 12px top/bottom + ~13px font + line-height ~1.5 => ~44px
    expect(css).toMatch(/\.tab \{\n  flex: 1;\n  padding: 12px 6px;/);
    // .btn-call padding 14px top/bottom + 15px font => ~45px
    expect(css).toMatch(/\.btn-call \{\n  padding: 14px 16px;/);
    // demon toggle checkbox is 20px inside a clickable label
    expect(css).toContain('width: 20px; height: 20px;');
  });

  it('responsive breakpoints stack the 3-column layout on phones', () => {
    const css = read('public/styles.css');
    expect(css).toContain('@media (max-width: 1180px)');
    expect(css).toContain('@media (max-width: 820px)');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(css).toContain('grid-template-columns: repeat(2, 1fr)');
  });

  it('all 9 .kiro files exist', () => {
    const files = [
      '.kiro/specs/necro-engine/requirements.md',
      '.kiro/specs/necro-engine/design.md',
      '.kiro/specs/necro-engine/tasks.md',
      '.kiro/steering/legacy-translation.md',
      '.kiro/steering/security-exorcism.md',
      '.kiro/steering/gothic-ui-standards.md',
      '.kiro/hooks/graveyard-watcher.json',
      '.kiro/hooks/pbt-gatekeeper.json',
      '.kiro/settings/mcp.json',
    ];
    for (const f of files) expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
  });

  it('.kiro settings point at the real HTTP MCP endpoint, not a missing stdio file', () => {
    const mcp = JSON.parse(read('.kiro/settings/mcp.json'));
    const server = mcp.mcpServers['necro-mcp-lazarus'];
    expect(server.url).toContain('/mcp/call');
    expect(server.command).toBeUndefined();
    expect(fs.existsSync(path.join(ROOT, 'src/engine/mcp-stdio.ts'))).toBe(false);
  });

  it('.kiro requirements describe the implemented REST surface', () => {
    const reqs = read('.kiro/specs/necro-engine/requirements.md');
    expect(reqs).toContain('POST /api/resurrect');
    expect(reqs).toContain('POST /api/exorcise');
    // The old route must not be presented as implemented anymore; it may only
    // appear inside the Phase 4 correction note explaining it never existed.
    expect(reqs).not.toContain('mount REST endpoints under');
    expect(reqs).toContain('never implemented');
  });

  it('tasks.md records Phase 4 as done', () => {
    const tasks = read('.kiro/specs/necro-engine/tasks.md');
    expect(tasks).toContain('Phase 4');
    expect(tasks).toContain('7.1');
  });
});
