import Phaser from 'phaser';
import { CONFIG, spriteScale, type Point } from '../config';
import type { CoachId } from '../buffs';
import { playAnim } from '../assets';
import { DEPTH } from '../fx/Effects';

/** 버프 시간과 별개로 3초간 배회한 뒤 천천히 화면 밖으로 걸어나간다. */
export class Coach {
  readonly sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private elapsed = 0;
  private target: Point;
  private exiting = false;

  constructor(scene: Phaser.Scene, readonly id: CoachId, pos: Point, private readonly wonjang: () => Point) {
    this.sprite = scene.add.sprite(pos.x, pos.y, 'placeholder');
    this.shadow = scene.add.image(pos.x, pos.y, 'shadow').setDisplaySize(90, 24).setAlpha(0.7);
    this.target = this.randomTarget();
    playAnim(this.sprite, `coach_${id}_back`);
    this.draw();
  }

  private randomTarget(): Point {
    return { x: Phaser.Math.Between(100, 620), y: Phaser.Math.Between(780, 950) };
  }

  /** false면 퇴장 완료: 소유 씬이 배열에서 제거하고 메시지를 표시한다. */
  update(dt: number): boolean {
    const s = this.sprite;
    const exitAt = CONFIG.COACH_ROAM_SEC;
    if (!this.exiting && this.elapsed >= exitAt) {
      this.exiting = true;
      this.target = { x: s.x < CONFIG.logicalWidth / 2 ? -220 : CONFIG.logicalWidth + 220, y: s.y };
    } else if (!this.exiting) {
      if (this.id !== 'bong') {
        const p = this.wonjang();
        this.target = { x: Phaser.Math.Clamp(p.x + (this.id === 'heo' ? -90 : 90), 40, 680), y: Phaser.Math.Clamp(p.y - 15, 710, 1010) };
      } else if (Math.hypot(this.target.x - s.x, this.target.y - s.y) < 1) {
        this.target = this.randomTarget();
      }
    }
    const dx = this.target.x - s.x;
    const dy = this.target.y - s.y;
    const distance = Math.hypot(dx, dy);
    const step = (this.exiting ? CONFIG.COACH_EXIT_SPEED : this.id === 'bong' ? CONFIG.BONG_ROAM_SPEED : CONFIG.COACH_WALK_SPEED) * dt;
    if (distance > 0) {
      const ratio = Math.min(1, step / distance);
      s.x += dx * ratio;
      s.y += dy * ratio;
    }
    const direction = this.id === 'jong'
      ? dy < -2 ? 'back' : Math.abs(dy) < 2 ? 'side' : Math.abs(dx) < 2 ? 'front' : 'diagonal'
      : dy < -2 ? 'back' : 'front';
    const key = `coach_${this.id}_${direction}`;
    playAnim(s, key);
    if (distance < 1 && !this.exiting) s.anims.pause();
    else s.anims.resume();
    s.setFlipX(this.id === 'jong' ? dx > 0 : dx < 0);
    this.elapsed += dt;
    this.draw();
    if (!this.exiting || distance > step) return true;
    this.destroy();
    return false;
  }

  private draw(): void {
    const s = this.sprite;
    s.setScale(spriteScale(s.y)).setDepth(DEPTH.world + s.y + 1);
    this.shadow.setPosition(s.x, s.y).setDepth(s.depth - 1);
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
