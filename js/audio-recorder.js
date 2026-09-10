/**
 * VoiceShield AI - Web Audio & MediaRecorder Pipeline
 * Real-time microphone capture with live frequency analysis, pause/resume,
 * audio level metering, and native uncompressed 16-bit PCM WAV generation.
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
    this.processorNode = null;
    this.recordedChunks = [];
    this.pcmChunks = [];
    this.recordedBlob = null;
    this.recordedUrl = null;
    this.rawSamples = null;

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
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  static encodeWavBlob(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');

    // fmt sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true);  // AudioFormat (PCM = 1)
    view.setUint16(22, 1, true);  // NumChannels (1 = Mono)
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * 1 * 2)
    view.setUint16(32, 2, true);  // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample

    // data sub-chunk
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // 16-bit PCM samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.onError('Microphone access (getUserMedia) is unavailable or not supported in this browser environment. Ensure HTTPS is active.');
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
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(() => {});
      }
      this.sampleRate = this.audioContext.sampleRate || 16000;

      const source = this.audioContext.createMediaStreamSource(this.audioStream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.3;
      source.connect(this.analyserNode);

      // Raw PCM Sample Capture via ScriptProcessorNode for 100% reliable decoding
      const bufferSize = 4096;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
      this.pcmChunks = [];
      this.processorNode.onaudioprocess = (e) => {
        if (!this.isRecording || this.isPaused) return;
        const inputData = e.inputBuffer.getChannelData(0);
        this.pcmChunks.push(new Float32Array(inputData));
      };
      source.connect(this.processorNode);
      // Connect to a silent dummy node or destination to keep processor active
      this.processorNode.connect(this.audioContext.destination);

      // Optional MediaRecorder for fallback container
      this.recordedChunks = [];
      if (window.MediaRecorder) {
        try {
          const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
          let selectedMime = '';
          for (const m of mimeTypes) {
            if (MediaRecorder.isTypeSupported(m)) {
              selectedMime = m;
              break;
            }
          }
          const recorderOptions = selectedMime ? { mimeType: selectedMime } : {};
          this.mediaRecorder = new MediaRecorder(this.audioStream, recorderOptions);
          this.mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              this.recordedChunks.push(e.data);
            }
          };
          this.mediaRecorder.start(100);
        } catch (e) {
          console.warn('MediaRecorder init warning (using PCM capture):', e);
        }
      }

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

      // Real-time audio input level and peak meter
      const timeData = new Uint8Array(this.analyserNode.fftSize);
      this.meterInterval = setInterval(() => {
        if (this.isRecording && !this.isPaused && this.analyserNode) {
          this.analyserNode.getByteTimeDomainData(timeData);
          let sumSquares = 0;
          let peakSample = 0;
          for (let i = 0; i < timeData.length; i++) {
            const normalized = (timeData[i] - 128) / 128.0;
            const absVal = Math.abs(normalized);
            if (absVal > peakSample) peakSample = absVal;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / timeData.length);
          const levelPct = Math.min(100, Math.max(0, Math.round(rms * 280)));
          const peakPct = Math.min(100, Math.max(0, Math.round(peakSample * 100)));
          this.onLevelUpdate(levelPct, peakPct);
        } else {
          this.onLevelUpdate(0, 0);
        }
      }, 40);

      this.onStateChange('recording', {
        analyser: this.analyserNode,
        sampleRate: this.sampleRate
      });
      return true;

    } catch (err) {
      console.error('Microphone error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.onError('Microphone permission is required to record audio.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        this.onError('No microphone detected. Please connect an audio input device and try again.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        this.onError('Microphone is unavailable or already in use by another application.');
      } else {
        this.onError(`Recording failed: ${err.message || 'Could not start audio recording'}`);
      }
      return false;
    }
  }

  pause() {
    if (!this.isRecording || this.isPaused) return;
    this.isPaused = true;
    this.pauseStartTime = Date.now();
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try { this.mediaRecorder.pause(); } catch (e) {}
    }
    this.onStateChange('paused', { duration: this.elapsedSeconds });
  }

  resume() {
    if (!this.isRecording || !this.isPaused) return;
    this.isPaused = false;
    this.pausedDuration += (Date.now() - this.pauseStartTime);
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      try { this.mediaRecorder.resume(); } catch (e) {}
    }
    this.onStateChange('resumed', { duration: this.elapsedSeconds });
  }

  stop() {
    if (!this.isRecording) return;

    this.isRecording = false;
    this.isPaused = false;
    clearInterval(this.timerInterval);
    clearInterval(this.meterInterval);
    this.onLevelUpdate(0, 0);

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch (e) {}
    }

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch (e) {}
      this.processorNode = null;
    }

    // Combine PCM chunks into single Float32Array
    let totalLen = 0;
    for (const chunk of this.pcmChunks) {
      totalLen += chunk.length;
    }
    const combinedSamples = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of this.pcmChunks) {
      combinedSamples.set(chunk, offset);
      offset += chunk.length;
    }
    this.rawSamples = combinedSamples;

    // Create 100% standard uncompressed 16-bit PCM WAV Blob
    const wavBlob = AudioRecorder.encodeWavBlob(combinedSamples, this.sampleRate);
    this.recordedBlob = wavBlob;

    if (this.recordedUrl) {
      URL.revokeObjectURL(this.recordedUrl);
    }
    this.recordedUrl = URL.createObjectURL(this.recordedBlob);

    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => {
        try { track.stop(); } catch (e) {}
      });
      this.audioStream = null;
    }

    if (this.analyserNode) {
      try { this.analyserNode.disconnect(); } catch (e) {}
      this.analyserNode = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.onStateChange('stopped', {
      blob: this.recordedBlob,
      url: this.recordedUrl,
      duration: this.elapsedSeconds,
      sizeBytes: this.recordedBlob.size,
      sampleRate: this.sampleRate,
      rawSamples: this.rawSamples
    });
  }

  getRecordedBlob() {
    return this.recordedBlob;
  }

  getRecordedUrl() {
    return this.recordedUrl;
  }

  getRawSamples() {
    return this.rawSamples;
  }
}
