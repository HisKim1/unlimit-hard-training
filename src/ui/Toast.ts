// 화면 중앙 토스트. 새 토스트가 오면 이전 것을 교체한다(쌓지 않음).
import Phaser from 'phaser';
import { CONFIG, FONT } from '../config';
import { DEPTH } from '../fx/Effects';

export class Toast {
  private box: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  private hideTimer?: Phaser.Time.TimerEvent;
  private tween?: Phaser.Tweens.Tween;

  constructor(private readonly scene: Phaser.Scene, private readonly y = CONFIG.logicalHeight * 0.42) {
    this.bg = scene.add.graphics();
    this.text = scene.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '32px', color: '#ffffff', align: 'center',
      wordWrap: { width: CONFIG.logicalWidth - 120, useAdvancedWrap: true }, lineSpacing: 6,
    }).setOrigin(0.5);
    this.box = scene.add.container(CONFIG.logicalWidth / 2, this.y, [this.bg, this.text])
      .setDepth(DEPTH.toast).setVisible(false);
  }

  show(msg: string, ms = CONFIG.TOAST_MS, color = '#ffffff'): void {
    this.hideTimer?.remove();
    this.tween?.stop();
    this.text.setText(msg).setColor(color);
    const w = Math.min(CONFIG.logicalWidth - 60, this.text.width + 56);
    const h = this.text.height + 34;
    this.bg.clear();
    this.bg.fillStyle(0x000000, 0.78);
    this.bg.fillRoundedRect(-w / 2, -h / 2, w, h, 22);
    this.bg.lineStyle(3, 0x2b6ef2, 0.9);
    this.bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 22);
    this.box.setVisible(true).setAlpha(1).setScale(0.92);
    this.tween = this.scene.tweens.add({ targets: this.box, scale: 1, duration: 120, ease: 'Back.easeOut' });
    this.hideTimer = this.scene.time.delayedCall(ms, () => {
      this.tween = this.scene.tweens.add({
        targets: this.box, alpha: 0, duration: 160, onComplete: () => this.box.setVisible(false),
      });
    });
  }
}
