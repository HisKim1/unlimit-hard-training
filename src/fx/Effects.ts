// 파티클·연출 이펙트. 파티클 수 상한(CONFIG.MAX_PARTICLES)을 둔다.
import Phaser from 'phaser';
import { CONFIG, FONT } from '../config';
import { STR } from '../strings';

export const DEPTH = {
  bg: 0,
  zone: 5,
  world: 10, // + y
  particles: 3000,
  label: 3100,
  vignette: 3500,
  hud: 4000,
  toast: 4500,
  toolbar: 5000,
  drag: 5500,
  overlay: 8000,
};

export class Effects {
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private sweat: Phaser.GameObjects.Particles.ParticleEmitter;
  private breath: Phaser.GameObjects.Particles.ParticleEmitter;
  private chalk: Phaser.GameObjects.Particles.ParticleEmitter;
  private stars: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private readonly scene: Phaser.Scene) {
    const cap = Math.max(1, Math.floor(CONFIG.MAX_PARTICLES / 6));
    this.dust = scene.add.particles(0, 0, 'smoke', {
      lifespan: 520, speedX: { min: -140, max: 140 }, speedY: { min: -60, max: -10 },
      scale: { start: 0.35, end: 0.9 }, alpha: { start: 0.7, end: 0 }, tint: 0x8a8a8a,
      emitting: false, maxAliveParticles: cap,
    }).setDepth(DEPTH.particles);
    this.smoke = scene.add.particles(0, 0, 'smoke', {
      lifespan: 650, speed: { min: 40, max: 160 }, angle: { min: 0, max: 360 },
      scale: { start: 0.6, end: 1.6 }, alpha: { start: 0.9, end: 0 },
      emitting: false, maxAliveParticles: cap,
    }).setDepth(DEPTH.particles);
    this.sweat = scene.add.particles(0, 0, 'drop', {
      lifespan: 700, speedX: { min: -70, max: 70 }, speedY: { min: -120, max: -40 }, gravityY: 500,
      scale: { start: 0.9, end: 0.6 }, alpha: { start: 1, end: 0.2 },
      emitting: false, maxAliveParticles: cap,
    }).setDepth(DEPTH.particles);
    this.breath = scene.add.particles(0, 0, 'puff', {
      lifespan: 700, speedX: { min: -40, max: 40 }, speedY: { min: -30, max: -5 },
      scale: { start: 0.25, end: 0.7 }, alpha: { start: 0.9, end: 0 },
      emitting: false, maxAliveParticles: cap,
    }).setDepth(DEPTH.particles);
    this.chalk = scene.add.particles(0, 0, 'puff', {
      lifespan: 900, speed: { min: 30, max: 180 }, angle: { min: 180, max: 360 },
      scale: { start: 0.4, end: 1.2 }, alpha: { start: 1, end: 0 },
      emitting: false, maxAliveParticles: cap,
    }).setDepth(DEPTH.particles);
    this.stars = scene.add.particles(0, 0, 'star', {
      lifespan: 450, speed: { min: 120, max: 260 }, angle: { min: 0, max: 360 },
      scale: { start: 0.8, end: 0.2 }, alpha: { start: 1, end: 0 },
      emitting: false, maxAliveParticles: cap,
    }).setDepth(DEPTH.particles);
  }

  dustAt(x: number, y: number, n = 10): void {
    this.dust.explode(n, x, y);
  }

  poofAt(x: number, y: number): void {
    this.smoke.explode(14, x, y);
  }

  sweatAt(x: number, y: number, n = 1): void {
    this.sweat.explode(n, x, y);
  }

  breathAt(x: number, y: number): void {
    this.breath.explode(1, x, y);
  }

  chalkAt(x: number, y: number): void {
    this.chalk.explode(16, x, y);
  }

  starsAt(x: number, y: number, n = 6): void {
    this.stars.explode(n, x, y);
  }

  /** 재촉: 손바닥 + "찰싹!" */
  slap(x: number, y: number): void {
    const s = this.scene;
    const hand = s.add.image(x + Phaser.Math.Between(-30, 30), y, 'hand')
      .setDepth(DEPTH.label + 5)
      .setScale(0.5)
      .setAngle(Phaser.Math.Between(-25, 25))
      .setAlpha(0.95);
    s.tweens.add({ targets: hand, scale: 0.9, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
    s.tweens.add({ targets: hand, alpha: 0, delay: 160, duration: 180, onComplete: () => hand.destroy() });
    const t = s.add.text(x + Phaser.Math.Between(-20, 20), y - 50, STR.slap, {
      fontFamily: FONT, fontSize: '40px', color: '#ffe14d', stroke: '#6b1d00', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(DEPTH.label + 6).setScale(0.6);
    s.tweens.add({ targets: t, scale: 1.1, y: t.y - 30, duration: 160, ease: 'Back.easeOut' });
    s.tweens.add({ targets: t, alpha: 0, delay: 250, duration: 200, onComplete: () => t.destroy() });
    this.starsAt(x, y, 5);
  }
}
