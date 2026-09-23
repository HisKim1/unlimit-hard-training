import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.URL || 'http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
  await page.evaluate(() => window.__game.scene.getScene('Title').scene.start('Game', { level: 1 }));
  await page.waitForFunction(() => window.__game.scene.isActive('Game'));
  const result = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game'), original = s.chimpRoll;
    function prod(r, ready = true) {
      if (ready) s.brain.lastProdMs = -Infinity;
      s.chimpRoll = () => r;
      try { s.onProd(); } finally { s.chimpRoll = original; }
    }
    prod(0.001);
    const boundary = s.tweens.getTweensOf(s.chimpVignette).length;
    prod(0.0009, false);
    const cooldown = s.tweens.getTweensOf(s.chimpVignette).length;
    s.setPaused(true); prod(0); const paused = s.tweens.getTweensOf(s.chimpVignette).length; s.setPaused(false);
    s.progress.done.set('barbell', 3);
    const before = [...s.progress.done]; prod(0.0009);
    window.pulses = 0;
    s.tweens.getTweensOf(s.chimpVignette)[0].on('yoyo', () => window.pulses++);
    const message = s.toast.text.text;
    prod(0.99);
    return { boundary, cooldown, paused, message, held: s.toast.text.text === message, before, after: [...s.progress.done] };
  });
  assert.equal(result.boundary, 0); assert.equal(result.cooldown, 0); assert.equal(result.paused, 0);
  assert.match(result.message, /^전방에 침팬지 출현!\n원장님이 개수를 까먹었습니다!\n차감: 바벨 −[1-3]$/);
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').toast.warningLabel.visible), true);
  assert.equal(result.held, true);
  const lost = result.before.reduce((n, [, v]) => n + v, 0) - result.after.reduce((n, [, v]) => n + v, 0);
  assert.ok(lost >= 1 && lost <= 3);
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').toolbar.items.find(i => i.id === 'barbell').highlight), true);
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'artifacts/chimp-warning.png' });
  const alpha = await page.evaluate(() => { const s = window.__game.scene.getScene('Game'); s.setPaused(true); return s.chimpVignette.alpha; });
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').chimpVignette.alpha), alpha);
  await page.evaluate(() => window.__game.scene.getScene('Game').setPaused(false));
  await page.waitForFunction(() => window.__game.scene.getScene('Game').tweens.getTweensOf(window.__game.scene.getScene('Game').chimpVignette).length === 0);
  assert.equal(await page.evaluate(() => window.pulses), 3);
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').chimpVignette.alpha), 0);
  assert.deepEqual(errors, []);
  console.log('PASS 0.1% boundary, cooldown/paused rejection, 1-3 completed counts deducted, highlight restored, three fades, pause/resume, cleanup');
} finally { await browser.close(); }
