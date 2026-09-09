/**
 * VoiceShield AI - Verification Component
 * Handles live voice recording, sentence prompts, microphone testing,
 * audio upload, and example demonstration voices.
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
    this.currentFilename = 'voice_sample.wav';
    this.currentDuration = 0;
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
      },
      onStateChange: (state, data) => {
        this._handleRecorderState(state, data);
      },
      onError: (errorMsg) => {
        toast.show(errorMsg, 'error', 5000);
        this._resetRecordingUI();
      }
    });

    this._bindElements();
  }

  _bindElements() {
    // 0. Tab Switcher
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) this.switchTab(tab);
      });
    });

    // 1. Large Mic Button: "Start Voice Check"
    const startCheckBtn = document.getElementById('btnStartVoiceCheck');
    if (startCheckBtn) {
      startCheckBtn.addEventListener('click', () => {
        if (this.recorder.isRecording) {
          this.recorder.stop();
        } else {
          this._startRecordingFlow();
        }
      });
    }

    // Stop Button
    const stopBtn = document.getElementById('btnStopRecording');
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        this.recorder.stop();
      });
    }

    // Play Voice Preview
    const playPreviewBtn = document.getElementById('btnPlayVoicePreview');
    if (playPreviewBtn) {
      playPreviewBtn.addEventListener('click', () => {
        this._togglePlayback();
      });
    }

    // Record Again
    const recordAgainBtn = document.getElementById('btnRecordAgain');
    if (recordAgainBtn) {
      recordAgainBtn.addEventListener('click', () => {
        this._resetRecordingUI();
      });
    }

    // Check This Voice (Primary Analysis Button)
    const checkVoiceBtn = document.getElementById('btnCheckThisVoice');
    if (checkVoiceBtn) {
      checkVoiceBtn.addEventListener('click', () => {
        this.startAnalysis();
      });
    }

    // 2. Sentence Prompt Buttons
    const copySentenceBtn = document.getElementById('btnCopySentence');
    if (copySentenceBtn) {
      copySentenceBtn.addEventListener('click', () => {
        const customInput = document.querySelector('#customSentenceBox input');
        const customBox = document.getElementById('customSentenceBox');
        let text = 'Hello, I am testing VoiceShield AI to verify this voice.';
        if (customBox && customBox.style.display !== 'none' && customInput && customInput.value.trim()) {
          text = customInput.value.trim();
        }
        navigator.clipboard.writeText(text)
          .then(() => {
            const originalHtml = copySentenceBtn.innerHTML;
            copySentenceBtn.innerHTML = '✓ Copied!';
            toast.show('Sentence copied to clipboard!', 'success');
            setTimeout(() => { copySentenceBtn.innerHTML = originalHtml; }, 2000);
          })
          .catch(() => toast.show('Failed to copy', 'warning'));
      });
    }

    const customSentenceBtn = document.getElementById('btnToggleCustomSentence');
    const promptBox = document.getElementById('sentencePromptBox');
    const customInputBox = document.getElementById('customSentenceBox');

    if (customSentenceBtn && promptBox && customInputBox) {
      customSentenceBtn.addEventListener('click', () => {
        if (customInputBox.style.display === 'none') {
          customInputBox.style.display = 'block';
          promptBox.style.display = 'none';
          customSentenceBtn.textContent = 'Use Suggested Sentence';
        } else {
          customInputBox.style.display = 'none';
          promptBox.style.display = 'block';
          customSentenceBtn.textContent = 'Use My Own Sentence';
        }
      });
    }

    // 3. Microphone Test Button
    const testMicBtn = document.getElementById('btnTestMicrophone');
    if (testMicBtn) {
      testMicBtn.addEventListener('click', () => {
        this._runMicrophoneTest();
      });
    }

    // 4. File Upload Handlers
    const dropzone = document.getElementById('uploadDropzone');
    const fileInput = document.getElementById('fileUploadInput');
    const browseBtn = document.getElementById('btnBrowseUpload');

    if (browseBtn && fileInput) {
      browseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.value = '';
        fileInput.click();
      });
    }

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
      });

      ['dragenter', 'dragover'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          dropzone.classList.add('is-dragover');
        });
      });

      ['dragleave', 'drop'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          dropzone.classList.remove('is-dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          this._handleUploadedFile(files[0]);
        }
      });

      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length > 0) {
          this._handleUploadedFile(fileInput.files[0]);
        }
      });
    }

    const changeUploadBtn = document.getElementById('btnChangeUpload');
    if (changeUploadBtn && fileInput) {
      changeUploadBtn.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
      });
    }

    const checkUploadBtn = document.getElementById('btnCheckUploadedVoice');
    if (checkUploadBtn) {
      checkUploadBtn.addEventListener('click', () => {
        this.startAnalysis();
      });
    }

    const uploadPlayBtn = document.getElementById('btnUploadPlayPause');
    if (uploadPlayBtn) {
      uploadPlayBtn.addEventListener('click', () => {
        this._togglePlayback();
      });
    }

    // 5. Example Voices (3 Example Cards)
    document.querySelectorAll('.btn-play-example').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sample = btn.getAttribute('data-sample');
        this._playExampleAudio(sample, btn);
      });
    });

    document.querySelectorAll('.btn-analyze-example').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sample = btn.getAttribute('data-sample');
        this.runDemoSample(sample);
      });
    });

    // Reset audio players on end
    this.audioPlayer.onended = () => {
      this._setPlayIcons(false);
    };

    this.exampleAudioPlayer.onended = () => {
      document.querySelectorAll('.btn-play-example').forEach(b => {
        b.innerHTML = '▶ Play Example';
      });
    };
  }

  async _startRecordingFlow() {
    this._resetRecordingUI();

    const startBtn = document.getElementById('btnStartVoiceCheck');
    const recordingPanel = document.getElementById('recordingActivePanel');
    const timerText = document.getElementById('recordTimerText');

    if (startBtn) startBtn.style.display = 'none';
    if (recordingPanel) recordingPanel.style.display = 'block';
    if (timerText) timerText.textContent = '00:00';

    const started = await this.recorder.start();
    if (!started) {
      this._resetRecordingUI();
    }
  }

  _handleRecorderState(state, data) {
    if (state === 'recording') {
      const canvas = document.getElementById('liveWaveformCanvas');
      if (canvas && data.analyser) {
        this.liveVisualizer = WaveformVisualizer.renderLiveAudio(canvas, data.analyser);
      }
    } else if (state === 'stopped') {
      if (this.liveVisualizer) {
        this.liveVisualizer.stop();
        this.liveVisualizer = null;
      }

      this.currentBlob = data.blob;
      this.currentFilename = 'recorded_voice.webm';
      this.currentDuration = data.duration;
      this.sampleHint = null;

      const recordingPanel = document.getElementById('recordingActivePanel');
      const completePanel = document.getElementById('recordingCompletePanel');
      const durationBadge = document.getElementById('recordedDurationBadge');

      if (recordingPanel) recordingPanel.style.display = 'none';
      if (completePanel) completePanel.style.display = 'block';

      const mins = Math.floor(this.currentDuration / 60);
      const secs = Math.floor(this.currentDuration % 60);
      if (durationBadge) {
        durationBadge.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }

      this.audioPlayer.src = data.url;
      toast.show('Voice captured successfully', 'success');
    }
  }

  _handleUploadedFile(file) {
    const allowed = ['wav', 'mp3', 'm4a', 'webm', 'ogg'];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      toast.show(`Unsupported file type (.${ext}). Please upload MP3, WAV, M4A, WebM, or OGG.`, 'error');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      toast.show('File is too large (max 25 MB).', 'error');
      return;
    }

    if (file.size < 100) {
      toast.show('File appears empty. Please choose a valid audio file.', 'error');
      return;
    }

    this.currentBlob = file;
    this.currentFilename = file.name;
    this.sampleHint = null;

    const fileUrl = URL.createObjectURL(file);
    this.audioPlayer.src = fileUrl;

    const preview = document.getElementById('uploadFilePreview');
    const nameEl = document.getElementById('uploadedFileName');
    const sizeEl = document.getElementById('uploadedFileSize');

    if (nameEl) nameEl.textContent = file.name;
    if (preview) {
      preview.classList.add('is-visible');
      preview.style.display = 'flex';
    }

    toast.show(`File ready: ${file.name}`, 'info');
  }

  _togglePlayback() {
    if (this.audioPlayer.paused) {
      this.audioPlayer.play()
        .then(() => this._setPlayIcons(true))
        .catch(() => toast.show('Could not play audio', 'warning'));
    } else {
      this.audioPlayer.pause();
      this._setPlayIcons(false);
    }
  }

  _setPlayIcons(isPlaying) {
    const recPlayBtn = document.getElementById('btnPlayVoicePreview');
    const uploadPlayBtn = document.getElementById('btnUploadPlayPause');

    const playText = '▶ Play Voice';
    const pauseText = '⏸ Pause';

    if (recPlayBtn) recPlayBtn.textContent = isPlaying ? pauseText : playText;
    if (uploadPlayBtn) uploadPlayBtn.textContent = isPlaying ? '⏸' : '▶';
  }

  _playExampleAudio(sampleId, btn) {
    const sampleFiles = {
      rahul: '/assets/samples/example-rahul.wav',
      suspicious: '/assets/samples/example-suspicious.wav',
      processed: '/assets/samples/example-ai-processed.wav'
    };

    const targetUrl = sampleFiles[sampleId] || sampleFiles.rahul;

    if (!this.exampleAudioPlayer.paused && this.exampleAudioPlayer.src.includes(sampleId)) {
      this.exampleAudioPlayer.pause();
      btn.innerHTML = '▶ Play Example';
    } else {
      document.querySelectorAll('.btn-play-example').forEach(b => b.innerHTML = '▶ Play Example');
      this.exampleAudioPlayer.src = targetUrl;
      this.exampleAudioPlayer.play()
        .then(() => {
          btn.innerHTML = '⏸ Pause';
        })
        .catch(() => toast.show('Could not load example audio', 'warning'));
    }
  }

  async _runMicrophoneTest() {
    toast.show('Testing microphone... Please speak for 2 seconds.', 'info');
    const statusBox = document.getElementById('micTestResultBox');
    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.innerHTML = '<span class="stage-spinner" style="display:inline-block; vertical-align:middle; margin-right:6px;"></span> Listening to microphone...';
      statusBox.className = 'status-box testing';
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const res = await VoiceShieldAPI.testMicrophone(blob);

        if (statusBox) {
          if (res.status === 'detected') {
            statusBox.className = 'status-box success';
            statusBox.innerHTML = `<strong>${res.title}</strong><br><span style="font-size:0.85rem;">${res.message}</span>`;
            toast.show('Microphone detected and working!', 'success');
          } else if (res.status === 'no_voice') {
            statusBox.className = 'status-box warning';
            statusBox.innerHTML = `<strong>${res.title}</strong><br><span style="font-size:0.85rem;">${res.message}</span>`;
            toast.show('Microphone detected, but sound was very quiet.', 'warning');
          } else {
            statusBox.className = 'status-box error';
            statusBox.innerHTML = `<strong>${res.title}</strong><br><span style="font-size:0.85rem;">${res.message}</span>`;
            toast.show('Microphone issue detected.', 'error');
          }
        }
      };

      recorder.start();
      setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, 2000);

    } catch (err) {
      if (statusBox) {
        statusBox.className = 'status-box error';
        statusBox.innerHTML = '<strong>⚠️ Microphone not detected</strong><br><span style="font-size:0.85rem;">Please allow microphone permissions in your browser.</span>';
      }
      toast.show('Microphone access was denied or device not found.', 'error');
    }
  }

  async runDemoSample(sampleId) {
    toast.show(`Checking demo example...`, 'info');
    this.sampleHint = sampleId;
    this.currentFilename = `example-${sampleId}.wav`;

    await this._runAnalysisSequence(async () => {
      return await VoiceShieldAPI.analyzeDemo(sampleId);
    });
  }

  async startAnalysis() {
    if (!this.currentBlob) {
      toast.show('Please record your voice or select an audio file first.', 'warning');
      return;
    }

    if (!this.audioPlayer.paused) {
      this.audioPlayer.pause();
      this._setPlayIcons(false);
    }

    await this._runAnalysisSequence(async () => {
      return await VoiceShieldAPI.analyzeVoice(this.currentBlob, this.currentFilename, this.sampleHint);
    });
  }

  async _runAnalysisSequence(apiCallFn) {
    const overlay = document.getElementById('analysisOverlay');
    const canvas = document.getElementById('analysisWaveformCanvas');
    const stages = document.querySelectorAll('.stage-item');

    if (overlay) overlay.classList.add('is-active');
    if (canvas) {
      this.scanVisualizer = WaveformVisualizer.renderScanningWaveform(canvas);
    }

    // Reset stages
    stages.forEach((item) => {
      item.className = 'stage-item';
      const icon = item.querySelector('.stage-icon');
      if (icon) icon.innerHTML = '○';
    });

    const updateStage = (stageIdx, state) => {
      if (!stages[stageIdx]) return;
      const item = stages[stageIdx];
      const icon = item.querySelector('.stage-icon');
      if (state === 'in-progress') {
        item.className = 'stage-item in-progress';
        if (icon) icon.innerHTML = '<div class="stage-spinner"></div>';
      } else if (state === 'completed') {
        item.className = 'stage-item completed';
        if (icon) icon.innerHTML = '✓';
      }
    };

    updateStage(0, 'completed'); // Audio received
    updateStage(1, 'completed'); // Audio quality checked
    updateStage(2, 'in-progress'); // Checking the voice

    let result = null;
    try {
      const apiPromise = apiCallFn();
      await new Promise(r => setTimeout(r, 400));
      updateStage(2, 'completed');
      updateStage(3, 'in-progress'); // Detecting synthetic patterns

      await new Promise(r => setTimeout(r, 400));
      updateStage(3, 'completed');
      updateStage(4, 'in-progress'); // Comparing voice characteristics

      result = await apiPromise;
      updateStage(4, 'completed');
      updateStage(5, 'completed'); // Risk assessment

      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      toast.show(`Analysis error: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      if (this.scanVisualizer) {
        this.scanVisualizer.stop();
        this.scanVisualizer = null;
      }
      if (overlay) overlay.classList.remove('is-active');
    }

    if (result) {
      this.onAnalysisComplete(result, this.currentFilename);
    }
  }

  _resetRecordingUI() {
    this.recorder.stop();
    this.currentBlob = null;
    this.audioPlayer.pause();
    this._setPlayIcons(false);

    const startBtn = document.getElementById('btnStartVoiceCheck');
    const recordingPanel = document.getElementById('recordingActivePanel');
    const completePanel = document.getElementById('recordingCompletePanel');

    if (startBtn) startBtn.style.display = 'inline-flex';
    if (recordingPanel) recordingPanel.style.display = 'none';
    if (completePanel) completePanel.style.display = 'none';
  }

  _resetUploadUI() {
    const preview = document.getElementById('uploadFilePreview');
    const fileInput = document.getElementById('fileUploadInput');
    if (preview) {
      preview.classList.remove('is-visible');
      preview.style.display = 'none';
    }
    if (fileInput) fileInput.value = '';
  }

  switchTab(tabName) {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const livePane = document.getElementById('tabPaneLive');
    const uploadPane = document.getElementById('tabPaneUpload');

    tabButtons.forEach(btn => {
      const isTarget = btn.getAttribute('data-tab') === tabName;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    if (livePane) livePane.classList.toggle('active', tabName === 'live');
    if (uploadPane) uploadPane.classList.toggle('active', tabName === 'upload');

    if (!this.audioPlayer.paused) {
      this.audioPlayer.pause();
      this._setPlayIcons(false);
    }
  }

  reset() {
    this._resetRecordingUI();
    this._resetUploadUI();
  }
}
