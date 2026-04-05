/**
 * Chirp audio sonification — client-side synthesis.
 *
 * Generates the chirp directly from the waveform data (amplitude +
 * frequency arrays) without needing a backend audio endpoint.
 * The algorithm maps GW frequency to audible range [40, 800] Hz,
 * integrates to get phase, and synthesizes audio = A(t) · sin(φ(t)).
 */

const F_MIN_HZ = 40;
const F_MAX_HZ = 800;
const SAMPLE_RATE = 44100;

export class ChirpAudio {
  constructor() {
    this.audioCtx = null;
    this.buffer = null;
    this.source = null;
    this.gainNode = null;
    this.enabled = false;
    this.playing = false;
    this.bufferDuration = 0;
    this._startWall = 0;
    this._startOffset = 0;
  }

  /**
   * Synthesize audio from waveform + trajectory data (no backend needed).
   * @param {object} waveform — from fetchWaveform (has .amplitude, .frequency, .time)
   * @param {object} trajectories — from fetchTrajectories (has .time for fraction mapping)
   * @param {number} duration — target playback duration in seconds
   */
  synthesize(waveform, trajectories, duration) {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }

    const wfTime = waveform.time;
    const wfAmp = waveform.amplitude;
    const wfFreq = waveform.frequency;

    const trajTMin = trajectories.time[0];
    const trajTMax = trajectories.time[trajectories.time.length - 1];
    const trajSpan = trajTMax - trajTMin;

    // Map waveform time to trajectory fraction [0, 1]
    const wfFrac = wfTime.map(t => Math.max(0, Math.min(1, (t - trajTMin) / trajSpan)));

    // Audio time grid
    const nSamples = Math.floor(duration * SAMPLE_RATE);
    this.bufferDuration = duration;

    // Interpolate amplitude and GW frequency onto uniform audio grid
    const A_audio = new Float32Array(nSamples);
    const f_gw_audio = new Float32Array(nSamples);

    for (let i = 0; i < nSamples; i++) {
      const frac = i / (nSamples - 1); // 0..1
      // Find bracketing index in wfFrac
      let lo = 0;
      for (let k = 0; k < wfFrac.length - 1; k++) {
        if (wfFrac[k + 1] >= frac) { lo = k; break; }
        lo = k;
      }
      const hi = Math.min(lo + 1, wfFrac.length - 1);
      const span = wfFrac[hi] - wfFrac[lo] || 1e-10;
      const t = (frac - wfFrac[lo]) / span;
      A_audio[i] = wfAmp[lo] + (wfAmp[hi] - wfAmp[lo]) * t;
      f_gw_audio[i] = wfFreq[lo] + (wfFreq[hi] - wfFreq[lo]) * t;
    }

    // Map GW frequency to audible range
    let fGwMin = Infinity, fGwMax = -Infinity;
    for (let i = 0; i < nSamples; i++) {
      if (f_gw_audio[i] > 0 && f_gw_audio[i] < fGwMin) fGwMin = f_gw_audio[i];
      if (f_gw_audio[i] > fGwMax) fGwMax = f_gw_audio[i];
    }
    if (fGwMin === Infinity) fGwMin = 1e-6;

    const fRange = fGwMax - fGwMin || 1;
    const f_audio = new Float32Array(nSamples);
    for (let i = 0; i < nSamples; i++) {
      f_audio[i] = F_MIN_HZ + (F_MAX_HZ - F_MIN_HZ) * ((f_gw_audio[i] - fGwMin) / fRange);
    }

    // Integrate frequency to get phase
    const dt = duration / nSamples;
    let phase = 0;
    const chirp = new Float32Array(nSamples);
    let maxAmp = 0;

    for (let i = 0; i < nSamples; i++) {
      phase += 2 * Math.PI * f_audio[i] * dt;
      chirp[i] = A_audio[i] * Math.sin(phase);
      const abs = Math.abs(chirp[i]);
      if (abs > maxAmp) maxAmp = abs;
    }

    // Normalize to [-1, 1]
    if (maxAmp > 0) {
      for (let i = 0; i < nSamples; i++) {
        chirp[i] /= maxAmp;
      }
    }

    // Create AudioBuffer
    this.buffer = this.audioCtx.createBuffer(1, nSamples, SAMPLE_RATE);
    this.buffer.getChannelData(0).set(chirp);

    if (!this.gainNode) {
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.connect(this.audioCtx.destination);
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  async play(fromFraction = 0) {
    if (!this.enabled || !this.buffer || !this.audioCtx) return;

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this._stopSource();

    const offset = Math.max(0, Math.min(fromFraction, 1)) * this.bufferDuration;

    // Fade in over 30ms to avoid click/pop
    this.gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
    this.gainNode.gain.linearRampToValueAtTime(1, this.audioCtx.currentTime + 0.03);

    this.source = this.audioCtx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.gainNode);
    this.source.start(0, offset);

    this._startWall = this.audioCtx.currentTime;
    this._startOffset = offset;
    this.playing = true;
  }

  stop() {
    if (this.gainNode && this.audioCtx && this.source) {
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, this.audioCtx.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.03);
      setTimeout(() => this._stopSource(), 40);
    } else {
      this._stopSource();
    }
    this.playing = false;
  }

  syncToFraction(fraction) {
    if (!this.enabled || !this.buffer || !this.audioCtx) return;
    if (!this.playing) return;

    const targetOffset = fraction * this.bufferDuration;
    const elapsed = this.audioCtx.currentTime - this._startWall;
    const currentOffset = this._startOffset + elapsed;
    const drift = Math.abs(currentOffset - targetOffset);

    if (drift > 1.0) {
      this.play(fraction);
    }
  }

  _stopSource() {
    if (this.source) {
      try { this.source.stop(); } catch { /* already stopped */ }
      this.source.disconnect();
      this.source = null;
    }
  }

  dispose() {
    this.stop();
    if (this.audioCtx) this.audioCtx.close();
  }
}
