// 결과 화면: 클리어(기록, 최고 기록 갱신, 멀쩡한 원장님) / 실패(사유 + 연출)
import Phaser from 'phaser';
import { CONFIG, FONT } from '../config';
import { STR, formatRecord } from '../strings';
import { WODS, wodByLevel } from '../wods';
import { save } from '../systems/Save';
import { audio } from '../systems/Audio';
import { firstAnim, playAnim } from '../assets';
import { makeButton } from '../ui/Button';
import type { ResultData } from './GameScene';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data: ResultData): void {
    const W = CONFIG.logicalWidth;
    const H = CONFIG.logicalHeight;
    this.add.image(0, 0, 'box_bg').setOrigin(0).setDisplaySize(W, H);
    this.add.rectangle(0, 0, W, H, data.cleared ? 0x06140c : 0x1a0606, 0.72).setOrigin(0);
    this.cameras.main.fadeIn(250, 0, 0, 0);

    const wod = data.level ? wodByLevel(data.level) : undefined;
    const head = data.cleared ? STR.clearTitle : STR.failTitle;
    this.add.text(W / 2, 170, head, {
      fontFamily: FONT, fontSize: '84px', color: data.cleared ? '#3ddc84' : '#ff5a5a', stroke: '#000', strokeThickness: 10,
    }).setOrigin(0.5);
    if (wod) this.add.text(W / 2, 260, `Lv${wod.level} ${wod.name}`, { fontFamily: FONT, fontSize: '40px', color: '#ffffff' }).setOrigin(0.5);

    // 원장님 연출
    const key = data.cleared
      ? firstAnim(this, ['wj_clear', 'wj_idle'])
      : data.reason === 'fainted'
        ? firstAnim(this, ['wj_fainted', 'floor_09', 'floor_01'])
        : firstAnim(this, ['floor_ghost', 'floor_01', 'wj_fainted', 'wj_idle']);
    if (key) {
      const s = this.add.sprite(W / 2, 760, 'placeholder');
      playAnim(s, key);
      s.setScale(1.7 / CONFIG.TEXTURE_SCALE);
      this.add.image(W / 2, 760, 'shadow').setDisplaySize(300, 60).setDepth(-1).setAlpha(0.9);
      if (data.cleared) {
        this.tweens.add({ targets: s, y: 720, duration: 320, yoyo: true, repeat: -1, ease: 'Quad.easeOut' });
        this.time.addEvent({
          delay: 500, repeat: 6, callback: () => {
            const star = this.add.image(W / 2 + Phaser.Math.Between(-200, 200), 520, 'star').setScale(1.2);
            this.tweens.add({ targets: star, y: star.y + 260, alpha: 0, angle: 360, duration: 1100, onComplete: () => star.destroy() });
          },
        });
      } else {
        const stars = [0, 1, 2].map(() => this.add.image(W / 2, 600, 'star'));
        this.tweens.addCounter({
          from: 0, to: Math.PI * 2, duration: 1400, repeat: -1,
          onUpdate: (tw) => {
            const a = tw.getValue() ?? 0;
            stars.forEach((st, i) => st.setPosition(W / 2 - 60 + Math.cos(a + i * 2.1) * 50, 620 + Math.sin(a + i * 2.1) * 14));
          },
        });
      }
    }
    audio.play(data.cleared ? 'fanfare' : 'fail');

    // 기록
    let y = 890;
    if (data.cleared) {
      this.add.text(W / 2, y, STR.record(formatRecord(data.timeSec)), { fontFamily: FONT, fontSize: '52px', color: '#ffffff' }).setOrigin(0.5);
      y += 64;
      if (data.isBest) {
        const nb = this.add.text(W / 2, y, STR.newBest, { fontFamily: FONT, fontSize: '40px', color: '#ffc53d', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
        this.tweens.add({ targets: nb, scale: 1.12, duration: 420, yoyo: true, repeat: -1 });
      } else if (data.best !== undefined) {
        this.add.text(W / 2, y, STR.prevBest(formatRecord(data.best)), { fontFamily: FONT, fontSize: '32px', color: '#c9d4e0' }).setOrigin(0.5);
      }
    } else {
      const reason = data.reason === 'fainted' ? STR.failFainted : STR.failTimeout;
      this.add.text(W / 2, y, reason, { fontFamily: FONT, fontSize: '46px', color: '#ffffff' }).setOrigin(0.5);
    }

    // 버튼
    const bx = W / 2;
    let by = 1060;
    const nextLevel = data.level ? data.level + 1 : null;
    const hasNext = data.cleared && nextLevel !== null && nextLevel <= WODS.length && save.isUnlocked(nextLevel);
    if (hasNext) {
      makeButton(this, bx, by, STR.nextLevel, () => this.scene.start('Game', { level: nextLevel }), { color: 0xff6b3d });
      by += 104;
      makeButton(this, bx - 150, by, STR.retry, () => this.scene.start('Game', { level: data.level ?? undefined }), { width: 280, height: 84, fontSize: 32 });
      makeButton(this, bx + 150, by, STR.toLevelSelect, () => this.scene.start('LevelSelect'), { width: 280, height: 84, fontSize: 30, color: 0x444c56 });
    } else {
      makeButton(this, bx, by, STR.retry, () => this.scene.start('Game', data.level ? { level: data.level } : {}), { color: 0xff6b3d });
      by += 104;
      makeButton(this, bx, by, STR.toLevelSelect, () => this.scene.start('LevelSelect'), { color: 0x444c56 });
    }
  }
}
