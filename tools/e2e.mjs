// 헤드리스 브라우저 자동 플레이 테스트 (개발용). 사용: node tools/e2e.mjs [outDir]
import { chromium } from 'playwright-core';

const OUT = process.argv[2] || '.';
const URL = process.env.URL || 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: false });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function toScreen(x, y) {
  return page.evaluate(([x, y]) => {
    const c = document.querySelector('#game canvas').getBoundingClientRect();
    return { x: c.left + (x / 720) * c.width, y: c.top + (y / 1280) * c.height };
  }, [x, y]);
}
async function tap(x, y) {
  const p = await toScreen(x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await sleep(40);
  await page.mouse.up();
}
async function drag(x0, y0, x1, y1, steps = 12) {
  const a = await toScreen(x0, y0);
  const b = await toScreen(x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
    await sleep(16);
  }
  await page.mouse.up();
}
async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
async function state() {
  return page.evaluate(() => {
    const g = window.__game;
    const s = g.scene.getScene('Game');
    const b = s && s.brain;
    return b ? { scene: g.scene.getScenes(true).map((x) => x.scene.key), state: b.state, burnout: Math.round(b.burnout), N: b.prodTarget, count: b.prodCount, speed: b.speedMult, eq: s.equipment.length, elapsed: s.elapsed?.toFixed(1), progress: [...s.progress.done.entries()] } : { scene: g.scene.getScenes(true).map((x) => x.scene.key) };
  });
}
async function waitFor(pred, timeoutMs = 20000, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await state();
    if (pred(s)) return s;
    await sleep(100);
  }
  const s = await state();
  throw new Error(`timeout waiting ${label}: ${JSON.stringify(s)}`);
}
function toolbarX(i) { return 14 + 124 / 2 + i * 124; }

const results = [];
function check(name, ok, info = '') { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); }

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(1500);
  await shot('01_title');
  await tap(360, 1060); // 시작하기
  await sleep(900);
  await shot('02_levels');
  await tap(360, 236); // Lv1 Fran
  await sleep(1200);
  let s = await state();
  check('Game 씬 진입', s.scene.includes('Game'), JSON.stringify(s.scene));
  check('기구 없을 때 릴스', s.state === 'IDLE_REELS', s.state);
  await shot('03_game_start');

  // 바벨을 툴바에서 위로 드래그 → 바닥
  await drag(toolbarX(0), 1180, 140, 950);
  await sleep(200);
  await shot('04_barbell_drop');
  s = await waitFor((x) => x.state === 'WALKING' || x.state === 'EXERCISING', 5000, 'walk');
  check('기구 배치 → 걷기', true, s.state);
  await sleep(700);
  await shot('05_walking');
  s = await waitFor((x) => x.state === 'EXERCISING', 15000, 'exercise');
  check('도착 → 운동', true);
  await sleep(800);
  await shot('06_exercising');
  // 운동 중 능동 재촉 1회
  await tap(608, 1040);
  await sleep(250);
  s = await state();
  check('능동 재촉: 번아웃 증가', s.burnout >= 9, `burnout=${s.burnout} speed=${s.speed}`);
  await shot('07_prod_active');
  s = await waitFor((x) => x.state === 'EXHAUSTED' || x.state === 'GAVE_UP', 15000, 'exhausted');
  await sleep(400);
  await shot('08_exhausted');
  s = await state();
  check('세션 완료 → 바닥 뻗음', s.state === 'EXHAUSTED', JSON.stringify(s.progress));

  // 풀업 바를 리그 슬롯으로
  await drag(toolbarX(1), 1180, 330, 760);
  await sleep(600);
  s = await state();
  check('뻗은 상태에서 기구 배치 → 카운트 초기화', s.count === 0, `count=${s.count} N=${s.N}`);
  await shot('09_pullup_placed');
  // 바닥 재촉 N회
  const b0 = s.burnout;
  for (let i = 0; i < 12; i++) {
    s = await state();
    if (s.state !== 'EXHAUSTED') break;
    await tap(608, 1040);
    await sleep(260);
    if (i === 2) await shot('10_floor_prod');
  }
  s = await state();
  check('바닥 재촉으로 일어남', s.state !== 'EXHAUSTED', s.state);
  check('바닥 재촉은 번아웃 안 올림', s.burnout <= b0, `${b0} -> ${s.burnout}`);
  await sleep(1500);
  await shot('11_next');
  // 남은 세션을 자동으로 진행: 뻗으면 재촉, 기구 없으면 배치
  const deadline = Date.now() + 150000;
  for (let loop = 0; Date.now() < deadline; loop++) {
    s = await state();
    if (!s.scene.includes('Game')) break;
    if (s.state === 'EXHAUSTED') {
      await tap(608, 1040);
      await sleep(230);
      continue;
    }
    if (s.state === 'IDLE_REELS') {
      const done = Object.fromEntries(s.progress);
      if ((done.barbell ?? 0) < 3) await drag(toolbarX(0), 1180, 200, 950);
      else await drag(toolbarX(1), 1180, 150, 760);
      await sleep(600);
      continue;
    }
    if (loop === 10) await shot('12_mid');
    await sleep(500);
  }
  await sleep(2500);
  s = await state();
  await shot('13_result');
  check('Fran 결과 화면', s.scene.includes('Result'), JSON.stringify(s));
  const unlocked = await page.evaluate(() => JSON.parse(localStorage.getItem('wonjang.save.v1') || '{}'));
  check('저장: Lv2 해금', unlocked.unlockedLevel >= 2, JSON.stringify(unlocked));
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(1200);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('wonjang.save.v1') || '{}'));
  check('새로고침 후 유지', after.unlockedLevel >= 2, JSON.stringify(after));
} catch (e) {
  results.push(`ERROR ${e.message}`);
  await shot('99_error').catch(() => {});
} finally {
  console.log(results.join('\n'));
  console.log('--- console ---');
  console.log(logs.filter((l) => !l.includes('[vite]')).slice(-30).join('\n'));
  if (results.some(r => /^(FAIL|ERROR)/.test(r)) || logs.some(l => l.startsWith('[pageerror]'))) process.exitCode = 1;
  await browser.close();
}
