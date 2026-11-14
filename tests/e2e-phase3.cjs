// Independent Playwright E2E for NecroMCP Phase 3 (PBT Exorcism deck, Mode B).
// Serves public/ via the local Express server (already running on :8932).
// Run: NODE_PATH=/home/hatch/workspace/shoppal-v2/node_modules node tests/e2e-phase3.cjs
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8932/';
let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('  PASS', name);
  } else {
    failed++;
    console.log('  FAIL', name, extra ? ':: ' + extra : '');
  }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const loc = m.location() && m.location().url ? ' @ ' + m.location().url : '';
      errors.push(m.text() + loc);
    }
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  console.log('Phase 3 E2E:');
  check('page title is Phase 4', (await page.title()).includes('Phase 4'), await page.title());
  check('footer mentions Phase 4 + PBT Exorcism', (await page.textContent('.footer')).includes('PBT Exorcism live'));
  check('node 4 shows Phase 4 before any run', (await page.textContent('#node-4 .node-state')).trim() === 'Phase 4');
  check('exorcism deck present with demon toggle + run button',
    (await page.$('#demon-toggle')) !== null && (await page.$('#exorcism-run')) !== null);
  check('auto-patch button hidden before any run', await page.isHidden('#exorcism-patch'));

  // Clean run on the default corpse (SOAP): VERIFIED_PURE, node 4 updates.
  await page.click('#exorcism-run');
  await page.waitForTimeout(300);
  const cleanResult = await page.textContent('#exorcism-result');
  check('clean run: VERIFIED_PURE 100/100', cleanResult.includes('VERIFIED_PURE') && cleanResult.includes('100/100'), cleanResult.slice(0, 200));
  check('clean run shows latency telemetry', cleanResult.includes('Legacy') && cleanResult.includes('adapter'), cleanResult.slice(0, 300));
  check('node 4 shows VERIFIED_PURE after clean run', (await page.textContent('#node-4 .node-state')).trim() === 'VERIFIED_PURE');
  check('progress bar at 100% after clean run', (await page.$eval('#exorcism-progress-fill', (el) => el.style.width)) === '100%');

  // Demon run: toggle on, run, expect DEMON_DETECTED + shrunk counterexample.
  await page.check('#demon-toggle');
  await page.click('#exorcism-run');
  await page.waitForTimeout(300);
  const demonResult = await page.textContent('#exorcism-result');
  check('demon run: DEMON_DETECTED', demonResult.includes('DEMON_DETECTED'), demonResult.slice(0, 200));
  check('demon run: shrunk counterexample {0.29, "&"}',
    demonResult.includes('"amountUsd":0.29') && demonResult.includes('"memo":"&"'),
    demonResult.slice(0, 600));
  check('demon run: shows legacy 29 vs adapter 28 (or bare & error)',
    demonResult.includes('29') && (demonResult.includes('28') || demonResult.includes('bare')),
    demonResult.slice(0, 600));
  check('demon run: tool quarantined', demonResult.includes('banking_wire_transfer'), demonResult.slice(0, 600));
  check('node 4 shows DEMON_DETECTED', (await page.textContent('#node-4 .node-state')).trim() === 'DEMON_DETECTED');
  check('auto-patch button visible after demon detection', await page.isVisible('#exorcism-patch'));

  // Quarantine: the wire tool must refuse while blocked.
  await page.click('#scenario-standard');
  await page.waitForTimeout(200);
  const blockedResult = await page.textContent('#tool-result');
  check('quarantined wire tool is BLOCKED in the playground', blockedResult.includes('DEMON_DETECTED'), blockedResult.slice(0, 300));

  // Auto-Patch: 100/100 green again, tool restored.
  await page.click('#exorcism-patch');
  await page.waitForTimeout(300);
  const patchedResult = await page.textContent('#exorcism-result');
  check('auto-patch: PATCHED 100/100', patchedResult.includes('PATCHED') && patchedResult.includes('100/100'), patchedResult.slice(0, 200));
  check('auto-patch shows the applied fix', patchedResult.includes('Math.round'), patchedResult.slice(0, 400));
  check('node 4 shows PATCHED', (await page.textContent('#node-4 .node-state')).trim() === 'PATCHED');
  check('auto-patch button hidden after patch', await page.isHidden('#exorcism-patch'));

  await page.click('#scenario-standard');
  await page.waitForTimeout(200);
  const restoredResult = await page.textContent('#tool-result');
  check('wire $450 settles again after patch', restoredResult.includes('"postedCents": 45000'), restoredResult.slice(0, 200));

  // COBOL corpse: demon run detects the same 0.29 bug.
  await page.click('#preset-cobol-ledger');
  await page.waitForTimeout(200);
  check('node 4 resets to Phase 4 for a corpse with no run yet', (await page.textContent('#node-4 .node-state')).trim() === 'Phase 4');
  await page.click('#exorcism-run');
  await page.waitForTimeout(300);
  const cobolResult = await page.textContent('#exorcism-result');
  check('COBOL demon run: DEMON_DETECTED with claimAmountUsd 0.29',
    cobolResult.includes('DEMON_DETECTED') && cobolResult.includes('"claimAmountUsd":0.29'),
    cobolResult.slice(0, 600));

  // Demon off again: clean COBOL run is VERIFIED_PURE.
  await page.uncheck('#demon-toggle');
  await page.click('#exorcism-run');
  await page.waitForTimeout(300);
  const cobolClean = await page.textContent('#exorcism-result');
  check('COBOL clean run: VERIFIED_PURE 100/100', cobolClean.includes('VERIFIED_PURE') && cobolClean.includes('100/100'), cobolClean.slice(0, 200));

  // Known environmental noise (also present in Phase 1/2, not regressions):
  // Google Fonts is unreachable from the sandbox, and there is no favicon.
  const knownNoise = (t) =>
    t.includes('ERR_TUNNEL_CONNECTION_FAILED') ||
    t.includes('fonts.g') ||
    t.includes('favicon.ico');
  check(
    'no unexpected page errors',
    errors.filter((e) => !knownNoise(e)).length === 0,
    errors.join(' | ').slice(0, 500),
  );

  await browser.close();
  console.log(`\nPhase 3 E2E: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
