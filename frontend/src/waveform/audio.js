/**
 * Chirp audio sonification.
 *
 * Audio is generated server-side at the correct target duration,
 * so we always play at playbackRate = 1.0.  The envelope peak is
 * guaranteed to align with the waveform amplitude peak.
 */

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

    // Fade in over 30ms to avoid click/pop from abrupt start
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
    // Fade out over 30ms to avoid click/pop from abrupt stop
    if (this.gainNode && this.audioCtx && this.source) {
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, this.audioCtx.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.03);
      // Delay the actual stop until after fade-out
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
