import Phaser from 'phaser';
import '@fontsource/jua/korean-400.css';
import '@fontsource/jua/latin-400.css';
import './style.css';
import { CONFIG, FONT } from './config';
import { audio, installAudioUnlock } from './systems/Audio';
import { save } from './systems/Save';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { GameScene } from './scenes/GameScene';
import { ResultScene } from './scenes/ResultScene';
import { SpriteViewerScene } from './scenes/SpriteViewerScene';

async function waitForFont(): Promise<void> {
  try {
    const timeout = new Promise<void>((r) => setTimeout(r, 2500));
    await Promise.race([
      Promise.all([document.fonts.load(`32px ${FONT}`, '원장님 키우기 0123'), document.fonts.load(`32px Jua`, 'ABC')]).then(() => undefined),
      timeout,
    ]);
  } catch {
    // 폰트 로딩 실패 시 시스템 폰트로 진행
  }
}

async function start(): Promise<void> {
  audio.setMuted(save.muted);
  installAudioUnlock();
  await waitForFont();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0b0d10',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: CONFIG.logicalWidth,
      height: CONFIG.logicalHeight,
    },
    audio: { noAudio: true }, // 효과음은 자체 Web Audio 합성 (systems/Audio)
    input: { activePointers: 3 },
    render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
    fps: { target: 60 },
    scene: [BootScene, TitleScene, LevelSelectScene, GameScene, ResultScene, SpriteViewerScene],
  });

  // 디버그·자동 테스트용 핸들
  (window as unknown as { __game?: Phaser.Game }).__game = game;

  // 탭이 숨겨지면 게임 일시정지 + 오디오 정지, 돌아오면 "계속하기" 오버레이
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.events.emit('app-hidden');
      audio.suspend();
    } else {
      audio.resume();
    }
  });
  window.addEventListener('pagehide', () => game.events.emit('app-hidden'));
  const landscape = window.matchMedia('(orientation: landscape) and (pointer: coarse) and (max-height: 600px)');
  landscape.addEventListener('change', () => {
    if (landscape.matches) game.events.emit('app-hidden');
  });

  // 브라우저 기본 제스처(길게 누르기 메뉴, 더블탭 확대) 차단
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
}

void start();
