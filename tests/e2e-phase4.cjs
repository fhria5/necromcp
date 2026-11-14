// Independent Playwright E2E for NecroMCP Phase 4 (polish + responsive + a11y).
// Serves public/ via the local Express server (already running on :8932).
// Run: NODE_PATH=/home/hatch/workspace/shoppal-v2/node_modules node tests/e2e-phase4.cjs
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

  // ---- Desktop 1280px ----
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  desktop.on('pageerror', (e) => errors.push(String(e)));
  desktop.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const faviconResp = await desktop.goto(BASE + 'favicon.ico');
  check('favicon.ico serves HTTP 200 (no more 404)', faviconResp && faviconResp.status() === 200,
    faviconResp && String(faviconResp.status()));
  await desktop.goto(BASE, { waitUntil: 'domcontentloaded' });
  await desktop.waitForTimeout(500);
  check('desktop: title is Phase 4', (await desktop.title()).includes('Phase 4'), await desktop.title());
  check('desktop: footer says Phase 4 + simulator honesty',
    (await desktop.textContent('.footer')).includes('NecroMCP Phase 4') &&
    (await desktop.textContent('.footer')).includes('not a real mainframe'));
  const desk = await desktop.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    cols: getComputedStyle(document.querySelector('.layout')).gridTemplateColumns.split(' ').length,
  }));
  check('desktop: no horizontal overflow', desk.scrollW <= desk.innerW, JSON.stringify(desk));
  check('desktop: 3-column layout', desk.cols === 3, JSON.stringify(desk));

  // ---- Phone 390px ----
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  phone.on('pageerror', (e) => errors.push(String(e)));
  await phone.goto(BASE, { waitUntil: 'domcontentloaded' });
  await phone.waitForTimeout(500);
  const mob = await phone.evaluate(() => {
    const h = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.getBoundingClientRect().height : -1;
    };
    return {
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      tabH: h('.tab'),
      presetH: h('.preset'),
      btnCallH: h('.btn-call'),
      scenarioH: h('.scenario-btn'),
      exorciseH: h('#exorcism-run'),
      pipelineCols: getComputedStyle(document.querySelector('.pipeline')).gridTemplateColumns.split(' ').length,
      layoutCols: getComputedStyle(document.querySelector('.layout')).gridTemplateColumns.split(' ').length,
      footerVisible: (() => {
        const r = document.querySelector('.footer').getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })(),
    };
  });
  check('phone 390px: no horizontal overflow', mob.scrollW <= mob.innerW, JSON.stringify(mob));
  check('phone 390px: single-column layout', mob.layoutCols === 1, JSON.stringify(mob));
  check('phone 390px: pipeline is 2 columns', mob.pipelineCols === 2, JSON.stringify(mob));
  check('phone 390px: tab tap target >= 44px', mob.tabH >= 44, 'tabH=' + mob.tabH);
  check('phone 390px: preset tap target >= 44px', mob.presetH >= 44, 'presetH=' + mob.presetH);
  check('phone 390px: Call Tool button >= 44px', mob.btnCallH >= 44, 'btnCallH=' + mob.btnCallH);
  check('phone 390px: scenario button >= 44px', mob.scenarioH >= 44, 'scenarioH=' + mob.scenarioH);
  check('phone 390px: Run PBT button >= 44px', mob.exorciseH >= 44, 'exorciseH=' + mob.exorciseH);
  check('phone 390px: footer renders', mob.footerVisible, JSON.stringify(mob));

  // Keyboard focus must be visible (focus-visible rule).
  await phone.focus('#preset-soap-bank');
  const focusOutline = await phone.evaluate(() => {
    const el = document.querySelector('#preset-soap-bank');
    const cs = getComputedStyle(el);
    return cs.outlineWidth + ' ' + cs.outlineStyle;
  });
  check('phone: focused preset shows a visible outline', !focusOutline.startsWith('0px'), focusOutline);

  // Google Fonts unreachable in the sandbox is known environmental noise;
  // favicon.ico must NOT appear in errors anymore.
  const knownNoise = (t) => t.includes('ERR_TUNNEL_CONNECTION_FAILED') || t.includes('fonts.g');
  check(
    'no unexpected page errors (favicon 404 is gone)',
    errors.filter((e) => !knownNoise(e)).length === 0,
    errors.join(' | ').slice(0, 500),
  );

  await browser.close();
  console.log(`\nPhase 4 E2E: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
