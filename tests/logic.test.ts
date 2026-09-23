import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { evaluatePlacement, pointInPolygon, type PlacedInfo } from '../src/systems/Placement';
import { SAVE_KEY, SaveStore, type KV } from '../src/systems/Save';
import { WodProgress } from '../src/systems/WodProgress';
import { WODS } from '../src/wods';

class MemKV implements KV {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

describe('Save (SPEC 10장)', () => {
  it('Fran 클리어 → Lv2 열림, 새로 만든 저장소에서도 유지', () => {
    const kv = new MemKV();
    const s1 = new SaveStore(kv);
    expect(s1.isUnlocked(2)).toBe(false);
    expect(s1.recordClear('fran', 1, 83.24)).toBe(true);
    const s2 = new SaveStore(kv);
    expect(s2.isUnlocked(2)).toBe(true);
    expect(s2.best('fran')).toBe(83.2);
    expect(s2.recordClear('fran', 1, 90)).toBe(false);
    expect(s2.best('fran')).toBe(83.2);
  });

  it('쓰기 실패해도 메모리 값으로 진행', () => {
    const kv: KV = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const s = new SaveStore(kv);
    s.setMuted(true);
    expect(s.muted).toBe(true);
  });

  it('버전이 다르거나 깨진 데이터면 기본값', () => {
    const kv = new MemKV();
    kv.setItem(SAVE_KEY, JSON.stringify({ version: 0, unlockedLevel: 5 }));
    expect(new SaveStore(kv).get().unlockedLevel).toBe(1);
    kv.setItem(SAVE_KEY, '{not json');
    expect(new SaveStore(kv).get().unlockedLevel).toBe(1);
  });
});

describe('WodProgress (SPEC 9장)', () => {
  const fran = WODS.find((w) => w.id === 'fran')!;
  it('라벨 순서, 딴짓, 초과분, 완료', () => {
    const p = new WodProgress(fran);
    expect(p.peek('barbell', '스러스터').label).toBe('스러스터 21개');
    expect(p.commit('barbell')).toBe(true);
    expect(p.peek('barbell', '스러스터').label).toBe('스러스터 15개');
    expect(p.peek('dumbbell', '데빌프레스')).toEqual({ label: '(딴짓) 데빌프레스', counts: false });
    expect(p.commit('dumbbell')).toBe(false);
    p.commit('barbell');
    p.commit('barbell');
    expect(p.peek('barbell', '스러스터').counts).toBe(false);
    expect(p.complete).toBe(false);
    p.commit('pullup');
    p.commit('pullup');
    p.commit('pullup');
    expect(p.complete).toBe(true);
  });

  it('모든 WOD 라벨 개수 = 요구 세션 수', () => {
    for (const w of WODS) for (const r of w.requirements) expect(r.labels.length).toBe(r.sessions);
  });

  it('망각은 완료분에서 1~3회만 차감하고 다시 완료할 수 있다', () => {
    const p = new WodProgress(fran);
    expect(p.forget()).toEqual([]);
    p.done.set('barbell', 3);
    p.done.set('pullup', 1);
    expect(p.forget(() => 0.999)).toEqual([{ equipment: 'pullup', count: 1 }, { equipment: 'barbell', count: 2 }]);
    expect(p.remaining('barbell')).toBe(2);
    expect(p.peek('barbell', '스러스터').counts).toBe(true);
    expect(p.forget(() => 0)).toEqual([{ equipment: 'barbell', count: 1 }]);
    expect(p.forget()).toEqual([]);
    expect(new WodProgress(null).forget()).toEqual([]);
    for (let i = 0; i < 3; i++) { p.commit('barbell'); p.commit('pullup'); }
    expect(p.complete).toBe(true);
  });

  it('자유 모드는 진행도 없음', () => {
    const p = new WodProgress(null);
    expect(p.peek('barbell', '스러스터')).toEqual({ label: '스러스터', counts: false });
    expect(p.complete).toBe(false);
  });
});

describe('Placement (SPEC 8.2)', () => {
  it('매트 다각형 안/밖', () => {
    expect(pointInPolygon({ x: 360, y: 850 }, CONFIG.FLOOR_POLYGON)).toBe(true);
    expect(pointInPolygon({ x: 360, y: 300 }, CONFIG.FLOOR_POLYGON)).toBe(false);
    expect(pointInPolygon({ x: 610, y: 1040 }, CONFIG.FLOOR_POLYGON)).toBe(false); // 재촉 버튼 자리
  });

  it('풀업 바는 리그 슬롯에만, 로프는 천장 고정점에만', () => {
    const rig = CONFIG.RIG_SLOT_POINTS[1];
    const r1 = evaluatePlacement('pullup', { x: rig.x + 20, y: rig.y + 30 }, [], null);
    expect(r1.ok).toBe(true);
    expect(r1.pos).toEqual(rig);
    expect(evaluatePlacement('pullup', { x: 360, y: 950 }, [], null).ok).toBe(false);
    const anchor = CONFIG.ROPE_ANCHOR_POINTS[0];
    expect(evaluatePlacement('rope', { x: anchor.x + 10, y: anchor.y }, [], null).ok).toBe(true);
    expect(evaluatePlacement('rope', CONFIG.RIG_SLOT_POINTS[0], [], null).ok).toBe(false);
  });

  it('바닥에서 겹치면 가까운 빈자리로 보정, 이미 찬 슬롯은 무효', () => {
    const placed: PlacedInfo[] = [{ id: 1, type: 'barbell', pos: { x: 300, y: 850 }, zone: 'floor', slot: -1 }];
    const snapped = evaluatePlacement('dumbbell', { x: 310, y: 852 }, placed, null);
    expect(snapped.ok).toBe(true);
    expect(snapped.pos).not.toEqual({ x: 310, y: 852 });
    expect(Math.hypot(snapped.pos.x - 310, snapped.pos.y - 852)).toBeLessThanOrEqual(96);
    expect(evaluatePlacement('dumbbell', snapped.pos, placed, null).pos).toEqual(snapped.pos);
    expect(evaluatePlacement('dumbbell', { x: 300, y: 950 }, placed, null).ok).toBe(true);
    expect(evaluatePlacement('dumbbell', { x: 500, y: 850 }, placed, { x: 500, y: 850 }).ok).toBe(true);
    const rigPlaced: PlacedInfo[] = [{ id: 2, type: 'pullup', pos: CONFIG.RIG_SLOT_POINTS[0], zone: 'rig', slot: 0 }];
    expect(evaluatePlacement('pullup', CONFIG.RIG_SLOT_POINTS[0], rigPlaced, null).ok).toBe(false);
  });

  it('바닥 기구 최대 개수', () => {
    const placed: PlacedInfo[] = [0, 1, 2, 3, 4].map((i) => ({
      id: i, type: 'kettlebell', pos: { x: 80 + i * 120, y: 760 }, zone: 'floor', slot: -1,
    }));
    const r = evaluatePlacement('kettlebell', { x: 360, y: 950 }, placed, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('full');
  });

  it('초록 영역 경계와 윗부분도 배치되며 밖으로 보정하지 않는다', () => {
    for (const p of [...CONFIG.FLOOR_POLYGON, { x: 150, y: 730 }]) {
      expect(evaluatePlacement('barbell', p, [], null)).toMatchObject({ ok: true, pos: p });
    }
    expect(evaluatePlacement('barbell', { x: 150, y: 620 }, [], null).ok).toBe(false);
  });
});
