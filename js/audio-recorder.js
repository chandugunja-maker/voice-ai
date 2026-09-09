/**
 * VoiceShield AI - Web Audio & MediaRecorder Pipeline
 * Real-time microphone capture with live frequency analysis and audio playback
 */

export class AudioRecorder {
  constructor(options = {}) {
    this.onTimerUpdate = options.onTimerUpdate || (() => {});
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
    this.startTime = 0;
    this.timerInterval = null;
    this.elapsedSeconds = 0;
  }

  /**
   * Checks browser support for MediaRecorder and getUserMedia
   */
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  /**
   * Requests mic permission and initializes recording stream
   */
  async start() {
    if (!AudioRecorder.isSupported()) {
      this.onError('Your browser does not support audio recording. Please use modern Chrome, Edge, or Firefox.');
      return false;
    }

    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false, // Keep raw acoustics for synthetic artifact detection
          autoGainControl: true,
        },
      });

      // Initialize Web Audio API for live frequency analysis
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtxClass();
      const source = this.audioContext.createMediaStreamSource(this.audioStream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
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
        });
      };

      this.mediaRecorder.start(100); // 100ms timeslices
      this.isRecording = true;
      this.startTime = Date.now();
      this.elapsedSeconds = 0;

      // Start timer tick
      this.timerInterval = setInterval(() => {
        this.elapsedSeconds = (Date.now() - this.startTime) / 1000;
        const mins = Math.floor(this.elapsedSeconds / 60);
        const secs = Math.floor(this.elapsedSeconds % 60);
        const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        this.onTimerUpdate(formatted, this.elapsedSeconds);
      }, 100);

      this.onStateChange('recording', { analyser: this.analyserNode });
      return true;

    } catch (err) {
      console.error('Microphone error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.onError('Microphone access denied. Please click the camera/mic icon in your address bar to allow microphone access.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        this.onError('No microphone device found. Please connect a microphone and try again.');
      } else {
        this.onError(`Microphone initialization error: ${err.message || 'Unknown error'}`);
      }
      return false;
    }
  }

  /**
   * Stops recording and releases media hardware
   */
  stop() {
    if (!this.isRecording) return;

    this.isRecording = false;
    clearInterval(this.timerInterval);

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    // Stop all audio tracks
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
