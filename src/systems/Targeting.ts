// 다음 기구 선택 (SPEC 7장: 최근접 + 동률 규칙). 순수 함수 — 단위 테스트 대상.

export interface Candidate {
  id: number;
  usePoint: { x: number; y: number };
}

/**
 * @param p 원장님 발 위치
 * @param placed 놓인 기구 목록
 * @param lastId 방금 사용한 기구 id (없으면 null)
 * @param eps 동률 허용 오차(px)
 * @param rnd 0 이상 1 미만 난수 (테스트에서 주입)
 * @returns 선택된 기구 id, 후보가 없으면 null
 */
export function selectNext(
  p: { x: number; y: number },
  placed: readonly Candidate[],
  lastId: number | null,
  eps: number,
  rnd: () => number = Math.random,
): number | null {
  if (placed.length === 0) return null;
  // 후보 C = E − {last} (단, E 에 last 하나뿐이면 C = {last})
  let C = placed.filter((e) => e.id !== lastId);
  if (C.length === 0) C = placed.filter((e) => e.id === lastId);
  if (C.length === 0) return null;

  const dist = (e: Candidate) => Math.hypot(e.usePoint.x - p.x, e.usePoint.y - p.y);
  const d = new Map<number, number>();
  for (const e of C) d.set(e.id, dist(e));
  const dMin = Math.min(...C.map((e) => d.get(e.id)!));
  const T = C.filter((e) => d.get(e.id)! - dMin <= eps);
  if (T.length === 1) return T[0].id;

  const R = C.filter((e) => !T.includes(e));
  if (R.length === 0) return randomOf(T, rnd).id;

  // c = R 중 p 에서 가장 가까운 기구 (두 번째로 가까운 기구)
  let c = R[0];
  for (const e of R) if (d.get(e.id)! < d.get(c.id)!) c = e;
  const cv = { x: c.usePoint.x - p.x, y: c.usePoint.y - p.y };

  // T 중 방향 벡터 (t − p)와 (c − p)의 코사인 유사도가 가장 큰 t
  const cos = (t: Candidate) => {
    const tv = { x: t.usePoint.x - p.x, y: t.usePoint.y - p.y };
    const nt = Math.hypot(tv.x, tv.y);
    const nc = Math.hypot(cv.x, cv.y);
    if (nt === 0 || nc === 0) return -Infinity; // 방향이 정의되지 않으면 우선순위 최하
    return (tv.x * cv.x + tv.y * cv.y) / (nt * nc);
  };
  const COS_EPS = 1e-9;
  const scored = T.map((t) => ({ t, s: cos(t) }));
  const best = Math.max(...scored.map((x) => x.s));
  if (!Number.isFinite(best)) return randomOf(T, rnd).id;
  const top = scored.filter((x) => best - x.s <= COS_EPS).map((x) => x.t);
  return top.length === 1 ? top[0].id : randomOf(top, rnd).id;
}

function randomOf<T>(arr: readonly T[], rnd: () => number): T {
  const i = Math.min(arr.length - 1, Math.floor(rnd() * arr.length));
  return arr[i];
}
