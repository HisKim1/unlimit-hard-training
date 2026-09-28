// 게임 본편: 박스, 원장님, 기구 배치, 재촉, WOD 진행
import Phaser from 'phaser';
import { COLORS, CONFIG, DEBUG, FONT, TIME_SCALE, depthScale, spriteScale, type Point } from '../config';
import { EQUIPMENT, FREE_MODE_EXTRA_MOTIONS, type EquipmentId, type MotionPreset } from '../equipment';
import { cheerPool, wodByLevel, type WodDef } from '../wods';
import { STR, failText, pick, type FailReason } from '../strings';
import { Brain, type BrainEvent, type PoseTier } from '../systems/Brain';
import { chimpChance } from '../systems/Chimp';
import { WodProgress } from '../systems/WodProgress';
import { fatigueFactor, wodSessionSec } from '../systems/Fatigue';
import { evaluatePlacement, pointInPolygon, slotPoints, type PlacedInfo } from '../systems/Placement';
import { audio } from '../systems/Audio';
import { save } from '../systems/Save';
import { Equipment } from '../entities/Equipment';
import { WonjangView } from '../entities/Wonjang';
import { DEPTH, Effects } from '../fx/Effects';
import { Toast } from '../ui/Toast';
import { HUD } from '../ui/HUD';
import { EmomClock, type EmomEvent } from '../systems/Emom';
import { BellBanner } from '../ui/BellBanner';
import { Toolbar } from '../ui/Toolbar';
import { imageOrigin, imageRef } from '../assets';
import { BUFFS, isBuff, type BuffId, type ToolbarId } from '../buffs';
import { Coach } from '../entities/Coach';

export interface GameData {
  level?: number; // 없으면 자유 모드
}

export interface ResultData {
  level: number | null;
  cleared: boolean;
  reason?: FailReason;
  timeSec: number;
  isBest: boolean;
  best?: number;
}

/** 바닥 포즈 사용 규칙 (motion_floor_exhausted 번호 기준, SPEC 5.2) */
const FLOOR_POSES: Record<PoseTier, string[]> = {
  base: ['floor_01', 'floor_04', 'floor_05', 'floor_07', 'floor_09', 'floor_10'],
  mid: ['floor_02', 'floor_08'],
  high: ['floor_06'],
};

interface Drag {
  type: ToolbarId;
  pointerId: number;
  ghost: Phaser.GameObjects.Image;
  valid: boolean;
  pos: Point;
  slot: number;
  reason?: string;
}

export class GameScene extends Phaser.Scene {
  private wod: WodDef | null = null;
  private progress!: WodProgress;
  private brain!: Brain;
  private view!: WonjangView;
  private fx!: Effects;
  private toast!: Toast;
  private cheerToast!: Toast;
  private cheerBtn!: Phaser.GameObjects.Container;
  private cheerLabel!: Phaser.GameObjects.Text;
  private hud!: HUD;
  private toolbar!: Toolbar;
  private equipment: Equipment[] = [];
  private landed = new Set<number>();
  private zoneGfx!: Phaser.GameObjects.Graphics;
  private debugGfx?: Phaser.GameObjects.Graphics;
  private vignette!: Phaser.GameObjects.Image;
  private chimpVignette!: Phaser.GameObjects.Image;
  private chimpRoll = () => Math.random();
  private prodBtn!: Phaser.GameObjects.Container;
  private prodBg!: Phaser.GameObjects.Graphics;
  private drag: Drag | null = null;
  private elapsed = 0;
  private ended = false;
  private paused = false;
  private pauseLayer?: Phaser.GameObjects.Container;
  private coaches: Coach[] = [];
  private coachVisits = { bong: 0, heo: 0, jong: 0 };
  private timeWarned = false;
  private prodPressedMs = 0;
  failReason: FailReason | null = null;
  private emom: EmomClock | null = null;
  private bellBanner: BellBanner | null = null;
  private bellPulse = false;
  /** 순환형 총 구간 수 (칼수형 null) */
  private emomTotal: number | null = null;
  /** 순환형: 이번 구간의 세션을 마쳤는가 */
  private intervalDone = false;
  /** 순환형: 기구가 없어 게으름 피우는 중 노랩 카운트 */
  private noRep: { count: number; timer?: Phaser.Time.TimerEvent } | null = null;

  constructor() {
    super('Game');
  }

  init(data: GameData): void {
    this.wod = data.level ? wodByLevel(data.level) ?? null : null;
    this.equipment = [];
    this.landed = new Set();
    this.drag = null;
    this.elapsed = 0;
    this.ended = false;
    this.paused = false;
    this.pauseLayer = undefined;
    this.coaches = [];
    this.coachVisits = { bong: 0, heo: 0, jong: 0 };
    this.timeWarned = false;
    this.failReason = null;
    this.emom = null;
    this.bellBanner = null;
    this.bellPulse = false;
    this.emomTotal = null;
    this.intervalDone = false;
    this.noRep = null;
  }

  create(): void {
    audio.setMusic('workout');
    const W = CONFIG.logicalWidth;
    const H = CONFIG.logicalHeight;
    this.add.image(0, 0, 'box_bg').setOrigin(0).setDisplaySize(W, H).setDepth(DEPTH.bg);
    this.zoneGfx = this.add.graphics().setDepth(DEPTH.zone);
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0).setDepth(DEPTH.vignette).setAlpha(0);
    this.chimpVignette = this.add.image(0, 0, 'vignette').setOrigin(0).setDepth(DEPTH.drag + 1).setAlpha(0);

    this.progress = new WodProgress(this.wod);
    this.fx = new Effects(this);
    this.toast = new Toast(this);
    this.cheerToast = new Toast(this, 300, true);

    this.brain = new Brain(
      {
        candidates: () => {
          const station = this.rotate ? this.emom!.station(this.emom!.interval) : undefined;
          return this.equipment
            .filter((e) => !e.removed && this.landed.has(e.id) && (station === undefined || e.type === station))
            .map((e) => ({ id: e.id, usePoint: e.usePoint }));
        },
        sessionDurationSec: (id) => {
          const eq = this.eqById(id);
          if (!eq) return 5;
          return wodSessionSec(this.wod, eq.type, eq.def.sessionDurationSec, this.progress.done.get(eq.type) ?? 0, this.brain.sessionProgress);
        },
      },
      CONFIG.WONJANG_START,
    );
    this.view = new WonjangView(this, this.brain, this.fx);
    this.brain.on((e) => this.onBrainEvent(e));
    if (this.wod?.emom) {
      this.emom = new EmomClock(this.wod.emom);
      this.emomTotal = this.wod.emom.kind === 'rotate' ? this.wod.requirements.reduce((n, r) => n + r.sessions, 0) : null;
      this.brain.floorProdLocked = this.wod.emom.kind === 'rotate';
    }

    this.hud = new HUD(this, this.progress, {
      onPause: () => this.setPaused(true),
      onMute: () => this.toggleMute(),
    });
    this.hud.setMuted(save.muted);
    this.toolbar = new Toolbar(this, {
      onDragStart: (id, p) => this.beginDrag(id, p),
      onTap: (id) => this.toast.show(isBuff(id)
        ? this.brain.buffCooldown(id) > 0 ? STR.buffCooldown(this.brain.buffCooldown(id)) : STR.buffHint
        : STR.dragHint),
        onTabChange: () => this.cancelDrag(),
    });
    this.refreshHighlight();
    this.createProdButton();
    this.createCheerButton();
    if (this.emom) this.bellBanner = new BellBanner(this);

    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onDragMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onDragEnd, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onDragEnd, this);

    if (DEBUG) this.debugGfx = this.add.graphics().setDepth(DEPTH.label + 20);

    // 탭이 숨겨지면 일시정지 → 돌아오면 "계속하기"
    const onHidden = () => this.setPaused(true);
    this.game.events.on('app-hidden', onHidden);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      audio.setMusic(null);
      this.game.events.off('app-hidden', onHidden);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onDragMove, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onDragEnd, this);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onDragEnd, this);
    });

    const intro = this.wod ? `${this.wod.name}: ${this.wod.original}` : STR.freeModeDesc;
    const guide = this.wod ? `필요 기구: ${this.wod.requirements.map(r => EQUIPMENT[r.equipment].name).join(' · ')}` : STR.dragHint;
    this.toast.show(`${intro}\n${guide}`, CONFIG.INTRO_TOAST_MS);
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  private eqById(id: number): Equipment | undefined {
    return this.equipment.find((e) => e.id === id);
  }

  private get rotate(): boolean {
    return !!this.emom && this.wod?.emom?.kind === 'rotate';
  }

  // ------------------------------------------------------------ 재촉 버튼

  private createProdButton(): void {
    const { x, y, r } = CONFIG.PROD_BUTTON;
    this.prodBg = this.add.graphics();
    const hand = this.add.image(0, -12, 'hand').setScale(0.52);
    const label = this.add.text(0, 34, STR.prodButton, {
      fontFamily: FONT, fontSize: '28px', color: '#ffffff', stroke: '#6b1d00', strokeThickness: 6,
    }).setOrigin(0.5);
    this.prodBtn = this.add.container(x, y, [this.prodBg, hand, label]).setDepth(DEPTH.toolbar - 1);
    this.drawProdButton(false);
    const zone = this.add.zone(x, y, r * 2 + 16, r * 2 + 16).setInteractive({ useHandCursor: true }).setDepth(DEPTH.toolbar - 1);
    zone.on('pointerdown', () => this.onProd());
  }

  private drawProdButton(pressed: boolean): void {
    const r = CONFIG.PROD_BUTTON.r;
    const g = this.prodBg;
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(0, 6, r);
    g.fillStyle(pressed ? COLORS.prodPressed : COLORS.prod, 1);
    g.fillCircle(0, pressed ? 4 : 0, r);
    g.lineStyle(5, 0xffffff, 0.9);
    g.strokeCircle(0, pressed ? 4 : 0, r);
    this.prodBtn.setScale(pressed ? 0.94 : 1);
  }

  private onProd(): void {
    if (this.paused || this.ended) return;
    if (this.emom?.windowOpen) {
      // 벨 창: 재촉은 벨 카운트로만 쓴다 (번아웃·속도·침팬지 없음)
      if (!this.brain.bellProd()) return;
      this.emom.prod();
      this.prodFeedback();
      return;
    }
    if (!this.brain.prod()) {
      // 쿨타임 중: 입력 무시, 버튼은 눌린 채
      return;
    }
    this.prodFeedback();
    this.rollChimp();
  }

  /** 재촉 버튼 눌림·소리·진동·찰싹 이펙트 */
  private prodFeedback(): void {
    this.prodPressedMs = CONFIG.PROD_COOLDOWN_MS;
    this.drawProdButton(true);
    audio.play('slap');
    try {
      navigator.vibrate?.(CONFIG.PROD_VIBRATE_MS);
    } catch {
      // iOS 등 진동 미지원: 무시
    }
    const c = this.view.bodyCenter;
    this.fx.slap(c.x, c.y);
    this.view.hit();
  }

  /** 침팬지 경고: 완료 세션 1~3회 망각 (스펙 12장 확률) */
  private rollChimp(): void {
    if (this.ended || this.chimpRoll() >= chimpChance(this.brain.chimpPunished)) return;
    const lost = this.progress.forget();
    this.hud.refreshProgress();
    this.refreshHighlight();
    const detail = lost.length ? `\n차감: ${lost.map(r => `${EQUIPMENT[r.equipment].name} −${r.count}`).join(' · ')}` : '';
    this.toast.show(STR.toastChimp + detail, CONFIG.CHIMP_TOAST_MS, '#ffffff', true, true);
    audio.play('warn');
    this.tweens.killTweensOf(this.chimpVignette);
    this.chimpVignette.setAlpha(0);
    this.tweens.add({
      targets: this.chimpVignette, alpha: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 0.85,
      duration: CONFIG.CHIMP_PULSE_MS, yoyo: true, repeat: 2, ease: 'Sine.easeInOut',
    });
  }

  // ------------------------------------------------------------ Brain 이벤트

  private onBrainEvent(e: BrainEvent): void {
    switch (e.type) {
      case 'toast':
        this.toast.show(e.text);
        break;
      case 'state':
        if (e.from === 'IDLE_REELS' && e.to !== 'IDLE_REELS') this.cancelNoRep();
        if (e.to === 'IDLE_REELS' && this.rotate && this.emom!.interval >= 0 && !this.intervalDone && !this.ended) this.startNoRep();
        if (e.to === 'WALKING') {
          const t = this.brain.targetId !== null ? this.eqById(this.brain.targetId) : undefined;
          this.view.lastTarget = t ? t.usePoint : null;
        }
        if (e.to === 'GETTING_UP' || e.to === 'EXHAUSTED' || e.to === 'IDLE_REELS' || e.to === 'GAVE_UP' || e.to === 'FAINTED') {
          if (this.view.exercise) this.view.endExercise();
        }
        if (e.to === 'EXHAUSTED' && e.from !== 'EXHAUSTED') this.view.floorPose = this.pickFloorPose('base');
        this.view.onStateChange();
        break;
      case 'startExercise':
        this.startExercise(e.equipmentId);
        break;
      case 'sessionComplete':
        this.completeSession(e.equipmentId);
        break;
      case 'exercisePaused':
        this.view.endExercise(); // 기구 다시 보이기·라벨 해제. 복귀 때 startExercise 가 다시 온다
        break;
      case 'sessionAborted':
        this.view.endExercise();
        break;
      case 'poseChange':
        this.view.setFloorPose(this.pickFloorPose(e.tier));
        break;
      case 'poseSwap':
        this.view.setFloorPose(this.pickFloorPose(this.brain.poseTier, this.view.floorPose));
        break;
      case 'burnoutWarning':
        audio.play('warn');
        break;
      case 'lazyWarning':
        this.toast.show(STR.toastLazy, CONFIG.CHIMP_TOAST_MS, '#ffffff', false, true);
        audio.play('warn');
        break;
      case 'chimpPunished':
        this.toast.show(STR.toastChimpPunished(CONFIG.CHIMP_CHANCE_LAZY * 100), CONFIG.TOAST_MS * 2, '#ffc53d');
        break;
      case 'fainted':
        this.fail('fainted');
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------ EMOM

  private onEmomEvent(ev: EmomEvent): void {
    const def = this.wod?.emom;
    if (!def) return;
    switch (ev.type) {
      case 'warn':
        if (def.kind === 'rotate') this.warnStation(ev.bell);
        break;
      case 'bell':
        if (def.kind === 'rotate' && ev.bell > 0 && !this.intervalDone) {
          this.fail('emomUnfinished');
          return;
        }
        this.intervalDone = false;
        audio.play('bell');
        this.refreshHighlight();
        break;
      case 'answered':
        audio.play('ding');
        if (def.kind === 'interrupt' && def.interrupt) {
          this.view.interrupt = { anim: def.interrupt.anim, label: def.interrupt.label };
          this.brain.beginInterrupt(def.interrupt.durationSec);
        } else {
          this.brain.bellAnswered();
        }
        break;
      case 'missed':
        this.fail('emomMissed');
        break;
      default:
        break;
    }
  }

  /** 툴바 강조: 순환형은 이번 구간(아직 안 했으면)과 다음 구간 기구, 그 외는 남은 요구 기구 */
  private refreshHighlight(): void {
    if (!this.wod) return;
    if (this.rotate) {
      const k = this.emom!.interval;
      const ids = [k >= 0 && !this.intervalDone ? this.emom!.station(k) : null, this.emom!.station(k + 1)]
        .filter((x): x is EquipmentId => x !== null);
      this.toolbar.setHighlighted([...new Set(ids)]);
      return;
    }
    this.toolbar.setHighlighted(this.wod.requirements.filter((r) => this.progress.remaining(r.equipment) > 0).map((r) => r.equipment));
  }

  /** 벨 3초 전: 다음 구간 기구가 착지한 것도, 떨어지는 중인 것도 없으면 게으름 경고 */
  private warnStation(bell: number): void {
    const type = this.emom?.station(bell);
    if (!type || this.equipment.some((e) => !e.removed && e.type === type)) return;
    this.toast.show(STR.emomLazy(EQUIPMENT[type].name), CONFIG.EMOM_WARN_BEFORE_SEC * 1000, '#ffc53d');
    audio.play('warn');
  }

  /** 기구가 없어 게으름: 붉은 테두리 은은하게 NOREP_COUNT 번, 끝까지 안 놓으면 탈락 */
  private startNoRep(): void {
    if (this.noRep) return;
    this.noRep = { count: 0 };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const station = this.emom!.station(this.emom!.interval);
    const lazy = station ? STR.emomLazy(EQUIPMENT[station].name) : '';
    const pulse = () => {
      if (!this.noRep || this.ended) return;
      this.noRep.count++;
      this.toast.show(`${lazy}\n${STR.noRep(this.noRep.count)}`, CONFIG.NOREP_PULSE_MS, '#ff5a5a');
      audio.play('warn');
      this.tweens.killTweensOf(this.chimpVignette);
      this.chimpVignette.setAlpha(0);
      this.tweens.add({
        targets: this.chimpVignette, alpha: reduced ? 0.2 : 0.55,
        duration: CONFIG.NOREP_PULSE_MS / 2, yoyo: true, ease: 'Sine.easeInOut',
      });
      this.noRep.timer = this.time.delayedCall(CONFIG.NOREP_PULSE_MS, () => {
        if (!this.noRep) return;
        if (this.noRep.count >= CONFIG.NOREP_COUNT) {
          this.noRep = null;
          this.fail('norep');
        } else {
          pulse();
        }
      });
    };
    pulse();
  }

  private cancelNoRep(): void {
    if (!this.noRep) return;
    this.noRep.timer?.remove();
    this.noRep = null;
    this.tweens.killTweensOf(this.chimpVignette);
    this.chimpVignette.setAlpha(0);
  }

  /** 벨 창 동안 배너·재촉 버튼 맥동. 창이 닫히면 원래대로. */
  private updateBellBanner(): void {
    if (!this.bellBanner || !this.emom) return;
    if (this.ended || !this.emom.windowOpen) {
      this.bellBanner.hide();
      if (this.bellPulse) {
        this.bellPulse = false;
        this.prodBtn.setScale(this.prodPressedMs > 0 ? 0.94 : 1);
      }
      return;
    }
    const need = CONFIG.EMOM_PRODS_REQUIRED;
    const st = this.wod?.emom?.kind === 'rotate' ? this.emom.station(this.emom.interval) : null;
    const label = st ? STR.emomBellStation(EQUIPMENT[st].name, this.emom.prodCount, need) : STR.emomBellBurpee(this.emom.prodCount, need);
    this.bellBanner.update(label, this.emom.windowRemainingSec / CONFIG.EMOM_WINDOW_SEC);
    this.bellPulse = true;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pulse = reducedMotion ? 1 : 1 + 0.07 * Math.abs(Math.sin(this.time.now / 90));
    this.prodBtn.setScale((this.prodPressedMs > 0 ? 0.94 : 1) * pulse);
  }

  private pickFloorPose(tier: PoseTier, avoid?: string): string {
    const have = (keys: string[]) => keys.filter((k) => this.anims.exists(k));
    let pool = have(FLOOR_POSES[tier]);
    if (pool.length === 0) pool = have(FLOOR_POSES.base);
    if (pool.length === 0) pool = have(['floor_01', 'floor_03', 'wj_fainted']);
    if (pool.length === 0) return 'floor_01';
    const filtered = avoid ? pool.filter((k) => k !== avoid) : pool;
    return pick(filtered.length ? filtered : pool);
  }

  private presetFor(type: EquipmentId): MotionPreset {
    const def = EQUIPMENT[type];
    const base: MotionPreset = { motions: def.motions, exercise: def.exercise };
    const ov = this.wod?.overrides?.[type];
    if (ov) return ov;
    if (!this.wod) {
      const extras = FREE_MODE_EXTRA_MOTIONS[type] ?? [];
      const pool = [base, ...extras].filter((p) => p.motions.some((m) => this.anims.exists(m)));
      if (pool.length) return pick(pool);
    }
    return base;
  }

  /** 지침 WOD 에서 지금 운동 속도 계수 (1 = 보통). 모션 재생 속도에 쓴다. */
  private currentFatigue(): number {
    const f = this.wod?.fatigue;
    const ex = this.view.exercise;
    if (!f || !ex || ex.eq.type !== f.equipment) return 1;
    const req = this.progress.required(f.equipment) || 1;
    return fatigueFactor(f.endSpeed, ((this.progress.done.get(f.equipment) ?? 0) + this.brain.sessionProgress) / req);
  }

  private startExercise(id: number): void {
    const eq = this.eqById(id);
    if (!eq) return;
    const preset = this.presetFor(eq.type);
    const anims = preset.motions.filter((m) => this.anims.exists(m));
    const info = this.progress.peek(eq.type, preset.exercise);
    this.view.startExercise({
      eq,
      anim: anims[0] ?? preset.motions[0] ?? 'wj_idle',
      anims: anims.length ? anims : preset.motions,
      label: info.label,
      counts: info.counts,
    });
  }

  private completeSession(id: number): void {
    if (this.ended) return;
    const eq = this.eqById(id);
    this.view.endExercise();
    if (!eq) return;
    eq.addUse();
    const counted = this.progress.commit(eq.type);
    if (counted) {
      audio.play('ding');
      this.hud.refreshProgress();
      this.refreshHighlight();
    }
    if (eq.uses >= CONFIG.SESSIONS_PER_EQUIPMENT) {
      eq.remove(this.fx);
      audio.play('poof');
      this.equipment = this.equipment.filter((e) => e !== eq);
      this.landed.delete(eq.id);
    }
    if (this.rotate && eq.type === this.emom!.station(this.emom!.interval)) {
      this.intervalDone = true;
      this.refreshHighlight();
    }
    if (this.progress.complete) this.clear();
  }

  // ------------------------------------------------------------ 드래그 배치

  private placedInfo(): PlacedInfo[] {
    return this.equipment.filter((e) => !e.removed).map((e) => ({ id: e.id, type: e.type, pos: e.pos, zone: e.def.zone, slot: e.slot }));
  }

  private beginDrag(type: ToolbarId, p: Phaser.Input.Pointer): void {
    if (this.paused || this.ended || this.drag) return;
    if (isBuff(type) && this.brain.buffCooldown(type) > 0) {
      this.toast.show(STR.buffCooldown(this.brain.buffCooldown(type)));
      return;
    }
    const def = isBuff(type) ? null : EQUIPMENT[type];
    const useIcon = !def || def.zone === 'ceiling';
    const name = isBuff(type) ? BUFFS[type].icon : useIcon ? EQUIPMENT[type].icon : EQUIPMENT[type].sprite;
    const ref = imageRef(this, name);
    const o = useIcon ? { x: 0.5, y: 1 } : imageOrigin(name);
    const ghost = this.add.image(p.x, p.y, ref.key, ref.frame).setOrigin(o.x, o.y).setDepth(DEPTH.drag).setAlpha(0.85);
    if (useIcon) ghost.setScale(0.9);
    this.drag = { type, pointerId: p.id, ghost, valid: false, pos: { x: p.x, y: p.y }, slot: -1 };
    audio.play('pop');
    this.updateDrag(p);
  }

  private onDragMove(p: Phaser.Input.Pointer): void {
    if (!this.drag || p.id !== this.drag.pointerId) return;
    this.updateDrag(p);
  }

  private updateDrag(p: Phaser.Input.Pointer): void {
    const d = this.drag!;
    const point = { x: p.x, y: p.y - (isBuff(d.type) ? CONFIG.DRAG_LIFT_PX : 0) };
    if (isBuff(d.type)) {
      const c = this.view.bodyCenter;
      d.valid = this.brain.buffCooldown(d.type) <= 0 && (d.type === 'chalk'
        ? Math.hypot(point.x - c.x, point.y - c.y) <= CONFIG.CHALK_DROP_RADIUS_PX
        : pointInPolygon(point, CONFIG.FLOOR_POLYGON));
      d.pos = point;
      d.ghost.setPosition(point.x, point.y);
    } else {
      const def = EQUIPMENT[d.type];
      const exercise = this.view.exercise?.eq;
      const body = exercise && exercise.def.zone === 'floor' ? exercise.exercisePoint : this.brain.pos;
      const res = evaluatePlacement(d.type, point, this.placedInfo(), body);
      d.valid = res.ok;
      d.pos = res.pos;
      d.slot = res.ok ? res.slot : -1;
      d.reason = res.ok ? undefined : res.reason;
      // 슬롯 기구는 가까운 슬롯에 스냅해서 보여준다
      const show = res.pos;
      d.ghost.setPosition(show.x, show.y);
      if (def.zone === 'floor' || def.zone === 'rig') d.ghost.setScale(spriteScale(show.y));
    }
    if (d.valid) d.ghost.clearTint();
    else d.ghost.setTint(0xff4d4d);
    this.drawZones(d.type);
  }

  /** 드래그 중 설치 가능 영역을 초록 반투명으로 표시 */
  private drawZones(type: ToolbarId | null): void {
    const g = this.zoneGfx;
    g.clear();
    if (!type) return;
    g.fillStyle(COLORS.good, 0.22);
    g.lineStyle(3, COLORS.good, 0.7);
    if (isBuff(type)) {
      if (type === 'chalk') {
        const c = this.view.bodyCenter;
        g.fillCircle(c.x, c.y, CONFIG.CHALK_DROP_RADIUS_PX);
        g.strokeCircle(c.x, c.y, CONFIG.CHALK_DROP_RADIUS_PX);
      } else {
        g.fillPoints(CONFIG.FLOOR_POLYGON, true);
        g.strokePoints(CONFIG.FLOOR_POLYGON, true);
      }
      return;
    }
    const def = EQUIPMENT[type];
    if (def.zone === 'floor') {
      g.fillPoints(CONFIG.FLOOR_POLYGON, true);
      g.strokePoints(CONFIG.FLOOR_POLYGON, true);
    } else if (def.zone === 'rig' || def.zone === 'ceiling') {
      const taken = new Set(this.equipment.filter((e) => !e.removed && e.def.zone === def.zone).map((e) => e.slot));
      slotPoints(def.zone).forEach((s, i) => {
        if (taken.has(i)) return;
        const allowed = evaluatePlacement(type, s, this.placedInfo(), this.brain.pos).ok;
        g.fillStyle(allowed ? COLORS.good : COLORS.bad, 0.22);
        g.lineStyle(3, allowed ? COLORS.good : COLORS.bad, 0.7);
        const sc = depthScale(s.y);
        if (def.zone === 'rig') {
          g.fillEllipse(s.x, s.y, 150 * sc, 44 * sc);
          g.strokeEllipse(s.x, s.y, 150 * sc, 44 * sc);
        } else {
          g.fillCircle(s.x, s.y, 34 * sc);
          g.strokeCircle(s.x, s.y, 34 * sc);
          g.lineStyle(3, COLORS.good, 0.35);
          g.lineBetween(s.x, CONFIG.HUD_HEIGHT, s.x, s.y - 34 * sc);
          g.lineStyle(3, COLORS.good, 0.7);
        }
      });
    }
  }

  private onDragEnd(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d || p.id !== d.pointerId) return;
    if (this.paused || this.ended) {
      this.cancelDrag();
      return;
    }
    this.updateDrag(p); // 놓는 순간의 원장님 위치와 기구 점유 상태로 다시 검사
    this.drag = null;
    this.drawZones(null);
    if (isBuff(d.type)) {
      if (d.valid && this.brain.applyBuff(d.type)) {
        d.ghost.destroy();
        this.showBuff(d.type, d.pos);
      } else {
        this.returnGhost(d);
        this.toast.show(this.brain.buffCooldown(d.type) > 0 ? STR.buffCooldown(this.brain.buffCooldown(d.type))
          : d.type === 'chalk' ? STR.toastChalkMiss : STR.toastCoachMiss);
      }
      return;
    }
    if (!d.valid) {
      if (d.reason === 'full') {
        const def = EQUIPMENT[d.type];
        this.toast.show(def.zone === 'floor' ? STR.toastFloorFull(CONFIG.MAX_FLOOR_EQUIPMENT) : STR.toastSlotFull);
      } else if (d.reason === 'slotTaken') {
        this.toast.show(STR.toastSlotFull);
      } else {
        this.toast.show(d.reason === 'overlap' ? '주변에 빈자리가 없어요. 조금 옆에 놓아주세요.' : '기구의 초록 배치 영역 안에 놓아주세요.');
      }
      this.returnGhost(d);
      return;
    }
    d.ghost.destroy();
    this.place(d.type, d.pos, d.slot);
  }

  /** 무효 위치: 툴바로 되돌아간다 */
  private returnGhost(d: Drag): void {
    const to = this.toolbar.iconWorldPos(d.type);
    this.tweens.add({
      targets: d.ghost, x: to.x, y: to.y + 40, scale: 0.4, alpha: 0, duration: 260, ease: 'Quad.easeIn',
      onComplete: () => d.ghost.destroy(),
    });
  }

  private createCheerButton(): void {
    const { x, y, r } = CONFIG.PROD_BUTTON;
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.35).fillCircle(0, 6, r);
    bg.fillStyle(0x18875b, 1).fillCircle(0, 0, r);
    bg.lineStyle(5, 0xffffff, 0.9).strokeCircle(0, 0, r);
    const icon = this.add.text(0, -20, '힘내!', { fontFamily: FONT, fontSize: '34px', color: '#fff3c4' }).setOrigin(0.5);
    this.cheerLabel = this.add.text(0, 27, STR.cheerButton, { fontFamily: FONT, fontSize: '26px', color: '#ffffff' }).setOrigin(0.5);
    this.cheerBtn = this.add.container(CONFIG.logicalWidth - x, y, [bg, icon, this.cheerLabel])
      .setSize(r * 2 + 16, r * 2 + 16).setDepth(DEPTH.toolbar - 1).setInteractive({ useHandCursor: true });
    this.cheerBtn.on('pointerdown', () => {
      if (this.paused || this.ended || !this.brain.cheer()) return;
      const pool = cheerPool(this.wod);
      this.cheerToast.show(`미모반 ${pick(pool.names)}:\n${pick(pool.lines)}`, 3000, '#173826');
      audio.play('ding');
    });
  }

  private cancelDrag(): void {
    this.drag?.ghost.destroy();
    this.drag = null;
    this.drawZones(null);
  }

  private showBuff(id: BuffId, pos: Point): void {
    if (id === 'chalk') {
      const c = this.view.bodyCenter;
      this.fx.chalkAt(c.x, c.y - 30);
      audio.play('poof');
      this.toast.show(STR.toastChalk, CONFIG.BUFF_DURATION_SEC * 1000);
    } else {
      this.coaches.push(new Coach(this, id, pos, () => this.brain.pos));
      const messages = BUFFS[id].messages;
      const visits = this.coachVisits[id]++;
      this.toast.show(visits === 0 ? messages[0] : pick(messages.slice(1)), CONFIG.BUFF_DURATION_SEC * 1000);
      audio.play('pop');
    }
    this.toolbar.refreshBuffs(id => this.brain.buffRemaining(id), id => this.brain.buffCooldown(id));
  }

  private place(type: EquipmentId, pos: Point, slot: number): void {
    const eq = new Equipment(this, type, { ...pos }, slot);
    this.equipment.push(eq);
    eq.dropIn(this.fx, () => {
      if (eq.removed || this.ended) return;
      this.landed.add(eq.id);
      audio.play('thud');
      if (eq.def.heavy) this.cameras.main.shake(140, 0.006);
      this.brain.onEquipmentPlaced();
    });
  }

  // ------------------------------------------------------------ 진행·종료

  private clear(): void {
    if (this.ended) return;
    this.ended = true;
    this.emom?.stop();
    this.bellBanner?.hide();
    this.cancelNoRep();
    this.toolbar.enabled = false;
    this.cancelDrag();
    this.brain.celebrate();
    audio.setMusic(null);
    audio.play('fanfare');
    this.tweens.killTweensOf(this.chimpVignette);
    this.chimpVignette.setAlpha(0);
    this.toast.show(STR.toastWodDone, CONFIG.CLEAR_TO_RESULT_MS, '#3ddc84', true);
    const c = this.view.bodyCenter;
    this.fx.starsAt(c.x, c.y - 60, 16);
    const time = this.elapsed;
    const wod = this.wod!;
    const prevBest = save.best(wod.id);
    const isBest = save.recordClear(wod.id, wod.level, time);
    this.time.delayedCall(CONFIG.CLEAR_TO_RESULT_MS, () => {
      const data: ResultData = { level: wod.level, cleared: true, timeSec: time, isBest, best: prevBest };
      this.goResult(data);
    });
  }

  private fail(reason: FailReason): void {
    if (this.ended) return;
    this.ended = true;
    this.emom?.stop();
    this.bellBanner?.hide();
    this.cancelNoRep();
    this.failReason = reason;
    this.toolbar.enabled = false;
    this.cancelDrag();
    audio.setMusic(null);
    audio.play('fail');
    this.tweens.killTweensOf(this.chimpVignette);
    this.chimpVignette.setAlpha(0);
    this.toast.show(reason === 'fainted' ? STR.toastFainted : failText(reason), CONFIG.FAINT_TO_RESULT_MS, '#ff5a5a', true);
    const data: ResultData = {
      level: this.wod?.level ?? null, cleared: false, reason, timeSec: this.elapsed, isBest: false,
      best: this.wod ? save.best(this.wod.id) : undefined,
    };
    this.time.delayedCall(CONFIG.FAINT_TO_RESULT_MS, () => this.goResult(data));
  }

  private goResult(data: ResultData): void {
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Result', data));
  }

  private toggleMute(): void {
    const m = !save.muted;
    save.setMuted(m);
    audio.setMuted(m);
    this.hud.setMuted(m);
  }

  // ------------------------------------------------------------ 일시정지

  setPaused(on: boolean): void {
    if (on === this.paused) return;
    if (on && this.ended) return;
    this.paused = on;
    audio.pauseMusic(on);
    if (on) {
      this.cancelDrag();
      this.tweens.pauseAll();
      this.anims.pauseAll();
      this.time.paused = true;
      this.toolbar.enabled = false;
      this.showPauseLayer();
    } else {
      this.tweens.resumeAll();
      this.anims.resumeAll();
      this.time.paused = false;
      this.toolbar.enabled = true;
      this.pauseLayer?.destroy();
      this.pauseLayer = undefined;
      audio.resume();
    }
  }

  private showPauseLayer(): void {
    const W = CONFIG.logicalWidth;
    const H = CONFIG.logicalHeight;
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0).setInteractive();
    const title = this.add.text(W / 2, H * 0.36, STR.paused, { fontFamily: FONT, fontSize: '64px', color: '#fff' }).setOrigin(0.5);
    const mk = (y: number, label: string, color: number, fn: () => void) => {
      const g = this.add.graphics();
      g.fillStyle(color, 1);
      g.fillRoundedRect(-170, -42, 340, 84, 24);
      const t = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: '36px', color: '#fff' }).setOrigin(0.5);
      const c = this.add.container(W / 2, y, [g, t]).setSize(340, 84).setInteractive({ useHandCursor: true });
      c.on('pointerup', () => {
        audio.unlock();
        audio.play('pop');
        fn();
      });
      return c;
    };
    const resume = mk(H * 0.5, STR.resume, COLORS.accentBlue, () => this.setPaused(false));
    const exit = mk(H * 0.5 + 110, STR.toLevelSelect, 0x444c56, () => {
      this.paused = false;
      this.time.paused = false;
      this.tweens.resumeAll();
      this.anims.resumeAll();
      this.scene.start('LevelSelect');
    });
    this.pauseLayer = this.add.container(0, 0, [dim, title, resume, exit]).setDepth(DEPTH.overlay);
  }

  // ------------------------------------------------------------ 매 프레임

  update(_time: number, deltaMs: number): void {
    if (this.paused) return;
    // 탭 전환 등으로 튄 프레임은 잘라낸다 (delta time 기반)
    const dt = (Math.min(deltaMs, 100) / 1000) * TIME_SCALE;

    if (!this.ended) {
      this.elapsed += dt;
      if (this.wod) {
        const remain = this.wod.timeCapSec - this.elapsed;
        this.hud.setTime(remain);
        if (!this.timeWarned && remain <= CONFIG.TIME_LOW_WARNING_SEC) {
          this.timeWarned = true;
          this.toast.show(STR.toastTimeLow, CONFIG.TOAST_MS, '#ffc53d');
        }
        if (remain <= 0) this.fail('timeout');
      } else {
        this.hud.setTime(null);
      }
    }

    if (!this.ended) this.brain.update(dt);
    if (!this.ended && this.emom) {
      for (const ev of this.emom.update(dt)) {
        this.onEmomEvent(ev);
        if (this.ended) break;
      }
      this.hud.setBell(this.emom.secToNextBell, this.emom.interval, this.emomTotal);
    }
    this.updateBellBanner();
    const cheerCooldown = this.brain.cheerCooldown;
    this.cheerLabel.setText(cheerCooldown > 0 ? `${Math.ceil(cheerCooldown)}초` : STR.cheerButton);
    this.cheerBtn.setAlpha(this.ended || cheerCooldown > 0 ? 0.55 : 1);
    let coachLeft = false;
    this.coaches = this.coaches.filter(coach => {
      if (this.ended) { coach.destroy(); return false; }
      const present = coach.update(dt);
      if (!present) coachLeft = true;
      return present;
    });
    if (coachLeft) this.toast.show(`${STR.coachLeft}\n${STR.wonjangRelaxed}`, CONFIG.BUFF_DURATION_SEC * 1000);
    this.toolbar.refreshBuffs(id => this.brain.buffRemaining(id), id => this.brain.buffCooldown(id));
    this.view.exerciseSpeed = this.currentFatigue();
    this.view.update(dt);
    this.toolbar.update(dt);
    this.hud.setBurnout(this.brain.burnout);

    if (this.prodPressedMs > 0) {
      this.prodPressedMs -= deltaMs;
      if (this.prodPressedMs <= 0) this.drawProdButton(false);
    }

    // 번아웃 70 이상: 붉은 비네트 맥동
    const warn = this.brain.burnout >= CONFIG.BURNOUT_WARNING && this.brain.state !== 'CELEBRATING';
    const target = warn ? 0.45 + 0.35 * Math.sin(this.time.now / 180) : 0;
    this.vignette.setAlpha(Phaser.Math.Linear(this.vignette.alpha, target, Math.min(1, dt * 8)));

    if (this.debugGfx) this.drawDebug();
  }

  private drawDebug(): void {
    const g = this.debugGfx!;
    g.clear();
    g.lineStyle(2, 0x00ff00, 0.9);
    g.strokePoints(CONFIG.FLOOR_POLYGON, true);
    for (const s of CONFIG.RIG_SLOT_POINTS) {
      g.lineStyle(2, 0x00aaff, 1);
      g.strokeCircle(s.x, s.y, 10);
    }
    for (const s of CONFIG.ROPE_ANCHOR_POINTS) {
      g.lineStyle(2, 0xffaa00, 1);
      g.strokeCircle(s.x, s.y, 10);
    }
    for (const e of this.equipment) e.debugDraw(g);
    g.fillStyle(0xff0000, 1);
    g.fillCircle(this.brain.pos.x, this.brain.pos.y, 5);
  }
}
