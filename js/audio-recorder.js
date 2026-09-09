/**
 * VoiceShield AI - Web Audio & MediaRecorder Pipeline
 * Real-time microphone capture with live frequency analysis, pause/resume,
 * and audio level metering.
 */

export class AudioRecorder {
  constructor(options = {}) {
    this.onTimerUpdate = options.onTimerUpdate || (() => {});
    this.onLevelUpdate = options.onLevelUpdate || (() => {});
    this.onStateChange = options.onStateChange || (() => {});
    this.onError = options.onError || (() => {});

    this.mediaRecorder = null;
    this.audioStream = null;
    this.audioContext = null;
    this.analyserNode = null;
    this.recordedChunks = [];
    this.recordedBlob = null;
    this.recordedUrl = null;

    this.isRecording = false;
    this.isPaused = false;
    this.startTime = 0;
    this.pausedDuration = 0;
    this.pauseStartTime = 0;
    this.timerInterval = null;
    this.meterInterval = null;
    this.elapsedSeconds = 0;
    this.sampleRate = 16000;
  }

  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  async start() {
    if (!AudioRecorder.isSupported()) {
      this.onError('Your browser does not support audio recording. Please use modern Chrome, Edge, or Firefox.');
      return false;
    }

    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false, // Keep raw acoustic features for synthetic artifact detection
          autoGainControl: true,
        },
      });

      // Initialize Web Audio API for live frequency & level analysis
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtxClass();
      this.sampleRate = this.audioContext.sampleRate || 16000;

      const source = this.audioContext.createMediaStreamSource(this.audioStream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.3;
      source.connect(this.analyserNode);

      // Select supported mime type
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
      ];
      let selectedMime = '';
      for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported(m)) {
          selectedMime = m;
          break;
        }
      }

      const recorderOptions = selectedMime ? { mimeType: selectedMime } : {};
      this.mediaRecorder = new MediaRecorder(this.audioStream, recorderOptions);
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const mime = selectedMime || 'audio/webm';
        this.recordedBlob = new Blob(this.recordedChunks, { type: mime });
        if (this.recordedUrl) {
          URL.revokeObjectURL(this.recordedUrl);
        }
        this.recordedUrl = URL.createObjectURL(this.recordedBlob);
        this.onStateChange('stopped', {
          blob: this.recordedBlob,
          url: this.recordedUrl,
          duration: this.elapsedSeconds,
          sizeBytes: this.recordedBlob.size,
          sampleRate: this.sampleRate,
        });
      };

      this.mediaRecorder.start(100);
      this.isRecording = true;
      this.isPaused = false;
      this.startTime = Date.now();
      this.pausedDuration = 0;
      this.elapsedSeconds = 0;

      // Timer tick
      this.timerInterval = setInterval(() => {
        if (!this.isPaused) {
          this.elapsedSeconds = (Date.now() - this.startTime - this.pausedDuration) / 1000;
          const mins = Math.floor(this.elapsedSeconds / 60);
          const secs = Math.floor(this.elapsedSeconds % 60);
          const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
          this.onTimerUpdate(formatted, this.elapsedSeconds);
        }
      }, 100);

      // Real-time audio level meter
      const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
      this.meterInterval = setInterval(() => {
        if (this.isRecording && !this.isPaused && this.analyserNode) {
          this.analyserNode.getByteFrequencyData(dataArray);
          let sum = 0;
          let peak = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
            if (dataArray[i] > peak) peak = dataArray[i];
          }
          const avg = sum / dataArray.length;
          const levelPct = Math.min(100, Math.round((avg / 128) * 100));
          const peakPct = Math.min(100, Math.round((peak / 255) * 100));
          this.onLevelUpdate(levelPct, peakPct);
        } else {
          this.onLevelUpdate(0, 0);
        }
      }, 50);

      this.onStateChange('recording', {
        analyser: this.analyserNode,
        sampleRate: this.sampleRate
      });
      return true;

    } catch (err) {
      console.error('Microphone error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.onError('Microphone access was denied. Please allow microphone access in your browser settings and try again.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        this.onError('No microphone device found. Please connect a microphone and try again.');
      } else {
        this.onError(`Microphone initialization error: ${err.message || 'Unknown error'}`);
      }
      return false;
    }
  }

  pause() {
    if (!this.isRecording || this.isPaused) return;
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.isPaused = true;
      this.pauseStartTime = Date.now();
      this.onStateChange('paused', { duration: this.elapsedSeconds });
    }
  }

  resume() {
    if (!this.isRecording || !this.isPaused) return;
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      this.isPaused = false;
      this.pausedDuration += (Date.now() - this.pauseStartTime);
      this.onStateChange('resumed', { duration: this.elapsedSeconds });
    }
  }

  stop() {
    if (!this.isRecording) return;

    this.isRecording = false;
    this.isPaused = false;
    clearInterval(this.timerInterval);
    clearInterval(this.meterInterval);

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
  }

  getRecordedBlob() {
    return this.recordedBlob;
  }

  getRecordedUrl() {
    return this.recordedUrl;
  }
}
