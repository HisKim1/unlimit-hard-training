// 하단 기구 툴바: 가로 스크롤(관성) + 위로 끌면 기구 드래그 (SPEC 8.3).
// HTML5 Drag and Drop 대신 Phaser 포인터 이벤트로 직접 구현한다.
import Phaser from 'phaser';
import { COLORS, CONFIG, FONT } from '../config';
import { EQUIPMENT, TOOLBAR_ORDER, type EquipmentId } from '../equipment';
import { DEPTH } from '../fx/Effects';
import { imageRef } from '../assets';
import { BUFFS, BUFF_ORDER, isBuff, type ToolbarId } from '../buffs';
import { STR } from '../strings';

interface Item {
  id: ToolbarId;
  box: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
  badge?: Phaser.GameObjects.Text;
  enabled: boolean;
  highlight: boolean;
}

export interface ToolbarCallbacks {
  onDragStart(id: ToolbarId, pointer: Phaser.Input.Pointer): void;
  onTap?(id: ToolbarId): void;
  onTabChange?(): void;
  onUpcoming?(): void;
}

const PAD = 14;

export class Toolbar {
  private root: Phaser.GameObjects.Container;
  private items: Item[] = [];
  private scroll = 0;
  private vel = 0;
  private minScroll = 0;
  private tabs: Phaser.GameObjects.Text[] = [];
  private upcoming!: Phaser.GameObjects.Container;
  /** 일시정지 등에서 입력을 막는다 */
  private _enabled = true;
  get enabled(): boolean { return this._enabled; }
  set enabled(value: boolean) {
    this._enabled = value;
    if (!value) {
      this.active = null;
      this.vel = 0;
    }
  }
  private active: {
    pointerId: number; startX: number; startY: number; lastX: number; lastT: number;
    mode: 'pending' | 'scroll'; item: Item | null;
  } | null = null;

  constructor(private readonly scene: Phaser.Scene, private readonly cb: ToolbarCallbacks) {
    const W = CONFIG.logicalWidth;
    const top = CONFIG.TOOLBAR_TOP;
    const H = CONFIG.TOOLBAR_HEIGHT;
    const panel = scene.add.graphics();
    panel.fillStyle(COLORS.toolbarBg, 0.96);
    panel.fillRect(0, 0, W, H + 40);
    panel.fillStyle(COLORS.accentBlue, 1);
    panel.fillRect(0, 0, W, 5);
    this.root = scene.add.container(0, top, [panel]).setDepth(DEPTH.toolbar);

    const iw = CONFIG.TOOLBAR_ITEM_W;
    const tabH = CONFIG.TOOLBAR_TAB_HEIGHT;
    const itemH = H - tabH;
    [STR.equipmentTab, STR.buffTab].forEach((label, i) => {
      const text = scene.add.text(W * (i + 0.5) / 2, tabH / 2, label, {
        fontFamily: FONT, fontSize: '25px', color: '#ffffff', align: 'center',
        backgroundColor: i === 0 ? '#1f5fd6' : '#232a33', fixedWidth: W / 2 - 12, fixedHeight: tabH - 4,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      text.on('pointerdown', () => { if (this.enabled) this.selectTab(i === 0 ? 'equipment' : 'buffs'); });
      this.tabs.push(text);
      this.root.add(text);
    });
    const ids: ToolbarId[] = [...TOOLBAR_ORDER, ...BUFF_ORDER];
    ids.forEach((id) => {
      const d = isBuff(id) ? BUFFS[id] : EQUIPMENT[id];
      const bg = scene.add.graphics();
      const ref = imageRef(scene, d.icon);
      const icon = scene.add.image(0, -14, ref.key, ref.frame);
      const s = (CONFIG.TOOLBAR_ICON_SIZE - tabH) / Math.max(icon.width, icon.height);
      icon.setScale(s);
      const label = scene.add.text(0, 26, d.name, {
        fontFamily: FONT, fontSize: '19px', color: '#e8eef5',
      }).setOrigin(0.5);
      if (label.width > iw - 8) label.setScale((iw - 8) / label.width);
      const box = scene.add.container(0, tabH + itemH / 2, [bg, icon, label]);
      this.root.add(box);
      const item: Item = { id, box, bg, icon, enabled: true, highlight: false };
      if (isBuff(id)) {
        item.badge = scene.add.text(0, 47, BUFFS[id].hint, { fontFamily: FONT, fontSize: '16px', color: '#8fe6c2' }).setOrigin(0.5);
        box.add(item.badge);
      }
      this.drawItem(item);
      this.items.push(item);
    });
    const upcomingBg = scene.add.rectangle(0, 0, iw - 12, itemH - 12, COLORS.toolbarItemDisabled);
    const question = scene.add.text(0, -18, '?', { fontFamily: FONT, fontSize: '52px', color: '#9da8b5' }).setOrigin(0.5);
    const upcomingLabel = scene.add.text(0, 26, '종코', { fontFamily: FONT, fontSize: '19px', color: '#e8eef5' }).setOrigin(0.5);
    const upcomingBadge = scene.add.text(0, 47, '업데이트 예정', { fontFamily: FONT, fontSize: '16px', color: '#9da8b5' }).setOrigin(0.5);
    this.upcoming = scene.add.container(PAD + iw / 2 + BUFF_ORDER.length * iw, tabH + itemH / 2,
      [upcomingBg, question, upcomingLabel, upcomingBadge]).setSize(iw - 12, itemH - 12).setInteractive({ useHandCursor: true });
    this.upcoming.on('pointerup', () => { if (this.enabled) this.cb.onUpcoming?.(); });
    this.root.add(this.upcoming);
    this.selectTab('equipment');

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
      scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
      scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
      scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    });
  }

  private drawItem(it: Item): void {
    const w = CONFIG.TOOLBAR_ITEM_W - 12;
    const h = CONFIG.TOOLBAR_HEIGHT - CONFIG.TOOLBAR_TAB_HEIGHT - 12;
    it.bg.clear();
    it.bg.fillStyle(it.enabled ? COLORS.toolbarItem : COLORS.toolbarItemDisabled, 1);
    it.bg.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    if (it.highlight && it.enabled) {
      it.bg.lineStyle(3, COLORS.warn, 1);
      it.bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
    }
    it.icon.setAlpha(it.enabled ? 1 : 0.3);
  }

  private layout(): void {
    const iw = CONFIG.TOOLBAR_ITEM_W;
    this.items.filter(it => it.box.visible).forEach((it, i) => it.box.setX(PAD + iw / 2 + i * iw + this.scroll));
  }

  selectTab(tab: 'equipment' | 'buffs'): void {
    this.upcoming.setVisible(tab === 'buffs');
    this.active = null;
    this.scroll = 0;
    this.vel = 0;
    for (const it of this.items) it.box.setVisible(isBuff(it.id) === (tab === 'buffs'));
    const count = tab === 'buffs' ? BUFF_ORDER.length : TOOLBAR_ORDER.length;
    this.minScroll = Math.min(0, CONFIG.logicalWidth - (PAD * 2 + count * CONFIG.TOOLBAR_ITEM_W));
    this.tabs.forEach((t, i) => t.setBackgroundColor((tab === 'equipment') === (i === 0) ? '#1f5fd6' : '#232a33'));
    this.layout();
    this.cb.onTabChange?.();
  }

  refreshBuffs(remaining: (id: typeof BUFF_ORDER[number]) => number, cooldown: (id: typeof BUFF_ORDER[number]) => number): void {
    for (const it of this.items) {
      if (!isBuff(it.id)) continue;
      const cd = cooldown(it.id);
      const active = remaining(it.id);
      if (it.enabled !== (cd <= 0)) { it.enabled = cd <= 0; this.drawItem(it); }
      it.badge?.setText(active > 0 ? STR.buffActive(active) : cd > 0 ? `${Math.ceil(cd)}초` : BUFFS[it.id].hint);
      it.badge?.setColor(active > 0 ? '#ffc53d' : cd > 0 ? '#9da8b5' : '#8fe6c2');
    }
  }

  /** WOD 에 필요한 기구를 노란 테두리로 강조 */
  setHighlighted(ids: EquipmentId[]): void {
    for (const it of this.items) {
      it.highlight = !isBuff(it.id) && ids.includes(it.id);
      this.drawItem(it);
    }
  }

  setEnabled(id: ToolbarId, enabled: boolean): void {
    const it = this.items.find((x) => x.id === id);
    if (!it) return;
    it.enabled = enabled;
    this.drawItem(it);
  }

  isEnabled(id: ToolbarId): boolean {
    return this.items.find((x) => x.id === id)?.enabled ?? false;
  }

  /** 아이콘의 현재 화면 좌표 (무효 드롭 시 되돌아갈 곳) */
  iconWorldPos(id: ToolbarId): { x: number; y: number } {
    const it = this.items.find((x) => x.id === id);
    if (!it) return { x: CONFIG.logicalWidth / 2, y: CONFIG.TOOLBAR_TOP + 60 };
    return { x: it.box.x, y: CONFIG.TOOLBAR_TOP + it.box.y + it.icon.y };
  }

  iconScale(id: ToolbarId): number {
    return this.items.find((x) => x.id === id)?.icon.scale ?? 1;
  }

  private itemAt(x: number): Item | null {
    const iw = CONFIG.TOOLBAR_ITEM_W;
    for (const it of this.items) if (it.box.visible && Math.abs(it.box.x - x) <= iw / 2) return it;
    return null;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.enabled || p.y < CONFIG.TOOLBAR_TOP + CONFIG.TOOLBAR_TAB_HEIGHT || this.active) return;
    this.vel = 0;
    this.active = { pointerId: p.id, startX: p.x, startY: p.y, lastX: p.x, lastT: p.downTime, mode: 'pending', item: this.itemAt(p.x) };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const a = this.active;
    if (!a || a.pointerId !== p.id || !p.isDown) return;
    const dx = p.x - a.startX;
    const dy = p.y - a.startY;
    if (a.mode === 'pending') {
      if (Math.hypot(dx, dy) < CONFIG.DRAG_START_PX) return;
      // 수직(위쪽) 성분이 수평 성분보다 크면 기구 드래그, 아니면 스크롤
      if (-dy > Math.abs(dx) && a.item && a.item.enabled) {
        const id = a.item.id;
        this.active = null;
        this.cb.onDragStart(id, p);
        return;
      }
      a.mode = 'scroll';
    }
    const now = p.moveTime || this.scene.time.now;
    const step = p.x - a.lastX;
    const dt = Math.max(1, now - a.lastT) / 1000;
    this.vel = Phaser.Math.Clamp(step / dt, -CONFIG.TOOLBAR_MAX_FLING_PX_PER_SEC, CONFIG.TOOLBAR_MAX_FLING_PX_PER_SEC) * 0.6 + this.vel * 0.4;
    a.lastX = p.x;
    a.lastT = now;
    this.scroll = Phaser.Math.Clamp(this.scroll + step, this.minScroll - 40, 40);
    this.layout();
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const a = this.active;
    if (!a || a.pointerId !== p.id) return;
    this.active = null;
    if (a.mode === 'pending') {
      this.vel = 0;
      if (a.item && this.cb.onTap) this.cb.onTap(a.item.id);
    } else if (this.scene.time.now - a.lastT > 80) {
      this.vel = 0; // 멈췄다가 뗀 경우 관성 없음
    }
  }

  update(dtSec: number): void {
    if (this.active?.mode === 'scroll') return;
    let changed = false;
    if (Math.abs(this.vel) > 5) {
      this.scroll += this.vel * dtSec;
      this.vel *= Math.exp(-CONFIG.TOOLBAR_INERTIA_DECAY * dtSec);
      changed = true;
    } else {
      this.vel = 0;
    }
    // 가장자리를 넘었으면 부드럽게 되돌림
    if (this.scroll > 0 || this.scroll < this.minScroll) {
      const target = this.scroll > 0 ? 0 : this.minScroll;
      this.scroll += (target - this.scroll) * Math.min(1, dtSec * 12);
      if (Math.abs(target - this.scroll) < 0.5) this.scroll = target;
      this.vel *= 0.5;
      changed = true;
    }
    if (changed) this.layout();
  }
}
