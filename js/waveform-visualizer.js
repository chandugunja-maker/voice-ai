/**
 * VoiceShield AI - Canvas Waveform & Audio Visualizer
 * Real-time oscillogram from Web Audio AnalyserNode (ByteTimeDomainData),
 * scanning forensic visualizer, and ambient biometric visualizers.
 * Theme: Obsidian Cybersecurity (#090d16 / #38bdf8 / #10b981)
 */

export class WaveformVisualizer {
  constructor(canvas) {
    this.canvas = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.animId = null;
    this.analyser = null;
    this.phase = 0;
    this.scanX = 0;
    this._handleResize = this._resize.bind(this);
  }

  _resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    this.canvas.width = parent ? parent.clientWidth : 500;
    this.canvas.height = parent && parent.clientHeight > 40 ? parent.clientHeight : 80;
  }

  /**
   * Starts live audio time-domain rendering from an AnalyserNode
   * When user speaks, wave oscillates dynamically with microphone amplitude.
   * When silent, wave settles to a clean flat baseline.
   */
  start(analyser) {
    if (!this.canvas || !analyser) return;
    this.stop();
    this.analyser = analyser;
    this._resize();
    window.addEventListener('resize', this._handleResize);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this.animId = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      const ctx = this.ctx;
      const width = this.canvas.width;
      const height = this.canvas.height;
      const midY = height / 2;

      // Dark cybersecurity background
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, width, height);

      // Subtle center grid baseline
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();

      // Real acoustic oscillogram wave
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#38bdf8';
      ctx.shadowColor = 'rgba(56, 189, 248, 0.4)';
      ctx.shadowBlur = 4;
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        // 128 is zero amplitude baseline in Uint8 byte time domain
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(width, midY);
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    draw();
  }

  /**
   * Synthetic forensic scan beam during audio pipeline processing
   */
  startSyntheticScan() {
    if (!this.canvas) return;
    this.stop();
    this._resize();
    window.addEventListener('resize', this._handleResize);

    const ctx = this.ctx;
    const draw = () => {
      this.animId = requestAnimationFrame(draw);
      const width = this.canvas.width;
      const height = this.canvas.height;
      const midY = height / 2;

      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, width, height);

      // Modulated spectral wave
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(56, 189, 248, 0.35)';
      ctx.shadowBlur = 4;
      ctx.beginPath();

      for (let x = 0; x < width; x += 4) {
        const norm = x / width;
        const y = midY + Math.sin(norm * 18 + this.phase) * 16 * Math.sin(norm * Math.PI);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Forensic scanning laser beam
      this.scanX = (this.scanX + 4) % width;
      const grad = ctx.createLinearGradient(this.scanX - 30, 0, this.scanX + 30, 0);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.45)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0)');

      ctx.fillStyle = grad;
      ctx.fillRect(this.scanX - 30, 0, 60, height);

      this.phase += 0.05;
    };

    draw();
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    window.removeEventListener('resize', this._handleResize);
    if (this.ctx && this.canvas) {
      this.ctx.fillStyle = '#090d16';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  clear() {
    this.stop();
  }

  /**
   * Static helper: Ambient hero visualizer
   */
  static initHeroVisualizer(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    let animationId;
    let phase = 0;

    const resize = () => {
      canvas.width = canvas.parentElement ? canvas.parentElement.clientWidth : 400;
      canvas.height = 160;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const midY = canvas.height / 2;
      const numPoints = 80;
      const step = canvas.width / numPoints;

      // Draw primary voice oscillation line (cyan)
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#38bdf8';

      for (let i = 0; i <= numPoints; i++) {
        const x = i * step;
        const normX = i / numPoints;
        const envelope = Math.sin(normX * Math.PI);
        const y = midY + envelope * (
          Math.sin(normX * 12 + phase) * 25 +
          Math.sin(normX * 28 - phase * 1.5) * 14 +
          Math.sin(normX * 4 + phase * 0.8) * 8
        );

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw secondary biometric harmonic line
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';

      for (let i = 0; i <= numPoints; i++) {
        const x = i * step;
        const normX = i / numPoints;
        const envelope = Math.sin(normX * Math.PI);
        const y = midY + envelope * Math.sin(normX * 18 + phase * 1.2) * 18;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Frequency spectrum grid bars at the bottom
      const numBars = 32;
      const barWidth = canvas.width / numBars - 2;
      for (let b = 0; b < numBars; b++) {
        const barHeight = Math.abs(Math.sin(b * 0.4 + phase * 2)) * 32 + 4;
        const bx = b * (barWidth + 2);
        const by = canvas.height - barHeight;
        ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
        ctx.fillRect(bx, by, barWidth, barHeight);
      }

      phase += 0.04;
      animationId = requestAnimationFrame(draw);
    };

    draw();

    return {
      stop: () => cancelAnimationFrame(animationId),
    };
  }

  /**
   * Static helper: Renders live audio input from an AnalyserNode
   */
  static renderLiveAudio(canvas, analyser) {
    const visualizer = new WaveformVisualizer(canvas);
    visualizer.start(analyser);
    return visualizer;
  }

  /**
   * Static helper: Analysis scanning waveform
   */
  static renderScanningWaveform(canvas) {
    const visualizer = new WaveformVisualizer(canvas);
    visualizer.startSyntheticScan();
    return visualizer;
  }
}
