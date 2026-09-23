// 아틀라스·애니 메타 로딩 헬퍼. 전처리 결과(public/assets)가 없거나 일부 키가 빠져도
// 플레이스홀더로 동작하도록 모든 조회를 여기서 한다.
import Phaser from 'phaser';

export const ATLAS = 'atlas';

export interface AnimMeta {
  frames: string[];
  fps: number;
  repeat: number;
  yoyo: boolean;
  originX: number;
  originY: number;
  width: number;
  height: number;
}
export interface ImageMeta {
  originX: number;
  originY: number;
  width: number;
  height: number;
}
export interface Tuning {
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  fps?: number;
}

export const meta: { anims: Record<string, AnimMeta>; images: Record<string, ImageMeta> } = { anims: {}, images: {} };
export const tuning: Record<string, Tuning> = {};

let atlasLoaded = false;

export function preloadAssets(scene: Phaser.Scene): void {
  scene.load.image('box_bg', 'assets/box_bg.jpg');
  scene.load.multiatlas(ATLAS, 'assets/atlas.json', 'assets/');
  scene.load.json('anims_meta', 'assets/anims.json');
  scene.load.json('anim_tuning', 'assets/anim-tuning.json');
}

export function initAssets(scene: Phaser.Scene): void {
  atlasLoaded = scene.textures.exists(ATLAS);
  const m = scene.cache.json.get('anims_meta') as typeof meta | undefined;
  if (m?.anims) Object.assign(meta.anims, m.anims);
  if (m?.images) Object.assign(meta.images, m.images);
  const t = scene.cache.json.get('anim_tuning') as Record<string, Tuning> | undefined;
  if (t) Object.assign(tuning, t);
  createAnims(scene);
}

export function createAnims(scene: Phaser.Scene): void {
  if (!atlasLoaded) return;
  const tex = scene.textures.get(ATLAS);
  for (const [key, a] of Object.entries(meta.anims)) {
    const frames = a.frames.filter((f) => tex.has(f));
    if (frames.length === 0) continue;
    if (scene.anims.exists(key)) scene.anims.remove(key);
    scene.anims.create({
      key,
      frames: frames.map((f) => ({ key: ATLAS, frame: f })),
      frameRate: tuning[key]?.fps ?? a.fps,
      repeat: a.repeat,
      yoyo: a.yoyo,
    });
  }
}

export function hasAnim(scene: Phaser.Scene, key: string): boolean {
  return scene.anims.exists(key);
}

export function hasFrame(scene: Phaser.Scene, name: string): boolean {
  if (atlasLoaded && scene.textures.get(ATLAS).has(name)) return true;
  return scene.textures.exists(name);
}

/** 이미지(아이콘·기구)의 텍스처 참조. 아틀라스 → 생성 텍스처 → 플레이스홀더 순 */
export function imageRef(scene: Phaser.Scene, name: string): { key: string; frame?: string } {
  if (atlasLoaded && scene.textures.get(ATLAS).has(name)) return { key: ATLAS, frame: name };
  if (scene.textures.exists(name)) return { key: name };
  return { key: 'placeholder' };
}

export function imageOrigin(name: string): { x: number; y: number } {
  const im = meta.images[name];
  if (im) return { x: im.originX, y: im.originY };
  return name.startsWith('icon_') ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 1 };
}

/** 스프라이트에 애니 적용: origin 을 애니 캔버스 앵커에 맞추고 재생. 없으면 false */
export function playAnim(sprite: Phaser.GameObjects.Sprite, key: string, ignoreIfPlaying = true): boolean {
  const scene = sprite.scene;
  if (!scene.anims.exists(key)) return false;
  const a = meta.anims[key];
  if (a) sprite.setOrigin(a.originX, a.originY);
  sprite.play(key, ignoreIfPlaying);
  return true;
}

export function animTuning(key: string): Required<Tuning> {
  const t = tuning[key] ?? {};
  return { scale: t.scale ?? 1, offsetX: t.offsetX ?? 0, offsetY: t.offsetY ?? 0, fps: t.fps ?? meta.anims[key]?.fps ?? 8 };
}

/** 첫 번째로 존재하는 애니 키 */
export function firstAnim(scene: Phaser.Scene, keys: readonly string[]): string | null {
  for (const k of keys) if (scene.anims.exists(k)) return k;
  return null;
}
