/**
 * VoiceShield AI - Verification Workspace Component
 * Handles microphone recording (with pause/resume and level meter),
 * audio file uploads (WAV, MP3, M4A, FLAC, OGG), pre-analysis diagnostics,
 * and the multi-stage animated analysis process.
 */

import { AudioRecorder } from '../audio-recorder.js';
import { WaveformVisualizer } from '../waveform-visualizer.js';
import { VoiceShieldAPI } from '../api.js';
import { toast } from './toast.js';

export class VerificationWorkspace {
  constructor(options = {}) {
    this.onAnalysisComplete = options.onAnalysisComplete || (() => {});

    // State
    this.currentBlob = null;
    this.currentFilename = null;
    this.currentDuration = 0;
    this.currentFileSize = 0;
    this.currentSampleRate = 16000;
    this.currentSourceType = null;
    this.sampleHint = null;
    this.audioPlayer = new Audio();
    this.exampleAudioPlayer = new Audio();

    // Visualizers
    this.liveVisualizer = null;
    this.scanVisualizer = null;

    // Recorder
    this.recorder = new AudioRecorder({
      onTimerUpdate: (formattedTime, seconds) => {
        const timerEl = document.getElementById('recordTimerText');
        if (timerEl) timerEl.textContent = formattedTime;
        this.currentDuration = seconds;
        if (seconds >= 60 && this.recorder.isRecording) {
          toast.show('Maximum recording duration reached (60 seconds). Stopping recording.', 'info');
          this.recorder.stop();
        }
      },
      onLevelUpdate: (levelPct, peakPct) => {
        this._updateAudioLevelMeter(levelPct, peakPct);
      },
      onStateChange: (state, data) => {
        this._handleRecorderState(state, data);
      },
      onError: (errorMsg) => {
        const lower = (errorMsg || '').toLowerCase();
        if (lower.includes('denied') || lower.includes('notallowed') || lower.includes('permission')) {
          this._setMicStatus('Permission Denied', 'status-denied');
        } else if (lower.includes('no microphone') || lower.includes('notfound') || lower.includes('devicesnotfound') || lower.includes('unavailable')) {
          this._setMicStatus('Microphone Unavailable', 'status-denied');
        } else {
          this._setMicStatus('Microphone Unavailable', 'status-denied');
        }
        toast.show(errorMsg, 'error', 6000);
        this._resetRecordingUI();
      }
    });

    this._checkMicPermission();
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', () => this._checkMicPermission());
    }
    this._bindElements();
    this._resetUploadUI();
  }

  async _checkMicPermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this._setMicStatus('Microphone Unavailable', 'status-denied');
      return;
    }

    try {
      if (navigator.mediaDevices.enumerateDevices) {
        const devices = await Promise.race([
          navigator.mediaDevices.enumerateDevices(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1200))
        ]);
        if (Array.isArray(devices)) {
          const hasAudioInput = devices.some(d => d.kind === 'audioinput');
          if (!hasAudioInput) {
            this._setMicStatus('Microphone Unavailable', 'status-denied');
            return;
          }
        }
      }
    } catch (e) {}

    if (navigator.permissions && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        this._mapPermissionStateToStatus(result.state);
        result.onchange = () => this._mapPermissionStateToStatus(result.state);
        return;
      } catch (e) {}
    }

    this._setMicStatus('Permission Required', 'status-prompt');
  }

  _mapPermissionStateToStatus(state) {
    if (state === 'granted') {
      this._setMicStatus('Microphone Ready', 'status-ready');
    } else if (state === 'denied') {
      this._setMicStatus('Permission Denied', 'status-denied');
    } else {
      this._setMicStatus('Permission Required', 'status-prompt');
    }
  }

  _setMicStatus(text, className) {
    const statusEl = document.getElementById('micPermissionStatus');
    if (!statusEl) return;
    statusEl.className = `mic-status-pill ${className}`;
    statusEl.textContent = text;
  }

  _bindElements() {
    // 0. Tab Switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) this.switchTab(tab);
      });
    });

    // 1. Voice Recording Buttons
    const startRecordBtn = document.getElementById('btnStartVoiceCheck');
    if (startRecordBtn) {
      startRecordBtn.addEventListener('click', () => {
        this._startRecordingFlow();
      });
    }

    const pauseBtn = document.getElementById('btnPauseRecording');
    const resumeBtn = document.getElementById('btnResumeRecording');
    const statusLabel = document.getElementById('recordingStatusLabel');

    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        this.recorder.pause();
        pauseBtn.style.display = 'none';
        if (resumeBtn) resumeBtn.style.display = 'inline-flex';
        if (statusLabel) statusLabel.textContent = 'Recording Paused';
        this._setMicStatus('Recording paused', 'status-prompt');
      });
    }

    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        this.recorder.resume();
        resumeBtn.style.display = 'none';
        if (pauseBtn) pauseBtn.style.display = 'inline-flex';
        if (statusLabel) statusLabel.textContent = 'Recording in Progress';
        this._setMicStatus('Recording', 'status-recording');
      });
    }

    const stopRecordBtn = document.getElementById('btnStopRecording');
    if (stopRecordBtn) {
      stopRecordBtn.addEventListener('click', () => {
        this.recorder.stop();
        this._setMicStatus('Recording stopped', 'status-ready');
      });
    }

    const recordAgainBtn = document.getElementById('btnRecordAgain');
    if (recordAgainBtn) {
      recordAgainBtn.addEventListener('click', () => {
        this._resetRecordingUI();
      });
    }

    const playVoiceBtn = document.getElementById('btnPlayVoicePreview');
    if (playVoiceBtn) {
      playVoiceBtn.addEventListener('click', () => {
        this._togglePlayback();
      });
    }

    const checkVoiceBtn = document.getElementById('btnCheckThisVoice');
    if (checkVoiceBtn) {
      checkVoiceBtn.addEventListener('click', () => {
        this.startAnalysis();
      });
    }

    // 2. Audio Upload Handling
    const dropzone = document.getElementById('uploadDropzone');
    const fileInput = document.getElementById('fileUploadInput');
    const browseBtn = document.getElementById('btnBrowseUpload');

    if (browseBtn && fileInput) {
      browseBtn.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this._handleSelectedFile(e.target.files[0]);
        }
      });
    }

    if (dropzone) {
      ['dragenter', 'dragover'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('is-dragover');
        });
      });

      ['dragleave', 'drop'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('is-dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this._handleSelectedFile(e.dataTransfer.files[0]);
        }
      });
    }

    const removeUploadBtn = document.getElementById('btnRemoveUpload');
    if (removeUploadBtn) {
      removeUploadBtn.addEventListener('click', () => {
        this._resetUploadUI();
      });
    }

    const checkUploadedVoiceBtn = document.getElementById('btnCheckUploadedVoice');
    if (checkUploadedVoiceBtn) {
      checkUploadedVoiceBtn.addEventListener('click', () => {
        this.startAnalysis();
      });
    }

    const uploadPlayBtn = document.getElementById('btnUploadPlayPause');
    if (uploadPlayBtn) {
      uploadPlayBtn.addEventListener('click', () => {
        this._togglePlayback();
      });
    }

    // 3. Microphone Diagnostics Test Button
    const testMicBtn = document.getElementById('btnTestMicrophone');
    if (testMicBtn) {
      testMicBtn.addEventListener('click', () => {
        this._runMicrophoneTest();
      });
    }

    // 4. Test Voice Benchmark Library & Examples
    document.querySelectorAll('.btn-analyze-example').forEach(btn => {
      btn.addEventListener('click', () => {
        const sample = btn.getAttribute('data-sample');
        this._analyzeExample(sample);
      });
    });

    document.querySelectorAll('.btn-play-example').forEach(btn => {
      btn.addEventListener('click', () => {
        const sample = btn.getAttribute('data-sample');
        this._toggleExamplePlayback(sample, btn);
      });
    });

    // 5. Sentence Prompts
    const copySentenceBtn = document.getElementById('btnCopySentence');
    if (copySentenceBtn) {
      copySentenceBtn.addEventListener('click', () => {
        const promptEl = document.getElementById('sentencePromptBox');
        if (promptEl) {
          navigator.clipboard.writeText(promptEl.textContent.trim().replace(/^“|”$/g, ''))
            .then(() => toast.show('Sentence copied to clipboard!', 'success'))
            .catch(() => toast.show('Failed to copy', 'warning'));
        }
      });
    }
  }

  _updateAudioLevelMeter(levelPct, peakPct) {
    const levelBar = document.getElementById('recordLevelBar');
    const peakDot = document.getElementById('recordPeakIndicator');
    if (levelBar) {
      levelBar.style.width = `${Math.min(100, Math.max(2, levelPct))}%`;
      if (levelPct > 75) {
        levelBar.style.background = '#ef4444'; // Red
      } else if (levelPct > 45) {
        levelBar.style.background = '#f59e0b'; // Amber
      } else {
        levelBar.style.background = '#10b981'; // Green
      }
    }
    if (peakDot) {
      peakDot.style.opacity = peakPct > 80 ? '1' : '0.3';
    }
  }

  async _startRecordingFlow() {
    this.sampleHint = null;
    this.currentBlob = null;
    this.currentFilename = `rec_${Date.now()}.wav`;

    this._setMicStatus('Requesting microphone permission...', 'status-prompt');

    const started = await this.recorder.start();
    if (!started) {
      await this._checkMicPermission();
      return;
    }
    this._setMicStatus('Recording', 'status-recording');

    // Switch UI to active recording state
    const startBtn = document.getElementById('btnStartVoiceCheck');
    const activePanel = document.getElementById('recordingActivePanel');
    const completePanel = document.getElementById('recordingCompletePanel');
    const pauseBtn = document.getElementById('btnPauseRecording');
    const resumeBtn = document.getElementById('btnResumeRecording');
    const statusLabel = document.getElementById('recordingStatusLabel');

    if (startBtn) startBtn.style.display = 'none';
    if (completePanel) completePanel.style.display = 'none';
    if (activePanel) activePanel.style.display = 'block';
    if (pauseBtn) pauseBtn.style.display = 'inline-flex';
    if (resumeBtn) resumeBtn.style.display = 'none';
    if (statusLabel) statusLabel.textContent = 'Recording in Progress';

    const canvas = document.getElementById('liveWaveformCanvas');
    if (canvas && this.recorder.analyserNode) {
      if (!this.liveVisualizer) {
        this.liveVisualizer = new WaveformVisualizer(canvas);
      }
      this.liveVisualizer.start(this.recorder.analyserNode);
    }
  }

  async _handleRecorderState(state, data) {
    if (state === 'recording') {
      const idleContainer = document.getElementById('recordingIdleState');
      if (idleContainer) idleContainer.style.display = 'none';
      this._setMicStatus('Recording in Progress', 'status-recording');
    } else if (state === 'paused') {
      this._setMicStatus('Recording Paused', 'status-prompt');
    } else if (state === 'resumed') {
      this._setMicStatus('Recording in Progress', 'status-recording');
    } else if (state === 'error') {
      const err = data;
      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        this._setMicStatus('Permission Denied', 'status-denied');
      } else if (err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')) {
        this._setMicStatus('Microphone Unavailable', 'status-denied');
      } else {
        await this._checkMicPermission();
      }
    } else if (state === 'stopped') {
      this._setMicStatus('Microphone Ready', 'status-ready');
      if (this.liveVisualizer) {
        this.liveVisualizer.stop();
      }

      this.currentSourceType = 'microphone';
      this.currentBlob = data.blob;
      this.currentFilename = 'microphone_recording.wav';
      this.currentDuration = data.duration;
      this.currentFileSize = data.sizeBytes || (data.blob ? data.blob.size : 0);
      this.currentSampleRate = data.sampleRate || 16000;
      this.audioPlayer.src = data.url;

      // Update UI to complete state
      const activePanel = document.getElementById('recordingActivePanel');
      const completePanel = document.getElementById('recordingCompletePanel');
      const durationBadge = document.getElementById('recordedDurationBadge');
      const metaDuration = document.getElementById('recordedMetaDuration');
      const metaSize = document.getElementById('recordedMetaSize');
      const metaRate = document.getElementById('recordedMetaRate');
      const metaChannels = document.getElementById('recordedMetaChannels');
      const metaRms = document.getElementById('recordedMetaRms');
      const metaSilence = document.getElementById('recordedMetaSilence');
      const metaSnr = document.getElementById('recordedMetaSnr');
      const metaNoise = document.getElementById('recordedMetaNoise');
      const metaSpeech = document.getElementById('recordedMetaSpeech');
      const qualityBadge = document.getElementById('recordedQualityBadge');

      if (activePanel) activePanel.style.display = 'none';
      if (completePanel) completePanel.style.display = 'block';

      const mins = Math.floor(this.currentDuration / 60);
      const secs = Math.floor(this.currentDuration % 60);
      const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      if (durationBadge) durationBadge.textContent = formatted;
      if (metaDuration) metaDuration.textContent = `${this.currentDuration.toFixed(1)}s`;
      if (metaSize) metaSize.textContent = `${(this.currentFileSize / 1024).toFixed(1)} KB`;
      if (metaRate) metaRate.textContent = `${this.currentSampleRate} Hz`;

      // Fetch pre-analysis diagnostics (non-blocking)
      VoiceShieldAPI.checkAudioQuality(this.currentBlob, this.currentFilename).then(diag => {
        if (diag && diag.quality) {
          const q = diag.quality;
          if (metaRms) metaRms.textContent = q.rms_level;
          if (metaSilence) metaSilence.textContent = `${q.silence_pct}%`;
          if (metaSnr) metaSnr.textContent = q.snr_estimate;
          if (metaNoise) metaNoise.textContent = q.background_noise_level;
          if (metaSpeech) metaSpeech.textContent = q.voice_activity;
          if (qualityBadge) {
            qualityBadge.textContent = q.voice_activity;
            qualityBadge.className = 'quality-badge';
            if (!diag.passed) {
              qualityBadge.classList.add(diag.status === 'poor_quality' ? 'quality-warning' : 'quality-error');
            }
          }
        }
      });

      // AUTO-TRIGGER ANALYSIS immediately after recording stops
      // Give the UI 600ms to update and show the complete panel first
      toast.show('Recording complete! Starting voice analysis…', 'info', 2500);
      setTimeout(() => {
        this.startAnalysis();
      }, 600);
    }
  }

  _resetRecordingUI() {
    if (this.recorder.isRecording) {
      this.recorder.stop();
    }
    if (this.liveVisualizer) {
      this.liveVisualizer.stop();
    }
    this.audioPlayer.pause();
    this.currentBlob = null;
    this.currentFilename = null;
    this.currentDuration = 0;
    if (this.currentSourceType === 'microphone') {
      this.currentSourceType = null;
    }

    this._checkMicPermission();

    const startBtn = document.getElementById('btnStartVoiceCheck');
    const idleContainer = document.getElementById('recordingIdleState');
    const activePanel = document.getElementById('recordingActivePanel');
    const completePanel = document.getElementById('recordingCompletePanel');

    if (startBtn) startBtn.style.display = 'inline-flex';
    if (idleContainer) idleContainer.style.display = 'block';
    if (activePanel) activePanel.style.display = 'none';
    if (completePanel) completePanel.style.display = 'none';

    const timerEl = document.getElementById('recordTimerText');
    if (timerEl) timerEl.textContent = '00:00';
    const durationBadge = document.getElementById('recordedDurationBadge');
    if (durationBadge) durationBadge.textContent = '--';
    const recMetaDuration = document.getElementById('recordedMetaDuration');
    if (recMetaDuration) recMetaDuration.textContent = '--';
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('recordedMetaRate', '--');
    setEl('recordedMetaChannels', '--');
    setEl('recordedMetaSize', '--');
    setEl('recordedMetaRms', '--');
    setEl('recordedMetaSilence', '--');
    setEl('recordedMetaSnr', '--');
    setEl('recordedMetaNoise', '--');
    setEl('recordedMetaSpeech', '--');
    const recQualityBadge = document.getElementById('recordedQualityBadge');
    if (recQualityBadge) {
      recQualityBadge.textContent = '--';
      recQualityBadge.className = 'quality-badge';
    }
    this._updateAudioLevelMeter(0, 0);
  }


  _handleSelectedFile(file) {
    if (!file) return;

    // Validate size (max 25MB)
    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.show('File is too large. Maximum supported audio file size is 25 MB.', 'error');
      return;
    }

    if (file.size < 100) {
      toast.show('The selected file is empty or corrupted. Please choose a valid audio recording.', 'error');
      return;
    }

    // Validate extension
    const allowed = ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'webm'];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext) && !file.type.startsWith('audio/')) {
      toast.show(`Unsupported audio format (.${ext}). VoiceShield AI supports WAV, MP3, M4A, FLAC, OGG.`, 'error');
      return;
    }

    this.currentSourceType = 'upload';
    this.currentBlob = file;
    this.currentFilename = file.name;
    this.sampleHint = null;

    // Grab Upload UI elements first
    const dropzone = document.getElementById('uploadDropzone');
    const previewBar = document.getElementById('uploadFilePreview');
    const nameEl = document.getElementById('uploadedFileName');
    const sizeEl = document.getElementById('uploadedFileSize');
    const metaFormat = document.getElementById('uploadMetaFormat');
    const metaSize = document.getElementById('uploadMetaSize');
    const metaQuality = document.getElementById('uploadMetaQuality');
    const qualityBadge = document.getElementById('uploadQualityBadge');
    const playBtn = document.getElementById('btnUploadPlayPause');
    const removeBtn = document.getElementById('btnRemoveUpload');
    const analyzeBtn = document.getElementById('btnCheckUploadedVoice');

    if (dropzone) dropzone.style.display = 'none';
    if (previewBar) previewBar.style.display = 'block';
    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = `${ext.toUpperCase()} • ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    if (metaFormat) metaFormat.textContent = ext.toUpperCase();
    if (metaSize) metaSize.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    if (playBtn) playBtn.disabled = false;
    if (removeBtn) removeBtn.disabled = false;
    if (analyzeBtn) analyzeBtn.disabled = false;

    // Inspect audio duration via temporary audio object
    const objectUrl = URL.createObjectURL(file);
    this.audioPlayer.src = objectUrl;

    const tempAudio = new Audio(objectUrl);
    tempAudio.onloadedmetadata = () => {
      this.currentDuration = tempAudio.duration || 0;
      const metaDuration = document.getElementById('uploadMetaDuration');
      if (metaDuration) metaDuration.textContent = `${this.currentDuration.toFixed(1)}s`;
      const chanStr = this.currentChannels ? (this.currentChannels === 1 ? ' • Mono' : ' • Stereo') : '';
      const rateStr = this.currentSampleRate ? ` • ${this.currentSampleRate}Hz` : '';
      if (sizeEl) sizeEl.textContent = `${ext.toUpperCase()} • ${(file.size / (1024 * 1024)).toFixed(2)} MB • ${this.currentDuration.toFixed(1)}s${rateStr}${chanStr}`;
    };
    tempAudio.onerror = () => {
      toast.show('Unable to decode this audio file.', 'error');
      this._resetUploadUI();
    };

    // Extract detailed audio metadata (duration, sample rate, channels) via Web Audio API
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (AudioCtxClass) {
      try {
        const tempCtx = new AudioCtxClass();
        file.arrayBuffer().then(buf => tempCtx.decodeAudioData(buf))
          .then(decoded => {
            this.currentSampleRate = decoded.sampleRate || 16000;
            this.currentChannels = decoded.numberOfChannels || 1;
            if (decoded.duration && !this.currentDuration) {
              this.currentDuration = decoded.duration;
            }
            const chanStr = decoded.numberOfChannels === 1 ? 'Mono' : (decoded.numberOfChannels === 2 ? 'Stereo' : `${decoded.numberOfChannels} ch`);
            if (sizeEl) {
              sizeEl.textContent = `${ext.toUpperCase()} • ${(file.size / (1024 * 1024)).toFixed(2)} MB • ${this.currentDuration.toFixed(1)}s • ${decoded.sampleRate}Hz • ${chanStr}`;
            }
            tempCtx.close().catch(() => {});
          })
          .catch(() => {
            tempCtx.close().catch(() => {});
          });
      } catch (e) {}
    }

    // Fetch pre-analysis diagnostics for uploaded file
    VoiceShieldAPI.checkAudioQuality(file, file.name).then(diag => {
      if (diag && diag.quality) {
        const q = diag.quality;
        const metaDuration = document.getElementById('uploadMetaDuration');
        if (metaDuration) metaDuration.textContent = `${q.duration}s`;
        if (metaQuality) metaQuality.textContent = q.snr_estimate || 'Validated';
        if (qualityBadge) {
          qualityBadge.textContent = q.voice_activity;
          qualityBadge.className = 'quality-badge';
          if (!diag.passed) {
            qualityBadge.classList.add(diag.status === 'poor_quality' ? 'quality-warning' : 'quality-error');
          }
        }
      }
    });

    toast.show(`Loaded "${file.name}" successfully. Click "Analyze Voice" to proceed.`, 'success');
  }


  _resetUploadUI() {
    this.audioPlayer.pause();
    this.currentBlob = null;
    this.currentFilename = null;
    this.currentDuration = 0;
    if (this.currentSourceType === 'upload') {
      this.currentSourceType = null;
    }

    const dropzone = document.getElementById('uploadDropzone');
    const previewBar = document.getElementById('uploadFilePreview');
    const fileInput = document.getElementById('fileUploadInput');
    const nameEl = document.getElementById('uploadedFileName');
    const sizeEl = document.getElementById('uploadedFileSize');
    const playBtn = document.getElementById('btnUploadPlayPause');
    const removeBtn = document.getElementById('btnRemoveUpload');
    const analyzeBtn = document.getElementById('btnCheckUploadedVoice');

    if (dropzone) dropzone.style.display = 'block';
    if (previewBar) previewBar.style.display = 'none';
    if (fileInput) fileInput.value = '';
    if (nameEl) nameEl.textContent = 'No audio selected';
    if (sizeEl) sizeEl.textContent = '--';
    if (playBtn) playBtn.disabled = true;
    if (removeBtn) removeBtn.disabled = true;
    if (analyzeBtn) analyzeBtn.disabled = true;
  }

  _togglePlayback() {
    if (!this.audioPlayer.src) return;

    const playVoiceBtn = document.getElementById('btnPlayVoicePreview');
    const uploadPlayBtn = document.getElementById('btnUploadPlayPause');

    if (this.audioPlayer.paused) {
      this.audioPlayer.play();
      if (playVoiceBtn) playVoiceBtn.innerHTML = '❚❚ Pause';
      if (uploadPlayBtn) uploadPlayBtn.innerHTML = '❚❚';
    } else {
      this.audioPlayer.pause();
      if (playVoiceBtn) playVoiceBtn.innerHTML = '▶ Play Voice';
      if (uploadPlayBtn) uploadPlayBtn.innerHTML = '▶';
    }

    this.audioPlayer.onended = () => {
      if (playVoiceBtn) playVoiceBtn.innerHTML = '▶ Play Voice';
      if (uploadPlayBtn) uploadPlayBtn.innerHTML = '▶';
    };
  }

  _toggleExamplePlayback(sampleId, btn) {
    if (this.exampleAudioPlayer.src && !this.exampleAudioPlayer.paused) {
      this.exampleAudioPlayer.pause();
      btn.innerHTML = '▶ Play Example';
      return;
    }

    const sampleFiles = {
      rahul: './assets/samples/example-rahul.wav',
      suspicious: './assets/samples/example-suspicious.wav',
      processed: './assets/samples/example-ai-processed.wav'
    };

    const url = sampleFiles[sampleId] || sampleFiles.rahul;
    this.exampleAudioPlayer.src = url;
    this.exampleAudioPlayer.play().catch(e => console.warn('Audio playback error:', e));

    btn.innerHTML = '❚❚ Pause';
    this.exampleAudioPlayer.onended = () => {
      btn.innerHTML = '▶ Play Example';
    };
  }

  _updateAnalysisStage(stageIdx) {
    const stageItems = document.querySelectorAll('#analysisStagesList li');
    if (!stageItems || stageItems.length === 0) return;

    stageItems.forEach((item, idx) => {
      const icon = item.querySelector('.stage-icon');
      if (idx < stageIdx) {
        item.className = 'stage-item completed';
        if (icon) icon.innerHTML = '✓';
      } else if (idx === stageIdx) {
        item.className = 'stage-item in-progress';
        if (icon) icon.innerHTML = '<div class="stage-spinner"></div>';
      } else {
        item.className = 'stage-item';
        if (icon) icon.innerHTML = '○';
      }
    });
  }

  _completeAllAnalysisStages() {
    const stageItems = document.querySelectorAll('#analysisStagesList li');
    if (!stageItems) return;
    stageItems.forEach(item => {
      item.className = 'stage-item completed';
      const icon = item.querySelector('.stage-icon');
      if (icon) icon.innerHTML = '✓';
    });
  }

  async _analyzeExample(sampleId) {
    this._showAnalysisOverlay();
    this._updateAnalysisStage(0);

    try {
      const result = await VoiceShieldAPI.analyzeDemo(sampleId, (stageIdx) => {
        this._updateAnalysisStage(stageIdx);
      });
      result.is_benchmark = true;
      result.source_type = 'benchmark';
      result.filename = `test_benchmark_${sampleId}.wav`;
      this._completeAllAnalysisStages();
      await new Promise(r => setTimeout(r, 120));
      this._hideAnalysisOverlay();
      this.onAnalysisComplete(result, result.filename, true);
    } catch (err) {
      this._hideAnalysisOverlay();
      toast.show(`Analysis failed: ${err.message}`, 'error');
    }
  }

  async startAnalysis() {
    if (!this.currentBlob) {
      toast.show('Please record or select an audio file first.', 'warning');
      return;
    }

    this._showAnalysisOverlay();
    this._updateAnalysisStage(0);

    try {
      const effectiveFilename = this.currentFilename || 'microphone_recording.wav';
      const result = await VoiceShieldAPI.analyzeVoice(
        this.currentBlob,
        effectiveFilename,
        this.sampleHint,
        (stageIdx) => {
          this._updateAnalysisStage(stageIdx);
        }
      );
      result.is_benchmark = false;
      result.source_type = this.currentSourceType || (this.currentFilename ? 'upload' : 'microphone');
      this._completeAllAnalysisStages();
      await new Promise(r => setTimeout(r, 120));
      this._hideAnalysisOverlay();
      this.onAnalysisComplete(result, effectiveFilename, false);
      // Auto-scroll to results panel so the user sees the analysis output
      const resultContainer = document.getElementById('resultContainer');
      if (resultContainer) {
        setTimeout(() => resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
      }
      // Notify user result is ready
      const verdictShort = result.status === 'success' ? (result.verdict || 'Analysis Complete') : 'Analysis complete — scroll down to view';
      toast.show(`✅ ${verdictShort} — scroll down to view results`, 'success', 4000);
    } catch (err) {
      this._hideAnalysisOverlay();
      toast.show(`Analysis error: ${err.message || 'Verification failed'}`, 'error');
    }
  }

  _showAnalysisOverlay() {
    const overlay = document.getElementById('analysisOverlay');
    if (overlay) {
      overlay.classList.add('is-active');
      const canvas = document.getElementById('analysisWaveformCanvas');
      if (canvas && !this.scanVisualizer) {
        this.scanVisualizer = new WaveformVisualizer(canvas);
      }
      if (this.scanVisualizer) {
        this.scanVisualizer.startSyntheticScan();
      }
    }
  }

  _hideAnalysisOverlay() {
    const overlay = document.getElementById('analysisOverlay');
    if (overlay) {
      overlay.classList.remove('is-active');
    }
    if (this.scanVisualizer) {
      this.scanVisualizer.stop();
    }
  }

  async _runMicrophoneTest() {
    const resultBox = document.getElementById('micTestResultBox');
    if (resultBox) {
      resultBox.style.display = 'block';
      resultBox.className = 'status-box status-loading';
      resultBox.innerHTML = '<div class="spinner-inline"></div> Listening to microphone for 2 seconds...';
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const res = await VoiceShieldAPI.testMicrophone(blob);

        if (resultBox) {
          if (res.status === 'detected') {
            resultBox.className = 'status-box status-success';
            resultBox.innerHTML = `<strong>${res.title}</strong><p>${res.message}</p><small>Input volume: ${res.audio_level}%</small>`;
          } else if (res.status === 'no_voice') {
            resultBox.className = 'status-box status-warning';
            resultBox.innerHTML = `<strong>${res.title}</strong><p>${res.message}</p>`;
          } else {
            resultBox.className = 'status-box status-error';
            resultBox.innerHTML = `<strong>${res.title}</strong><p>${res.message}</p>`;
          }
        }
      };

      recorder.start();
      setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 2000);

    } catch (e) {
      if (resultBox) {
        resultBox.className = 'status-box status-error';
        resultBox.innerHTML = `<strong>⚠️ Microphone Access Denied</strong><p>${e.message || 'Please permit microphone permissions in browser.'}</p>`;
      }
    }
  }

  switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const isTarget = btn.getAttribute('data-tab') === tabName;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    const livePane = document.getElementById('tabPaneLive');
    const uploadPane = document.getElementById('tabPaneUpload');
    const liveGuardPane = document.getElementById('tabPaneLiveGuard');

    if (livePane) livePane.classList.toggle('active', tabName === 'live');
    if (uploadPane) uploadPane.classList.toggle('active', tabName === 'upload');
    if (liveGuardPane) liveGuardPane.classList.toggle('active', tabName === 'liveguard');
  }

  reset() {
    this._resetRecordingUI();
    this._resetUploadUI();
  }
}
