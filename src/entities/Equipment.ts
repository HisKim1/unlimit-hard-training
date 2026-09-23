// 박스에 놓인 기구 하나 (바닥 스프라이트 + 그림자 + 사용 횟수 점 + 로프/링 매달기)
import Phaser from 'phaser';
import { CONFIG, depthScale, spriteScale, type Point } from '../config';
import { EQUIPMENT, RINGS_HEIGHT_PX, RINGS_SPACING_PX, type EquipmentDef, type EquipmentId } from '../equipment';
import { DEPTH, type Effects } from '../fx/Effects';
import { imageOrigin, imageRef } from '../assets';
import { clampWalk } from '../systems/Placement';

let nextId = 1;

export class Equipment {
  readonly id = nextId++;
  readonly def: EquipmentDef;
  uses = 0;
  inUse = false;
  removed = false;
  private sprite?: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private pips: Phaser.GameObjects.Graphics;
  private hang?: Phaser.GameObjects.TileSprite; // 로프
  private straps: Phaser.GameObjects.TileSprite[] = []; // 링 스트랩
  private rings: Phaser.GameObjects.Image[] = [];
  readonly scale: number;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly type: EquipmentId,
    readonly pos: Point,
    readonly slot: number,
  ) {
    this.def = EQUIPMENT[type];
    this.scale = depthScale(pos.y);
    const depth = DEPTH.world + pos.y;

    this.shadow = scene.add.image(pos.x, pos.y, 'shadow').setDepth(depth - 0.5).setAlpha(0.8);
    const fp = this.def.footprint;
    this.shadow.setDisplaySize(fp.rx * 2.3 * this.scale, fp.ry * 2.6 * this.scale);

    if (type === 'rope') {
      const len = pos.y - CONFIG.ROPE_TOP_Y;
      this.hang = scene.add.tileSprite(pos.x, CONFIG.ROPE_TOP_Y, 18, len, 'rope_tile')
        .setOrigin(0.5, 0).setDepth(depth - 1);
      this.hang.setDisplaySize(16 * this.scale, len);
    } else if (type === 'rings') {
      const ringY = pos.y - RINGS_HEIGHT_PX * this.scale;
      const half = (RINGS_SPACING_PX * this.scale) / 2;
      for (const sx of [-half, half]) {
        const len = ringY - CONFIG.ROPE_TOP_Y - 14 * this.scale;
        const strap = scene.add.tileSprite(pos.x + sx, CONFIG.ROPE_TOP_Y, 10, len, 'strap_tile')
          .setOrigin(0.5, 0).setDepth(depth - 1);
        strap.setDisplaySize(8 * this.scale, len);
        this.straps.push(strap);
        const ring = scene.add.image(pos.x + sx, ringY, 'ring_single').setDepth(depth - 1).setScale(this.scale * 0.9);
        this.rings.push(ring);
      }
    } else {
      const ref = imageRef(scene, this.def.sprite);
      const o = imageOrigin(this.def.sprite);
      this.sprite = scene.add.image(pos.x, pos.y, ref.key, ref.frame).setOrigin(o.x, o.y).setDepth(depth).setScale(spriteScale(pos.y));
    }

    this.pips = scene.add.graphics().setDepth(DEPTH.label - 10);
    this.drawPips();
  }

  /** 원장님이 서는 지점 */
  get usePoint(): Point {
    const u = this.def.usePoint;
    return clampWalk({ x: this.pos.x + u.dx * this.scale, y: this.pos.y + u.dy * this.scale });
  }

  /** 운동 모션 스프라이트의 원점 위치 */
  get exercisePoint(): Point {
    const a = this.def.exerciseAnchor;
    return { x: this.pos.x + a.dx * this.scale, y: this.pos.y + a.dy * this.scale };
  }

  get remaining(): number {
    return CONFIG.SESSIONS_PER_EQUIPMENT - this.uses;
  }

  private drawPips(): void {
    const g = this.pips;
    g.clear();
    const n = CONFIG.SESSIONS_PER_EQUIPMENT;
    const gap = 14;
    const x0 = this.pos.x - ((n - 1) * gap) / 2;
    const y = this.pos.y + 16 * this.scale;
    for (let i = 0; i < n; i++) {
      const used = i < this.uses;
      g.fillStyle(0x000000, 0.6);
      g.fillCircle(x0 + i * gap, y, 6);
      g.fillStyle(used ? 0x555555 : 0x3ddc84, 1);
      g.fillCircle(x0 + i * gap, y, 4);
    }
  }

  /** 위에서 "쿵" 떨어지는 연출 */
  dropIn(fx: Effects, onLand: () => void): void {
    const h = CONFIG.DROP_FALL_HEIGHT_PX;
    const all = [this.sprite, this.hang, ...this.straps, ...this.rings].filter(Boolean) as (Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite)[];
    if (this.def.zone === 'ceiling') {
      // 매다는 기구는 위에서 내려온다 (스르륵)
      for (const o of all) {
        const y = o.y;
        o.y -= h;
        this.scene.tweens.add({ targets: o, y, duration: CONFIG.DROP_FALL_MS * 1.3, ease: 'Sine.easeOut' });
      }
      this.shadow.setScale(this.shadow.scaleX * 0.3, this.shadow.scaleY * 0.3);
      this.scene.tweens.add({
        targets: this.shadow, scaleX: this.shadow.scaleX / 0.3, scaleY: this.shadow.scaleY / 0.3,
        duration: CONFIG.DROP_FALL_MS * 1.3, onComplete: onLand,
      });
      this.pips.setAlpha(0);
      this.scene.tweens.add({ targets: this.pips, alpha: 1, delay: CONFIG.DROP_FALL_MS, duration: 200 });
      return;
    }
    const s = this.sprite!;
    const y = s.y;
    s.y -= h;
    const sx = this.shadow.scaleX;
    const sy = this.shadow.scaleY;
    this.shadow.setScale(sx * 0.2, sy * 0.2);
    this.pips.setAlpha(0);
    this.scene.tweens.add({ targets: this.shadow, scaleX: sx, scaleY: sy, duration: CONFIG.DROP_FALL_MS, ease: 'Quad.easeIn' });
    this.scene.tweens.add({
      targets: s, y, duration: CONFIG.DROP_FALL_MS, ease: 'Bounce.easeOut',
      onComplete: () => {
        fx.dustAt(this.pos.x, this.pos.y, 12);
        this.scene.tweens.add({ targets: this.pips, alpha: 1, duration: 200 });
        onLand();
      },
    });
    // 떨어지는 동안 살짝 흔들림
    this.scene.tweens.add({ targets: s, angle: { from: -6, to: 0 }, duration: CONFIG.DROP_FALL_MS });
  }

  /** 운동 중에는 모션 그림에 기구가 포함되어 있으면 숨긴다 (SPEC 4.4) */
  setExercising(on: boolean): void {
    this.inUse = on;
    if (!this.def.hideDuringExercise) return;
    this.sprite?.setVisible(!on);
    for (const r of this.rings) r.setVisible(!on);
  }

  /** 세션 완료 */
  addUse(): void {
    this.uses++;
    this.drawPips();
  }

  /** 사용 완료 후 "펑" 연기와 함께 페이드아웃 */
  remove(fx: Effects): void {
    this.removed = true;
    fx.poofAt(this.pos.x, this.pos.y - 30 * this.scale);
    const all = [this.sprite, this.shadow, this.pips, this.hang, ...this.straps, ...this.rings].filter(Boolean) as Phaser.GameObjects.Components.Alpha[];
    this.scene.tweens.add({
      targets: all, alpha: 0, duration: CONFIG.REMOVE_FADE_MS,
      onComplete: () => this.destroy(),
    });
    if (this.sprite) this.scene.tweens.add({ targets: this.sprite, scale: this.sprite.scale * 1.15, duration: CONFIG.REMOVE_FADE_MS });
  }

  destroy(): void {
    this.sprite?.destroy();
    this.shadow.destroy();
    this.pips.destroy();
    this.hang?.destroy();
    for (const s of this.straps) s.destroy();
    for (const r of this.rings) r.destroy();
  }

  /** 디버그: 풋프린트 */
  debugDraw(g: Phaser.GameObjects.Graphics): void {
    const fp = this.def.footprint;
    g.lineStyle(2, 0xffff00, 0.8);
    g.strokeEllipse(this.pos.x, this.pos.y, fp.rx * 2 * this.scale, fp.ry * 2 * this.scale);
    const u = this.usePoint;
    g.fillStyle(0x00ffff, 1);
    g.fillCircle(u.x, u.y, 4);
    const e = this.exercisePoint;
    g.fillStyle(0xff00ff, 1);
    g.fillCircle(e.x, e.y, 4);
  }
}
