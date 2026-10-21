// ============================================================================
// MY PORSCHE : GENESIS 911 — ACOUSTIC & NEURO-TELEMETRY ENGINE
// Procedural Flat-Six Boxer Resonance · Rain & Highway · Stereo Binaural Beats
// ============================================================================

class GenesisAudioEngine {
  constructor() {
    this.ctx = null;
    this.pseOpen = true;
    this.soundscapeActive = false;
    this.nodes = null;

    this.levels = {
      boxer: 0.65,
      rain: 0.40,
      binaural: 0.25,
      voice: 0.85,
      beatHz: 6
    };
    this.currentRpm = 2400;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  makeWarmSaturationCurve(amount = 35) {
    const n = 44100;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  // 德國鋁合金微動開關觸感音效
  playTactileClick(freq = 720) {
    try {
      const ctx = this.init();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.035);
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
      if (navigator.vibrate) navigator.vibrate(10);
    } catch (e) {}
  }

  // 水平對臥六缸冷車啟動 (Starter Crank -> Bark -> Boxer Idle)
  playColdStart(onRpmTick, onFinish) {
    const ctx = this.init();
    const now = ctx.currentTime;
    const duration = 3.6;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.01, now);
    master.gain.linearRampToValueAtTime(0.28, now + 0.12);
    master.gain.setValueAtTime(0.42, now + 0.62);
    master.gain.exponentialRampToValueAtTime(0.22, now + 2.3);
    master.gain.linearRampToValueAtTime(0.001, now + duration);

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.makeWarmSaturationCurve(52);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(360, now);
    filter.frequency.linearRampToValueAtTime(1650, now + 0.74);
    filter.frequency.exponentialRampToValueAtTime(520, now + 2.1);

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc2.type = "triangle";
    osc3.type = "square";

    const g1 = ctx.createGain();
    const g2 = ctx.createGain();
    const g3 = ctx.createGain();
    g1.gain.value = 0.52;
    g2.gain.value = 0.48;
    g3.gain.value = 0.16;

    osc1.connect(g1);
    osc2.connect(g2);
    osc3.connect(g3);
    g1.connect(shaper);
    g2.connect(shaper);
    g3.connect(shaper);
    shaper.connect(filter);
    filter.connect(master);
    master.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
    osc3.stop(now + duration);

    if (navigator.vibrate) navigator.vibrate([60, 40, 60, 40, 280]);

    const t0 = performance.now();
    const tick = (ts) => {
      const el = (ts - t0) / 1000;
      if (el >= duration) {
        if (onRpmTick) onRpmTick(850);
        if (onFinish) onFinish();
        return;
      }
      let rpm = 850;
      if (el < 0.58) {
        rpm = 260 + Math.sin(el * 28) * 80;
      } else if (el < 1.0) {
        const p = (el - 0.58) / 0.42;
        rpm = 340 + Math.sin(p * Math.PI * 0.5) * 2550;
      } else if (el < 2.2) {
        const p = (el - 1.0) / 1.2;
        rpm = 2890 - p * 1850 + Math.sin(el * 34) * 25;
      } else {
        rpm = 850 + Math.sin(el * 42) * 20;
      }
      const f = Math.max(18, (rpm / 60) * 3);
      osc1.frequency.setTargetAtTime(f, ctx.currentTime, 0.015);
      osc2.frequency.setTargetAtTime(f * 0.5, ctx.currentTime, 0.015);
      osc3.frequency.setTargetAtTime(f * 1.5, ctx.currentTime, 0.015);
      if (onRpmTick) onRpmTick(Math.round(rpm));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // 退檔補油與排氣回火聲 (Downshift Rev-Match Blip)
  playRevMatchBlip(targetRpm = 5200) {
    const ctx = this.init();
    const now = ctx.currentTime;
    const dur = 0.85;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + 0.18);
    filter.frequency.exponentialRampToValueAtTime(550, now + dur);

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const baseFreq = (targetRpm / 60) * 3;
    osc.frequency.setValueAtTime(baseFreq * 0.65, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.72, now + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
  }

  // ==========================================================================
  // 四軌座艙環境聲場 (01 Boxer Resonance + 02 Rain/Highway + 03 Theta 6Hz)
  // ==========================================================================
  startSoundscape(rpm = 2600, beatHz = 6) {
    this.stopSoundscape();
    const ctx = this.init();
    this.currentRpm = rpm;
    this.levels.beatHz = beatHz;

    // 01: 水平對臥六缸低頻巡航共鳴
    const boxerGain = ctx.createGain();
    boxerGain.gain.value = this.levels.boxer * 0.18;

    const boxerFilter = ctx.createBiquadFilter();
    boxerFilter.type = "lowpass";
    boxerFilter.frequency.value = 240;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc2.type = "triangle";
    const f = (rpm / 60) * 3;
    osc1.frequency.value = f;
    osc2.frequency.value = f * 0.5;

    osc1.connect(boxerFilter);
    osc2.connect(boxerFilter);
    boxerFilter.connect(boxerGain);
    boxerGain.connect(ctx.destination);

    // 02: 前擋風玻璃夜雨與高速公路胎噪 (Pink Noise)
    const rainGain = ctx.createGain();
    rainGain.gain.value = this.levels.rain * 0.25;

    const bufLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const out = noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0;
    for (let i = 0; i < bufLen; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029;
      b1 = 0.985 * b1 + w * 0.032;
      b2 = 0.950 * b2 + w * 0.048;
      b3 = 0.850 * b3 + w * 0.065;
      out[i] = (b0 + b1 + b2 + b3) * 0.08;
    }
    const rainSource = ctx.createBufferSource();
    rainSource.buffer = noiseBuf;
    rainSource.loop = true;

    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = "bandpass";
    rainFilter.frequency.value = 780;
    rainFilter.Q.value = 0.65;

    rainSource.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(ctx.destination);

    // 03: 雙耳節拍腦波同調 (左耳 200Hz, 右耳 200 + beatHz)
    const binGain = ctx.createGain();
    binGain.gain.value = this.levels.binaural * 0.22;

    const merger = ctx.createChannelMerger(2);
    const leftOsc = ctx.createOscillator();
    const rightOsc = ctx.createOscillator();
    leftOsc.type = "sine";
    rightOsc.type = "sine";
    leftOsc.frequency.value = 200;
    rightOsc.frequency.value = 200 + beatHz;

    leftOsc.connect(merger, 0, 0);
    rightOsc.connect(merger, 0, 1);
    merger.connect(binGain);
    binGain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    rainSource.start();
    leftOsc.start();
    rightOsc.start();

    this.nodes = {
      boxerGain,
      boxerFilter,
      osc1,
      osc2,
      rainGain,
      rainSource,
      binGain,
      leftOsc,
      rightOsc
    };
    this.soundscapeActive = true;
  }

  updateSoundscapeRpm(rpm) {
    this.currentRpm = rpm;
    if (!this.soundscapeActive || !this.nodes || !this.ctx) return;
    const f = Math.max(24, (rpm / 60) * 3);
    const now = this.ctx.currentTime;
    this.nodes.osc1.frequency.setTargetAtTime(f, now, 0.04);
    this.nodes.osc2.frequency.setTargetAtTime(f * 0.5, now, 0.04);
    this.nodes.boxerFilter.frequency.setTargetAtTime(160 + (rpm / 9000) * 650, now, 0.05);
  }

  updateLevels(partial) {
    Object.assign(this.levels, partial);
    if (!this.soundscapeActive || !this.nodes || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.nodes.boxerGain.gain.setTargetAtTime(this.levels.boxer * 0.18, now, 0.05);
    this.nodes.rainGain.gain.setTargetAtTime(this.levels.rain * 0.25, now, 0.05);
    this.nodes.binGain.gain.setTargetAtTime(this.levels.binaural * 0.22, now, 0.05);
    if (typeof partial.beatHz === "number") {
      this.nodes.rightOsc.frequency.setTargetAtTime(200 + partial.beatHz, now, 0.05);
    }
  }

  stopSoundscape() {
    if (this.nodes) {
      try {
        this.nodes.osc1.stop();
        this.nodes.osc2.stop();
        this.nodes.rainSource.stop();
        this.nodes.leftOsc.stop();
        this.nodes.rightOsc.stop();
        this.nodes.boxerGain.disconnect();
        this.nodes.rainGain.disconnect();
        this.nodes.binGain.disconnect();
      } catch (e) {}
      this.nodes = null;
    }
    this.soundscapeActive = false;
  }

  speak(text, opts = {}) {
    if (!("speechSynthesis" in window)) {
      if (opts.onEnd) opts.onEnd();
      return;
    }
    if (opts.cancel !== false) {
      window.speechSynthesis.cancel();
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-TW";
    u.rate = opts.rate || 0.9;
    u.pitch = opts.pitch || 0.94;
    u.volume = Math.min(1, Math.max(0.05, opts.volume ?? this.levels.voice));

    const voices = window.speechSynthesis.getVoices();
    const zh =
      voices.find((v) => v.lang.includes("zh-TW") && (v.name.includes("Meijia") || v.name.includes("Natural"))) ||
      voices.find((v) => v.lang.includes("zh-TW")) ||
      voices.find((v) => v.lang.includes("zh"));
    if (zh) u.voice = zh;

    if (opts.onEnd) u.onend = opts.onEnd;
    u.onerror = () => {
      if (opts.onEnd) opts.onEnd();
    };
    window.speechSynthesis.speak(u);
  }
}

window.genesisAudio = new GenesisAudioEngine();
