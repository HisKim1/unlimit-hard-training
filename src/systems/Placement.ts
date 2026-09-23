// 기구 배치 판정 (SPEC 8.2). 순수 로직.
import { CONFIG, depthScale, type Point } from '../config';
import type { EquipmentId, Zone } from '../equipment';
import { EQUIPMENT } from '../equipment';

export interface PlacedInfo {
  id: number;
  type: EquipmentId;
  pos: Point;
  zone: Zone;
  slot: number; // rig/ceiling 슬롯 번호, 바닥은 -1
}

export type PlaceResult =
  | { ok: true; pos: Point; slot: number }
  | { ok: false; pos: Point; reason: 'outside' | 'overlap' | 'full' | 'slotTaken' };

export function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    if (Math.abs(cross) < 1e-6 && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)
      && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)) return true;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 두 타원 풋프린트가 겹치는가 (원근 스케일 적용, 타원을 합친 반지름 기준 근사) */
export function footprintsOverlap(
  a: Point, ar: { rx: number; ry: number },
  b: Point, br: { rx: number; ry: number },
): boolean {
  const sa = depthScale(a.y);
  const sb = depthScale(b.y);
  const rx = ar.rx * sa + br.rx * sb;
  const ry = ar.ry * sa + br.ry * sb;
  const dx = (a.x - b.x) / rx;
  const dy = (a.y - b.y) / ry;
  return dx * dx + dy * dy < 1;
}

export function slotPoints(zone: Zone): readonly Point[] {
  if (zone === 'rig') return CONFIG.RIG_SLOT_POINTS;
  if (zone === 'ceiling') return CONFIG.ROPE_ANCHOR_POINTS;
  return [];
}

/**
 * 드롭 지점 p 에 type 기구를 놓을 수 있는지 판정.
 * rig/ceiling 은 가까운 슬롯으로 스냅한다.
 */
export function evaluatePlacement(
  type: EquipmentId,
  p: Point,
  placed: readonly PlacedInfo[],
  wonjang: Point | null,
): PlaceResult {
  const def = EQUIPMENT[type];
  const zone = def.zone;
  if (zone === 'rig' || zone === 'ceiling') {
    const pts = slotPoints(zone);
    let best = -1;
    let bestD = Infinity;
    let free = -1;
    let freeD = Infinity;
    pts.forEach((s, i) => {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
      if (d <= CONFIG.SLOT_SNAP_RADIUS_PX && d < freeD
        && !placed.some(e => e.zone === zone && e.slot === i) && !overlapsAny(type, s, placed, wonjang)) {
        free = i;
        freeD = d;
      }
    });
    if (free >= 0) return { ok: true, pos: pts[free], slot: free };
    if (best < 0 || bestD > CONFIG.SLOT_SNAP_RADIUS_PX) return { ok: false, pos: p, reason: 'outside' };
    const pos = pts[best];
    const taken = placed.some((e) => e.zone === zone && e.slot === best);
    if (taken) {
      const anyFree = pts.some((_, i) => !placed.some((e) => e.zone === zone && e.slot === i));
      return { ok: false, pos, reason: anyFree ? 'slotTaken' : 'full' };
    }
    if (overlapsAny(type, pos, placed, wonjang)) return { ok: false, pos, reason: 'overlap' };
    return { ok: true, pos, slot: best };
  }
  if (zone === 'floor') {
    if (!pointInPolygon(p, CONFIG.FLOOR_POLYGON)) return { ok: false, pos: p, reason: 'outside' };
    const floorCount = placed.filter((e) => e.zone === 'floor').length;
    if (floorCount >= CONFIG.MAX_FLOOR_EQUIPMENT) return { ok: false, pos: p, reason: 'full' };
    if (overlapsAny(type, p, placed, wonjang)) {
      // 가까운 빈자리로만 보정. 멀리 떨어뜨리거나 겹쳐 놓지는 않는다.
      for (let radius = 16; radius <= 96; radius += 16) {
        for (let i = 0; i < 16; i++) {
          const angle = i * Math.PI / 8;
          const pos = { x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius };
          if (pointInPolygon(pos, CONFIG.FLOOR_POLYGON) && !overlapsAny(type, pos, placed, wonjang)) return { ok: true, pos, slot: -1 };
        }
      }
      return { ok: false, pos: p, reason: 'overlap' };
    }
    return { ok: true, pos: p, slot: -1 };
  }
  return { ok: false, pos: p, reason: 'outside' };
}

function overlapsAny(type: EquipmentId, p: Point, placed: readonly PlacedInfo[], wonjang: Point | null): boolean {
  const fp = EQUIPMENT[type].footprint;
  for (const e of placed) {
    if (footprintsOverlap(p, fp, e.pos, EQUIPMENT[e.type].footprint)) return true;
  }
  if (wonjang) {
    const r = CONFIG.WONJANG_BODY_RADIUS_PX;
    if (footprintsOverlap(p, fp, wonjang, { rx: r, ry: r * 0.45 })) return true;
  }
  return false;
}

/** 원장님이 서는 지점을 걷기 영역 안으로 당긴다 */
export function clampWalk(p: Point): Point {
  const b = CONFIG.WALK_BOUNDS;
  return { x: Math.min(b.maxX, Math.max(b.minX, p.x)), y: Math.min(b.maxY, Math.max(b.minY, p.y)) };
}
