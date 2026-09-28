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

  // ---------------- 순환형 (Chelsea, 2배속)
  await open('?speed=2');
  await startWod('chelsea');
  assert.deepEqual(await game((s) => s.toolbar.items.filter((i) => i.highlight).map((i) => i.id)), ['pullup']);
  await page.waitForFunction(() => window.__game.scene.getScene('Game').toast.text.text === '풀업 바가 없어서 원장님이 게으름 피웁니다! 다음 기구를 배치해주세요!');
  await game((s) => s.place('pullup', { x: 330, y: 700 }, 1));
  await page.waitForTimeout(600);
  assert.equal(await game((s) => s.brain.state), 'IDLE_REELS', 'waits for first bell');
  await page.waitForFunction(() => window.__game.scene.getScene('Game').emom.windowOpen);
  assert.equal(await game((s) => s.bellBanner.text.text), '🔔 풀업 바! 0/5');
  await tapProd(5);
  await page.waitForFunction(() => window.__game.scene.getScene('Game').brain.state === 'EXHAUSTED');
  assert.equal(await game((s) => s.intervalDone), true);
  const locked = await game((s) => { s.brain.lastProdMs = -Infinity; s.onProd(); return { count: s.brain.prodCount, toast: s.toast.text.text }; });
  assert.deepEqual(locked, { count: 0, toast: '원장님이 벨을 기다리며 쉬는 중입니다.' });
  await page.waitForFunction(() => window.__game.scene.getScene('Game').toast.text.text === '맨몸 매트가 없어서 원장님이 게으름 피웁니다! 다음 기구를 배치해주세요!');
  await page.waitForFunction(() => window.__game.scene.getScene('Game').emom.windowOpen);
  await tapProd(5);
  await page.waitForFunction(() => window.__game.scene.getScene('Game').noRep?.count === 1);
  const seen = new Set([await game((s) => s.toast.text.text)]);
  const noRepFrozen = await game((s) => { s.setPaused(true); return s.noRep.count; });
  await page.waitForTimeout(1200);
  assert.equal(await game((s) => s.noRep.count), noRepFrozen, 'no-rep pauses');
  assert.equal(await page.evaluate(() => window.__game.scene.isActive('Result')), false);
  await game((s) => s.setPaused(false));
  await page.screenshot({ path: 'artifacts/emom-norep.png' });
  while (!(await page.evaluate(() => window.__game.scene.isActive('Result')))) {
    seen.add(await page.evaluate(() => window.__game.scene.getScene('Game').toast.text.text));
    await page.waitForTimeout(100);
  }
  const lazyLine = '맨몸 매트가 없어서 원장님이 게으름 피웁니다! 다음 기구를 배치해주세요!';
  for (const n of ['노랩!', '노랩! 노랩!', '노랩! 노랩! 노랩!']) assert.ok(seen.has(`${lazyLine}\n${n}`), `saw ${n}: ${JSON.stringify([...seen])}`);
  assert.ok((await resultText()).includes('노랩 3번! 탈락!'));
  console.log('PASS Chelsea: warn text with josa, first-bell wait, station banner, floor lock, no-rep x3 with pause, norep result');

  // ---------------- 노랩 도중 기구 착지 → 취소, 떨어지는 중인 기구는 경고 안 함, 구간 미완료 탈락
  await startWod('chelsea');
  await game((s) => s.place('pullup', { x: 330, y: 700 }, 1));
  await page.waitForFunction(() => window.__game.scene.getScene('Game').emom.windowOpen);
  await tapProd(5);
  await page.waitForFunction(() => window.__game.scene.getScene('Game').brain.state === 'EXHAUSTED');
  await page.waitForFunction(() => window.__game.scene.getScene('Game').emom.windowOpen);
  await tapProd(5);
  await page.waitForFunction(() => (window.__game.scene.getScene('Game').noRep?.count ?? 0) >= 1);
  await game((s) => s.place('mat', { x: 360, y: 900 }, -1));
  await page.waitForFunction(() => window.__game.scene.getScene('Game').brain.state === 'WALKING');
  assert.deepEqual(await game((s) => ({ noRep: s.noRep, alpha: s.chimpVignette.alpha })), { noRep: null, alpha: 0 });
  const inFlight = await game((s) => { s.toast.text.setText(''); s.place('pullup', { x: 510, y: 694 }, 2); s.warnStation(2); return s.toast.text.text; });
  assert.equal(inFlight, '', 'falling equipment counts as placed');
  await page.waitForFunction(() => window.__game.scene.getScene('Game').intervalDone);
  await page.waitForFunction(() => window.__game.scene.getScene('Game').emom.secToNextBell < 1);
  await game((s) => { s.intervalDone = false; });
  assert.ok((await resultText()).includes('시간 안에 못 끝냈어요!'));
  console.log('PASS Chelsea: landing cancels no-rep, in-flight equipment suppresses warn, unfinished interval fails');

  // ---------------- Fight Gone Bad HUD
  await startWod('fgb');
  const fgb = await game((s) => ({ chips: s.hud.chips.map((c) => c.text.text), hl: s.toolbar.items.filter((i) => i.highlight).map((i) => i.id), title: s.hud.title.text }));
  assert.deepEqual(fgb.chips, ['0/3', '0/3', '0/3', '0/3', '0/3']);
  assert.deepEqual(fgb.hl, ['wallball']);
  await page.screenshot({ path: 'artifacts/emom-fgb.png' });
  console.log(`PASS Fight Gone Bad: compact chips, first station highlight, title "${fgb.title}"`);

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
