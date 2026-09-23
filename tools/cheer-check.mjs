import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.URL || 'http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
  await page.evaluate(() => window.__game.scene.getScene('Title').scene.start('Game', {}));
  await page.waitForFunction(() => window.__game.scene.isActive('Game'));
  const canvas = await page.locator('canvas').boundingBox();
  await page.touchscreen.tap(canvas.x + 112 / 720 * canvas.width, canvas.y + 1040 / 1280 * canvas.height);
  const state = () => page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    return { text: s.cheerToast.text.text, visible: s.cheerToast.box.visible, alpha: s.cheerToast.box.alpha,
      cooldown: s.brain.cheerCooldown, x: s.cheerBtn.x, y: s.cheerBtn.y,
      bottom: s.cheerToast.box.getBounds().bottom, toastTop: s.toast.box.getBounds().top };
  });
  const first = await state();
  assert.match(first.text, /^미모반 (김희수|성지윤|남장원|정류진|정은우|박소영|변세정|박민혁|성승용|이후영|정수민|정우형|성혜원|이화진|최정균):\n/);
  assert.ok(first.cooldown > 4 && first.cooldown <= 5);
  assert.equal(first.y, 1040); assert.equal(first.x, 112);
  assert.ok(first.bottom < first.toastTop);
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.onProd(); s.cheerBtn.emit('pointerdown'); s.setPaused(true);
  });
  const paused = await state();
  await page.waitForTimeout(300);
  assert.equal((await state()).cooldown, paused.cooldown);
  assert.equal((await state()).text, first.text);
  await page.evaluate(() => window.__game.scene.getScene('Game').setPaused(false));
  await page.waitForTimeout(2300);
  assert.equal((await state()).alpha, 1);
  await page.screenshot({ path: 'artifacts/cheer.png' });
  await page.waitForTimeout(1400);
  assert.equal((await state()).visible, false);
  const layout = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.cheerToast.show('미모반 김희수:\n원장님 멈추면 안돼 아직 라운드 더 남앗어', 3000, '#173826');
    s.toast.show('원장님: 마지막 한 세트라면서요. 아까도 마지막이었잖아요.');
    const b = s.cheerToast.box.getBounds();
    return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, toastTop: s.toast.box.getBounds().top };
  });
  assert.ok(layout.top > 150 && layout.bottom < layout.toastTop && layout.left >= 0 && layout.right <= 720);
  await page.waitForTimeout(180);
  await page.screenshot({ path: 'artifacts/cheer-long.png' });
  await page.waitForFunction(() => !window.__game.scene.getScene('Game').cheerToast.box.visible);
  await page.waitForFunction(() => window.__game.scene.getScene('Game').brain.cheerCooldown === 0);
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.ended = true; s.cheerBtn.emit('pointerdown');
  });
  assert.equal((await state()).visible, false);
  assert.deepEqual(errors, []);
  console.log('PASS cheer touch, mirrored button, name, separate bubble, cooldown, pause, 3s hold/fade, ended guard');
} finally { await browser.close(); }
