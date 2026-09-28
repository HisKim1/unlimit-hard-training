// 원장님 상태 기계 + 재촉 + 번아웃 (SPEC 5·6장). Phaser 와 무관한 순수 로직.
// 화면 연출은 GameScene 이 이벤트를 받아 처리한다.
import { CONFIG, type Point } from '../config';
import { STR, pick } from '../strings';
import { selectNext, type Candidate } from './Targeting';
import type { BuffId } from '../buffs';

export type WState =
  | 'IDLE_REELS'
  | 'WALKING'
  | 'EXERCISING'
  | 'EXHAUSTED'
  | 'GETTING_UP'
  | 'GAVE_UP'
  | 'FAINTED'
  | 'CELEBRATING';

/** 재촉 진행에 따른 바닥 포즈 단계 */
export type PoseTier = 'base' | 'mid' | 'high';

export type BrainEvent =
  | { type: 'state'; from: WState; to: WState }
  | { type: 'toast'; text: string }
  | { type: 'startExercise'; equipmentId: number }
  | { type: 'sessionComplete'; equipmentId: number }
  | { type: 'sessionAborted'; equipmentId: number }
  | { type: 'poseChange'; tier: PoseTier } // 바닥 포즈 단계가 바뀜 (또는 새로 뻗음)
  | { type: 'poseSwap' } // 기구 없이 누워 있을 때 4~6초마다 다른 포즈
  | { type: 'prod'; kind: 'reels' | 'floor' | 'active' | 'none' }
  | { type: 'burnoutWarning' }
  | { type: 'fainted' }
  | { type: 'lazyWarning' } // 바닥에서 오래 재촉이 없음 (스펙 12장)
  | { type: 'chimpPunished' }; // 경고 후 유예 안에 재촉이 부족해 이번 판 침팬지 확률 상승

export interface BrainWorld {
  /** 현재 놓인 기구들 (원장님이 사용할 수 있는 것만) */
  candidates(): Candidate[];
  sessionDurationSec(equipmentId: number): number;
}

type Cfg = typeof CONFIG;

export class Brain {
  state: WState = 'IDLE_REELS';
  pos: Point;
  burnout = 0;
  speedMult = 1;
  prodCount = 0;
  prodTarget = 0;
  poseTier: PoseTier = 'base';
  targetId: number | null = null;
  lastId: number | null = null;
  sessionProgress = 0;

  private clockMs = 0;
  private lastProdMs = -Infinity;
  private lastActiveProdMs = -Infinity;
  private lastSpeedToastMs = -Infinity;
  private stateTimerMs = 0;
  private poseSwapInMs = 0;
  private listeners: ((e: BrainEvent) => void)[] = [];
  private buffStarted: Record<BuffId, number> = { chalk: -Infinity, bong: -Infinity, heo: -Infinity, jong: -Infinity };
  private heoProdSec = 0;
  private lastCheerMs = -Infinity;
  private cheerPending = false;
  private floorCheered = false;
  /** 이번 판에서 나태 벌칙(침팬지 확률 상승)을 받았는가. 되돌아가지 않는다. */
  chimpPunished = false;
  private exhaustedAtMs = 0;
  private lazyWarned = false;
  private graceUntilMs = -1;
  private graceProds = 0;

  constructor(
    private readonly world: BrainWorld,
    start: Point,
    private readonly cfg: Cfg = CONFIG,
    private readonly rnd: () => number = Math.random,
  ) {
    this.pos = { ...start };
  }

  on(fn: (e: BrainEvent) => void): void {
    this.listeners.push(fn);
  }

  private emit(e: BrainEvent): void {
    for (const l of this.listeners) l(e);
  }

  /** 걷는 중 번아웃이 높으면 기어간다 */
  get crawling(): boolean {
    return this.state === 'WALKING' && this.burnout >= this.cfg.CRAWL_THRESHOLD;
  }

  get prodRatio(): number {
    return this.prodTarget > 0 ? this.prodCount / this.prodTarget : 0;
  }

  get nowMs(): number {
    return this.clockMs;
  }

  /** 재촉 쿨타임 중인가 */
  get prodCoolingDown(): boolean {
    return this.clockMs - this.lastProdMs < this.cfg.PROD_COOLDOWN_MS;
  }

  private setState(to: WState): void {
    const from = this.state;
    this.state = to;
    this.stateTimerMs = 0;
    this.emit({ type: 'state', from, to });
  }

  private newProdTarget(): void {
    const { PROD_REQUIRED_MIN: lo, PROD_REQUIRED_MAX: hi } = this.cfg;
    this.prodTarget = lo + Math.floor(this.rnd() * (hi - lo + 1));
    this.prodTarget = Math.min(hi, Math.max(lo, this.prodTarget));
    if (this.floorCheered) this.prodTarget = Math.max(1, this.prodTarget - this.cfg.CHEER_PROD_REDUCTION);
    this.prodCount = 0;
  }

  private setTier(t: PoseTier, force = false): void {
    if (t !== this.poseTier || force) {
      this.poseTier = t;
      this.emit({ type: 'poseChange', tier: t });
    }
  }

  private schedulePoseSwap(): void {
    const [a, b] = this.cfg.FLOOR_POSE_SWAP_SEC;
    this.poseSwapInMs = (a + this.rnd() * (b - a)) * 1000;
  }

  private enterExhausted(): void {
    this.targetId = null;
    this.sessionProgress = 0;
    this.floorCheered = this.cheerPending;
    this.cheerPending = false;
    this.newProdTarget();
    this.exhaustedAtMs = this.clockMs;
    this.lazyWarned = false;
    this.setState('EXHAUSTED');
    this.setTier('base', true);
    this.schedulePoseSwap();
  }

  /** 다음 기구를 골라 걷기 시작. 없으면 릴스. */
  private goNext(): void {
    const id = selectNext(this.pos, this.world.candidates(), this.lastId, this.cfg.TIE_EPSILON_PX, this.rnd);
    if (id === null) {
      this.targetId = null;
      this.setState('IDLE_REELS');
    } else {
      this.targetId = id;
      this.setState('WALKING');
    }
  }

  // ------------------------------------------------------------ 외부 이벤트

  /** 기구가 새로 놓였을 때 */
  onEquipmentPlaced(): void {
    if (this.state === 'IDLE_REELS') {
      this.goNext();
    } else if (this.state === 'EXHAUSTED') {
      // 카운트 0으로 초기화, N 새로 뽑기
      this.newProdTarget();
      this.setTier('base', true);
    }
  }

  /** 응원은 5초 쿨타임, 다음 바닥 회복 한 번만 보조한다. */
  get cheerCooldown(): number {
    return Math.max(0, this.cfg.CHEER_COOLDOWN_SEC - (this.clockMs - this.lastCheerMs) / 1000);
  }

  cheer(): boolean {
    if (this.state === 'FAINTED' || this.state === 'CELEBRATING' || this.cheerCooldown > 0) return false;
    this.lastCheerMs = this.clockMs;
    this.addBurnout(-this.cfg.CHEER_MENTAL_RECOVERY);
    if (this.state === 'EXHAUSTED') {
      if (!this.floorCheered) {
        this.floorCheered = true;
        this.prodTarget = Math.max(1, this.prodTarget - this.cfg.CHEER_PROD_REDUCTION);
        if (this.prodCount >= this.prodTarget) this.setState('GETTING_UP');
      }
    } else {
      this.cheerPending = true;
    }
    return true;
  }

  /** 재촉하기. 쿨타임 중이면 false (입력 무시) */
  prod(): boolean {
    if (this.prodCoolingDown) return false;
    this.lastProdMs = this.clockMs;
    this.countGraceProd();
    switch (this.state) {
      case 'IDLE_REELS':
        this.emit({ type: 'prod', kind: 'reels' });
        this.emit({ type: 'toast', text: STR.toastReels });
        break;
      case 'EXHAUSTED':
        this.floorProd();
        break;
      case 'WALKING':
      case 'EXERCISING':
        this.activeProd();
        break;
      default:
        this.emit({ type: 'prod', kind: 'none' });
    }
    return true;
  }

  /** 나태 경고 유예 중이면 받아들여진 재촉을 센다 */
  private countGraceProd(): void {
    if (this.graceUntilMs >= 0) this.graceProds++;
  }

  private floorProd(notify = true): void {
    // 바닥 재촉은 번아웃을 올리지 않는다
    this.prodCount++;
    this.emit({ type: 'prod', kind: 'floor' });
    const r = this.prodRatio;
    if (r >= 1) {
      if (notify) this.emit({ type: 'toast', text: STR.toastGotUp });
      this.setState('GETTING_UP');
      return;
    }
    if (r >= 0.8) {
      if (notify) this.emit({ type: 'toast', text: pick(STR.toastFloorHigh, this.rnd) });
      this.setTier('high');
    } else if (r >= 0.4) {
      if (notify) this.emit({ type: 'toast', text: pick(STR.toastFloorMid, this.rnd) });
      this.setTier('mid');
    } else {
      if (notify) this.emit({ type: 'toast', text: pick(STR.toastFloorLow, this.rnd) });
    }
  }

  private activeProd(): void {
    const c = this.cfg;
    this.speedMult = Math.min(c.MAX_SPEED_MULT, this.speedMult + c.SPEED_MULT_PER_PROD);
    this.lastActiveProdMs = this.clockMs;
    this.emit({ type: 'prod', kind: 'active' });
    const warned = this.addBurnout(c.BURNOUT_PER_ACTIVE_PROD);
    if (this.state === 'FAINTED') return;
    if (this.burnout >= c.GIVEUP_THRESHOLD && this.rnd() < c.GIVEUP_CHANCE) {
      this.giveUp();
      return;
    }
    // 경고 토스트를 바로 덮지 않도록 경고가 뜬 재촉에서는 속도 토스트를 생략
    if (!warned && this.clockMs - this.lastSpeedToastMs >= c.SPEED_TOAST_MIN_GAP_MS) {
      this.lastSpeedToastMs = this.clockMs;
      this.emit({ type: 'toast', text: STR.toastSpeedUp });
    }
  }

  private giveUp(): void {
    if (this.state === 'EXERCISING' && this.targetId !== null) {
      // 진행 중이던 세션은 무효, 기구는 그대로
      this.emit({ type: 'sessionAborted', equipmentId: this.targetId });
    }
    this.targetId = null;
    this.sessionProgress = 0;
    this.speedMult = 1;
    this.emit({ type: 'toast', text: STR.toastGaveUp });
    this.setState('GAVE_UP');
  }

  /** 번아웃 증가. 70 이상에 새로 진입해 경고를 띄웠으면 true */
  addBurnout(v: number): boolean {
    const before = this.burnout;
    this.burnout = Math.min(this.cfg.BURNOUT_FAINT, Math.max(0, this.burnout + v));
    let warned = false;
    if (before < this.cfg.BURNOUT_WARNING && this.burnout >= this.cfg.BURNOUT_WARNING && this.burnout < this.cfg.BURNOUT_FAINT) {
      warned = true;
      this.emit({ type: 'burnoutWarning' });
      this.emit({ type: 'toast', text: STR.toastBurnoutWarning });
    }
    if (this.burnout >= this.cfg.BURNOUT_FAINT && this.state !== 'FAINTED' && this.state !== 'CELEBRATING') {
      this.faint();
    }
    return warned;
  }

  private faint(): void {
    if (this.state === 'EXERCISING' && this.targetId !== null) {
      this.emit({ type: 'sessionAborted', equipmentId: this.targetId });
    }
    this.targetId = null;
    this.speedMult = 1;
    this.emit({ type: 'toast', text: STR.toastFainted });
    this.setState('FAINTED');
    this.emit({ type: 'fainted' });
  }

  buffRemaining(id: BuffId): number {
    return Math.max(0, (id === 'jong' ? this.cfg.JONG_DURATION_SEC : this.cfg.BUFF_DURATION_SEC) - (this.clockMs - this.buffStarted[id]) / 1000);
  }

  buffCooldown(id: BuffId): number {
    return Math.max(0, this.cfg.BUFF_COOLDOWN_SEC - (this.clockMs - this.buffStarted[id]) / 1000);
  }

  applyBuff(id: BuffId): boolean {
    if (this.state === 'FAINTED' || this.state === 'CELEBRATING' || this.buffCooldown(id) > 0) return false;
    this.buffStarted[id] = this.clockMs;
    if (id === 'heo') this.heoProdSec = 0;
    return true;
  }

  /** 레벨 클리어: 모든 행동을 멈추고 축하 */
  celebrate(): void {
    if (this.state === 'FAINTED') return;
    this.targetId = null;
    this.speedMult = 1;
    this.setState('CELEBRATING');
  }

  // ------------------------------------------------------------ 매 프레임

  update(dtSec: number): void {
    // 만료 경계를 넘는 프레임에서도 정확히 2초분만 보너스를 적용한다.
    const chalkSec = Math.min(dtSec, this.buffRemaining('chalk'));
    const bongSec = Math.min(dtSec, this.buffRemaining('bong'));
    const heoSec = Math.min(dtSec, this.buffRemaining('heo'));
    const jongSec = Math.min(dtSec, this.buffRemaining('jong'));
    const dtMs = dtSec * 1000;
    this.clockMs += dtMs;
    this.stateTimerMs += dtMs;
    const c = this.cfg;
    // 나태 경고 후 유예 판정
    if (this.graceUntilMs >= 0 && this.clockMs >= this.graceUntilMs - 1e-6) {
      if (this.graceProds < c.LAZY_GRACE_PRODS && !this.chimpPunished) {
        this.chimpPunished = true;
        this.emit({ type: 'chimpPunished' });
      }
      this.graceUntilMs = -1;
    }

    // 속도 배율 복귀: 마지막 재촉 후 2초가 지나면 서서히 1.0으로
    if (this.speedMult > 1 && this.clockMs - this.lastActiveProdMs > c.SPEED_DECAY_DELAY_SEC * 1000) {
      this.speedMult = Math.max(1, this.speedMult - c.SPEED_DECAY_PER_SEC * dtSec);
    }

    // 번아웃 자연 감소
    if (this.state !== 'FAINTED' && this.state !== 'CELEBRATING') {
      const decay =
        this.state === 'EXHAUSTED' ? c.BURNOUT_DECAY.EXHAUSTED
          : this.state === 'IDLE_REELS' ? c.BURNOUT_DECAY.IDLE_REELS
            : c.BURNOUT_DECAY.DEFAULT;
      this.burnout = Math.max(0, this.burnout - decay * (dtSec + jongSec * (c.JONG_RECOVERY_MULT - 1)));
    }

    switch (this.state) {
      case 'WALKING': {
        const tp = this.world.candidates().find((e) => e.id === this.targetId)?.usePoint;
        if (!tp) {
          // 목표가 사라졌으면 다시 고른다
          this.goNext();
          break;
        }
        const dx = tp.x - this.pos.x;
        const dy = tp.y - this.pos.y;
        const dist = Math.hypot(dx, dy);
        const speed = c.WALK_SPEED_PX_PER_SEC * this.speedMult * (this.crawling ? c.CRAWL_SPEED_MULT : 1);
        const step = speed * (dtSec + bongSec * (c.BONG_WALK_MULT - 1));
        if (dist <= Math.max(step, c.ARRIVE_EPSILON_PX)) {
          this.pos = { x: tp.x, y: tp.y };
          this.sessionProgress = 0;
          this.setState('EXERCISING');
          this.emit({ type: 'startExercise', equipmentId: this.targetId! });
        } else {
          this.pos = { x: this.pos.x + (dx / dist) * step, y: this.pos.y + (dy / dist) * step };
        }
        break;
      }
      case 'EXERCISING': {
        const id = this.targetId!;
        const dur = Math.max(0.1, this.world.sessionDurationSec(id));
        this.sessionProgress += ((dtSec + chalkSec * (c.CHALK_EXERCISE_MULT - 1)) * this.speedMult) / dur;
        if (this.sessionProgress >= 1) {
          this.sessionProgress = 1;
          this.lastId = id;
          this.emit({ type: 'sessionComplete', equipmentId: id });
          // 핸들러에서 celebrate() 등으로 상태가 바뀌었으면 그대로 둔다
          if (this.state === 'EXERCISING') this.enterExhausted();
        }
        break;
      }
      case 'EXHAUSTED': {
        if (!this.lazyWarned && this.clockMs - Math.max(this.lastProdMs, this.exhaustedAtMs) >= c.LAZY_WARN_SEC * 1000 - 1e-6) {
          this.lazyWarned = true;
          this.graceUntilMs = this.clockMs + c.LAZY_GRACE_SEC * 1000;
          this.graceProds = 0;
          this.emit({ type: 'lazyWarning' });
        }
        this.heoProdSec += heoSec;
        while (this.heoProdSec + 1e-9 >= c.HEO_PROD_INTERVAL_SEC && this.state === 'EXHAUSTED') {
          this.heoProdSec -= c.HEO_PROD_INTERVAL_SEC;
          this.floorProd(false);
        }
        if (this.world.candidates().length === 0) {
          this.poseSwapInMs -= dtMs;
          if (this.poseSwapInMs <= 0) {
            this.emit({ type: 'poseSwap' });
            this.schedulePoseSwap();
          }
        }
        break;
      }
      case 'GETTING_UP':
        if (this.stateTimerMs >= c.GETTING_UP_MS) this.goNext();
        break;
      case 'GAVE_UP':
        if (this.stateTimerMs >= c.GAVE_UP_MS) this.enterExhausted();
        break;
      default:
        break;
    }
    if (this.state !== 'EXHAUSTED' || this.buffRemaining('heo') === 0) this.heoProdSec = 0;
  }
}
