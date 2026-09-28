import { describe, expect, it } from 'vitest';
import { EmomClock, type EmomDef, type EmomEvent } from '../src/systems/Emom';

const cfg = { EMOM_PREP_SEC: 5, EMOM_WINDOW_SEC: 3, EMOM_PRODS_REQUIRED: 5, EMOM_WARN_BEFORE_SEC: 3 };
const kalsu: EmomDef = { kind: 'interrupt', intervalSec: 10, interrupt: { anim: 'wj_burpee', label: '버피 5개', durationSec: 3 } };
const names = (ev: EmomEvent[]) => ev.map((e) => `${e.type}${e.bell}`);

describe('EmomClock (스펙 5장)', () => {
  it('준비 5초 뒤 첫 벨, 벨 3초 전 경고', () => {
    const c = new EmomClock(kalsu, cfg);
    expect(c.interval).toBe(-1);
    expect(names(c.update(1.5))).toEqual([]);
    expect(names(c.update(0.5))).toEqual(['warn0']);
    expect(names(c.update(2.5))).toEqual([]);
    expect(names(c.update(0.5))).toEqual(['bell0']);
    expect(c.windowOpen).toBe(true);
    expect(c.interval).toBe(0);
    expect(c.secToNextBell).toBe(10);
    expect(c.windowRemainingSec).toBe(3);
  });

  it('창 안에서 5번 재촉하면 answered, 창이 닫히고 이후 재촉은 무시, 다음 벨 진행', () => {
    const c = new EmomClock(kalsu, cfg);
    expect(names(c.update(5))).toEqual(['warn0', 'bell0']);
    for (let i = 0; i < 4; i++) expect(c.prod()).toBe(true);
    expect(c.prodCount).toBe(4);
    expect(c.prod()).toBe(true);
    expect(c.windowOpen).toBe(false);
    expect(c.prod()).toBe(false);
    expect(names(c.update(0.01))).toEqual(['answered0']);
    expect(names(c.update(7))).toEqual(['warn1']);
    expect(names(c.update(3))).toEqual(['bell1']);
    expect(c.interval).toBe(1);
  });

  it('4번만 누르면 창 끝에 missed, 그 뒤로는 멈춤', () => {
    const c = new EmomClock(kalsu, cfg);
    c.update(5);
    for (let i = 0; i < 4; i++) c.prod();
    expect(names(c.update(2.9))).toEqual([]);
    expect(names(c.update(0.2))).toEqual(['missed0']);
    expect(c.windowOpen).toBe(false);
    expect(names(c.update(100))).toEqual([]);
    expect(c.prod()).toBe(false);
  });

  it('창 밖 재촉은 false', () => {
    const c = new EmomClock(kalsu, cfg);
    expect(c.prod()).toBe(false);
    c.update(3);
    expect(c.prod()).toBe(false);
  });

  it('큰 dt 한 번에 여러 경계를 넘어도 시간 순서대로, missed 뒤로는 없음', () => {
    const c = new EmomClock(kalsu, cfg);
    expect(names(c.update(40))).toEqual(['warn0', 'bell0', 'missed0']);
  });

  it('창 끝 직전 프레임의 5번째 재촉은 answered 가 이긴다', () => {
    const c = new EmomClock(kalsu, cfg);
    c.update(5);
    c.update(2.9);
    for (let i = 0; i < 5; i++) c.prod();
    expect(names(c.update(1))).toEqual(['answered0']);
  });

  it('stop() 뒤에는 이벤트·재촉 없음', () => {
    const c = new EmomClock(kalsu, cfg);
    c.update(5);
    c.stop();
    expect(c.prod()).toBe(false);
    expect(names(c.update(30))).toEqual([]);
  });

  it('순환형 구간 기구', () => {
    const c = new EmomClock({ kind: 'rotate', intervalSec: 15, rotation: ['pullup', 'mat'] }, cfg);
    expect([0, 1, 2, 3].map((k) => c.station(k))).toEqual(['pullup', 'mat', 'pullup', 'mat']);
    expect(c.station(-1)).toBeNull();
    expect(new EmomClock(kalsu, cfg).station(0)).toBeNull();
  });
});
