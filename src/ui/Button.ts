// 둥근 버튼 공용 컴포넌트
import Phaser from 'phaser';
import { FONT } from '../config';
import { audio } from '../systems/Audio';

export interface ButtonOpts {
  width?: number;
  height?: number;
  color?: number;
  fontSize?: number;
  textColor?: string;
  disabled?: boolean;
}

export function makeButton(
  scene: Phaser.Scene, x: number, y: number, label: string, onClick: () => void, opts: ButtonOpts = {},
): Phaser.GameObjects.Container {
  const w = opts.width ?? 360;
  const h = opts.height ?? 92;
  const color = opts.color ?? 0x2b6ef2;
  const g = scene.add.graphics();
  const draw = (pressed: boolean) => {
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 26);
    g.fillStyle(opts.disabled ? 0x3a3f46 : color, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + (pressed ? 4 : 0), w, h, 26);
    g.lineStyle(3, 0xffffff, opts.disabled ? 0.2 : 0.5);
    g.strokeRoundedRect(-w / 2, -h / 2 + (pressed ? 4 : 0), w, h, 26);
  };
  draw(false);
  const t = scene.add.text(0, 0, label, {
    fontFamily: FONT, fontSize: `${opts.fontSize ?? 38}px`, color: opts.textColor ?? '#ffffff', align: 'center',
  }).setOrigin(0.5);
  if (opts.disabled) t.setAlpha(0.5);
  const c = scene.add.container(x, y, [g, t]).setSize(w, h);
  let lastClick = -Infinity;
  if (!opts.disabled) {
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => {
      draw(true);
      t.setY(4);
    });
    c.on('pointerout', () => {
      draw(false);
      t.setY(0);
    });
    c.on('pointerup', () => {
      if (scene.time.now - lastClick < 250) return;
      lastClick = scene.time.now;
      draw(false);
      t.setY(0);
      audio.unlock();
      audio.play('pop');
      onClick();
    });
  }
  return c;
}
