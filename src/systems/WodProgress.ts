// WOD 진행도 (SPEC 9장). 순수 로직.
import type { EquipmentId } from '../equipment';
import type { WodDef } from '../wods';
import { STR } from '../strings';

export interface SessionInfo {
  /** 머리 위 세션 라벨 */
  label: string;
  /** 이 세션이 WOD 진행도에 반영되는가 */
  counts: boolean;
}

export class WodProgress {
  readonly done = new Map<EquipmentId, number>();

  constructor(readonly wod: WodDef | null) {
    for (const r of wod?.requirements ?? []) this.done.set(r.equipment, 0);
  }

  get isFree(): boolean {
    return this.wod === null;
  }

  required(eq: EquipmentId): number {
    return this.wod?.requirements.find((r) => r.equipment === eq)?.sessions ?? 0;
  }

  /** 세션 시작 전에 라벨과 반영 여부를 본다 */
  peek(eq: EquipmentId, exercise: string): SessionInfo {
    if (!this.wod) return { label: exercise, counts: false };
    const req = this.wod.requirements.find((r) => r.equipment === eq);
    if (!req) return { label: STR.offWod(exercise), counts: false };
    const n = this.done.get(eq) ?? 0;
    if (n >= req.sessions) return { label: STR.moreThanNeeded(exercise), counts: false };
    return { label: req.labels[n] ?? exercise, counts: true };
  }

  /** 세션 완료. 진행도에 반영됐으면 true */
  commit(eq: EquipmentId): boolean {
    if (!this.wod) return false;
    const req = this.wod.requirements.find((r) => r.equipment === eq);
    if (!req) return false;
    const n = this.done.get(eq) ?? 0;
    if (n >= req.sessions) return false;
    this.done.set(eq, n + 1);
    return true;
  }

  get complete(): boolean {
    if (!this.wod) return false;
    return this.wod.requirements.every((r) => (this.done.get(r.equipment) ?? 0) >= r.sessions);
  }

  /** 완료한 세션 중 총 1~3회를 잊는다. 0 미만으로 내려가지 않는다. */
  forget(rnd: () => number = Math.random): { equipment: EquipmentId; count: number }[] {
    const total = [...this.done.values()].reduce((sum, n) => sum + n, 0);
    if (!total) return [];
    const losses = new Map<EquipmentId, number>();
    const count = 1 + Math.floor(rnd() * Math.min(3, total));
    for (let i = 0; i < count; i++) {
      const available = [...this.done].filter(([, n]) => n > 0);
      const [eq, n] = available[Math.floor(rnd() * available.length)];
      this.done.set(eq, n - 1);
      losses.set(eq, (losses.get(eq) ?? 0) + 1);
    }
    return [...losses].map(([equipment, count]) => ({ equipment, count }));
  }

  /** 남은 세션 수가 있는 기구인가 (HUD 강조용) */
  remaining(eq: EquipmentId): number {
    return Math.max(0, this.required(eq) - (this.done.get(eq) ?? 0));
  }
}
