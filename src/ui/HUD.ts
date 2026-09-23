// 상단 HUD: WOD 이름, 남은 시간, 요구 세션 진행도, 멘탈(번아웃) 게이지, 음소거·일시정지 버튼
import Phaser from 'phaser';
import { COLORS, CONFIG, FONT } from '../config';
import { EQUIPMENT } from '../equipment';
import { DEPTH } from '../fx/Effects';
import { imageRef } from '../assets';
import { STR, formatTime } from '../strings';
import type { WodProgress } from '../systems/WodProgress';

export interface HudCallbacks {
  onPause(): void;
  onMute(): void;
}

export class HUD {
  private timer: Phaser.GameObjects.Text;
  private chips: { eq: string; text: Phaser.GameObjects.Text; icon: Phaser.GameObjects.Image; check: Phaser.GameObjects.Text }[] = [];
  private gauge: Phaser.GameObjects.Graphics;
  private gaugeText: Phaser.GameObjects.Text;
  private muteText: Phaser.GameObjects.Text;
  private lastBurnout = -1;
  private lastSec = -1;

  constructor(scene: Phaser.Scene, private readonly progress: WodProgress, cb: HudCallbacks) {
    const W = CONFIG.logicalWidth;
    const H = CONFIG.HUD_HEIGHT;
    const bg = scene.add.graphics().setDepth(DEPTH.hud);
    bg.fillGradientStyle(COLORS.hudBg, COLORS.hudBg, COLORS.hudBg, COLORS.hudBg, 0.92, 0.92, 0.55, 0.55);
    bg.fillRect(0, 0, W, H);
    bg.fillStyle(COLORS.accentBlue, 1);
    bg.fillRect(0, H - 4, W, 4);

    const btn = (x: number, label: string, fn: () => void) => {
      const g = scene.add.graphics().setDepth(DEPTH.hud);
      g.fillStyle(0xffffff, 0.12);
      g.fillRoundedRect(x - 26, 12, 52, 48, 12);
      const t = scene.add.text(x, 36, label, { fontFamily: FONT, fontSize: '28px', color: '#ffffff' })
        .setOrigin(0.5).setDepth(DEPTH.hud);
      const zone = scene.add.zone(x, 36, 60, 56).setInteractive({ useHandCursor: true }).setDepth(DEPTH.hud);
      zone.on('pointerup', fn);
      return t;
    };
    btn(36, 'Ⅱ', cb.onPause);
    this.muteText = btn(W - 36, '🔊', cb.onMute);

    const wod = progress.wod;
    const titleStr = wod ? `Lv${wod.level} ${wod.name}` : STR.freeHud;
    scene.add.text(76, 36, titleStr, { fontFamily: FONT, fontSize: '30px', color: '#ffffff' })
      .setOrigin(0, 0.5).setDepth(DEPTH.hud);
    this.timer = scene.add.text(W - 78, 36, '', { fontFamily: FONT, fontSize: '40px', color: '#ffffff', stroke: '#000', strokeThickness: 4 })
      .setOrigin(1, 0.5).setDepth(DEPTH.hud);

    // 진행도 칩
    if (wod) {
      const n = wod.requirements.length;
      const chipW = Math.min(170, (W - 24) / n);
      wod.requirements.forEach((r, i) => {
        const cx = 12 + chipW * i + 8;
        const ref = imageRef(scene, EQUIPMENT[r.equipment].icon);
        const icon = scene.add.image(cx + 20, 88, ref.key, ref.frame).setDepth(DEPTH.hud);
        icon.setScale(40 / Math.max(icon.width, icon.height));
        const text = scene.add.text(cx + 46, 88, '', { fontFamily: FONT, fontSize: '28px', color: '#ffffff' })
          .setOrigin(0, 0.5).setDepth(DEPTH.hud);
        const check = scene.add.text(cx + 34, 74, '✔', { fontFamily: FONT, fontSize: '22px', color: '#3ddc84' })
          .setOrigin(0.5).setDepth(DEPTH.hud).setVisible(false);
        this.chips.push({ eq: r.equipment, text, icon, check });
      });
    } else {
      scene.add.text(12, 88, STR.freeModeDesc, { fontFamily: FONT, fontSize: '22px', color: '#c9d4e0' })
        .setOrigin(0, 0.5).setDepth(DEPTH.hud);
    }

    scene.add.text(14, 126, STR.mental, { fontFamily: FONT, fontSize: '22px', color: '#ffffff' })
      .setOrigin(0, 0.5).setDepth(DEPTH.hud);
    this.gauge = scene.add.graphics().setDepth(DEPTH.hud);
    this.gaugeText = scene.add.text(W - 16, 126, '', { fontFamily: FONT, fontSize: '20px', color: '#ffffff' })
      .setOrigin(1, 0.5).setDepth(DEPTH.hud);
    this.refreshProgress();
    this.setBurnout(0);
  }

  setMuted(m: boolean): void {
    this.muteText.setText(m ? '🔇' : '🔊');
  }

  setTime(remainingSec: number | null): void {
    if (remainingSec === null) {
      this.timer.setText('');
      return;
    }
    const s = Math.ceil(remainingSec);
    if (s === this.lastSec) return;
    this.lastSec = s;
    this.timer.setText(formatTime(s));
    this.timer.setColor(s <= 10 ? '#ff5a5a' : s <= 30 ? '#ffc53d' : '#ffffff');
  }

  refreshProgress(): void {
    for (const c of this.chips) {
      const eq = c.eq as keyof typeof EQUIPMENT;
      const req = this.progress.required(eq);
      const done = this.progress.done.get(eq) ?? 0;
      c.text.setText(`${done}/${req}`);
      const full = done >= req;
      c.text.setColor(full ? '#3ddc84' : '#ffffff');
      c.check.setVisible(full);
      c.icon.setAlpha(full ? 0.6 : 1);
    }
  }

  setBurnout(v: number): void {
    const r = Math.round(v);
    if (r === this.lastBurnout) return;
    this.lastBurnout = r;
    const x0 = 72;
    const w = CONFIG.logicalWidth - x0 - 70;
    const g = this.gauge;
    g.clear();
    g.fillStyle(0xffffff, 0.15);
    g.fillRoundedRect(x0, 116, w, 20, 10);
    const t = Phaser.Math.Clamp(v / CONFIG.BURNOUT_FAINT, 0, 1);
    // 낮으면 초록, 높으면 빨강
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(t < 0.5 ? COLORS.good : COLORS.warn),
      Phaser.Display.Color.ValueToColor(t < 0.5 ? COLORS.warn : COLORS.bad),
      100, t < 0.5 ? t * 200 : (t - 0.5) * 200,
    );
    const c = Phaser.Display.Color.GetColor(col.r, col.g, col.b);
    if (t > 0.01) {
      g.fillStyle(c, 1);
      g.fillRoundedRect(x0, 116, Math.max(20, w * t), 20, 10);
    }
    // 경고·기절 눈금
    for (const mark of [CONFIG.GIVEUP_THRESHOLD, CONFIG.BURNOUT_WARNING]) {
      const mx = x0 + (w * mark) / CONFIG.BURNOUT_FAINT;
      g.fillStyle(0xffffff, 0.5);
      g.fillRect(mx - 1, 114, 2, 24);
    }
    this.gaugeText.setText(`${r}`);
  }
}
