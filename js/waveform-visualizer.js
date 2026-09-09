/**
 * VoiceShield AI - Canvas Waveform & Audio Visualizer
 */

export class WaveformVisualizer {
  /**
   * Initializes ambient hero visualizer
   */
  static initHeroVisualizer(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    let animationId;
    let phase = 0;

    const resize = () => {
      canvas.width = canvas.parentElement.clientWidth || 400;
      canvas.height = 160;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      ctx.fillStyle = 'rgba(240, 246, 255, 0.35)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const midY = canvas.height / 2;
      const numPoints = 80;
      const step = canvas.width / numPoints;

      // Draw primary voice oscillation line (crisp white)
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0070f3';

      for (let i = 0; i <= numPoints; i++) {
        const x = i * step;
        const normX = i / numPoints;
        const envelope = Math.sin(normX * Math.PI); // Window envelope
        const y = midY + envelope * (
          Math.sin(normX * 12 + phase) * 25 +
          Math.sin(normX * 28 - phase * 1.5) * 14 +
          Math.sin(normX * 4 + phase * 0.8) * 8
        );

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw secondary biometric harmonic line (subtle white)
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0, 112, 243, 0.35)';

      for (let i = 0; i <= numPoints; i++) {
        const x = i * step;
        const normX = i / numPoints;
        const envelope = Math.sin(normX * Math.PI);
        const y = midY + envelope * Math.sin(normX * 18 + phase * 1.2) * 18;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw frequency spectrum grid bars at the bottom
      const numBars = 32;
      const barWidth = canvas.width / numBars - 2;
      for (let b = 0; b < numBars; b++) {
        const barHeight = Math.abs(Math.sin(b * 0.4 + phase * 2)) * 32 + 4;
        const bx = b * (barWidth + 2);
        const by = canvas.height - barHeight;
        ctx.fillStyle = 'rgba(0, 112, 243, 0.12)';
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
   * Renders live audio input from an AnalyserNode
   */
  static renderLiveAudio(canvas, analyser) {
    if (!canvas || !analyser) return null;
    const ctx = canvas.getContext('2d');
    let animId;

    canvas.width = canvas.parentElement.clientWidth || 500;
    canvas.height = canvas.parentElement.clientHeight || 100;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animId = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#f0f6ff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0066ff'; // Clean blue voice capture wave
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();

    return {
      stop: () => {
        cancelAnimationFrame(animId);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      },
    };
  }

  /**
   * Analysis progress animation
   */
  static renderScanningWaveform(canvas) {
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    let animId;
    let scanX = 0;
    let phase = 0;

    canvas.width = canvas.parentElement.clientWidth || 400;
    canvas.height = 90;

    const draw = () => {
      animId = requestAnimationFrame(draw);
      ctx.fillStyle = '#f0f6ff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw static/modulated spectral wave
      ctx.strokeStyle = '#0066ff';
      ctx.lineWidth = 2;
      ctx.beginPath();

      const midY = canvas.height / 2;
      for (let x = 0; x < canvas.width; x += 4) {
        const norm = x / canvas.width;
        const y = midY + Math.sin(norm * 20 + phase) * 20 * Math.sin(norm * Math.PI);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw vertical scanning beam
      scanX = (scanX + 4) % canvas.width;
      const grad = ctx.createLinearGradient(scanX - 25, 0, scanX + 25, 0);
      grad.addColorStop(0, 'rgba(0, 112, 243, 0)');
      grad.addColorStop(0.5, 'rgba(0, 112, 243, 0.5)');
      grad.addColorStop(1, 'rgba(0, 112, 243, 0)');

      ctx.fillStyle = grad;
      ctx.fillRect(scanX - 25, 0, 50, canvas.height);

      phase += 0.05;
    };

    draw();

    return {
      stop: () => cancelAnimationFrame(animId),
    };
  }
}

