/**
 * Chirp audio sonification with Doppler modulation.
 *
 * Audio is generated server-side at the correct target duration,
 * so we always play at playbackRate = 1.0.  The envelope peak is
 * guaranteed to align with the waveform amplitude peak.
 *
 * Doppler effect: a BiquadFilterNode shifts the center frequency
 * based on the radial velocity of the binary relative to the camera.
 * An approaching body raises the pitch; a receding body lowers it.
 */

export class ChirpAudio {
  constructor() {
    this.audioCtx = null;
    this.buffer = null;
    this.source = null;
    this.gainNode = null;
    this.dopplerFilter = null;
    this.dopplerEnabled = false;
    this.enabled = false;
    this.playing = false;
    this.bufferDuration = 0;
    this._startWall = 0;
    this._startOffset = 0;
    this._prevBHPos = null;
    this._prevTime = 0;
  }

  async loadAudioData(audioData) {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }

    const { samples, sample_rate, duration } = audioData;
    this.bufferDuration = duration;

    this.buffer = this.audioCtx.createBuffer(1, samples.length, sample_rate);
    const channelData = this.buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      channelData[i] = samples[i];
    }

    // Build audio chain: source → dopplerFilter → gainNode → destination
    if (!this.gainNode) {
      this.dopplerFilter = this.audioCtx.createBiquadFilter();
      this.dopplerFilter.type = 'allpass';
      this.dopplerFilter.frequency.value = 800;
      this.dopplerFilter.Q.value = 0.5;

      this.gainNode = this.audioCtx.createGain();
      this.dopplerFilter.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  setDopplerEnabled(enabled) {
    this.dopplerEnabled = enabled;
    if (!enabled && this.dopplerFilter) {
      // Reset to neutral
      this.dopplerFilter.type = 'allpass';
      this.gainNode.gain.value = 1.0;
    }
  }

  play(fromFraction = 0) {
    if (!this.enabled || !this.buffer || !this.audioCtx) return;

    this._stopSource();

    const offset = Math.max(0, Math.min(fromFraction, 1)) * this.bufferDuration;

    this.source = this.audioCtx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.dopplerFilter);
    this.source.start(0, offset);

    this._startWall = this.audioCtx.currentTime;
    this._startOffset = offset;
    this.playing = true;
    this._prevBHPos = null;
    this._prevTime = 0;
  }

  stop() {
    this._stopSource();
    this.playing = false;
  }

  syncToFraction(fraction) {
    if (!this.enabled || !this.buffer || !this.audioCtx) return;
    if (!this.playing) return;

    const targetOffset = fraction * this.bufferDuration;
    const elapsed = this.audioCtx.currentTime - this._startWall;
    const currentOffset = this._startOffset + elapsed;
    const drift = Math.abs(currentOffset - targetOffset);

    if (drift > 0.3) {
      this.play(fraction);
    }
  }

  /**
   * Update Doppler modulation based on BH positions and camera.
   * @param {{x,y,z}} posA - BH A world position
   * @param {{x,y,z}} posB - BH B world position
   * @param {{x,y,z}} camPos - Camera world position
   */
  updateDoppler(posA, posB, camPos) {
    if (!this.dopplerEnabled || !this.playing || !this.dopplerFilter) return;

    const now = performance.now() / 1000;

    // Center of mass (equal mass approximation)
    const comX = (posA.x + posB.x) / 2;
    const comY = (posA.y + posB.y) / 2;
    const comZ = (posA.z + posB.z) / 2;

    if (this._prevBHPos && this._prevTime > 0) {
      const dt = now - this._prevTime;
      if (dt > 0.001) {
        // Velocity of COM
        const vx = (comX - this._prevBHPos.x) / dt;
        const vy = (comY - this._prevBHPos.y) / dt;
        const vz = (comZ - this._prevBHPos.z) / dt;

        // Direction from COM to camera
        const dx = camPos.x - comX;
        const dy = camPos.y - comY;
        const dz = camPos.z - comZ;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > 0.01) {
          // Radial velocity (positive = approaching camera)
          const vRadial = -(vx * dx + vy * dy + vz * dz) / dist;

          // Effective speed of sound scaling — orbital velocities are
          // ~0.1-0.5 in geometric units, we want audible but not extreme shifts
          const cEff = 2.0;
          const dopplerFactor = 1.0 / (1.0 - vRadial / cEff);
          const clampedDoppler = Math.max(0.5, Math.min(2.0, dopplerFactor));

          // Use peaking filter to shift perceived pitch
          this.dopplerFilter.type = 'peaking';
          this.dopplerFilter.frequency.value = 400 * clampedDoppler;
          this.dopplerFilter.gain.value = (clampedDoppler - 1.0) * 6;
          this.dopplerFilter.Q.value = 0.7;

          // Proximity gain: closer = louder
          const proxGain = Math.min(2.0, 30.0 / dist);
          this.gainNode.gain.setTargetAtTime(
            proxGain, this.audioCtx.currentTime, 0.05
          );
        }
      }
    }

    this._prevBHPos = { x: comX, y: comY, z: comZ };
    this._prevTime = now;
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
