// EMOM 벨 배너: HUD 바로 아래 가운데. "🔔 버피! 2/5" 와 남은 창 시간 게이지.
import Phaser from 'phaser';
import { CONFIG, FONT } from '../config';
import { DEPTH } from '../fx/Effects';
import { fitText } from './fitText';

const BANNER_W = 460;
const BANNER_H = 86;

export class BellBanner {
  readonly box: Phaser.GameObjects.Container;
  readonly text: Phaser.GameObjects.Text;
  private bar: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    const bg = scene.add.graphics();
    bg.fillStyle(0x111111, 0.88).fillRoundedRect(-BANNER_W / 2, -BANNER_H / 2, BANNER_W, BANNER_H, 20);
    bg.lineStyle(4, 0xffc900, 1).strokeRoundedRect(-BANNER_W / 2, -BANNER_H / 2, BANNER_W, BANNER_H, 20);
    this.text = scene.add.text(0, -10, '', { fontFamily: FONT, fontSize: '36px', color: '#ffc900' }).setOrigin(0.5);
    this.bar = scene.add.graphics();
    this.box = scene.add.container(CONFIG.logicalWidth / 2, CONFIG.HUD_HEIGHT + 56, [bg, this.text, this.bar])
      .setDepth(DEPTH.toast - 1).setVisible(false);
  }

  /** remainRatio: 남은 창 시간 비율 1 → 0 */
  update(label: string, remainRatio: number): void {
    this.box.setVisible(true);
    if (this.text.text !== label) fitText(this.text, [label], BANNER_W - 40, 36, 24);
    const x0 = -BANNER_W / 2 + 24;
    const w = BANNER_W - 48;
    this.bar.clear();
    this.bar.fillStyle(0xffffff, 0.2).fillRoundedRect(x0, BANNER_H / 2 - 22, w, 10, 5);
    this.bar.fillStyle(remainRatio > 0.34 ? 0xffc900 : 0xff5a5a, 1)
      .fillRoundedRect(x0, BANNER_H / 2 - 22, Math.max(6, w * Phaser.Math.Clamp(remainRatio, 0, 1)), 10, 5);
  }

  hide(): void {
    this.box.setVisible(false);
  }
}
