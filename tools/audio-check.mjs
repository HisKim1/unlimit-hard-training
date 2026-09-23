import assert from 'node:assert/strict';
import { chromium, webkit, devices } from 'playwright-core';

for (const [name, engine, device] of [['iphone', webkit, 'iPhone 13'], ['android', chromium, 'Pixel 7']]) {
  const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
  try {
    const page = await browser.newPage({ ...devices[device] });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.addInitScript(() => {
      window.musicNodes = [];
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      const original = Ctor.prototype.createBufferSource;
      Ctor.prototype.createBufferSource = function () { const n = original.call(this); window.musicNodes.push(n); return n; };
    });
    await page.goto(process.env.URL || 'http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
    if (!await page.evaluate(() => !!(window.AudioContext || window.webkitAudioContext))) {
      console.log(`SKIP ${name} audio: this installed browser build has no Web Audio API (not an iPhone hardware test)`);
      continue;
    }
    const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).audio);
    assert.equal((await state()).playing, false, 'silent until a gesture');
    async function tap(x, y) {
      const r = await page.locator('canvas').boundingBox();
      await page.touchscreen.tap(r.x + x / 720 * r.width, r.y + y / 1280 * r.height);
    }
    await tap(360, 1060);
    await page.waitForFunction(() => window.__game.scene.isActive('LevelSelect') && JSON.parse(window.render_game_to_text()).audio.playing);
    assert.equal((await state()).track, 'menu');
    await tap(670, 72);
    assert.equal((await state()).muted, true);
    await tap(670, 72);
    assert.equal((await state()).muted, false);
    await tap(360, 245);
    await page.waitForFunction(() => window.__game.scene.isActive('Game') && JSON.parse(window.render_game_to_text()).audio.playing);
    assert.equal((await state()).track, 'workout');
    const loops = await page.evaluate(() => window.musicNodes.filter(n => n.loop).map(n => n.buffer.duration));
    assert.equal(loops.length, 2);
    assert.ok(loops.every(duration => duration > 10));
    await page.evaluate(() => window.__game.scene.getScene('Game').setPaused(true));
    const paused = await state();
    assert.equal(paused.playing, false);
    await page.waitForTimeout(250);
    assert.equal((await state()).offset, paused.offset);
    await tap(360, 640);
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).audio.playing);
    assert.ok((await state()).offset >= paused.offset);
    // Switching away while paused must not leak workout music into menus.
    await page.evaluate(() => window.__game.scene.getScene('Game').setPaused(true));
    await tap(360, 750);
    await page.waitForFunction(() => window.__game.scene.isActive('LevelSelect'));
    assert.equal((await state()).track, 'menu');
    await tap(360, 245);
    await page.waitForFunction(() => window.__game.scene.isActive('Game'));
    await page.evaluate(() => window.__game.scene.getScene('Game').clear());
    assert.equal((await state()).track, null);
    await page.waitForFunction(() => window.__game.scene.isActive('Result'));
    assert.equal((await state()).playing, false);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `artifacts/audio-${name}.png` });
    assert.deepEqual(errors, []);
    console.log(`PASS ${name}: decoded loops ${loops.map(n => n.toFixed(1))}s, gesture, menu/workout, mute, pause/resume, exit, result`);
  } finally { await browser.close(); }
}
