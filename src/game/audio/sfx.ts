import type { GameEvent } from '../core';

export class SfxEngine {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private masterGain: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private ambientTimer: number | null = null;
  private ambientActive = false;
  private paused = false;

  private ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      this.setupBuses(this.ctx);
    }
    return this.ctx;
  }

  unlock = async () => {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') await ctx.resume();
    this.unlocked = ctx.state === 'running';
    if (this.unlocked && this.ambientActive) this.scheduleAmbient();
  };

  updateThreatIntensity(value: number, enabled: boolean) {
    // Intentionally muted for now. We can reintroduce adaptive music later,
    // but the user requested a quiet ambient bubble bed instead of a drone.
    void value;
    void enabled;
  }

  setGameplayAudioState(enabled: boolean, playing: boolean) {
    this.paused = !playing;
    const ctx = this.ensureContext();
    if (ctx && this.masterGain) {
      const target = enabled && playing ? 0.85 : 0.0001;
      this.masterGain.gain.setTargetAtTime(target, ctx.currentTime, 0.03);
    }
    this.ambientActive = enabled && playing;
    if (!this.ambientActive) {
      this.clearAmbientTimer();
      return;
    }
    if (this.unlocked) this.scheduleAmbient();
  }

  playEvents(events: GameEvent[], enabled: boolean) {
    if (!enabled) return;
    if (!this.unlocked) return;
    for (const event of events) {
      if (event.type === 'eat') this.chirp(event.kind === 'predator' ? 420 : 620, 0.04, 0.018, 'triangle');
      if (event.type === 'player-hit') this.noiseHit();
      if (event.type === 'growth') this.rise(380, 660, 0.12);
      if (event.type === 'extra-life') this.rise(500, 920, 0.18);
      if (event.type === 'apex-hit') this.rise(180, 260, 0.08, 'square');
      if (event.type === 'apex-killed') {
        this.rise(160, 420, 0.16, 'sawtooth');
        this.chirp(120, 0.14, 0.06, 'square');
      }
      if (event.type === 'game-over') this.fall(280, 90, 0.25);
    }
  }

  private chirp(freq: number, duration: number, gainPeak: number, type: OscillatorType) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.sfxBus ?? ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private rise(from: number, to: number, duration: number, type: OscillatorType = 'triangle') {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.03, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.sfxBus ?? ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private fall(from: number, to: number, duration: number) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.sfxBus ?? ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  private noiseHit() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const length = Math.floor(ctx.sampleRate * 0.07);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 350;
    const gain = ctx.createGain();
    gain.gain.value = 0.04;
    src.connect(filter).connect(gain).connect(this.sfxBus ?? ctx.destination);
    src.start();
  }

  private setupBuses(ctx: AudioContext) {
    const master = ctx.createGain();
    const musicBus = ctx.createGain();
    const sfxBus = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.14;
    master.gain.value = 0.85;
    musicBus.gain.value = 0.45;
    sfxBus.gain.value = 1;
    musicBus.connect(master);
    sfxBus.connect(master);
    master.connect(compressor).connect(ctx.destination);
    this.masterGain = master;
    this.musicBus = musicBus;
    this.sfxBus = sfxBus;
    this.compressor = compressor;
  }

  private scheduleAmbient() {
    if (!this.ambientActive || !this.unlocked || this.ambientTimer !== null) return;
    const delayMs = Math.floor(1600 + Math.random() * 3200);
    this.ambientTimer = window.setTimeout(() => {
      this.ambientTimer = null;
      if (this.ambientActive && !this.paused) {
        this.playAmbientBubbleCluster();
      }
      if (this.ambientActive) this.scheduleAmbient();
    }, delayMs);
  }

  private clearAmbientTimer() {
    if (this.ambientTimer !== null) {
      window.clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
    }
  }

  private playAmbientBubbleCluster() {
    const count = Math.random() < 0.7 ? 1 : 2;
    for (let i = 0; i < count; i += 1) {
      const offsetMs = i * (60 + Math.random() * 80);
      window.setTimeout(() => this.playAmbientBubble(), offsetMs);
    }
  }

  private playAmbientBubble() {
    const ctx = this.ensureContext();
    if (!ctx || !this.musicBus) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sine';
    filter.type = 'bandpass';
    const f1 = 260 + Math.random() * 220;
    const f2 = f1 + 120 + Math.random() * 220;
    osc.frequency.setValueAtTime(f1, now);
    osc.frequency.exponentialRampToValueAtTime(f2, now + 0.09);
    filter.frequency.setValueAtTime(700 + Math.random() * 700, now);
    filter.Q.value = 1.2;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.008 + Math.random() * 0.006, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(filter).connect(gain).connect(this.musicBus);
    osc.start(now);
    osc.stop(now + 0.15);
  }
}
