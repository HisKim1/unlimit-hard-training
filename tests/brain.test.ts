import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Brain, type BrainEvent } from '../src/systems/Brain';
import type { Candidate } from '../src/systems/Targeting';

function setup(opts: { rnd?: () => number; equipment?: Candidate[] } = {}) {
  const eq: Candidate[] = opts.equipment ?? [];
  const world = { candidates: () => eq, sessionDurationSec: () => 1 };
  const brain = new Brain(world, { x: 0, y: 0 }, CONFIG, opts.rnd ?? (() => 0));
  const events: BrainEvent[] = [];
  brain.on((e) => events.push(e));
  return { brain, eq, events };
}

/** dt 를 잘게 나눠 시간 진행 */
function run(brain: Brain, sec: number, step = 1 / 60) {
  for (let t = 0; t < sec; t += step) brain.update(step);
}

describe('Brain 상태 기계 (SPEC 5장)', () => {
  it('기구가 없으면 릴스 대기', () => {
    const { brain } = setup();
    run(brain, 2);
    expect(brain.state).toBe('IDLE_REELS');
  });

  it('릴스 중 재촉: 토스트만, 번아웃 변화 없음', () => {
    const { brain, events } = setup();
    expect(brain.prod()).toBe(true);
    expect(brain.burnout).toBe(0);
    expect(events.some((e) => e.type === 'toast' && e.text.includes('릴스'))).toBe(true);
  });

  it('기구 배치 → 걷기 → 도착 → 운동 → 세션 완료 → 바닥', () => {
    const { brain, eq, events } = setup({ rnd: () => 0 });
    eq.push({ id: 1, usePoint: { x: 30, y: 0 } });
    brain.onEquipmentPlaced();
    expect(brain.state).toBe('WALKING');
    run(brain, 1);
    expect(brain.state).toBe('EXERCISING');
    expect(events.some((e) => e.type === 'startExercise' && e.equipmentId === 1)).toBe(true);
    run(brain, 1.1);
    expect(events.some((e) => e.type === 'sessionComplete' && e.equipmentId === 1)).toBe(true);
    expect(brain.state).toBe('EXHAUSTED');
    expect(brain.prodTarget).toBeGreaterThanOrEqual(CONFIG.PROD_REQUIRED_MIN);
    expect(brain.prodTarget).toBeLessThanOrEqual(CONFIG.PROD_REQUIRED_MAX);
  });

  it('바닥 재촉 N회 → 일어나기 → 다음 기구로 (바닥 재촉은 번아웃을 올리지 않음)', () => {
    const { brain, eq } = setup({ rnd: () => 0 }); // N = 5
    eq.push({ id: 1, usePoint: { x: 10, y: 0 } });
    brain.onEquipmentPlaced();
    run(brain, 2);
    expect(brain.state).toBe('EXHAUSTED');
    expect(brain.prodTarget).toBe(5);
    const b0 = brain.burnout;
    for (let i = 0; i < 4; i++) {
      brain.prod();
      run(brain, 0.25); // 쿨타임 0.2초
    }
    expect(brain.state).toBe('EXHAUSTED');
    expect(brain.burnout).toBeLessThanOrEqual(b0);
    brain.prod();
    expect(brain.state).toBe('GETTING_UP');
    run(brain, 0.7);
    // 같은 기구 하나뿐이면 다시 그 기구 (이미 그 앞이라 곧바로 운동에 들어갈 수 있음)
    expect(['WALKING', 'EXERCISING']).toContain(brain.state);
    expect(brain.targetId).toBe(1);
  });

  it('뻗은 상태에서 기구를 놓으면 카운트 0 으로 초기화, N 새로 뽑기', () => {
    let r = 0;
    const { brain, eq } = setup({ rnd: () => r });
    eq.push({ id: 1, usePoint: { x: 10, y: 0 } });
    brain.onEquipmentPlaced();
    run(brain, 2);
    expect(brain.state).toBe('EXHAUSTED');
    brain.prod();
    run(brain, 0.25);
    brain.prod();
    expect(brain.prodCount).toBe(2);
    r = 0.99; // 새 N = 10
    eq.push({ id: 2, usePoint: { x: 200, y: 0 } });
    brain.onEquipmentPlaced();
    expect(brain.prodCount).toBe(0);
    expect(brain.prodTarget).toBe(10);
  });

  it('쿨타임 0.2초 중 입력은 무시', () => {
    const { brain, eq } = setup({ rnd: () => 0 });
    eq.push({ id: 1, usePoint: { x: 10, y: 0 } });
    brain.onEquipmentPlaced();
    run(brain, 2);
    expect(brain.prod()).toBe(true);
    expect(brain.prod()).toBe(false);
    run(brain, 0.1);
    expect(brain.prod()).toBe(false);
    run(brain, 0.15);
    expect(brain.prod()).toBe(true);
    expect(brain.prodCount).toBe(2);
  });

  it('기구가 하나도 없이 누워 있으면 4~6초마다 포즈를 바꾼다', () => {
    const { brain, eq, events } = setup({ rnd: () => 0 });
    eq.push({ id: 1, usePoint: { x: 10, y: 0 } });
    brain.onEquipmentPlaced();
    run(brain, 1.3);
    expect(brain.state).toBe('EXHAUSTED');
    eq.length = 0; // 사용 완료 후 제거된 상황
    run(brain, 4.2);
    expect(events.filter((e) => e.type === 'poseSwap').length).toBe(1);
  });
});

describe('재촉 + 번아웃 (SPEC 6장)', () => {
  it('운동 중 연타: 속도 증가, 번아웃 +10, 70 경고 → 100 기절 (포기 확률 0)', () => {
    const { brain, eq, events } = setup({ rnd: () => 0.99 }); // 포기 안 함
    eq.push({ id: 1, usePoint: { x: 1, y: 0 } });
    brain.onEquipmentPlaced();
    run(brain, 0.2);
    expect(brain.state).toBe('EXERCISING');
    brain.prod();
    expect(brain.speedMult).toBe(1.5);
    expect(brain.burnout).toBe(10);
    const order: string[] = [];
    for (let i = 0; i < 12 && brain.state !== 'FAINTED'; i++) {
      run(brain, 0.21);
      brain.prod();
      if (brain.state === 'EXHAUSTED') {
        // 세션이 끝났으면 다시 운동시키기 위해 다음 세션까지 진행
        break;
      }
    }
    for (const e of events) {
      if (e.type === 'burnoutWarning') order.push('warn');
      if (e.type === 'fainted') order.push('faint');
    }
    expect(brain.speedMult).toBeLessThanOrEqual(CONFIG.MAX_SPEED_MULT);
    // 세션 길이 1초라 운동 중에 끝날 수 있으므로, 긴 세션으로 따로 검증
    expect(order.indexOf('warn')).toBeLessThanOrEqual(order.indexOf('faint') === -1 ? Infinity : order.indexOf('faint'));
  });

  it('긴 세션 연타: 경고가 기절보다 먼저, 기절하면 FAINTED', () => {
    const eq: Candidate[] = [{ id: 1, usePoint: { x: 1, y: 0 } }];
    const brain = new Brain({ candidates: () => eq, sessionDurationSec: () => 1000 }, { x: 0, y: 0 }, CONFIG, () => 0.99);
    const order: string[] = [];
    brain.on((e) => {
      if (e.type === 'burnoutWarning') order.push('warn');
      if (e.type === 'fainted') order.push('faint');
    });
    brain.onEquipmentPlaced();
    run(brain, 0.2);
    for (let i = 0; i < 15 && brain.state !== 'FAINTED'; i++) {
      brain.prod();
      run(brain, 0.21);
    }
    expect(order).toEqual(['warn', 'faint']);
    expect(brain.state).toBe('FAINTED');
  });

  it('번아웃 50 이상에서 25% 확률로 "나 안 해!" → 세션 무효 → 바닥', () => {
    let r = 0.99;
    const eq: Candidate[] = [{ id: 1, usePoint: { x: 1, y: 0 } }];
    const brain = new Brain({ candidates: () => eq, sessionDurationSec: () => 1000 }, { x: 0, y: 0 }, CONFIG, () => r);
    const events: BrainEvent[] = [];
    brain.on((e) => events.push(e));
    brain.onEquipmentPlaced();
    run(brain, 0.2);
    brain.addBurnout(45);
    r = 0.1; // < 0.25 → 포기
    brain.prod();
    expect(brain.state).toBe('GAVE_UP');
    expect(events.some((e) => e.type === 'sessionAborted' && e.equipmentId === 1)).toBe(true);
    run(brain, 1.3);
    expect(brain.state).toBe('EXHAUSTED');
  });

  it('재촉이 2초 없으면 속도 배율이 서서히 1.0 으로', () => {
    const eq: Candidate[] = [{ id: 1, usePoint: { x: 1, y: 0 } }];
    const brain = new Brain({ candidates: () => eq, sessionDurationSec: () => 1000 }, { x: 0, y: 0 }, CONFIG, () => 0.99);
    brain.onEquipmentPlaced();
    run(brain, 0.2);
    brain.prod();
    run(brain, 0.21);
    brain.prod();
    expect(brain.speedMult).toBe(2);
    run(brain, 1.5);
    expect(brain.speedMult).toBe(2);
    run(brain, 3);
    expect(brain.speedMult).toBe(1);
  });

  it('번아웃 자연 감소: 바닥 −5/초, 릴스 −3/초', () => {
    const { brain } = setup();
    brain.addBurnout(30);
    run(brain, 2);
    expect(brain.burnout).toBeCloseTo(24, 0);
  });

  it('탄마는 2초간 운동만 2배, 10초 쿨타임 후 재사용', () => {
    const brain = new Brain({ candidates: () => [], sessionDurationSec: () => 100 }, { x: 0, y: 0 });
    brain.state = 'EXERCISING';
    brain.targetId = 1;
    brain.burnout = 40;
    expect(brain.applyBuff('chalk')).toBe(true);
    expect(brain.burnout).toBe(40); // 이전 멘탈 회복 효과는 제거
    expect(brain.applyBuff('chalk')).toBe(false);
    brain.update(2.5); // 만료를 넘는 프레임: 2초×2 + 0.5초
    expect(brain.sessionProgress).toBeCloseTo(0.045);
    expect(brain.buffRemaining('chalk')).toBe(0);
    expect(brain.buffCooldown('chalk')).toBe(7.5);
    brain.update(7.49);
    expect(brain.applyBuff('chalk')).toBe(false);
    brain.update(0.02);
    expect(brain.applyBuff('chalk')).toBe(true);
  });

  it('봉코는 이동만 2배, 탄마와 쿨타임을 별도로 관리', () => {
    const { brain } = setup({ equipment: [{ id: 1, usePoint: { x: 10000, y: 0 } }] });
    brain.onEquipmentPlaced();
    brain.applyBuff('chalk');
    brain.update(0.5);
    expect(brain.pos.x).toBeCloseTo(45); // 탄마는 걷기에 영향 없음
    expect(brain.applyBuff('bong')).toBe(true);
    brain.update(2.5);
    expect(brain.pos.x).toBeCloseTo(45 + 90 * 4.5);
    expect(brain.buffRemaining('bong')).toBe(0);
    expect(brain.buffCooldown('bong')).toBe(7.5);
    expect(brain.buffCooldown('chalk')).toBe(7);
  });

  it('허코는 바닥에서 자동 재촉해 일으키고 2초 뒤에는 멈춘다', () => {
    const { brain } = setup();
    brain.state = 'EXHAUSTED';
    brain.prodTarget = 10;
    expect(brain.applyBuff('heo')).toBe(true);
    brain.update(1.5);
    expect(brain.state).toBe('GETTING_UP');
    expect(brain.prodCount).toBe(10);
    expect(brain.burnout).toBe(0);
    brain.update(0.6);
    brain.state = 'EXHAUSTED';
    brain.prodCount = 0;
    brain.update(1);
    expect(brain.prodCount).toBe(0);
    expect(brain.applyBuff('heo')).toBe(false);
  });
});
