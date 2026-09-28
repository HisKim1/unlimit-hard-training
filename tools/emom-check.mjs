// EMOM 브라우저 검사. npm run preview 후: URL=http://127.0.0.1:4173/ node tools/emom-check.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

await mkdir('artifacts', { recursive: true });
const BASE = process.env.URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  page.setDefaultTimeout(40000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  async function open(query = '') {
    await page.goto(BASE + query, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
  }
  async function startWod(id) {
    await page.evaluate((id) => {
      const w = window.__wods.find((x) => x.id === id);
      const s = window.__game.scene.getScenes(true)[0];
      if (s.scene.key === 'Game' && s.paused) s.setPaused(false);
      s.scene.start('Game', { level: w.level });
    }, id);
    await page.waitForFunction((id) => window.__game.scene.isActive('Game') && window.__game.scene.getScene('Game').wod?.id === id, id);
  }
  async function tapProd(n) {
    const c = await page.locator('canvas').boundingBox();
    for (let i = 0; i < n; i++) {
      await page.touchscreen.tap(c.x + (608 / 720) * c.width, c.y + (1040 / 1280) * c.height);
      await page.waitForTimeout(130);
    }
  }
  const game = (fn) => page.evaluate(`(${fn})(window.__game.scene.getScene('Game'))`);
  async function resultText() {
    await page.waitForFunction(() => window.__game.scene.isActive('Result'));
    return page.evaluate(() => window.__game.scene.getScene('Result').children.list.filter((o) => o.type === 'Text').map((o) => o.text));
  }

  // ---------------- 칼수형: 실제 탭 5번 → 버피 → 같은 세션 이어감
  await open();
  await startWod('kalsu');
  await game((s) => { s.toast.box.setVisible(false); s.place('barbell', { x: 360, y: 900 }, -1); });
  await page.waitForFunction(() => window.__game.scene.getScene('Game').brain.state === 'EXERCISING');
  await page.waitForFunction(() => window.__game.scene.getScene('Game').emom.windowOpen);
  await game((s) => { s.brain.sessionProgress = 0; }); // 창 안에서 세션이 끝나지 않게
  assert.equal(await game((s) => s.hud.bellText.text.startsWith('🔔')), true);
  await tapProd(2);
  assert.equal(await game((s) => s.bellBanner.text.text), '🔔 버피! 2/5');
  await page.screenshot({ path: 'artifacts/emom-kalsu-bell.png' });
  await tapProd(3);
  await page.waitForFunction(() => window.__game.scene.getScene('Game').brain.state === 'BURPEE');
  const burpee = await game((s) => ({ p: s.brain.sessionProgress, target: s.brain.targetId, anim: s.view.animKey, label: s.view.labelText.text, banner: s.bellBanner.box.visible, burnout: s.brain.burnout }));
  assert.equal(burpee.anim, 'wj_burpee');
  assert.equal(burpee.label, '버피 5개');
  assert.equal(burpee.banner, false);
  assert.ok(burpee.burnout < 1, 'bell prods do not raise burnout');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'artifacts/emom-burpee.png' });
  await page.waitForFunction(() => window.__game.scene.getScene('Game').brain.state === 'EXERCISING');
  const resumed = await game((s) => ({ p: s.brain.sessionProgress, target: s.brain.targetId, label: s.view.labelText.text }));
  assert.equal(resumed.target, burpee.target);
  assert.ok(resumed.p >= burpee.p - 1e-9, 'session progress kept');
  assert.equal(resumed.label, '스러스터 20개');

  // ---------------- 창 도중 일시정지 → 멈춤, 4번만 누르면 탈락
  await page.waitForFunction(() => window.__game.scene.getScene('Game').emom.windowOpen);
  await tapProd(2);
  const frozen = await game((s) => { s.setPaused(true); return [s.emom.windowRemainingSec, s.emom.prodCount]; });
  await page.waitForTimeout(500);
  assert.deepEqual(await game((s) => [s.emom.windowRemainingSec, s.emom.prodCount]), frozen);
  await game((s) => s.setPaused(false));
  await tapProd(2);
  const kalsuFail = await resultText();
  assert.ok(kalsuFail.includes('벨을 놓쳤어요! 3초 안에 5번 재촉해야 해요.'), JSON.stringify(kalsuFail));
  await page.screenshot({ path: 'artifacts/emom-missed.png' });
  console.log('PASS Kalsu: real taps, banner count, burpee, resume same session, window pause, missed bell result');

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
