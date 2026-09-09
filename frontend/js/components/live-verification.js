/**
 * VoiceShield AI - Live Real-Time Voice Verification Mode
 * Quick 5-second automatic burst analysis for high-speed SIH live demonstrations
 */

import { AudioRecorder } from '../audio-recorder.js';
import { WaveformVisualizer } from '../waveform-visualizer.js';
import { VoiceShieldAPI } from '../api.js';
import { toast } from './toast.js';

export class LiveVerification {
  constructor(options = {}) {
    this.onComplete = options.onComplete || (() => {});
    this.isLiveActive = false;
    this.visualizer = null;
    this.liveTimer = null;

    this.recorder = new AudioRecorder({
      onTimerUpdate: (formatted, seconds) => {
        const liveStatusEl = document.getElementById('liveStatusText');
        if (liveStatusEl && this.isLiveActive) {
          liveStatusEl.textContent = `● Listening... ${seconds.toFixed(1)}s / 5.0s`;
        }
      },
      onStateChange: (state, data) => {
        if (state === 'recording') {
          const liveCanvas = document.getElementById('liveStreamCanvas');
          if (liveCanvas && data.analyser) {
            this.visualizer = WaveformVisualizer.renderLiveAudio(liveCanvas, data.analyser);
          }
        } else if (state === 'stopped') {
          this._processLiveSample(data.blob);
        }
      },
      onError: (err) => {
        toast.show(err, 'error');
        this.reset();
      }
    });

    this._bindEvents();
  }

  _bindEvents() {
    const liveBtn = document.getElementById('btnStartLiveVerification');
    if (liveBtn) {
      liveBtn.addEventListener('click', () => {
        if (this.isLiveActive) {
          this.stop();
        } else {
          this.start();
        }
      });
    }
  }

  async start() {
    this.isLiveActive = true;
    const liveBtn = document.getElementById('btnStartLiveVerification');
    const ring = document.getElementById('liveIndicatorRing');
    const statusText = document.getElementById('liveStatusText');

    if (liveBtn) {
      liveBtn.textContent = 'Cancel Live Verification';
      liveBtn.classList.remove('btn-primary');
      liveBtn.classList.add('btn-secondary');
    }
    if (ring) ring.classList.add('listening');
    if (statusText) statusText.textContent = '● Listening... Initializing microphone';

    const started = await this.recorder.start();
    if (!started) {
      this.reset();
      return;
    }

    // Automatically stop and analyze after 5.0 seconds
    this.liveTimer = setTimeout(() => {
      if (this.isLiveActive) {
        if (statusText) statusText.textContent = '● Processing audio sample...';
        this.recorder.stop();
      }
    }, 5000);
  }

  async _processLiveSample(blob) {
    const statusText = document.getElementById('liveStatusText');
    const ring = document.getElementById('liveIndicatorRing');

    if (statusText) statusText.textContent = '● Processing & analyzing synthetic traits...';
    if (ring) ring.classList.remove('listening');

    try {
      const result = await VoiceShieldAPI.analyzeVoice(blob, 'live_stream_sample.webm');
      if (statusText) statusText.textContent = '● Verification Complete';
      toast.show('Live voice verification finished!', 'success');
      this.reset();
      this.onComplete(result);
    } catch (err) {
      toast.show(`Live verification error: ${err.message}`, 'error');
      this.reset();
    }
  }

  stop() {
    clearTimeout(this.liveTimer);
    this.recorder.stop();
    this.reset();
  }

  reset() {
    this.isLiveActive = false;
    clearTimeout(this.liveTimer);
    if (this.visualizer) {
      this.visualizer.stop();
      this.visualizer = null;
    }

    const liveBtn = document.getElementById('btnStartLiveVerification');
    const ring = document.getElementById('liveIndicatorRing');
    const statusText = document.getElementById('liveStatusText');

    if (liveBtn) {
      liveBtn.textContent = 'Start Live Verification';
      liveBtn.classList.add('btn-primary');
      liveBtn.classList.remove('btn-secondary');
    }
    if (ring) ring.classList.remove('listening');
    if (statusText) statusText.textContent = 'Ready • Click to begin 5-second live capture';
  }
}
