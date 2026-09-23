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

  constructor(scene: Phaser.Scene, readonly id: CoachId, pos: Point) {
    this.sprite = scene.add.sprite(pos.x, pos.y, 'placeholder');
    this.shadow = scene.add.image(pos.x, pos.y, 'shadow').setDisplaySize(90, 24).setAlpha(0.7);
    this.target = { x: Phaser.Math.Clamp(pos.x + (pos.x < 360 ? 150 : -150), 60, 660), y: Phaser.Math.Clamp(pos.y - 55, 745, 960) };
    playAnim(this.sprite, `coach_${id}_back`);
    this.draw();
  }

  /** false면 퇴장 완료: 소유 씬이 배열에서 제거하고 메시지를 표시한다. */
  update(dt: number): boolean {
    const s = this.sprite;
    const exitAt = CONFIG.COACH_ROAM_SEC;
    if (!this.exiting && this.elapsed >= exitAt) {
      this.exiting = true;
      this.target = { x: s.x < CONFIG.logicalWidth / 2 ? -220 : CONFIG.logicalWidth + 220, y: s.y };
    } else if (!this.exiting && Math.hypot(this.target.x - s.x, this.target.y - s.y) < 1) {
      this.target = { x: s.x < 360 ? 510 : 210, y: s.y < 850 ? 920 : 780 };
    }
    const dx = this.target.x - s.x;
    const dy = this.target.y - s.y;
    const distance = Math.hypot(dx, dy);
    const step = (this.exiting ? CONFIG.COACH_EXIT_SPEED : CONFIG.COACH_WALK_SPEED) * dt;
    if (distance > 0) {
      const ratio = Math.min(1, step / distance);
      s.x += dx * ratio;
      s.y += dy * ratio;
    }
    const key = `coach_${this.id}_${dy < -2 ? 'back' : 'front'}`;
    playAnim(s, key);
    s.setFlipX(dx < 0);
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
