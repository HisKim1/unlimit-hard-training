// 효과음: Web Audio 합성. BGM 출처/CC0: public/audio/CREDITS.md.
// 나중에 파일로 바꿀 수 있게 키 기반 레지스트리로 둔다: register(key, fn).

type SoundFn = (ctx: AudioContext, out: AudioNode, t: number) => void;
type Music = 'menu' | 'workout';

class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private sounds = new Map<string, SoundFn>();
  private _muted = false;
  private music: Music | null = null;
  private musicPaused = false;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private musicOffset = 0;
  private musicStarted = 0;
  private musicBuffers = new Map<Music, Promise<AudioBuffer>>();

  get musicState() {
    return { track: this.music, paused: this.musicPaused, playing: !!this.musicSource && this.ctx?.state === 'running', muted: this._muted,
      offset: this.musicOffset + (this.musicSource && this.ctx ? this.ctx.currentTime - this.musicStarted : 0) };
  }

  setMusic(track: Music | null): void {
    if (track !== this.music) {
      this.stopMusicSource();
      this.musicOffset = 0;
      this.music = track;
    }
    this.musicPaused = false;
    void this.startMusicSource();
  }

  pauseMusic(paused: boolean): void {
    this.musicPaused = paused;
    if (paused) this.stopMusicSource();
    else void this.startMusicSource();
  }

  private stopMusicSource(): void {
    const source = this.musicSource;
    const gain = this.musicGain;
    if (!source || !gain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicOffset = (this.musicOffset + now - this.musicStarted) % source.buffer!.duration;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.15);
    source.stop(now + 0.16);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    this.musicSource = null;
    this.musicGain = null;
  }

  private async startMusicSource(): Promise<void> {
    const ctx = this.ctx, track = this.music;
    if (!ctx || !this.master || !track || this.musicPaused || this.musicSource) return;
    try {
      let pending = this.musicBuffers.get(track);
      if (!pending) {
        pending = fetch(`audio/${track}.mp3`).then(r => {
          if (!r.ok) throw new Error(`BGM HTTP ${r.status}`);
          return r.arrayBuffer();
        }).then(data => ctx.decodeAudioData(data));
        this.musicBuffers.set(track, pending);
      }
      const buffer = await pending;
      // 로딩 중 씬 전환·일시정지가 발생해도 이전 곡을 시작하지 않는다.
      if (this.music !== track || this.musicPaused || this.musicSource) return;
      const source = ctx.createBufferSource(), gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(track === 'menu' ? 0.14 : 0.22, ctx.currentTime + 0.45);
      source.connect(gain).connect(this.master);
      this.musicOffset %= buffer.duration;
      this.musicStarted = ctx.currentTime;
      source.start(0, this.musicOffset);
      this.musicSource = source;
      this.musicGain = gain;
    } catch {
      this.musicBuffers.delete(track); // 다음 사용자 입력에서 재시도. 음원 실패는 게임을 막지 않는다.
    }
  }

  constructor() {
    this.register('slap', (ctx, out, t) => {
      // 짧은 화이트 노이즈 버스트 + 빠른 감쇠 + 고역 통과. 피치 ±10%
      const pitch = 0.9 + Math.random() * 0.2;
      const src = this.noiseSource(ctx, pitch);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1400 * pitch;
      const bp = ctx.createBiquadFilter();
      bp.type = 'peaking';
      bp.frequency.value = 2600 * pitch;
      bp.gain.value = 8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1.0, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      src.connect(hp).connect(bp).connect(g).connect(out);
      src.start(t);
      src.stop(t + 0.14);
      // 손바닥 저음 성분
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(220 * pitch, t);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.06);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.35, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      o.connect(og).connect(out);
      o.start(t);
      o.stop(t + 0.08);
    });

    this.register('thud', (ctx, out, t) => {
      // 저음 사인 스윕 다운 (기구 착지)
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.34);
      const n = this.noiseSource(ctx, 0.5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 400;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.5, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      n.connect(lp).connect(ng).connect(out);
      n.start(t);
      n.stop(t + 0.16);
    });

    this.register('pant', (ctx, out, t) => {
      // 필터 걸린 노이즈 두 번 (헥헥)
      for (let i = 0; i < 2; i++) {
        const st = t + i * 0.24;
        const n = this.noiseSource(ctx, 0.8 + Math.random() * 0.2);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 900 + Math.random() * 300;
        bp.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.35, st + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
        n.connect(bp).connect(g).connect(out);
        n.start(st);
        n.stop(st + 0.2);
      }
    });

    this.register('poof', (ctx, out, t) => {
      const n = this.noiseSource(ctx, 1);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(3000, t);
      lp.frequency.exponentialRampToValueAtTime(200, t + 0.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      n.connect(lp).connect(g).connect(out);
      n.start(t);
      n.stop(t + 0.5);
    });

    this.register('pop', (ctx, out, t) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(880, t + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.1);
    });

    this.register('ding', (ctx, out, t) => {
      [880, 1320].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        const st = t + i * 0.07;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.3, st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.35);
        o.connect(g).connect(out);
        o.start(st);
        o.stop(st + 0.4);
      });
    });

    this.register('warn', (ctx, out, t) => {
      [0, 0.18].forEach((d) => {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = 330;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.12, t + d + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.14);
        o.connect(g).connect(out);
        o.start(t + d);
        o.stop(t + d + 0.15);
      });
    });

    this.register('fanfare', (ctx, out, t) => {
      const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
      const times = [0, 0.12, 0.24, 0.36, 0.52, 0.62];
      notes.forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i < 4 ? 'square' : 'triangle';
        o.frequency.value = f;
        const g = ctx.createGain();
        const st = t + times[i];
        const len = i === notes.length - 1 ? 0.6 : 0.12;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.18, st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, st + len);
        o.connect(g).connect(out);
        o.start(st);
        o.stop(st + len + 0.02);
      });
    });

    this.register('fail', (ctx, out, t) => {
      const notes = [392, 349.23, 311.13, 261.63];
      notes.forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        const st = t + i * 0.22;
        o.frequency.setValueAtTime(f, st);
        if (i === notes.length - 1) o.frequency.linearRampToValueAtTime(f * 0.85, st + 0.6);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1200;
        const g = ctx.createGain();
        const len = i === notes.length - 1 ? 0.7 : 0.2;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.16, st + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, st + len);
        o.connect(lp).connect(g).connect(out);
        o.start(st);
        o.stop(st + len + 0.02);
      });
    });
  }

  register(key: string, fn: SoundFn): void {
    this.sounds.set(key, fn);
  }

  get muted(): boolean {
    return this._muted;
  }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.master && this.ctx) this.master.gain.setValueAtTime(m ? 0 : 0.8, this.ctx.currentTime);
  }

  /** 사용자 제스처 안에서 호출해야 한다 (iOS 오디오 잠금 해제). 여러 번 불러도 안전. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain();
        this.master.gain.value = this._muted ? 0 : 0.8;
        this.master.connect(this.ctx.destination);
        this.noise = this.makeNoise(this.ctx);
      }
      void this.startMusicSource();
      if (this.ctx.state === 'running') return;
      void this.ctx.resume();
      // 무음 버퍼를 한 번 재생해서 iOS 오디오 경로를 연다
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.ctx.destination);
      s.start(0);
    } catch {
      // 오디오를 못 쓰는 환경: 조용히 진행
    }
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
  }

  play(key: string): void {
    if (this._muted || !this.ctx || !this.master) return;
    const fn = this.sounds.get(key);
    if (!fn) return;
    if (this.ctx.state !== 'running') void this.ctx.resume();
    try {
      fn(this.ctx, this.master, this.ctx.currentTime + 0.001);
    } catch {
      // 합성 실패는 게임 진행에 영향 없음
    }
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 0.6);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private noiseSource(ctx: AudioContext, rate: number): AudioBufferSourceNode {
    const s = ctx.createBufferSource();
    s.buffer = this.noise ?? this.makeNoise(ctx);
    s.playbackRate.value = rate;
    return s;
  }
}

export const audio = new AudioSystem();

/** 첫 사용자 제스처에서 오디오를 잠금 해제하는 DOM 리스너 (Phaser 입력과 별개로 보강) */
export function installAudioUnlock(): void {
  const handler = () => {
    audio.unlock();
  };
  for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) {
    window.addEventListener(ev, handler, { passive: true });
  }
}
