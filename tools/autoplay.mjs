// 밸런스 자동 테스트 (개발용): 헤드리스 Chrome 에서 자동 플레이어가 각 WOD 를 플레이하고 클리어 시간을 잰다.
// 사용: node tools/autoplay.mjs [levels=1,2,...] [speed=2] [outDir]
// 자동 플레이어는 필요한 기구만 놓고, 뻗으면 바로 재촉하고, 능동 재촉(번아웃 증가)은 하지 않는다.
import { chromium } from 'playwright-core';

const LEVELS = (process.argv[2] || '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17').split(',').map(Number);
const SPEED = Number(process.argv[3] || 2);
const OUT = process.argv[4] || '.';
const MODE = process.argv[5] || 'basic'; // assist: 능동 재촉 + 탄마·종코·허코 사용
const URL = (process.env.URL || 'http://localhost:5173/') + `?speed=${SPEED}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

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
  await page.mouse.up();
}
async function drag(x0, y0, x1, y1) {
  const a = await toScreen(x0, y0);
  const b = await toScreen(x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  if (y1 < y0 - 50) {
    // 세로로 먼저 들어 올려 툴바 스크롤과 기구 드래그를 구분한다.
    await page.mouse.move(a.x, a.y - 20);
    await sleep(15);
  }
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
    await sleep(5);
  }
  await sleep(30); // 손을 멈춘 뒤 놓아 툴바 관성이 다음 아이콘 선택을 밀지 않게 함
  await page.mouse.up();
}
async function snap() {
  return page.evaluate(() => {
    const g = window.__game;
    if (!g) return { keys: ['(loading)'] };
    const keys = g.scene.getScenes(true).map((x) => x.scene.key);
    const s = g.scene.getScene('Game');
    if (!keys.includes('Game') || !s.brain) return { keys };
    return {
      keys,
      state: s.brain.state,
      burnout: s.brain.burnout,
      elapsed: s.elapsed,
      ended: s.ended,
      req: s.wod ? s.wod.requirements.map((r) => ({ eq: r.equipment, n: r.sessions, done: s.progress.done.get(r.equipment) ?? 0 })) : [],
      placed: s.equipment.filter((e) => !e.removed).map((e) => ({ type: e.type, remaining: e.remaining, zone: e.def.zone, x: e.pos.x, y: e.pos.y })),
      order: ['barbell', 'pullup', 'rower', 'dumbbell', 'jumprope', 'kettlebell', 'bike', 'wallball', 'box', 'mat', 'ski', 'rope', 'rings'],
      cap: s.wod ? s.wod.timeCapSec : 0,
      emom: s.emom ? {
        open: s.emom.windowOpen, rotate: s.wod.emom.kind === 'rotate', interval: s.emom.interval,
        cur: s.emom.station(s.emom.interval), next: s.emom.station(s.emom.interval + 1), done: s.intervalDone,
        sec: s.emom.secToNextBell, // 벨까지 남은 시간(게임초): 배치 중 벨을 통째로 놓치는 것을 막는 데 씀
      } : null,
    };
  });
}

const FLOOR_SPOTS = [
  [140, 790], [360, 780], [580, 790], [230, 930], [470, 930], [110, 960], [350, 990], [600, 900],
];
const RIG = [[150, 708], [330, 700], [510, 694]];
const CEIL = [[92, 888], [362, 760], [628, 872]];

async function placeOne(type, s) {
  const idx = s.order.indexOf(type);
  // 툴바를 해당 아이콘이 보이도록 스크롤 (가로 스와이프)
  const itemX = (i, scroll) => 14 + 62 + i * 124 + scroll;
  const scroll = await page.evaluate(() => window.__game.scene.getScene('Game').toolbar.scroll);
  let x = itemX(idx, scroll);
  for (let attempt = 0; (x < 60 || x > 660) && attempt < 6; attempt++) {
    const dx = Math.max(-600, Math.min(600, 360 - x));
    await drag(360, 1200, 360 + dx, 1203);
    await sleep(40);
    const sc2 = await page.evaluate(() => window.__game.scene.getScene('Game').toolbar.scroll);
    x = itemX(idx, sc2);
  }
  const zone = type === 'pullup' ? 'rig' : type === 'rope' || type === 'rings' ? 'ceiling' : 'floor';
  const spots = zone === 'rig' ? RIG : zone === 'ceiling' ? CEIL : FLOOR_SPOTS;
  if (x < 60 || x > 660) return false;
  const before = s.placed.filter(p => p.type === type).length;
  for (const [tx, ty] of spots) {
    await drag(x, 1180, tx, ty); // 손가락 위치가 실제 배치 위치
    await sleep(40);
    const n = (await snap()).placed?.filter(p => p.type === type).length ?? 0;
    if (n > before) return true;
  }
  return false;
}

const report = [];
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('wonjang.save.v1', JSON.stringify({ version: 1, unlockedLevel: 99, bestTimes: {}, settings: { muted: true } })));
await page.reload({ waitUntil: 'networkidle' });
await sleep(1500);

for (const level of LEVELS) {
  await page.evaluate((lv) => {
    const g = window.__game;
    g.scene.getScenes(true)[0].scene.start('Game', { level: lv });
  }, level);
  await sleep(50);
  let s = await snap();
  let result = 'timeout(test)';
  const t0 = Date.now();
  let prods = 0;
  let placedCount = 0;
  let lastPlaceTry = 0;
  let lastActive = 0;
  while (Date.now() - t0 < 400000 / SPEED) {
    s = await snap();
    if (s.keys[0] === '(loading)') {
      await sleep(200);
      continue;
    }
    if (!s.keys.includes('Game') || s.ended) {
      const r = await page.evaluate(() => {
        const g = window.__game;
        const s = g.scene.getScene('Game');
        return { ended: s.ended, elapsed: s.elapsed, state: s.brain?.state, complete: s.progress?.complete, reason: s.failReason };
      });
      result = r.complete ? `CLEAR ${r.elapsed.toFixed(1)}s` : `FAIL(${r.reason ?? r.state}) ${r.elapsed.toFixed(1)}s`;
      break;
    }
    if (s.emom?.open) {
      for (let i = 0; i < 5; i++) {
        await tap(608, 1040);
        await sleep(Math.max(30, 130 / SPEED));
      }
      continue;
    }
    if (MODE === 'assist' && s.state === 'EXHAUSTED') {
      await page.evaluate(() => {
        const g = window.__game.scene.getScene('Game');
        if (g.brain.buffCooldown('heo') === 0 && g.brain.applyBuff('heo')) g.showBuff('heo', g.brain.pos);
      });
    }
    if (s.state === 'EXHAUSTED' && !s.emom?.rotate) {
      await tap(608, 1040);
      prods++;
      await sleep(Math.max(60, 230 / SPEED));
      continue;
    }
    if (MODE === 'assist' && s.state === 'EXERCISING') {
      if (s.burnout < 40 && Date.now() - lastActive > 250 / SPEED) {
        lastActive = Date.now();
        await tap(608, 1040);
      }
      await page.evaluate(() => {
        const g = window.__game.scene.getScene('Game');
        if (g.brain.buffCooldown('chalk') === 0 && g.brain.applyBuff('chalk')) g.showBuff('chalk', g.brain.pos);
        if (g.brain.burnout > 20 && g.brain.buffCooldown('jong') === 0 && g.brain.applyBuff('jong')) g.showBuff('jong', g.brain.pos);
      });
    }
    // 칼수형(비순환)은 배치 드래그(300~900ms)가 벨 창(SPEED=4 기준 실제 0.75초)을 통째로
    // 삼킬 수 있어 벨이 임박하면 배치를 미룬다. 순환형은 반대로 벨이 열리기 전에 미리
    // 놓아야 하므로(늦으면 노랩 유예 0.675초 안에 못 놓아 탈락) 여기서 미루지 않는다.
    const bellSoon = !s.emom?.rotate && s.emom && s.emom.sec != null && s.emom.sec < SPEED * 1.2;
    if (s.emom?.rotate) {
      // 순환형: 이번 구간(아직 안 했으면)과 다음 구간 기구만 미리 놓는다
      if (Date.now() - lastPlaceTry > 300) {
        const want = [s.emom.done ? null : s.emom.cur, s.emom.next].filter(Boolean);
        for (const t of want) {
          if (!s.placed.some((p) => p.type === t)) {
            lastPlaceTry = Date.now();
            if (await placeOne(t, s)) placedCount++;
            break;
          }
        }
      }
      await sleep(80);
      continue;
    }
    // 필요한 기구 보충
    if (!bellSoon && Date.now() - lastPlaceTry > 300) {
      for (const r of s.req) {
        const avail = s.placed.filter((p) => p.type === r.eq).reduce((a, p) => a + p.remaining, 0);
        if (r.n - r.done > avail) {
          lastPlaceTry = Date.now();
          if (await placeOne(r.eq, s)) placedCount++;
          break;
        }
      }
    }
    await sleep(80);
  }
  const cap = s.cap || 0;
  report.push(`Lv${level} [${MODE}]: ${result} / cap ${cap}s, placed ${placedCount}, prods ${prods}`);
  console.log(report[report.length - 1]);
  await page.screenshot({ path: `${OUT}/autoplay_lv${level}.png` });
  await page.waitForFunction(() => window.__game.scene.isActive('Result'), null, { timeout: 10000 });
}
console.log('--- summary ---\n' + report.join('\n'));
if (errors.length) console.log('--- page errors ---\n' + errors.slice(0, 10).join('\n'));
if (errors.length || report.some(r => !r.includes(': CLEAR '))) process.exitCode = 1;
await browser.close();
