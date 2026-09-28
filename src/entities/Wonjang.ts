// 원장님 표시: Brain(순수 상태 기계)의 상태를 스프라이트·이펙트로 그린다.
import Phaser from 'phaser';
import { CONFIG, DEBUG, FONT, spriteScale } from '../config';
import { DEPTH, type Effects } from '../fx/Effects';
import { animTuning, firstAnim, meta, playAnim } from '../assets';
import type { Brain } from '../systems/Brain';
import type { Equipment } from './Equipment';
import { audio } from '../systems/Audio';
import { STR } from '../strings';

/** 원본 그림에서 걷기 프레임이 바라보는 방향 (flipX 계산용) */
export const WALK_FACING = { front: 'left' as 'left' | 'right', back: 'right' as 'left' | 'right' };

const ROPE_CLIMB_PX = 150;

export interface ExerciseView {
  eq: Equipment;
  anim: string; // 현재 재생 중인 모션
  anims: readonly string[]; // 세션 동안 번갈아 재생할 모션들 (푸쉬업+스쿼트 등)
  label: string;
  counts: boolean;
}

export class WonjangView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private placeholder: Phaser.GameObjects.Text;
  private labelBox: Phaser.GameObjects.Container;
  private labelText: Phaser.GameObjects.Text;
  private labelBar: Phaser.GameObjects.Graphics;
  private bubble: Phaser.GameObjects.Container;
  private dizzy: Phaser.GameObjects.Image[] = [];
  private debugText?: Phaser.GameObjects.Text;

  exercise: ExerciseView | null = null;
  floorPose = 'floor_01';
  /** 지침 계수 (GameScene 이 매 프레임 넣는다). 운동 모션 재생 속도에 곱한다. */
  exerciseSpeed = 1;
  private animKey = '';
  private t = 0;
  private staggerMs = 0;
  private staggerDir = 1;
  private sweatMs = 0;
  private breathMs = 0;
  private pantMs = 0;
  private shakeMs = 0;
  private facingLeft = false;
  private celebrateT = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly brain: Brain, private readonly fx: Effects) {
    this.sprite = scene.add.sprite(brain.pos.x, brain.pos.y, 'placeholder');
    this.placeholder = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '20px', color: '#fff', backgroundColor: '#aa2266' })
      .setOrigin(0.5, 1).setVisible(false);

    this.labelText = scene.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '26px', color: '#ffffff', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5, 1);
    this.labelBar = scene.add.graphics();
    this.labelBox = scene.add.container(0, 0, [this.labelBar, this.labelText]).setDepth(DEPTH.label).setVisible(false);

    const bt = scene.add.text(0, 0, STR.gaveUpBubble, { fontFamily: FONT, fontSize: '34px', color: '#d40000' }).setOrigin(0.5);
    const bg = scene.add.graphics();
    bg.fillStyle(0xffffff, 1);
    bg.lineStyle(4, 0x000000, 1);
    bg.fillRoundedRect(-bt.width / 2 - 18, -bt.height / 2 - 12, bt.width + 36, bt.height + 24, 18);
    bg.strokeRoundedRect(-bt.width / 2 - 18, -bt.height / 2 - 12, bt.width + 36, bt.height + 24, 18);
    bg.fillStyle(0xffffff, 1);
    bg.fillTriangle(-10, bt.height / 2 + 10, 12, bt.height / 2 + 10, 0, bt.height / 2 + 30);
    this.bubble = scene.add.container(0, 0, [bg, bt]).setDepth(DEPTH.label + 1).setVisible(false);

    for (let i = 0; i < 3; i++) {
      this.dizzy.push(scene.add.image(0, 0, 'star').setDepth(DEPTH.label).setVisible(false).setScale(0.8));
    }
    if (DEBUG) {
      this.debugText = scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '16px', color: '#0f0', backgroundColor: '#000a' })
        .setOrigin(0.5, 1).setDepth(DEPTH.label + 10);
    }
    this.refreshAnim(true);
  }

  // ------------------------------------------------------------ 이벤트 반응

  onStateChange(): void {
    this.bubble.setVisible(false);
    for (const d of this.dizzy) d.setVisible(false);
    this.labelBox.setVisible(false);
    switch (this.brain.state) {
      case 'GAVE_UP':
        this.bubble.setVisible(true).setScale(0.3);
        this.scene.tweens.add({ targets: this.bubble, scale: 1, duration: 220, ease: 'Back.easeOut' });
        break;
      case 'FAINTED':
        for (const d of this.dizzy) d.setVisible(true);
        break;
      case 'CELEBRATING':
        this.celebrateT = 0;
        break;
      default:
        break;
    }
    this.refreshAnim(true);
  }

  startExercise(view: ExerciseView): void {
    this.exercise = view;
    view.eq.setExercising(true);
    this.labelText.setText(view.label).setColor(view.counts ? '#ffffff' : '#ffb3b3');
    this.labelBox.setVisible(true);
    this.refreshAnim(true);
  }

  endExercise(): void {
    if (this.exercise) this.exercise.eq.setExercising(false);
    this.exercise = null;
    this.labelBox.setVisible(false);
  }

  setFloorPose(key: string): void {
    this.floorPose = key;
    if (this.brain.state === 'EXHAUSTED') this.refreshAnim(true);
  }

  /** 재촉 맞았을 때 흔들림 */
  hit(): void {
    this.shakeMs = 160;
  }

  // ------------------------------------------------------------ 애니 선택

  private desiredAnim(): string[] {
    const b = this.brain;
    switch (b.state) {
      case 'IDLE_REELS':
        return ['wj_reels', 'wj_reels_tripod', 'wj_idle'];
      case 'WALKING': {
        if (b.crawling) return ['floor_03', 'wj_walk_front'];
        const tp = this.targetDir();
        return tp.dy < -2 ? ['wj_walk_back', 'wj_walk_front', 'wj_idle'] : ['wj_walk_front', 'wj_idle'];
      }
      case 'EXERCISING':
        return this.exercise ? [this.exercise.anim, 'wj_idle'] : ['wj_idle'];
      case 'EXHAUSTED':
        return [this.floorPose, 'floor_01', 'wj_fainted', 'wj_idle'];
      case 'GETTING_UP':
        return ['wj_getup', 'wj_idle'];
      case 'GAVE_UP':
        return ['wj_gaveup', 'wj_idle'];
      case 'FAINTED':
        return ['wj_fainted', 'floor_09', 'floor_01'];
      case 'CELEBRATING':
        return ['wj_clear', 'wj_idle'];
      default:
        return ['wj_idle'];
    }
  }

  private targetDir(): { dx: number; dy: number } {
    const b = this.brain;
    const tp = this.lastTarget;
    return tp ? { dx: tp.x - b.pos.x, dy: tp.y - b.pos.y } : { dx: 0, dy: 1 };
  }

  lastTarget: { x: number; y: number } | null = null;

  private refreshAnim(force = false): void {
    const want = this.desiredAnim();
    const key = firstAnim(this.scene, want);
    if (!key) {
      // 스프라이트가 전혀 없을 때 플레이스홀더 (색 도형 + 텍스트)
      this.animKey = '';
      this.sprite.setTexture('placeholder').setOrigin(0.5, 1);
      this.placeholder.setText(`원장님\n${this.brain.state}`).setVisible(true);
      return;
    }
    this.placeholder.setVisible(false);
    if (key !== this.animKey || force) {
      this.animKey = key;
      playAnim(this.sprite, key, !force);
    }
  }

  // ------------------------------------------------------------ 매 프레임

  update(dtSec: number): void {
    const b = this.brain;
    const s = this.sprite;
    this.t += dtSec;
    const dtMs = dtSec * 1000;

    this.refreshAnim();
    s.anims.timeScale = b.speedMult * (b.state === 'EXERCISING' && b.buffRemaining('chalk') > 0
      ? CONFIG.CHALK_EXERCISE_MULT : b.state === 'WALKING' && b.buffRemaining('bong') > 0 ? CONFIG.BONG_WALK_MULT : 1)
      * (b.state === 'EXERCISING' ? Math.max(CONFIG.FATIGUE_MIN_ANIM_SPEED, this.exerciseSpeed) : 1);

    // 운동 중 모션 교대 (푸쉬업 → 스쿼트)
    if (b.state === 'EXERCISING' && this.exercise && this.exercise.anims.length > 1) {
      const idx = Math.min(this.exercise.anims.length - 1, Math.floor(b.sessionProgress * this.exercise.anims.length));
      const next = this.exercise.anims[idx];
      if (next !== this.exercise.anim && this.scene.anims.exists(next)) {
        this.exercise.anim = next;
        this.refreshAnim(true);
      }
    }

    const tune = animTuning(this.animKey);
    let x = b.pos.x;
    let y = b.pos.y;
    let scaleY = y;
    let depthY = y;
    let angle = 0;
    let bob = 0;

    if (b.state === 'EXERCISING' && this.exercise) {
      const eq = this.exercise.eq;
      const p = eq.exercisePoint;
      x = p.x;
      y = p.y;
      scaleY = eq.pos.y;
      depthY = eq.pos.y + 2;
      if (eq.def.motionAnchor === 'rope') {
        y -= Math.sin(Math.PI * b.sessionProgress) * ROPE_CLIMB_PX * eq.scale;
      }
      // 한 프레임짜리 모션(바이크 등)은 코드로 움직임을 준다
      const frames = meta.anims[this.animKey]?.frames.length ?? 1;
      if (frames <= 1) bob = Math.sin(this.t * Math.PI * 2 * 3 * b.speedMult) * 3;
      s.setFlipX(false);
    } else if (b.state === 'WALKING') {
      const d = this.targetDir();
      if (Math.abs(d.dx) > 1) {
        const facing = d.dy < -2 ? WALK_FACING.back : WALK_FACING.front;
        const movingLeft = d.dx < 0;
        s.setFlipX(b.crawling ? !movingLeft : (facing === 'left') !== movingLeft);
        this.facingLeft = movingLeft;
      }
      // 비실비실: 좌우 흔들림 + 가끔 휘청
      angle = Math.sin(this.t * Math.PI * 2 * CONFIG.WALK_WOBBLE_HZ) * CONFIG.WALK_WOBBLE_DEG;
      if (this.staggerMs <= 0 && Math.random() < CONFIG.STAGGER_CHANCE_PER_SEC * dtSec) {
        this.staggerMs = CONFIG.STAGGER_DURATION_MS;
        this.staggerDir = Math.random() < 0.5 ? -1 : 1;
      }
      if (b.crawling) {
        angle = Math.sin(this.t * Math.PI * 2 * 1.4) * 2;
        bob = Math.abs(Math.sin(this.t * Math.PI * 2 * 1.4)) * -3;
      } else {
        bob = -Math.abs(Math.sin(this.t * Math.PI * 2 * CONFIG.WALK_WOBBLE_HZ)) * 3;
      }
    } else if (b.state === 'EXHAUSTED') {
      // 헐떡임: 살짝 부풀었다 줄었다
      bob = 0;
      s.setFlipX(this.facingLeft);
    } else if (b.state === 'CELEBRATING') {
      // 축하 점프 4번 (발 위치 기준)
      this.celebrateT += dtSec;
      if (this.celebrateT < 1.8) bob = -Math.abs(Math.sin(this.celebrateT * Math.PI * 2.2)) * 40;
      s.setFlipX(false);
    } else if (b.state === 'IDLE_REELS' || b.state === 'GETTING_UP' || b.state === 'GAVE_UP' || b.state === 'FAINTED') {
      s.setFlipX(false);
    }

    if (this.staggerMs > 0) {
      this.staggerMs -= dtMs;
      const k = Math.sin((1 - this.staggerMs / CONFIG.STAGGER_DURATION_MS) * Math.PI);
      angle += k * 12 * this.staggerDir;
      x += k * 6 * this.staggerDir;
    }
    if (this.shakeMs > 0) {
      this.shakeMs -= dtMs;
      x += (Math.random() - 0.5) * 10;
    }

    const sc = spriteScale(scaleY) * CONFIG.CHARACTER_BASE_SCALE * tune.scale;
    const breathe = b.state === 'EXHAUSTED' ? 1 + Math.sin(this.t * Math.PI * 2 * (1.2 + b.burnout / 60)) * 0.03 : 1;
    s.setPosition(x + tune.offsetX * sc, y + tune.offsetY * sc + bob);
    s.setScale(sc, sc * breathe);
    s.setAngle(angle);
    s.setDepth(DEPTH.world + depthY + 1);
    this.placeholder.setPosition(s.x, s.y - 10).setDepth(s.depth + 0.1);

    // 머리 위치 추정
    const bounds = s.getBounds();
    const floorLike = b.state === 'EXHAUSTED' || b.state === 'FAINTED' || b.crawling;
    const headX = floorLike ? bounds.centerX + (s.flipX ? 0.3 : -0.3) * bounds.width : bounds.centerX;
    const headY = floorLike ? bounds.top + bounds.height * 0.35 : bounds.top + bounds.height * 0.16;

    // 라벨·말풍선·어지러움
    if (this.labelBox.visible) {
      this.labelBox.setPosition(bounds.centerX, Math.max(CONFIG.HUD_HEIGHT + 50, bounds.top - 8));
      const w = Math.max(120, this.labelText.width);
      this.labelBar.clear();
      this.labelBar.fillStyle(0x000000, 0.6);
      this.labelBar.fillRoundedRect(-w / 2, 4, w, 12, 6);
      this.labelBar.fillStyle(this.exercise?.counts ? 0x3ddc84 : 0xff8080, 1);
      this.labelBar.fillRoundedRect(-w / 2 + 2, 6, Math.max(4, (w - 4) * b.sessionProgress), 8, 4);
    }
    if (this.bubble.visible) this.bubble.setPosition(headX, Math.max(CONFIG.HUD_HEIGHT + 40, bounds.top - 40));
    if (b.state === 'FAINTED') {
      this.dizzy.forEach((d, i) => {
        const a = this.t * 4 + (i * Math.PI * 2) / 3;
        d.setPosition(headX + Math.cos(a) * 34, headY - 20 + Math.sin(a) * 10).setAngle(this.t * 200);
      });
    }

    // 헥헥 효과: 번아웃이 높을수록 자주 (SPEC 4.5)
    const active = b.state !== 'IDLE_REELS' && b.state !== 'CELEBRATING';
    if (active) {
      const k = b.burnout / 100;
      const exhaustedBoost = b.state === 'EXHAUSTED' || b.state === 'FAINTED' ? 0.5 : 0;
      const kk = Math.min(1, k + exhaustedBoost);
      this.sweatMs -= dtMs;
      this.breathMs -= dtMs;
      if (this.sweatMs <= 0) {
        this.fx.sweatAt(headX + Phaser.Math.Between(-20, 20), headY, 1 + Math.round(kk * 2));
        this.sweatMs = Phaser.Math.Linear(CONFIG.SWEAT_INTERVAL_MS[0], CONFIG.SWEAT_INTERVAL_MS[1], kk);
      }
      if (this.breathMs <= 0) {
        this.fx.breathAt(headX + (s.flipX ? 26 : -26), headY + 18);
        this.breathMs = Phaser.Math.Linear(CONFIG.BREATH_INTERVAL_MS[0], CONFIG.BREATH_INTERVAL_MS[1], kk);
      }
    }
    if (b.state === 'EXHAUSTED') {
      this.pantMs -= dtMs;
      if (this.pantMs <= 0) {
        audio.play('pant');
        this.pantMs = CONFIG.PANT_SOUND_INTERVAL_MS;
      }
    } else {
      this.pantMs = 400;
    }

    if (this.debugText) {
      this.debugText.setText(
        `${b.state}${b.crawling ? '(crawl)' : ''}\nN=${b.prodTarget} count=${b.prodCount}\nburnout=${b.burnout.toFixed(0)} x${b.speedMult.toFixed(2)}\n${this.animKey}`,
      ).setPosition(bounds.centerX, bounds.top - 50);
    }
  }

  /** 재촉 이펙트 위치 (몸 가운데) */
  get bodyCenter(): { x: number; y: number } {
    const b = this.sprite.getBounds();
    return { x: b.centerX, y: b.centerY };
  }
}
