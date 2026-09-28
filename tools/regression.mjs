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
  const logo = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Title');
    const logo = s.children.list.find(o => o.texture?.key === 'unlimit_logo');
    const b = logo?.getBounds();
    return b ? { top: b.top, bottom: b.bottom, width: b.width, height: b.height, ratio: logo.width / logo.height } : null;
  });
  assert.ok(logo && logo.top > 0 && logo.bottom < 194, 'brand logo above title without overlap');
  assert.ok(Math.abs(logo.width / logo.height - logo.ratio) < 0.001, 'original logo aspect ratio');
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
  const wodCount = await page.evaluate(() => window.__wods.length);
  let shotThree = false;
  for (let level = 1; level <= wodCount; level++) {
    await start(level);
    const guide = await page.evaluate(() => {
      const s = window.__game.scene.getScene('Game');
      return { requirements: s.wod.requirements.map(r => r.equipment), highlighted: s.toolbar.items.filter(i => i.highlight).map(i => i.id),
        chips: s.hud.chips.map(c => ({ text: c.text.text, left: c.text.getBounds().left, right: c.text.getBounds().right, bottom: c.text.getBounds().bottom })) };
    });
    assert.deepEqual([...guide.highlighted].sort(), [...guide.requirements].sort());
    guide.chips.forEach((c, i) => {
      assert.match(c.text, /\S+\n0\/\d+/);
      assert.ok(c.bottom <= 114 && c.left >= 0 && c.right <= 720, `level ${level}: ${JSON.stringify(c)}`);
      if (i) assert.ok(guide.chips[i - 1].right < c.left, 'requirement labels do not overlap');
    });
    const fit = await page.evaluate(() => {
      const s = window.__game.scene.getScene('Game');
      const limit = s.hud.bellText ? s.hud.bellText.getBounds().left : s.hud.timer.getBounds().left;
      return { title: s.hud.title.getBounds().right, timer: limit, text: s.hud.title.text };
    });
    assert.ok(fit.title <= fit.timer - 6, `level ${level}: HUD title "${fit.text}" overlaps timer`);
    if (guide.requirements.length === 3 && !shotThree) {
      shotThree = true;
      await page.screenshot({ path: 'artifacts/wod-guide-three.png' });
    }
  }
  await start();
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.progress.done.set('barbell', 2);
    s.place('barbell', { x: 150, y: 900 }, -1);
    s.completeSession(s.equipment[0].id);
  });
  assert.deepEqual(await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    return { highlighted: s.toolbar.items.filter(i => i.highlight).map(i => i.id), done: s.hud.chips[0].text.text, checked: s.hud.chips[0].check.visible,
      badge: s.toolbar.items.find(i => i.id === 'barbell').badge.visible };
  }), { highlighted: ['pullup'], done: '바벨\n3/3', checked: true, badge: false });
  await page.screenshot({ path: 'artifacts/wod-guide-completed.png' });
  await page.evaluate(() => window.__game.scene.getScenes(true)[0].scene.start('LevelSelect'));
  await page.waitForFunction(() => window.__game.scene.isActive('LevelSelect'));
  const cards = await page.evaluate(() => {
    const s = window.__game.scene.getScene('LevelSelect');
    const r = (o) => { const b = o.getBounds(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
    return s.list.list.filter((c) => c.type === 'Container' && c.list[1]?.text?.startsWith('Lv')).map((c) => {
      const [, , name, desc, info, ...rest] = c.list;
      return { card: r(c), name: r(name), text: name.text, desc: r(desc), info: r(info), icons: rest.filter((o) => o.type === 'Image').map(r) };
    });
  });
  assert.equal(cards.length, wodCount);
  for (const k of cards) assert.ok(k.name.r <= k.card.r - 60, `card title fits: ${k.text}`);
  await page.screenshot({ path: 'artifacts/level-select.png' });
  console.log('PASS all WOD names/counts fit, needed-only highlights, completed highlight clears');
  await start();
  await pointer(76, 1205);
  await page.mouse.down();
  await pointer(150, 730);
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').equipment.length), 1, 'finger inside upper green floor drops successfully');
  await page.waitForTimeout(300);
  await pointer(76, 1205);
  await page.mouse.down();
  await pointer(270, 1185); // horizontal first, then lift into floor
  await pointer(150, 730); // occupied spot: snap nearby
  await page.waitForTimeout(100);
  const preview = await page.evaluate(() => {
    const d = window.__game.scene.getScene('Game').drag;
    return d && { valid: d.valid, pos: d.pos, ghost: { x: d.ghost.x, y: d.ghost.y } };
  });
  assert.ok(preview?.valid);
  assert.deepEqual(preview.pos, preview.ghost);
  await page.screenshot({ path: 'artifacts/placement-snap.png' });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').equipment.length), 2, 'diagonal drag recovers from scroll and avoids overlap');
  console.log('PASS finger-based drop, diagonal drag, nearby free-space snap and matching preview');
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

  await start();
  const burpee = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.toast.box.setVisible(false);
    s.view.interrupt = { anim: 'wj_burpee', label: '버피 5개' };
    s.brain.beginInterrupt(3);
    return { state: s.brain.state, label: s.view.labelText.text, labelVisible: s.view.labelBox.visible };
  });
  assert.deepEqual(burpee, { state: 'BURPEE', label: '버피 5개', labelVisible: true });
  for (const i of [1, 2, 3]) {
    await page.waitForTimeout(170);
    await page.screenshot({ path: `artifacts/burpee-${i}.png` });
  }
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').view.animKey), 'wj_burpee');
  await page.waitForFunction(() => window.__game.scene.getScene('Game').brain.state !== 'BURPEE', null, { timeout: 5000 });
  console.log('PASS burpee motion, label and return');

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
  assert.deepEqual(await page.evaluate(() => window.__game.scene.getScene('Game').toolbar.items.filter(i => i.box.visible).map(i => i.id)), ['chalk', 'bong', 'heo', 'jong']);
  await pointer(448, 1205);
  await page.mouse.down();
  await page.mouse.up();
  assert.match(await page.evaluate(() => window.__game.scene.getScene('Game').toast.text.text), /종코 5초/);
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

  await page.evaluate(() => { window.__game.scene.getScene('Game').brain.burnout = 60; });
  await pointer(448, 1205); await page.mouse.down();
  await pointer(448, 1090); await pointer(180, 940); await page.mouse.up();
  await page.waitForFunction(() => window.__game.scene.getScene('Game').coaches.some(c => c.id === 'jong'));
  const jong = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    const c = s.coaches.find(c => c.id === 'jong');
    return { anim: c.sprite.anims.currentAnim.key, remaining: s.brain.buffRemaining('jong'), cd: s.brain.buffCooldown('jong'), duplicate: s.brain.applyBuff('jong'), message: s.toast.text.text };
  });
  assert.match(jong.anim, /^coach_jong_/); assert.match(jong.message, /^종코:/);
  assert.ok(jong.remaining > 4 && jong.remaining <= 5 && jong.cd > 9);
  assert.equal(jong.duplicate, false);
  await page.screenshot({ path: 'artifacts/jong-active.png' });
  await page.evaluate(() => window.__game.scene.getScene('Game').setPaused(true));
  const jongFrozen = await page.evaluate(() => window.__game.scene.getScene('Game').brain.buffRemaining('jong'));
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('Game').brain.buffRemaining('jong')), jongFrozen);
  await page.evaluate(() => window.__game.scene.getScene('Game').setPaused(false));
  await page.waitForFunction(() => window.__game.scene.getScene('Game').brain.buffRemaining('jong') === 0);
  assert.ok(await page.evaluate(() => window.__game.scene.getScene('Game').brain.buffCooldown('jong') > 0));
  await page.waitForFunction(() => !window.__game.scene.getScene('Game').coaches.some(c => c.id === 'jong'));
  console.log('PASS Jong real drag, animated sprite, 5s effect, 10s cooldown, pause and exit');

  const movement = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Game');
    s.brain.pos = { x: 360, y: 850 };
    for (const id of ['bong', 'heo', 'jong']) s.showBuff(id, { x: 360, y: 850 });
    const [bong, heo, jong] = s.coaches;
    bong.target = { x: 600, y: 850 };
    bong.update(0.1);
    const bongSpeed = (bong.sprite.x - 360) / 0.1;
    heo.update(1); jong.update(1);
    const near = [heo.sprite.x, jong.sprite.x];
    s.brain.pos = { x: 420, y: 900 };
    heo.update(1); jong.update(1);
    return { bongSpeed, near, followed: [heo.sprite.x, heo.sprite.y, jong.sprite.x, jong.sprite.y] };
  });
  assert.equal(movement.bongSpeed, 90);
  assert.deepEqual(movement.near, [270, 450]);
  assert.deepEqual(movement.followed, [330, 885, 510, 885]);
  await page.screenshot({ path: 'artifacts/coaches-follow.png' });
  console.log('PASS slower Bong roaming and Heo/Jong following both sides of Wonjang');

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
