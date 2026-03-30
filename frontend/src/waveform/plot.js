/**
 * Waveform h(t) plotter using 2D Canvas.
 * Shows full waveform in gray, progress overlay in white.
 */

export class WaveformPlot {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = null;
    this.fraction = 0;

    this._onResize = this._handleResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._handleResize();
  }

  setData(waveformData) {
    this.data = waveformData;
  }

  setFraction(f) {
    this.fraction = f;
  }

  render() {
    const { ctx, canvas, data } = this;
    if (!data) return;

    // Use CSS pixel dimensions (the DPR transform is handled by setTransform)
    const dpr = window.devicePixelRatio;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const padding = { top: 24, bottom: 24, left: 50, right: 16 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    // Find amplitude range
    const hReal = data.h_real;
    let maxAmp = 0;
    for (let i = 0; i < hReal.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(hReal[i]));
    }
    if (maxAmp === 0) maxAmp = 1;

    // Draw axes
    ctx.strokeStyle = '#22222e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + plotH / 2);
    ctx.lineTo(padding.left + plotW, padding.top + plotH / 2);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = '#8888a0';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('t / M', padding.left + plotW / 2, h - 10);
    ctx.save();
    ctx.translate(15, padding.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('h(t)', 0, 0);
    ctx.restore();

    // Map time to x-position (true physical time axis)
    const tMin = data.time[0];
    const tMax = data.time[data.time.length - 1];
    const tRange = tMax - tMin;
    const timeToX = (t) => padding.left + ((t - tMin) / tRange) * plotW;

    // Time labels
    ctx.textAlign = 'left';
    ctx.fillText(tMin.toFixed(0), padding.left, h - 22);
    ctx.textAlign = 'right';
    ctx.fillText(tMax.toFixed(0), padding.left + plotW, h - 22);

    // Plot full waveform in gray (plotted against true time)
    ctx.strokeStyle = 'rgba(136, 136, 160, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < hReal.length; i++) {
      const x = timeToX(data.time[i]);
      const y = padding.top + plotH / 2 - (hReal[i] / maxAmp) * (plotH / 2) * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Progress overlay in white — find the index corresponding to
    // the current time fraction (which is in simulation-time space)
    const progressTime = tMin + this.fraction * tRange;
    // Binary search for the index
    let progressIdx = 0;
    for (let i = 0; i < data.time.length; i++) {
      if (data.time[i] <= progressTime) progressIdx = i;
      else break;
    }

    if (progressIdx > 0) {
      ctx.strokeStyle = '#e0e0e8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= progressIdx; i++) {
        const x = timeToX(data.time[i]);
        const y = padding.top + plotH / 2 - (hReal[i] / maxAmp) * (plotH / 2) * 0.9;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Progress line
      const px = timeToX(progressTime);
      ctx.strokeStyle = '#4a7cff';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(px, padding.top);
      ctx.lineTo(px, padding.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Title
    ctx.fillStyle = '#4a7cff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`h(t)  (${data.mode[0]},${data.mode[1]})`, padding.left, 14);
  }

  _handleResize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (width <= 0 || height <= 0) return;

    const dpr = window.devicePixelRatio;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
  }
}
