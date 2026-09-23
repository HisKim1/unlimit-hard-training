// 개발용 스프라이트 뷰어 (?viewer): 애니 재생, 앵커 십자선·발 기준선, 스케일/오프셋/fps 조정, anim-tuning.json 내보내기
import Phaser from 'phaser';
import { CONFIG, FONT } from '../config';
import { animTuning, createAnims, meta, playAnim, tuning, type Tuning } from '../assets';

export class SpriteViewerScene extends Phaser.Scene {
  private sprite!: Phaser.GameObjects.Sprite;
  private ref!: Phaser.GameObjects.Sprite;
  private cross!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private panel?: HTMLDivElement;
  private key = '';
  private keys: string[] = [];

  constructor() {
    super('SpriteViewer');
  }

  create(): void {
    const W = CONFIG.logicalWidth;
    this.cameras.main.setBackgroundColor('#5a5f66');
    this.keys = Object.keys(meta.anims).sort();
    const baseY = 900;
    const g = this.add.graphics();
    g.lineStyle(2, 0xff4040, 1);
    g.lineBetween(0, baseY, W, baseY);
    this.add.text(10, baseY + 6, '발 기준선', { fontFamily: FONT, fontSize: '20px', color: '#ffb0b0' });
    this.ref = this.add.sprite(W * 0.22, baseY, 'placeholder').setAlpha(0.55);
    if (this.anims.exists('wj_idle')) playAnim(this.ref, 'wj_idle');
    this.add.text(W * 0.22, baseY + 40, '기준: wj_idle', { fontFamily: FONT, fontSize: '20px', color: '#ddd' }).setOrigin(0.5);
    this.sprite = this.add.sprite(W * 0.62, baseY, 'placeholder');
    this.cross = this.add.graphics();
    this.info = this.add.text(10, 10, '', { fontFamily: 'monospace', fontSize: '18px', color: '#fff', backgroundColor: '#0008' });
    this.buildPanel();
    if (this.keys.length) this.select(this.keys[0]);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.panel?.remove());
  }

  private select(key: string): void {
    this.key = key;
    playAnim(this.sprite, key, false);
    this.syncPanel();
  }

  private current(): Required<Tuning> {
    return animTuning(this.key);
  }

  private setTuning(patch: Partial<Tuning>): void {
    const t = { ...this.current(), ...patch };
    tuning[this.key] = { scale: t.scale, offsetX: t.offsetX, offsetY: t.offsetY, fps: t.fps };
    if (patch.fps !== undefined) {
      createAnims(this);
      playAnim(this.sprite, this.key, false);
    }
  }

  private buildPanel(): void {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;right:8px;top:8px;z-index:10;background:#111d;color:#fff;padding:10px;border-radius:10px;font:14px sans-serif;width:260px;max-height:90vh;overflow:auto';
    const sel = document.createElement('select');
    sel.style.width = '100%';
    for (const k of this.keys) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = `${k} (${meta.anims[k].frames.length})`;
      sel.appendChild(o);
    }
    sel.onchange = () => this.select(sel.value);
    p.appendChild(sel);
    const mk = (name: keyof Tuning, min: number, max: number, step: number) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:block;margin-top:8px';
      const span = document.createElement('span');
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.style.width = '100%';
      input.dataset.name = name;
      input.oninput = () => {
        this.setTuning({ [name]: Number(input.value) });
        span.textContent = `${name}: ${input.value}`;
      };
      row.append(span, input);
      p.appendChild(row);
    };
    mk('scale', 0.3, 2, 0.01);
    mk('offsetX', -120, 120, 1);
    mk('offsetY', -120, 120, 1);
    mk('fps', 1, 20, 0.5);
    const btn = document.createElement('button');
    btn.textContent = 'anim-tuning.json 복사';
    btn.style.cssText = 'margin-top:10px;width:100%;padding:8px';
    const out = document.createElement('textarea');
    out.style.cssText = 'width:100%;height:120px;margin-top:6px;font:11px monospace';
    btn.onclick = () => {
      const json = JSON.stringify(tuning, null, 1);
      out.value = json;
      void navigator.clipboard?.writeText(json).catch(() => undefined);
    };
    p.append(btn, out);
    document.body.appendChild(p);
    this.panel = p;
  }

  private syncPanel(): void {
    const t = this.current();
    this.panel?.querySelectorAll('input[type=range]').forEach((el) => {
      const input = el as HTMLInputElement;
      const name = input.dataset.name as keyof Tuning;
      input.value = String(t[name]);
      (input.previousSibling as HTMLSpanElement).textContent = `${name}: ${t[name]}`;
    });
  }

  update(): void {
    if (!this.key) return;
    const t = this.current();
    const s = this.sprite;
    const baseX = CONFIG.logicalWidth * 0.62;
    const baseY = 900;
    s.setScale(t.scale).setPosition(baseX + t.offsetX * t.scale, baseY + t.offsetY * t.scale);
    this.ref.setScale(animTuning('wj_idle').scale);
    const g = this.cross;
    g.clear();
    g.lineStyle(2, 0x00ff00, 1);
    g.lineBetween(s.x - 20, s.y, s.x + 20, s.y);
    g.lineBetween(s.x, s.y - 20, s.x, s.y + 20);
    const b = s.getBounds();
    g.lineStyle(1, 0xffffff, 0.5);
    g.strokeRect(b.x, b.y, b.width, b.height);
    const a = meta.anims[this.key];
    this.info.setText(`${this.key}\nframes=${a.frames.length} canvas=${a.width}x${a.height}\norigin=(${a.originX}, ${a.originY})\nframe=${s.frame.name}`);
  }
}
