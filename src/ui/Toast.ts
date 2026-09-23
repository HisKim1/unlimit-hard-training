// 화면 중앙 토스트. 새 토스트가 오면 이전 것을 교체한다(쌓지 않음).
import Phaser from 'phaser';
import { CONFIG, FONT } from '../config';
import { DEPTH } from '../fx/Effects';

export class Toast {
  private box: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  private warningBar: Phaser.GameObjects.Graphics;
  private warningLabel: Phaser.GameObjects.Text;
  private hideTimer?: Phaser.Time.TimerEvent;
  private tween?: Phaser.Tweens.Tween;
  private held = false;

  constructor(private readonly scene: Phaser.Scene, private readonly y = CONFIG.logicalHeight * 0.42, private readonly shout = false) {
    this.bg = scene.add.graphics();
    this.warningBar = scene.add.graphics();
    this.warningLabel = scene.add.text(0, 0, 'WARNING!', {
      fontFamily: FONT, fontSize: '32px', color: '#ffc900', backgroundColor: '#111111', padding: { x: 14, y: 0 },
    }).setOrigin(0.5).setVisible(false);
    this.text = scene.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '32px', color: '#ffffff', align: 'center',
      wordWrap: { width: CONFIG.logicalWidth - 120, useAdvancedWrap: true }, lineSpacing: 6,
    }).setOrigin(0.5);
    this.box = scene.add.container(CONFIG.logicalWidth / 2, this.y, [this.bg, this.warningBar, this.warningLabel, this.text])
      .setDepth(DEPTH.toast).setVisible(false);
  }

  show(msg: string, ms = CONFIG.TOAST_MS, color = '#ffffff', hold = false, warning = false): void {
    if (this.held && !hold) return;
    this.held = hold;
    this.hideTimer?.remove();
    this.tween?.stop();
    this.text.setText(warning ? msg.replace(/^WARNING!\s*/, '') : msg).setColor(color);
    this.warningBar.clear();
    this.warningLabel.setVisible(warning);
    const w = Math.min(CONFIG.logicalWidth - 60, this.text.width + 56);
    const h = this.text.height + 34;
    this.bg.clear();
    this.bg.fillStyle(this.shout ? 0xfff3c4 : 0x000000, this.shout ? 1 : 0.78);
    this.bg.fillRoundedRect(-w / 2, -h / 2, w, h, 22);
    this.bg.lineStyle(3, 0x2b6ef2, 0.9);
    this.bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 22);
    if (this.shout) {
      this.bg.fillTriangle(-w / 2 + 45, h / 2 - 2, -w / 2 + 65, h / 2 + 24, -w / 2 + 85, h / 2 - 2);
      this.bg.lineBetween(-w / 2 + 45, h / 2, -w / 2 + 65, h / 2 + 24);
      this.bg.lineBetween(-w / 2 + 65, h / 2 + 24, -w / 2 + 85, h / 2);
      for (const side of [-1, 1]) {
        for (const dy of [-24, 0, 24]) this.bg.lineBetween(side * (w / 2 + 8), dy, side * (w / 2 + 22), dy * 1.5);
      }
    }
    if (warning) {
      const left = -w / 2, right = w / 2, top = -h / 2 - 44;
      this.warningBar.fillStyle(0xffc900, 1).fillRect(left, top, w, 44);
      this.warningBar.fillStyle(0x111111, 1);
      const clip = (x: number) => Phaser.Math.Clamp(x, left, right);
      for (let x = left - 44; x < right; x += 48) {
        this.warningBar.fillPoints([
          { x: clip(x + 44), y: top }, { x: clip(x + 68), y: top },
          { x: clip(x + 24), y: top + 44 }, { x: clip(x), y: top + 44 },
        ], true);
      }
      this.warningLabel.setY(top + 22);
    }
    this.box.setVisible(true).setAlpha(1).setScale(0.92);
    this.tween = this.scene.tweens.add({ targets: this.box, scale: 1, duration: 120, ease: 'Back.easeOut' });
    this.hideTimer = this.scene.time.delayedCall(ms, () => {
      this.held = false;
      this.tween = this.scene.tweens.add({
        targets: this.box, alpha: 0, duration: this.shout ? 400 : 160, onComplete: () => this.box.setVisible(false),
      });
    });
  }
}
