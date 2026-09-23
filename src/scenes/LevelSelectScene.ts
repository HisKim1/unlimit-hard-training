// 레벨(WOD) 선택: 잠긴 레벨 자물쇠, 최고 기록, 자유 모드
import Phaser from 'phaser';
import { COLORS, CONFIG, FONT } from '../config';
import { EQUIPMENT } from '../equipment';
import { STR, formatRecord, formatTime } from '../strings';
import { WODS } from '../wods';
import { save } from '../systems/Save';
import { audio } from '../systems/Audio';
import { imageRef } from '../assets';
import { makeButton } from '../ui/Button';

export class LevelSelectScene extends Phaser.Scene {
  private list!: Phaser.GameObjects.Container;
  private scrollY = 0;
  private minScroll = 0;
  private dragStart: { y: number; scroll: number; moved: boolean } | null = null;

  constructor() {
    super('LevelSelect');
  }

  create(): void {
    audio.setMusic('menu');
    this.scrollY = 0;
    this.dragStart = null;
    const W = CONFIG.logicalWidth;
    const H = CONFIG.logicalHeight;
    this.add.image(0, 0, 'box_bg').setOrigin(0).setDisplaySize(W, H);
    this.add.rectangle(0, 0, W, H, 0x0d1117, 0.72).setOrigin(0);

    this.list = this.add.container(0, 0);
    const top = 170;
    const cardH = 150;
    const gap = 16;
    WODS.forEach((w, i) => {
      const y = top + i * (cardH + gap) + cardH / 2;
      const unlocked = save.isUnlocked(w.level);
      const best = save.best(w.id);
      const g = this.add.graphics();
      g.fillStyle(unlocked ? 0x1b2330 : 0x121720, 0.95);
      g.fillRoundedRect(-(W - 60) / 2, -cardH / 2, W - 60, cardH, 22);
      g.lineStyle(3, unlocked ? (w.bonus ? COLORS.warn : COLORS.accentBlue) : 0x333a44, 1);
      g.strokeRoundedRect(-(W - 60) / 2, -cardH / 2, W - 60, cardH, 22);
      const lv = this.add.text(-(W - 60) / 2 + 24, -46, `Lv${w.level}`, { fontFamily: FONT, fontSize: '28px', color: unlocked ? '#8fb4ff' : '#666' }).setOrigin(0, 0.5);
      const name = this.add.text(-(W - 60) / 2 + 100, -46, `${w.name} · ${w.nameKo}`, { fontFamily: FONT, fontSize: '32px', color: unlocked ? '#ffffff' : '#666' }).setOrigin(0, 0.5);
      const desc = this.add.text(-(W - 60) / 2 + 24, 2, w.original, {
        fontFamily: FONT, fontSize: '21px', color: unlocked ? '#c9d4e0' : '#555', wordWrap: { width: W - 250, useAdvancedWrap: true }, lineSpacing: 2,
      }).setOrigin(0, 0.5);
      const info = this.add.text(-(W - 60) / 2 + 24, 52,
        `${STR.timeCap(formatTime(w.timeCapSec))}   ${best !== undefined ? STR.best(formatRecord(best)) : STR.noRecord}`,
        { fontFamily: FONT, fontSize: '22px', color: unlocked ? (best !== undefined ? '#3ddc84' : '#8a96a3') : '#555' }).setOrigin(0, 0.5);
      const parts: Phaser.GameObjects.GameObject[] = [g, lv, name, desc, info];
      // 필요한 기구 아이콘
      w.requirements.forEach((r, k) => {
        const ref = imageRef(this, EQUIPMENT[r.equipment].icon);
        const icon = this.add.image((W - 60) / 2 - 40 - k * 58, 30, ref.key, ref.frame);
        icon.setScale(48 / Math.max(icon.width, icon.height)).setAlpha(unlocked ? 1 : 0.25);
        parts.push(icon);
      });
      if (!unlocked) {
        const lock = this.add.text((W - 60) / 2 - 40, -30, '🔒', { fontSize: '40px' }).setOrigin(0.5);
        parts.push(lock);
      }
      const card = this.add.container(W / 2, y, parts).setSize(W - 60, cardH);
      card.setInteractive({ useHandCursor: unlocked });
      card.on('pointerup', () => {
        if (this.dragStart?.moved) return;
        if (!unlocked) {
          audio.play('warn');
          this.tweens.add({ targets: card, x: W / 2 + 10, duration: 50, yoyo: true, repeat: 2 });
          return;
        }
        audio.unlock();
        audio.play('pop');
        this.scene.start('Game', { level: w.level });
      });
      this.list.add(card);
    });
    const listBottom = top + WODS.length * (cardH + gap);
    const free = makeButton(this, W / 2, listBottom + 60, `${STR.freeMode}  ·  ${STR.freeModeDesc}`, () => {
      if (this.dragStart?.moved) return;
      this.scene.start('Game', {});
    }, { width: W - 60, height: 96, fontSize: 28, color: 0x3a8f5c });
    this.list.add(free);
    const contentBottom = listBottom + 140;
    this.minScroll = Math.min(0, H - 30 - contentBottom);

    // 헤더 (고정)
    const header = this.add.graphics();
    header.fillStyle(0x0d1117, 0.96);
    header.fillRect(0, 0, W, 140);
    header.fillStyle(COLORS.accentBlue, 1);
    header.fillRect(0, 136, W, 4);
    this.add.text(W / 2, 72, STR.levelSelect, { fontFamily: FONT, fontSize: '52px', color: '#ffffff' }).setOrigin(0.5);
    const muteT = this.add.text(W - 50, 72, save.muted ? '🔇' : '🔊', { fontSize: '40px' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    muteT.on('pointerup', () => {
      const m = !save.muted;
      save.setMuted(m);
      audio.setMuted(m);
      muteT.setText(m ? '🔇' : '🔊');
    });
    const back = this.add.text(46, 72, '←', { fontFamily: FONT, fontSize: '48px', color: '#ffffff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    back.on('pointerup', () => this.scene.start('Title'));

    if (save.get().unlockedLevel > WODS.length) {
      this.add.text(W / 2, 118, STR.allCleared, { fontFamily: FONT, fontSize: '22px', color: '#3ddc84' }).setOrigin(0.5);
    }

    // 세로 스크롤 (카드가 화면보다 길 때)
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.dragStart = { y: p.y, scroll: this.scrollY, moved: false };
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.dragStart || !p.isDown) return;
      const dy = p.y - this.dragStart.y;
      if (Math.abs(dy) > CONFIG.DRAG_START_PX) this.dragStart.moved = true;
      if (this.dragStart.moved) {
        this.scrollY = Phaser.Math.Clamp(this.dragStart.scroll + dy, this.minScroll, 0);
        this.list.y = this.scrollY;
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.time.delayedCall(0, () => (this.dragStart = null));
    });
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY - dy, this.minScroll, 0);
      this.list.y = this.scrollY;
    });
  }
}
