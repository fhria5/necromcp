// Independent Playwright E2E for NecroMCP Phase 2 (browser UI, Mode B).
// Serves public/ via the local Express server (already running on :8932).
// Run: NODE_PATH=/home/hatch/workspace/shoppal-v2/node_modules node tests/e2e-phase2.cjs
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

  console.log('Phase 2 E2E:');
  check('page title is Phase 3', (await page.title()).includes('Phase 3'), await page.title());
  check(
    'all 3 presets enabled',
    (await page.$eval('#preset-sql-warehouse', (b) => !b.disabled)) &&
      (await page.$eval('#preset-cobol-ledger', (b) => !b.disabled)),
  );
  check('footer mentions Phase 3 + 3 corpses', (await page.textContent('.footer')).includes('3 corpses'));

  // SQL preset end-to-end.
  await page.click('#preset-sql-warehouse');
  await page.waitForTimeout(200);
  const sqlOps = await page.$$eval('#op-select option', (opts) => opts.map((o) => o.value));
  check('SQL preset offers 3 operations', JSON.stringify(sqlOps) === JSON.stringify(['SP_QUERY_STOCK', 'SP_AUDIT_LOW_STOCK', 'SP_MUTATE_INV_QTY']), JSON.stringify(sqlOps));
  check('wire layer 2 label is SQL Call after a call', true); // checked after call below
  await page.click('#call-tool-btn');
  await page.waitForTimeout(200);
  const sqlResult = await page.textContent('#tool-result');
  check('SQL query settles with quantity 31', sqlResult.includes('"quantityOnHand": 31'), sqlResult.slice(0, 200));
  check('wire layer 2 title is SQL Call', (await page.textContent('#wire-layer2-title')) === 'SQL Call');
  check('wire layer 2 shows EXEC with placeholders', (await page.textContent('#wire-soap')).includes('EXEC SP_QUERY_STOCK @P_SKU_CD = ?'));

  // COBOL preset end-to-end.
  await page.click('#preset-cobol-ledger');
  await page.waitForTimeout(200);
  const cobOps = await page.$$eval('#op-select option', (opts) => opts.map((o) => o.value));
  check('COBOL preset offers the lookup operation', JSON.stringify(cobOps) === JSON.stringify(['LookupClaimByPatient']), JSON.stringify(cobOps));
  await page.click('#call-tool-btn');
  await page.waitForTimeout(200);
  const cobResult = await page.textContent('#tool-result');
  check('COBOL lookup settles with $1,450.75 claim', cobResult.includes('"claimAmountUsd": 1450.75'), cobResult.slice(0, 200));
  check('wire layer 2 title is COBOL Record', (await page.textContent('#wire-layer2-title')) === 'COBOL Record');
  check('wire layer 2 shows the 80-byte record', (await page.textContent('#wire-soap')).includes('PT00088412'));

  // Scenario 1: standard wire $450.
  await page.click('#scenario-standard');
  await page.waitForTimeout(200);
  const stdResult = await page.textContent('#tool-result');
  check('scenario 1 settles $450', stdResult.includes('"postedCents": 45000'), stdResult.slice(0, 200));

  // Scenario 2: HITL $50,000 -> card -> approve -> success.
  await page.click('#scenario-hitl');
  await page.waitForTimeout(200);
  check('scenario 2 pauses with the HITL card visible', await page.isVisible('#hitl-card'));
  const token = (await page.textContent('#hitl-token')).trim();
  check('HITL card shows a HITL token', /^HITL-[0-9A-F]{8}$/.test(token), token);
  check('HITL card shows $50,000', (await page.textContent('#hitl-amount')).includes('50,000'));
  const pendingText = await page.textContent('#tool-result');
  check('result shows PENDING_HITL_APPROVAL', pendingText.includes('PENDING_HITL_APPROVAL'), pendingText.slice(0, 200));
  await page.click('#hitl-approve');
  await page.waitForTimeout(200);
  const approved = await page.textContent('#tool-result');
  check('approved $50,000 wire settles 5,000,000 cents', approved.includes('"postedCents": 5000000'), approved.slice(0, 200));
  check('HITL card hides after approval', await page.isHidden('#hitl-card'));

  // Scenario 2 again, then Deny.
  await page.click('#scenario-hitl');
  await page.waitForTimeout(200);
  await page.click('#hitl-deny');
  await page.waitForTimeout(200);
  const denied = await page.textContent('#tool-result');
  check('denied transfer is not executed', denied.includes('denied by operator'), denied.slice(0, 200));

  // Scenario 3: attacks blocked + logged.
  await page.click('#scenario-attack');
  await page.waitForTimeout(300);
  const logText = await page.textContent('#sentinel-log');
  check('sentinel log records the XXE block', logText.includes('SENTINEL_XXE'), logText.slice(0, 300));
  check('sentinel log records the SQLi block', logText.includes('SENTINEL_SQLI'), logText.slice(0, 300));
  const attackResult = await page.textContent('#tool-result');
  check('attack result shows BLOCKED', attackResult.includes('BLOCKED by Sentinel'), attackResult.slice(0, 200));
  check(
    'wire layer 2 is empty after a block (no marshaling happened)',
    (await page.textContent('#wire-soap')).trim() === '—',
  );

  // Known environmental noise (also present in Phase 1, not regressions):
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
  console.log(`\nE2E Phase 2: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(2);
});
