/**
 * Evolution plot: separation and radiated energy over time.
 * Rendered on a 2D Canvas strip below the waveform.
 */

export class EvolutionPlot {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = null;
    this.fraction = 0;

    this._onResize = this._handleResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._handleResize();
  }

  setData(evolutionData) {
    this.data = evolutionData;
  }

  setFraction(f) {
    this.fraction = f;
  }

  setCurrentTime(t) {
    this._currentTime = t;
  }

  render() {
    const { ctx, canvas, data } = this;
    if (!data) return;

    const dpr = window.devicePixelRatio;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const padding = { top: 18, bottom: 16, left: 50, right: 50 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    const tArr = data.time;
    const tMin = tArr[0];
    const tMax = tArr[tArr.length - 1];
    const tRange = tMax - tMin;
    const timeToX = (t) => padding.left + ((t - tMin) / tRange) * plotW;

    const progressTime = this._currentTime != null ? this._currentTime : tMin + this.fraction * tRange;

    // --- Left axis: Separation ---
    const sepArr = data.separation;
    if (sepArr) {
      let sepMax = 0;
      for (let i = 0; i < sepArr.length; i++) {
        if (sepArr[i] > sepMax) sepMax = sepArr[i];
      }
      sepMax = Math.max(sepMax * 1.1, 1);
      const sepToY = (v) => padding.top + plotH - (v / sepMax) * plotH;

      this._drawTrace(ctx, tArr, sepArr, timeToX, sepToY, progressTime,
        'rgba(100, 160, 255, 0.25)', '#6699ff', 1, 1.5);

      // Left axis label
      ctx.fillStyle = '#6699ff';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Separation', padding.left, padding.top - 4);
    }

    // --- Right axis: Radiated energy fraction ---
    // Rendered as a filled area so even small values are visible.
    // Uses sqrt scale to compress the 10,000× dynamic range.
    const eArr = data.energy_radiated_frac;
    if (eArr) {
      let eMax = 0;
      for (let i = 0; i < eArr.length; i++) {
        if (eArr[i] > eMax) eMax = eArr[i];
      }
      eMax = Math.max(eMax, 0.001);
      const sqrtMax = Math.sqrt(eMax);
      const eToY = (v) => {
        const sv = Math.sqrt(Math.max(v, 0));
        return padding.top + plotH - (sv / sqrtMax) * plotH;
      };
      const baseline = padding.top + plotH;

      // Dim filled area (full data)
      ctx.fillStyle = 'rgba(255, 170, 68, 0.08)';
      ctx.beginPath();
      ctx.moveTo(timeToX(tArr[0]), baseline);
      for (let i = 0; i < eArr.length; i++) {
        ctx.lineTo(timeToX(tArr[i]), eToY(eArr[i]));
      }
      ctx.lineTo(timeToX(tArr[tArr.length - 1]), baseline);
      ctx.closePath();
      ctx.fill();

      // Dim trace line
      this._drawTrace(ctx, tArr, eArr, timeToX, eToY, progressTime,
        'rgba(255, 170, 68, 0.2)', '#ffaa44', 1, 2);

      // Bright filled area (progress)
      ctx.fillStyle = 'rgba(255, 170, 68, 0.15)';
      ctx.beginPath();
      ctx.moveTo(timeToX(tArr[0]), baseline);
      for (let i = 0; i < eArr.length; i++) {
        if (tArr[i] > progressTime) {
          ctx.lineTo(timeToX(progressTime), eToY(eArr[i]));
          break;
        }
        ctx.lineTo(timeToX(tArr[i]), eToY(eArr[i]));
      }
      ctx.lineTo(timeToX(Math.min(progressTime, tArr[tArr.length - 1])), baseline);
      ctx.closePath();
      ctx.fill();

      // Current E_rad value as text
      let currentE = 0;
      for (let i = 0; i < tArr.length; i++) {
        if (tArr[i] > progressTime) break;
        currentE = eArr[i];
      }
      ctx.fillStyle = '#ffaa44';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(
        `Radiated energy: ${(currentE * 100).toFixed(3)}%`,
        w - 4, padding.top + 10
      );

      // Max label
      ctx.fillStyle = '#ffaa4466';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText(`max ${(eMax * 100).toFixed(1)}%`, w - 4, padding.top - 4);
    }

    // Progress cursor
    if (this.fraction > 0) {
      const px = timeToX(progressTime);
      ctx.strokeStyle = '#4a7cff';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(px, padding.top);
      ctx.lineTo(px, padding.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Zero line
    ctx.strokeStyle = '#1a1a2a';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + plotH);
    ctx.lineTo(padding.left + plotW, padding.top + plotH);
    ctx.stroke();
  }

  _drawTrace(ctx, tArr, vals, timeToX, valToY, progressTime, dimColor, brightColor, dimWidth, brightWidth) {
    // Dim full trace
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = dimWidth;
    ctx.beginPath();
    for (let i = 0; i < vals.length; i++) {
      const x = timeToX(tArr[i]);
      const y = valToY(vals[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Bright progress overlay
    ctx.strokeStyle = brightColor;
    ctx.lineWidth = brightWidth;
    ctx.beginPath();
    for (let i = 0; i < vals.length; i++) {
      if (tArr[i] > progressTime) break;
      const x = timeToX(tArr[i]);
      const y = valToY(vals[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
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
