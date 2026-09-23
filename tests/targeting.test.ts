import { describe, expect, it } from 'vitest';
import { selectNext, type Candidate } from '../src/systems/Targeting';

const c = (id: number, x: number, y: number): Candidate => ({ id, usePoint: { x, y } });
const P = { x: 0, y: 0 };
const EPS = 8;
const never = () => {
  throw new Error('rnd should not be called');
};

describe('selectNext (SPEC 7장)', () => {
  it('기구가 없으면 null', () => {
    expect(selectNext(P, [], null, EPS)).toBeNull();
  });

  it('가장 가까운 기구 하나를 고른다 (난수 사용 안 함)', () => {
    expect(selectNext(P, [c(1, 100, 0), c(2, 50, 0), c(3, 0, 200)], null, EPS, never)).toBe(2);
  });

  it('방금 사용한 기구는 후보에서 뺀다', () => {
    expect(selectNext(P, [c(1, 10, 0), c(2, 300, 0)], 1, EPS, never)).toBe(2);
  });

  it('남은 기구가 방금 쓴 기구 하나뿐이면 그 기구를 다시 쓴다', () => {
    expect(selectNext(P, [c(7, 10, 0)], 7, EPS, never)).toBe(7);
  });

  it('EPS 이내 거리 차이는 동률로 본다: 두 번째로 가까운 기구 방향과 가장 비슷한 쪽', () => {
    // 1: 오른쪽 100, 2: 왼쪽 105 (차이 5 ≤ 8 → 동률), 3: 오른쪽 위 300 → 1 방향과 비슷
    const got = selectNext(P, [c(1, 100, 0), c(2, -105, 0), c(3, 300, -20)], null, EPS, never);
    expect(got).toBe(1);
    // 3을 왼쪽으로 옮기면 2 선택
    expect(selectNext(P, [c(1, 100, 0), c(2, -105, 0), c(3, -300, -20)], null, EPS, never)).toBe(2);
  });

  it('EPS 를 넘는 차이는 동률이 아니다', () => {
    expect(selectNext(P, [c(1, 100, 0), c(2, -109, 0), c(3, -300, 0)], null, EPS, never)).toBe(1);
  });

  it('동률인데 나머지 후보가 없으면 동률 집합에서 무작위', () => {
    const cands = [c(1, 100, 0), c(2, -100, 0)];
    expect(selectNext(P, cands, null, EPS, () => 0)).toBe(1);
    expect(selectNext(P, cands, null, EPS, () => 0.99)).toBe(2);
  });

  it('코사인 유사도까지 같으면 무작위', () => {
    // 1, 2 는 대칭, 3 은 정확히 아래쪽 → 두 방향의 코사인이 같다
    const cands = [c(1, 100, 0), c(2, -100, 0), c(3, 0, 400)];
    expect(selectNext(P, cands, null, EPS, () => 0)).toBe(1);
    expect(selectNext(P, cands, null, EPS, () => 0.99)).toBe(2);
  });

  it('방금 쓴 기구가 가장 가까워도 제외 후 동률 규칙 적용', () => {
    const cands = [c(9, 1, 0), c(1, 100, 0), c(2, -104, 0), c(3, -250, 0)];
    expect(selectNext(P, cands, 9, EPS, never)).toBe(2);
  });

  it('원장님 위치와 같은 지점의 기구는 거리 0 → 단독 최근접', () => {
    expect(selectNext(P, [c(1, 0, 0), c(2, 5, 0)], null, 0, never)).toBe(1);
  });

  it('원장님 위치에 겹친 동률 기구들(방향 정의 불가)도 에러 없이 고른다', () => {
    const got = selectNext(P, [c(1, 0, 0), c(2, 0, 0), c(3, 50, 0)], null, EPS, () => 0.5);
    expect([1, 2]).toContain(got);
  });
});
