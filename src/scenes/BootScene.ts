// 에셋 로딩 + 애니 생성 + 코드 텍스처 생성
import Phaser from 'phaser';
import { CONFIG, FONT, VIEWER } from '../config';
import { initAssets, preloadAssets } from '../assets';
import { generateTextures } from '../fx/Textures';
import { STR } from '../strings';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const W = CONFIG.logicalWidth;
    const H = CONFIG.logicalHeight;
    const label = this.add.text(W / 2, H / 2 - 40, STR.loading, { fontFamily: FONT, fontSize: '36px', color: '#fff' }).setOrigin(0.5);
    const bar = this.add.graphics();
    this.load.on(Phaser.Loader.Events.PROGRESS, (v: number) => {
      bar.clear();
      bar.fillStyle(0x333a44, 1);
      bar.fillRoundedRect(W / 2 - 200, H / 2 + 10, 400, 22, 11);
      bar.fillStyle(0x2b6ef2, 1);
      bar.fillRoundedRect(W / 2 - 200, H / 2 + 10, Math.max(22, 400 * v), 22, 11);
    });
    // 일부 파일이 없어도(전처리 전) 플레이스홀더로 계속 진행
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.warn('[boot] 로드 실패:', file.key, file.src);
    });
    this.load.once(Phaser.Loader.Events.COMPLETE, () => label.destroy());
    preloadAssets(this);
  }

  create(): void {
    if (!this.textures.exists('box_bg')) {
      // 배경이 없으면 플레이스홀더 박스 (검은 매트, 흰 벽, 파란 띠)
      const g = this.make.graphics({}, false);
      const W = CONFIG.logicalWidth;
      g.fillStyle(0xf2f2f2, 1).fillRect(0, 0, W, 660);
      g.fillStyle(0x1f5fd6, 1).fillRect(0, 330, W, 30);
      g.fillStyle(0x1c1c1f, 1).fillRect(0, 640, W, CONFIG.logicalHeight - 640);
      g.generateTexture('box_bg', W, CONFIG.logicalHeight);
      g.destroy();
    }
    initAssets(this);
    generateTextures(this);
    this.scene.start(VIEWER ? 'SpriteViewer' : 'Title');
  }
}
