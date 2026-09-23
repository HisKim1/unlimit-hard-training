// 실제 배포 빌드의 종료·입력·모바일 회귀 검사. URL=http://... node tools/regression.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(process.env.URL || 'http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
  await page.screenshot({ path: 'artifacts/title.png' });
  const assets = await page.evaluate(async () => {
    const m = await (await fetch('assets/anims.json')).json();
    const g = window.__game;
    return { missing: Object.entries(m.anims).filter(([k, a]) => !g.anims.exists(k) || a.frames.some(f => !g.textures.get('atlas').has(f))).map(([k]) => k), count: Object.keys(m.anims).length };
  });
  assert.deepEqual(assets.missing, []);
  assert.ok(assets.count >= 37);
  console.log('PASS assets');

  await page.evaluate(() => {
    const g = window.__game;
    window.levelCreates = 0;
    g.scene.getScene('LevelSelect').events.on('create', () => window.levelCreates++);
    const btn = g.scene.getScene('Title').children.list.find(o => o.type === 'Container' && o.input);
    btn.emit('pointerup');
    btn.emit('pointerup');
  });
  await page.waitForFunction(() => window.__game.scene.isActive('LevelSelect'));
  assert.equal(await page.evaluate(() => window.levelCreates), 1, 'double tap must only enter once');
  console.log('PASS double tap');

  async function start(level = 1) {
    await page.evaluate(lv => {
      const g = window.__game;
      const s = g.scene.getScenes(true)[0];
      if (s.scene.key === 'Game' && s.paused) s.setPaused(false);
      s.scene.start('Game', { level: lv });
    }, level);
    await page.waitForFunction(() => window.__game.scene.isActive('Game'));
    await page.waitForTimeout(100);
  }
  await start();
  await page.screenshot({ path: 'artifacts/game.png' });
  for (const type of ['pullup', 'rings', 'rower', 'bike', 'mat']) {
    await start(type === 'mat' ? 3 : 1);
    const motion = await page.evaluate(type => {
      const s = window.__game.scene.getScene('Game');
      s.toast.box.setVisible(false);
      s.place(type, { x: 330, y: type === 'pullup' ? 700 : 850 }, -1);
      const eq = s.equipment[0];
      s.brain.pos = eq.usePoint;
      s.brain.targetId = eq.id;
      s.brain.state = 'EXERCISING';
      s.startExercise(eq.id);
      return s.view.exercise.anim;
    }, type);
    assert.notEqual(motion, 'wj_idle');
    await page.waitForTimeout(450);
    await page.screenshot({ path: `artifacts/motion-${type}.png` });
  }
  await start();
  const pose = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.brain.state = 'EXHAUSTED';
    s.brain.poseTier = 'high';
    s.onBrainEvent({ type: 'poseSwap' });
    return s.view.floorPose;
  });
  assert.equal(pose, 'floor_06');
  console.log('PASS pose');

  const paused = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    const p = { id: 0, x: 76, y: 1180, downTime: s.time.now };
    s.toolbar.onDown(p);
    s.beginDrag('barbell', { ...p, x: 150, y: 1000 });
    const ghost = s.drag.ghost;
    s.setPaused(true);
    return { drag: s.drag, active: s.toolbar.active, destroyed: !ghost.scene, elapsed: s.elapsed };
  });
  assert.equal(paused.drag, null);
  assert.equal(paused.active, null);
  assert.equal(paused.destroyed, true);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').elapsed), paused.elapsed);
  await page.evaluate(() => window.__game.scene.getScene('Game').setPaused(false));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => window.__game.scene.getScene('Game').paused);
  assert.equal(await page.locator('#rotate').isVisible(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  console.log('PASS pause and rotation');

  await start();
  await page.evaluate(() => window.__game.scene.getScene('Game').place('barbell', { x: 150, y: 900 }, -1));
  await page.waitForFunction(() => window.__game.scene.getScene('Game').brain.state === 'EXERCISING');
  const stopped = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.brain.sessionProgress = 0.999;
    s.fail('timeout');
    return { progress: s.brain.sessionProgress, done: [...s.progress.done], uses: s.equipment[0].uses };
  });
  await page.waitForTimeout(500);
  assert.deepEqual(await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    return { progress: s.brain.sessionProgress, done: [...s.progress.done], uses: s.equipment[0].uses };
  }), stopped, 'timeout must freeze progress');

  for (const type of ['barbell', 'pullup', 'rings']) {
    await start();
    await page.evaluate(type => {
      const s = window.__game.scene.getScene('Game');
      s.place(type, { x: 150, y: 900 }, -1);
    }, type);
    await page.waitForFunction(() => window.__game.scene.getScene('Game').brain.state === 'EXERCISING');
    await page.evaluate(() => { window.__game.scene.getScene('Game').brain.sessionProgress = 0.999; });
    await page.waitForFunction(() => window.__game.scene.getScene('Game').brain.state === 'EXHAUSTED');
    const used = await page.evaluate(type => {
      const s = window.__game.scene.getScene('Game');
      return { equipment: s.equipment.length, landed: s.landed.size, done: s.progress.done.get(type) ?? 0, complete: s.progress.complete,
        required: s.wod.requirements.find(r => r.equipment === type)?.sessions ?? 0 };
    }, type);
    assert.deepEqual(used, { equipment: 0, landed: 0, done: type === 'rings' ? 0 : 1, complete: false, required: type === 'rings' ? 0 : 3 }, `${type}: one use removes equipment without changing WOD goals`);
  }
  console.log('PASS single-use equipment in floor, rig and ceiling zones; WOD goals unchanged');

  await start();
  async function pointer(x, y) {
    const p = await page.evaluate(([x, y]) => {
      const r = document.querySelector('canvas').getBoundingClientRect();
      return { x: r.left + x / 720 * r.width, y: r.top + y / 1280 * r.height };
    }, [x, y]);
    await page.mouse.move(p.x, p.y);
  }
  await pointer(540, 1142);
  await page.mouse.down();
  await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => window.__game.scene.getScene('Game').toolbar.items.filter(i => i.box.visible).map(i => i.id)), ['chalk', 'bong', 'heo']);
  await pointer(448, 1205);
  await page.mouse.down();
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').toast.text.text), '업데이트 예정입니다!\n종코: 5초간 원장님의 멘탈 회복 속도 증가');
  await pointer(448, 1205);
  await page.mouse.down();
  await pointer(448, 940);
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').drag), null);
  await page.screenshot({ path: 'artifacts/jong-upcoming.png' });
  await pointer(200, 1205);
  await page.mouse.down();
  await pointer(200, 1090);
  await pointer(450, 940);
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForFunction(() => window.__game.scene.getScene('Game').coaches.length === 1);
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').toast.text.text), '앗! 봉코치가 등장했다! 도망가!');
  await page.screenshot({ path: 'artifacts/buff-active.png' });
  const frozen = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.setPaused(true);
    return [s.brain.buffRemaining('bong'), s.brain.buffCooldown('bong'), s.coaches[0].elapsed];
  });
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    return [s.brain.buffRemaining('bong'), s.brain.buffCooldown('bong'), s.coaches[0].elapsed];
  }), frozen);
  await page.evaluate(() => window.__game.scene.getScene('Game').setPaused(false));
  await page.waitForFunction(() => window.__game.scene.getScene('Game').coaches[0]?.elapsed >= 2.8);
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').coaches[0].exiting), false, 'roams for 3 seconds, independent of buff expiration');
  await page.waitForFunction(() => window.__game.scene.getScene('Game').coaches[0]?.exiting);
  const exitSpeed = await page.evaluate(() => {
    const c = window.__game.scene.getScene('Game').coaches[0];
    const x = c.sprite.x;
    c.update(0.1);
    return Math.abs(c.sprite.x - x) / 0.1;
  });
  assert.ok(Math.abs(exitSpeed - 100) < 0.001, 'slow constant exit speed');
  await page.screenshot({ path: 'artifacts/coach-slow-exit.png' });
  await page.waitForFunction(() => window.__game.scene.getScene('Game').coaches.length === 0);
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').toast.text.text), '휴,,, 코치가 사라졌다.\n원장님이 안일해집니다');
  const cooldown = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    return { active: s.brain.buffRemaining('bong'), cd: s.brain.buffCooldown('bong'), duplicate: s.brain.applyBuff('bong'), others: s.brain.buffCooldown('heo') + s.brain.buffCooldown('chalk'), gear: s.equipment.length };
  });
  assert.equal(cooldown.active, 0);
  assert.ok(cooldown.cd > 0 && cooldown.cd < 7);
  assert.equal(cooldown.duplicate, false);
  assert.equal(cooldown.others, 0);
  assert.equal(cooldown.gear, 0);
  await page.screenshot({ path: 'artifacts/buff-departed.png' });
  await page.waitForFunction(() => window.__game.scene.getScene('Game').toolbar.isEnabled('bong'), { timeout: 12000 });
  console.log('PASS buff tab, real coach drag, arrival/departure, 2s effect, independent 10s cooldown, pause');

  await start();
  const clear = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.beginDrag('barbell', { id: 0, x: 150, y: 1000 });
    const ghost = s.drag.ghost;
    s.clear();
    return { drag: s.drag, enabled: s.toolbar.enabled, destroyed: !ghost.scene };
  });
  assert.deepEqual(clear, { drag: null, enabled: false, destroyed: true });
  await page.waitForFunction(() => window.__game.scene.isActive('Result'));
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('wonjang.save.v1')).unlockedLevel >= 2));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('wonjang.save.v1')).unlockedLevel >= 2));
  assert.deepEqual(errors, []);
  console.log(`PASS: ${assets.count} animations, double tap, floor pose, pause, rotation, timeout, clear input, save/reload; no browser/HTTP errors`);
} finally {
  await browser.close();
}
