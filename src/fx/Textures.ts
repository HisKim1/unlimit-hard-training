// 코드로 그리는 텍스처 (파티클, 비네트, 손바닥, 초크·링 아이콘, 없는 에셋의 플레이스홀더)
import Phaser from 'phaser';
import { CONFIG, FONT } from '../config';
import { EQUIPMENT, type EquipmentId } from '../equipment';
import { hasFrame } from '../assets';

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const t = scene.textures.createCanvas(key, w, h);
  if (!t) return;
  draw(t.getContext());
  t.refresh();
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function generateTextures(scene: Phaser.Scene): void {
  canvas(scene, 'placeholder', 64, 64, (c) => {
    c.fillStyle = '#ff00aa';
    roundRect(c, 2, 2, 60, 60, 10);
    c.fill();
    c.fillStyle = '#fff';
    c.font = `36px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('?', 32, 34);
  });

  canvas(scene, 'dot', 12, 12, (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(6, 6, 5.5, 0, Math.PI * 2);
    c.fill();
  });

  canvas(scene, 'drop', 14, 20, (c) => {
    // 땀방울
    c.fillStyle = '#bfe6ff';
    c.strokeStyle = '#5aa9e6';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(7, 1);
    c.quadraticCurveTo(13, 11, 12, 14);
    c.arc(7, 14, 5, 0, Math.PI);
    c.quadraticCurveTo(1, 11, 7, 1);
    c.fill();
    c.stroke();
  });

  canvas(scene, 'puff', 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });

  canvas(scene, 'smoke', 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(210,210,210,0.95)');
    g.addColorStop(0.7, 'rgba(170,170,170,0.5)');
    g.addColorStop(1, 'rgba(150,150,150,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });

  canvas(scene, 'star', 32, 32, (c) => {
    c.fillStyle = '#ffe14d';
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 15 : 5;
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      c.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  });

  canvas(scene, 'shadow', 128, 40, (c) => {
    const g = c.createRadialGradient(64, 20, 2, 64, 20, 62);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save();
    c.scale(1, 40 / 128);
    c.fillStyle = g;
    c.beginPath();
    c.arc(64, 64, 64, 0, Math.PI * 2);
    c.fill();
    c.restore();
  });

  canvas(scene, 'vignette', CONFIG.logicalWidth, CONFIG.logicalHeight, (c) => {
    const w = CONFIG.logicalWidth;
    const h = CONFIG.logicalHeight;
    c.save();
    c.scale(1, h / w);
    const g = c.createRadialGradient(w / 2, w / 2, w * 0.35, w / 2, w / 2, w * 0.78);
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, 'rgba(230,20,20,0.75)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, w);
    c.restore();
  });

  canvas(scene, 'hand', 96, 110, (c) => {
    // 손바닥 (찰싹 이펙트)
    c.fillStyle = '#ffd2a8';
    c.strokeStyle = '#6b3b1f';
    c.lineWidth = 4;
    const finger = (x: number, y: number, w: number, h: number, rot: number) => {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      roundRect(c, -w / 2, -h, w, h, w / 2);
      c.fill();
      c.stroke();
      c.restore();
    };
    finger(26, 52, 16, 40, -0.18);
    finger(42, 46, 17, 44, -0.05);
    finger(58, 47, 17, 42, 0.07);
    finger(73, 54, 15, 34, 0.2);
    finger(18, 78, 16, 34, -1.1);
    roundRect(c, 16, 44, 66, 58, 24);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,120,90,0.35)';
    c.beginPath();
    c.ellipse(50, 74, 18, 13, 0, 0, Math.PI * 2);
    c.fill();
  });

  canvas(scene, 'rope_tile', 18, 24, (c) => {
    c.fillStyle = '#c99a5b';
    c.fillRect(2, 0, 14, 24);
    c.strokeStyle = '#7a5528';
    c.lineWidth = 2;
    for (let y = -12; y < 30; y += 8) {
      c.beginPath();
      c.moveTo(2, y + 8);
      c.lineTo(16, y);
      c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(12, 0, 4, 24);
    c.fillStyle = '#3b2a17';
    c.fillRect(0, 0, 2, 24);
    c.fillRect(16, 0, 2, 24);
  });

  canvas(scene, 'strap_tile', 10, 16, (c) => {
    c.fillStyle = '#1b1b1b';
    c.fillRect(1, 0, 8, 16);
    c.fillStyle = '#333';
    c.fillRect(2, 0, 2, 16);
  });

  // 링 한 쌍 (천장 스트랩 끝)
  canvas(scene, 'ring_single', 40, 40, (c) => {
    c.lineWidth = 7;
    c.strokeStyle = '#4a2f14';
    c.beginPath();
    c.arc(20, 20, 15, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 4.5;
    c.strokeStyle = '#d9a86a';
    c.beginPath();
    c.arc(20, 20, 15, 0, Math.PI * 2);
    c.stroke();
  });

  if (!hasFrame(scene, 'icon_rings')) {
    canvas(scene, 'icon_rings', 112, 112, (c) => {
      c.fillStyle = '#1b1b1b';
      c.fillRect(30, 0, 8, 56);
      c.fillRect(74, 0, 8, 56);
      for (const x of [34, 78]) {
        c.lineWidth = 11;
        c.strokeStyle = '#4a2f14';
        c.beginPath();
        c.arc(x, 76, 20, 0, Math.PI * 2);
        c.stroke();
        c.lineWidth = 7;
        c.strokeStyle = '#d9a86a';
        c.beginPath();
        c.arc(x, 76, 20, 0, Math.PI * 2);
        c.stroke();
      }
    });
  }

  if (!hasFrame(scene, 'icon_chalk')) {
    canvas(scene, 'icon_chalk', 112, 112, (c) => {
      // 초크 버킷
      c.fillStyle = '#2f3a48';
      c.strokeStyle = '#111';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(22, 40);
      c.lineTo(90, 40);
      c.lineTo(82, 104);
      c.lineTo(30, 104);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#f7f7f2';
      c.beginPath();
      c.ellipse(56, 40, 36, 12, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = '#ffffff';
      roundRect(c, 40, 16, 34, 26, 6);
      c.fill();
      c.strokeStyle = '#cfcfcf';
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.8)';
      for (const [x, y, r] of [[30, 20, 5], [86, 24, 4], [22, 30, 3], [92, 12, 3]]) {
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#fff';
      c.font = `18px ${FONT}`;
      c.textAlign = 'center';
      c.fillText('CHALK', 56, 80);
    });
  }

  // 아틀라스에 없는 아이콘·기구 그림은 이름이 적힌 플레이스홀더로 (SPEC 0: 플레이스홀더 우선)
  for (const id of Object.keys(EQUIPMENT) as EquipmentId[]) {
    const d = EQUIPMENT[id];
    for (const name of [d.icon, d.sprite]) {
      if (hasFrame(scene, name)) continue;
      const isIcon = name.startsWith('icon_');
      const w = isIcon ? 112 : Math.max(60, d.footprint.rx * 2);
      const h = isIcon ? 112 : 70;
      canvas(scene, name, w, h, (c) => {
        const col = '#' + d.placeholderColor.toString(16).padStart(6, '0');
        c.fillStyle = col;
        c.strokeStyle = '#fff';
        c.lineWidth = 3;
        roundRect(c, 3, 3, w - 6, h - 6, 14);
        c.fill();
        c.stroke();
        c.fillStyle = '#fff';
        c.font = `${isIcon ? 24 : 18}px ${FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(d.name, w / 2, h / 2);
      });
    }
  }
}
