// 첫 화면: "시작하기" 터치로 오디오 잠금 해제 (iOS)
import Phaser from 'phaser';
import { CONFIG, FONT } from '../config';
import { STR } from '../strings';
import { audio } from '../systems/Audio';
import { save } from '../systems/Save';
import { firstAnim, playAnim } from '../assets';
import { makeButton } from '../ui/Button';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const W = CONFIG.logicalWidth;
    const H = CONFIG.logicalHeight;
    this.add.image(0, 0, 'box_bg').setOrigin(0).setDisplaySize(W, H);
    this.add.rectangle(0, 0, W, H, 0x000000, 0.35).setOrigin(0);

    const title = this.add.text(W / 2, 250, STR.title, {
      fontFamily: FONT, fontSize: '96px', color: '#ffffff', stroke: '#1f5fd6', strokeThickness: 16,
    }).setOrigin(0.5);
    this.tweens.add({ targets: title, y: 262, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.text(W / 2, 350, STR.subtitle, {
      fontFamily: FONT, fontSize: '34px', color: '#ffffff', stroke: '#000000', strokeThickness: 6,
      align: 'center', wordWrap: { width: W - 80 },
    }).setOrigin(0.5);

    const key = firstAnim(this, ['wj_idle', 'wj_walk_front', 'wj_reels']);
    if (key) {
      const s = this.add.sprite(W / 2, 900, 'placeholder');
      playAnim(s, key);
      s.setScale(1.6 / CONFIG.TEXTURE_SCALE);
      this.tweens.add({ targets: s, angle: { from: -3, to: 3 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.add.image(W / 2, 900, 'shadow').setDisplaySize(220, 50).setDepth(-1).setAlpha(0.8);
    }

    const btn = makeButton(this, W / 2, 1060, STR.start, () => {
      audio.unlock();
      audio.setMuted(save.muted);
      audio.play('slap'); // 시작 버튼 이후 찰싹 소리가 즉시 나는지 확인용
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('LevelSelect'));
    }, { width: 420, height: 110, fontSize: 48, color: 0xff6b3d });
    this.tweens.add({ targets: btn, scale: 1.05, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.text(W / 2, 1150, STR.startHint, { fontFamily: FONT, fontSize: '24px', color: '#dddddd' }).setOrigin(0.5);
  }
}
