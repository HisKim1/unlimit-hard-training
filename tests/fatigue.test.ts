import { describe, expect, it } from 'vitest';
import { fatigueFactor, wodSessionSec } from '../src/systems/Fatigue';
import { WODS } from '../src/wods';

const devil = () => WODS.find((w) => w.id === 'devil1000')!;

describe('지침 (스펙 11장)', () => {
  it('p=0 → 1, p=1 → endSpeed, 단조 감소, 범위 밖은 자름', () => {
    expect(fatigueFactor(1 / 8, 0)).toBe(1);
    expect(fatigueFactor(1 / 8, 1)).toBeCloseTo(1 / 8);
    expect(fatigueFactor(1 / 8, 0.5)).toBeCloseTo(Math.sqrt(1 / 8));
    let prev = 2;
    for (let i = 0; i <= 10; i++) {
      const f = fatigueFactor(1 / 8, i / 10);
      expect(f).toBeLessThan(prev);
      prev = f;
    }
    expect(fatigueFactor(1 / 8, -1)).toBe(1);
    expect(fatigueFactor(1 / 8, 2)).toBeCloseTo(1 / 8);
  });

  it('데빌프레스: 기본 10초, 진행할수록 길어짐, 다른 기구·다른 WOD 는 그대로', () => {
    const d = devil();
    expect(d.level).toBe(3);
    expect(d.requirements).toEqual([{ equipment: 'dumbbell', sessions: 10, labels: Array.from({ length: 10 }, (_, i) => `데빌프레스 ${(i + 1) * 100}/1000`) }]);
    expect(wodSessionSec(d, 'dumbbell', 5, 0, 0)).toBe(10);
    expect(wodSessionSec(d, 'dumbbell', 5, 5, 0)).toBeCloseTo(10 / Math.sqrt(1 / 8));
    expect(wodSessionSec(d, 'dumbbell', 5, 9, 1)).toBeCloseTo(80);
    expect(wodSessionSec(d, 'barbell', 5, 9, 1)).toBe(5);
    expect(wodSessionSec(WODS[0], 'barbell', 5, 2, 0.5)).toBe(5);
    expect(wodSessionSec(null, 'dumbbell', 5, 0, 0)).toBe(5);
  });

  it('도움 없이 순수 운동 시간 ≈ 337초 (Brain 과 같은 적분)', () => {
    const d = devil();
    let t = 0;
    const dt = 0.01;
    for (let done = 0; done < 10; done++) {
      let prog = 0;
      while (prog < 1) {
        prog += dt / wodSessionSec(d, 'dumbbell', 5, done, prog);
        t += dt;
      }
    }
    expect(t).toBeGreaterThan(330);
    expect(t).toBeLessThan(345);
  });
});
