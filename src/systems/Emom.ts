// EMOM 벨 시계 (스펙 5장). Phaser 와 무관한 순수 로직.
// GameScene 이 dt 로 update() 를 돌리고, 돌려받은 이벤트를 처리한다.
import { CONFIG } from '../config';
import type { EquipmentId } from '../equipment';

export interface EmomDef {
  kind: 'interrupt' | 'rotate';
  intervalSec: number;
  /** 칼수형: 벨마다 끼워 넣는 맨몸 동작 */
  interrupt?: { anim: string; label: string; durationSec: number };
  /** 순환형: 구간 k 의 기구 = rotation[k % rotation.length] */
  rotation?: EquipmentId[];
}

export type EmomEvent =
  | { type: 'warn'; bell: number } // 벨 k 의 EMOM_WARN_BEFORE_SEC 전
  | { type: 'bell'; bell: number } // 창 열림
  | { type: 'answered'; bell: number } // 창 안에서 재촉 수 충족
  | { type: 'missed'; bell: number }; // 창 종료까지 미충족 (이후 시계는 멈춘다)

type Cfg = Pick<typeof CONFIG, 'EMOM_PREP_SEC' | 'EMOM_WINDOW_SEC' | 'EMOM_PRODS_REQUIRED' | 'EMOM_WARN_BEFORE_SEC'>;

export class EmomClock {
  private t = 0;
  private nextBell = 0;
  private warnedBell = -1;
  private openBell = -1;
  private count = 0;
  private pendingAnswer = -1;
  private stopped = false;

  constructor(readonly def: EmomDef, private readonly cfg: Cfg = CONFIG) {}

  bellTime(k: number): number {
    return this.cfg.EMOM_PREP_SEC + k * this.def.intervalSec;
  }

  get windowOpen(): boolean {
    return this.openBell >= 0;
  }

  /** 현재 창에서 받은 재촉 수 */
  get prodCount(): number {
    return this.windowOpen ? this.count : 0;
  }

  get windowRemainingSec(): number {
    return this.windowOpen ? Math.max(0, this.bellTime(this.openBell) + this.cfg.EMOM_WINDOW_SEC - this.t) : 0;
  }

  get secToNextBell(): number {
    return Math.max(0, this.bellTime(this.nextBell) - this.t);
  }

  /** 현재 구간 번호 (첫 벨 전 -1) */
  get interval(): number {
    return this.nextBell - 1;
  }

  station(k: number): EquipmentId | null {
    const r = this.def.rotation;
    if (!r || r.length === 0 || k < 0) return null;
    return r[k % r.length];
  }

  stop(): void {
    this.stopped = true;
    this.openBell = -1;
    this.pendingAnswer = -1;
  }

  /** 창이 열려 있으면 재촉을 세고 true. 필요 수를 채우면 창을 닫고 다음 update 에서 answered. */
  prod(): boolean {
    if (this.stopped || this.openBell < 0) return false;
    this.count++;
    if (this.count >= this.cfg.EMOM_PRODS_REQUIRED) {
      this.pendingAnswer = this.openBell;
      this.openBell = -1;
    }
    return true;
  }

  update(dtSec: number): EmomEvent[] {
    const out: EmomEvent[] = [];
    if (this.stopped) return out;
    if (this.pendingAnswer >= 0) {
      out.push({ type: 'answered', bell: this.pendingAnswer });
      this.pendingAnswer = -1;
    }
    const end = this.t + dtSec;
    // 경계(창 끝 · 경고 · 벨)를 시간 순서대로 처리한다
    for (;;) {
      const bell = this.bellTime(this.nextBell);
      let at = Infinity;
      let kind: 'warn' | 'bell' | 'close' | null = null;
      if (this.openBell >= 0) {
        at = this.bellTime(this.openBell) + this.cfg.EMOM_WINDOW_SEC;
        kind = 'close';
      }
      if (this.warnedBell < this.nextBell) {
        const w = Math.max(0, bell - this.cfg.EMOM_WARN_BEFORE_SEC);
        if (w < at) {
          at = w;
          kind = 'warn';
        }
      } else if (bell < at) {
        at = bell;
        kind = 'bell';
      }
      if (kind === null || at > end) break;
      this.t = Math.max(this.t, at);
      if (kind === 'close') {
        out.push({ type: 'missed', bell: this.openBell });
        this.stop();
        return out;
      }
      if (kind === 'warn') {
        this.warnedBell = this.nextBell;
        out.push({ type: 'warn', bell: this.nextBell });
      } else {
        this.openBell = this.nextBell;
        this.count = 0;
        out.push({ type: 'bell', bell: this.nextBell });
        this.nextBell++;
      }
    }
    this.t = end;
    return out;
  }
}
