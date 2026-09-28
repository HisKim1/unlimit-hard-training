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
    prod(0.005);
    const boundary = s.tweens.getTweensOf(s.chimpVignette).length;
    prod(0.0049, false);
    const cooldown = s.tweens.getTweensOf(s.chimpVignette).length;
    s.setPaused(true); prod(0); const paused = s.tweens.getTweensOf(s.chimpVignette).length; s.setPaused(false);
    s.progress.done.set('barbell', 3);
    const before = [...s.progress.done]; prod(0.0049);
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
  // Game 씬은 재시작해도 같은 인스턴스를 재사용하므로 (wod.id === 'fran' 도 이전 씬에서 이미 참이라 그것만으로는
  // 재시작 완료를 구분 못 한다). create() 가 매번 this.brain = new Brain(...) 로 새 인스턴스를 만드는 것을
  // 마커로 삼아, 이전 brain 객체가 아닌 새 brain 이 생겼는지로 재시작 완료를 확인한다.
  await page.evaluate(() => { window.__oldBrain = window.__game.scene.getScene('Game').brain; });
  await page.evaluate(() => window.__game.scene.getScene('Game').scene.start('Game', { level: 1 }));
  await page.waitForFunction(() => {
    const s = window.__game.scene.getScene('Game');
    return !!s.brain && s.brain !== window.__oldBrain && s.wod?.id === 'fran';
  });
  await page.evaluate(() => window.__game.scene.getScene('Game').place('barbell', { x: 360, y: 900 }, -1));
  await page.waitForFunction(() => window.__game.scene.getScene('Game').brain.state === 'EXHAUSTED', null, { timeout: 20000 });
  await page.waitForFunction(() => window.__game.scene.getScene('Game').toast.text.text === '원장님이 너무 나태합니다!\n빨리 재촉 안 하면 침팬지가 등장할수도?!', null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').toast.warningLabel.visible), true);
  await page.screenshot({ path: 'artifacts/lazy-warning.png' });
  await page.waitForFunction(() => window.__game.scene.getScene('Game').brain.chimpPunished, null, { timeout: 4000 });
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').toast.text.text), '침팬지 등장 확률이 1%로 올랐습니다!');
  const punished = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game'), original = s.chimpRoll;
    function roll(r) {
      s.brain.lastProdMs = -Infinity;
      s.chimpRoll = () => r;
      try { s.onProd(); } finally { s.chimpRoll = original; }
      return s.tweens.getTweensOf(s.chimpVignette).length;
    }
    const at = roll(0.01);
    const below = roll(0.0099);
    return { at, below };
  });
  assert.deepEqual(punished, { at: 0, below: 1 });
  assert.deepEqual(errors, []);
  console.log('PASS 0.5% boundary, lazy warning, 1% after grace');
} finally { await browser.close(); }
