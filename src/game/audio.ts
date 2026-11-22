// Zero-dependency procedural Web Audio synthesizer with spatial gain, filtered noise, voice cap, and click-free envelopes

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private cooldowns: Record<string, number> = {};
  private activeVoices = 0;
  private readonly maxVoices = 8;
  public muted = false;

  private ensureContext(): boolean {
    if (this.muted) return false;
    if (typeof window === 'undefined') return false;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(20, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(5, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.008, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.18, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.38, this.ctx.currentTime);

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx.state !== 'closed';
  }

  private getNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.noiseBuffer) {
      const sr = this.ctx.sampleRate;
      const length = Math.floor(sr * 0.55);
      const buffer = this.ctx.createBuffer(1, length, sr);
      const data = buffer.getChannelData(0);
      // Warm 1-pole brownian-smoothed noise so bursts never sound like harsh static hiss
      let lastOut = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.08 * white) / 1.08;
        data[i] = Math.max(-1, Math.min(1, lastOut * 2.8));
      }
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }

  private canTrigger(key: string, minIntervalMs: number): boolean {
    const now = performance.now();
    const last = this.cooldowns[key] || 0;
    if (now - last < minIntervalMs) return false;
    if (this.activeVoices >= this.maxVoices) return false;
    this.cooldowns[key] = now;
    return true;
  }

  private scheduleTone(options: {
    type: OscillatorType;
    startFreq: number;
    endFreq?: number;
    volume: number;
    duration: number;
    delay?: number;
    filterFreq?: number;
    jitterPct?: number;
  }) {
    if (!this.ctx || !this.masterGain) return;
    if (this.activeVoices >= this.maxVoices) return;

    const ctx = this.ctx;
    const vol = Math.min(0.32, Math.max(0.002, options.volume));
    const t0 = Math.max(ctx.currentTime + 0.005, ctx.currentTime + (options.delay || 0));
    const dur = Math.max(0.045, options.duration);
    const pitchJitter = options.jitterPct ? 1 + (Math.random() * 2 - 1) * options.jitterPct : 1;
    const fStart = Math.max(28, options.startFreq * pitchJitter);
    const fEnd =
      options.endFreq !== undefined ? Math.max(24, options.endFreq * pitchJitter) : fStart;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = options.type;
    osc.frequency.setValueAtTime(fStart, t0);
    if (fEnd !== fStart) {
      osc.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
    }

    // Smooth click-free ADSR envelope with zero-padded stop tail
    const attack = Math.min(0.016, dur * 0.26);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    gain.gain.setValueAtTime(0.00001, t0 + dur + 0.02);

    const effectiveFilterFreq =
      options.filterFreq ?? (options.type === 'triangle' ? 2100 : undefined);

    if (effectiveFilterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.setValueAtTime(0.7, t0);
      filter.frequency.setValueAtTime(effectiveFilterFreq, t0);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(this.masterGain);
    this.activeVoices++;
    osc.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Ignore already disconnected nodes
      }
    };
    osc.start(t0);
    osc.stop(t0 + dur + 0.04);
  }

  private scheduleFilteredNoise(options: {
    volume: number;
    duration: number;
    startFreq: number;
    endFreq?: number;
    filterType?: BiquadFilterType;
    delay?: number;
  }) {
    if (!this.ctx || !this.masterGain) return;
    if (this.activeVoices >= this.maxVoices) return;
    const buffer = this.getNoiseBuffer();
    if (!buffer) return;

    const ctx = this.ctx;
    const t0 = Math.max(ctx.currentTime + 0.005, ctx.currentTime + (options.delay || 0));
    const dur = Math.min(0.52, Math.max(0.04, options.duration));
    const vol = Math.min(0.3, Math.max(0.002, options.volume));

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = options.filterType || 'lowpass';
    filter.Q.setValueAtTime(0.8, t0);
    filter.frequency.setValueAtTime(options.startFreq, t0);
    if (options.endFreq && options.endFreq !== options.startFreq) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, options.endFreq), t0 + dur);
    }

    const gain = ctx.createGain();
    const attack = Math.min(0.012, dur * 0.2);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    gain.gain.setValueAtTime(0.00001, t0 + dur + 0.02);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    this.activeVoices++;
    src.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      try {
        src.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {
        // Ignore already disconnected nodes
      }
    };
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  public playSelect() {
    if (!this.ensureContext() || !this.canTrigger('select', 85)) return;
    this.scheduleTone({
      type: 'sine',
      startFreq: 520,
      endFreq: 740,
      volume: 0.065,
      duration: 0.075,
    });
  }

  public playOrder() {
    if (!this.ensureContext() || !this.canTrigger('order', 95)) return;
    this.scheduleTone({
      type: 'sine',
      startFreq: 540,
      endFreq: 690,
      volume: 0.07,
      duration: 0.09,
    });
  }

  public playInvalid() {
    if (!this.ensureContext() || !this.canTrigger('invalid', 180)) return;
    this.scheduleTone({
      type: 'sine',
      startFreq: 210,
      endFreq: 145,
      volume: 0.08,
      duration: 0.11,
    });
  }

  public playAttackOrder() {
    if (!this.ensureContext() || !this.canTrigger('attackOrder', 140)) return;
    this.scheduleTone({
      type: 'triangle',
      startFreq: 230,
      endFreq: 380,
      volume: 0.085,
      duration: 0.12,
      filterFreq: 1200,
    });
  }

  public playRallyPoint() {
    if (!this.ensureContext() || !this.canTrigger('rally', 140)) return;
    [659.25, 880].forEach((freq, idx) => {
      this.scheduleTone({
        type: 'sine',
        startFreq: freq,
        volume: 0.075,
        duration: 0.13,
        delay: idx * 0.075,
      });
    });
  }

  public playUnderAttackAlert() {
    if (!this.ensureContext() || !this.canTrigger('alert', 11000)) return;
    this.scheduleTone({
      type: 'triangle',
      startFreq: 330,
      endFreq: 440,
      volume: 0.095,
      duration: 0.13,
      filterFreq: 1000,
    });
    this.scheduleTone({
      type: 'triangle',
      startFreq: 440,
      endFreq: 330,
      volume: 0.095,
      duration: 0.16,
      delay: 0.14,
      filterFreq: 1000,
    });
  }

  public playEnemySpotted() {
    if (!this.ensureContext() || !this.canTrigger('spotted', 15000)) return;
    // Crisp 2-note scout horn signal when hostiles enter sight range
    this.scheduleTone({
      type: 'triangle',
      startFreq: 293.66,
      endFreq: 392.0,
      volume: 0.09,
      duration: 0.14,
      filterFreq: 1100,
    });
    this.scheduleTone({
      type: 'sine',
      startFreq: 587.33,
      volume: 0.075,
      duration: 0.2,
      delay: 0.12,
    });
  }

  public playResourceDepleted(resourceType: 'food' | 'wood' | 'gold' | 'stone' = 'wood') {
    if (!this.ensureContext() || !this.canTrigger(`depleted_${resourceType}`, 3500)) return;
    const baseFreq =
      resourceType === 'gold' ? 660 : resourceType === 'stone' ? 520 : resourceType === 'food' ? 587 : 494;
    this.scheduleTone({
      type: 'sine',
      startFreq: baseFreq,
      volume: 0.075,
      duration: 0.11,
    });
    this.scheduleTone({
      type: 'sine',
      startFreq: baseFreq * 0.75,
      volume: 0.07,
      duration: 0.16,
      delay: 0.1,
    });
  }

  public playGarrison() {
    if (!this.ensureContext() || !this.canTrigger('garrison', 180)) return;
    this.scheduleTone({
      type: 'triangle',
      startFreq: 260,
      endFreq: 420,
      volume: 0.075,
      duration: 0.09,
      filterFreq: 950,
    });
  }

  // Combat sounds are distance-scaled and globally rate-limited so large battles
  // remain readable without turning every unit swing into constant audio noise.
  public playSwordHit(gainScale = 1) {
    const gain = Math.max(0, Math.min(1, Number.isFinite(gainScale) ? gainScale : 0));
    if (gain < 0.06 || !this.ensureContext() || !this.canTrigger('combatSword', 95)) return;
    this.scheduleFilteredNoise({
      volume: 0.065 * gain,
      duration: 0.11,
      startFreq: 1700,
      endFreq: 300,
      filterType: 'lowpass',
    });
    this.scheduleTone({
      type: 'triangle',
      startFreq: 142,
      endFreq: 68,
      volume: 0.055 * gain,
      duration: 0.14,
      filterFreq: 460,
      jitterPct: 0.1,
    });
  }

  public playArrowShot(gainScale = 1) {
    const gain = Math.max(0, Math.min(1, Number.isFinite(gainScale) ? gainScale : 0));
    if (gain < 0.06 || !this.ensureContext() || !this.canTrigger('combatArrow', 125)) return;
    this.scheduleFilteredNoise({
      volume: 0.042 * gain,
      duration: 0.075,
      startFreq: 3400,
      endFreq: 900,
      filterType: 'bandpass',
    });
    this.scheduleTone({
      type: 'triangle',
      startFreq: 620,
      endFreq: 320,
      volume: 0.025 * gain,
      duration: 0.075,
      filterFreq: 2400,
      jitterPct: 0.08,
    });
  }

  public playMagicShot(gainScale = 1) {
    const gain = Math.max(0, Math.min(1, Number.isFinite(gainScale) ? gainScale : 0));
    if (gain < 0.06 || !this.ensureContext() || !this.canTrigger('magicShot', 260)) return;
    [523.25, 783.99, 1046.5].forEach((frequency, index) => {
      this.scheduleTone({
        type: 'sine',
        startFreq: frequency,
        volume: 0.038 * gain,
        duration: 0.17,
        delay: index * 0.052,
        jitterPct: 0.025,
      });
    });
  }

  public playChopWood(_gainScale = 1) {
    return;
  }

  public playMineGold(_gainScale = 1) {
    return;
  }

  public playHammerBuild(_gainScale = 1) {
    return;
  }

  public playUnitKo(gainScale = 1) {
    const gain = Math.max(0, Math.min(1, Number.isFinite(gainScale) ? gainScale : 0));
    if (gain < 0.06 || !this.ensureContext() || !this.canTrigger('unitKo', 160)) return;
    this.scheduleFilteredNoise({
      volume: 0.095 * gain,
      duration: 0.24,
      startFreq: 620,
      endFreq: 90,
      filterType: 'lowpass',
    });
    this.scheduleTone({
      type: 'triangle',
      startFreq: 98,
      endFreq: 38,
      volume: 0.065 * gain,
      duration: 0.28,
      filterFreq: 240,
      jitterPct: 0.06,
    });
  }

  public playBuildingCollapse(gainScale = 1) {
    if (gainScale < 0.04) return;
    if (!this.ensureContext() || !this.canTrigger('collapse', 340)) return;
    this.scheduleFilteredNoise({
      volume: 0.14 * gainScale,
      duration: 0.5,
      startFreq: 480,
      endFreq: 95,
      filterType: 'lowpass',
    });
    this.scheduleTone({
      type: 'triangle',
      startFreq: 112,
      endFreq: 38,
      volume: 0.12 * gainScale,
      duration: 0.42,
      filterFreq: 260,
    });
  }

  public playConstruct(gainScale = 1) {
    if (gainScale < 0.05) return;
    if (!this.ensureContext() || !this.canTrigger('construct', 160)) return;
    [440, 554.37, 659.25].forEach((freq, idx) => {
      this.scheduleTone({
        type: 'sine',
        startFreq: freq,
        volume: 0.065 * gainScale,
        duration: 0.13,
        delay: idx * 0.065,
      });
    });
  }

  public playUnitTrained() {
    if (!this.ensureContext() || !this.canTrigger('trained', 200)) return;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      this.scheduleTone({
        type: 'sine',
        startFreq: freq,
        volume: 0.07,
        duration: 0.16,
        delay: idx * 0.075,
      });
    });
  }

  public playVictory() {
    if (!this.ensureContext() || !this.canTrigger('victory', 1000)) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      this.scheduleTone({
        type: 'triangle',
        startFreq: freq,
        volume: 0.12,
        duration: idx === 3 ? 0.65 : 0.2,
        delay: idx * 0.14,
        filterFreq: 1800,
      });
    });
  }

  public playDefeat() {
    if (!this.ensureContext() || !this.canTrigger('defeat', 500)) return;
    [440, 415.3, 392, 349.23].forEach((freq, idx) => {
      this.scheduleTone({
        type: 'triangle',
        startFreq: freq,
        volume: 0.1,
        duration: 0.26,
        delay: idx * 0.16,
        filterFreq: 1050,
      });
    });
  }

  public playAgeUp() {
    if (!this.ensureContext() || !this.canTrigger('ageUp', 800)) return;
    const melody = [
      { freq: 523.25, time: 0.0, dur: 0.18, type: 'triangle' as OscillatorType, vol: 0.12 },
      { freq: 659.25, time: 0.16, dur: 0.18, type: 'triangle' as OscillatorType, vol: 0.13 },
      { freq: 783.99, time: 0.32, dur: 0.22, type: 'triangle' as OscillatorType, vol: 0.14 },
      { freq: 1046.5, time: 0.52, dur: 0.58, type: 'triangle' as OscillatorType, vol: 0.15 },
      { freq: 523.25, time: 0.52, dur: 0.58, type: 'sine' as OscillatorType, vol: 0.1 },
      { freq: 659.25, time: 0.52, dur: 0.58, type: 'sine' as OscillatorType, vol: 0.1 },
    ];
    melody.forEach((note) => {
      this.scheduleTone({
        type: note.type,
        startFreq: note.freq,
        volume: note.vol,
        duration: note.dur,
        delay: note.time,
        filterFreq: 1900,
      });
    });
  }
}

export const sound = new SoundManager();
