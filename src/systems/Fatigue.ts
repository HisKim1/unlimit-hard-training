// 지침: 누적 진행률 p 에 따라 운동 속도가 endSpeed^p 로 떨어진다 (스펙 11장). 순수 로직.
import type { EquipmentId } from '../equipment';
import type { WodDef } from '../wods';

/** 연속 지수 감속 계수: p=0 → 1, p=1 → endSpeed. p 는 0~1 로 자른다. */
export function fatigueFactor(endSpeed: number, p: number): number {
  const t = Math.min(1, Math.max(0, p));
  return Math.pow(endSpeed, t);
}

/** 이 WOD 에서 기구 한 세션에 걸리는 시간(초). sessionSec 덮어쓰기와 지침을 반영한다. */
export function wodSessionSec(wod: WodDef | null, eq: EquipmentId, baseSec: number, done: number, sessionProgress: number): number {
  const base = wod?.sessionSec?.[eq] ?? baseSec;
  const f = wod?.fatigue;
  if (!wod || !f || f.equipment !== eq) return base;
  const req = wod.requirements.find((r) => r.equipment === eq)?.sessions ?? 1;
  return base / fatigueFactor(f.endSpeed, (done + sessionProgress) / req);
}
