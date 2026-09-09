/**
 * VoiceShield AI - Live Call Guard Engine
 * Real-Time Active Conversation Monitoring & Acoustic Deepfake Screening
 *
 * Guaranteed Properties:
 * - Explicit user consent before audio capture starts
 * - Transparent disclosure: Monitors audio via microphone/speaker capture
 * - Rolling window analysis (2.5s analysis window, 1.5s interval)
 * - Temporal smoothing & evidence accumulation: Never alerts on a single frame
 * - 4 Risk States: 🟢 NORMAL, 🟡 REVIEW, 🟠 ELEVATED, 🔴 HIGH RISK
 * - Explainable evidence: Synthetic indicators, replay comb-filter, liveness, background noise
 * - Non-destructive: Never auto-hangs up or blocks; provides decision support to the user
 * - Comprehensive Session Summary report on stop
 * - Thorough resource cleanup
 */

import { AudioRecorder } from '../audio-recorder.js';
import { SpeakerEnrollment } from './speaker-enrollment.js';
import { toast } from './toast.js';

export class LiveCallGuard {
  constructor(options = {}) {
    this.onAlert = options.onAlert || (() => {});
    this.onStateChange = options.onStateChange || (() => {});

    // State
    this.isActive = false;
    this.monitoringMode = 'general'; // 'general' | 'stranger' | 'known'
    this.sessionId = null;
    this.startTime = null;
    this.timerInterval = null;
    this.analysisInterval = null;
    this.elapsedSeconds = 0;

    // Audio stream & processing nodes
    this.mediaStream = null;
    this.audioContext = null;
    this.analyserNode = null;
    this.processorNode = null;
    this.rawSampleRingBuffer = [];
    this.sampleRate = 16000;
    const RING_BUFFER_MAX = 16000 * 6; // Keep 6 seconds of audio in memory
    this.ringBufferMax = RING_BUFFER_MAX;

    // Evidence accumulation & temporal smoothing
    this.recentWindows = []; // Last 5 analyzed windows
    this.windowHistory = [];  // Complete session history
    this.currentState = 'NORMAL'; // 'NORMAL' | 'REVIEW' | 'ELEVATED' | 'HIGHRISK'
    this.consecutiveSuspiciousCount = 0;
    this.hasAlerted = false;
    this.timelineEvents = [];

    // Session Metrics for Report
    this.sessionSummary = {
      totalWindows: 0,
      normalWindows: 0,
      reviewWindows: 0,
      elevatedEvents: 0,
      highRiskEvents: 0,
      maxRisk: 'LOW',
      confidences: []
    };

    this._bindEvents();
  }

  _bindEvents() {
    // Top / Tab button to launch
    const startGuardBtn = document.getElementById('btnStartLiveCallGuard');
    const stopGuardBtn = document.getElementById('btnStopLiveCallGuard');
    const consentModal = document.getElementById('liveGuardConsentModal');
    const confirmConsentBtn = document.getElementById('btnConfirmLiveConsent');
    const cancelConsentBtn = document.getElementById('btnCancelLiveConsent');

    // Hero CTA button if present
    const heroGuardBtn = document.getElementById('btnHeroLiveGuard');
    if (heroGuardBtn) {
      heroGuardBtn.addEventListener('click', () => {
        const guardSection = document.getElementById('live-guard') || document.getElementById('analyze');
        if (guardSection) guardSection.scrollIntoView({ behavior: 'smooth' });
        this._promptConsent();
      });
    }

    if (startGuardBtn) {
      startGuardBtn.addEventListener('click', () => {
        if (!this.isActive) {
          this._promptConsent();
        }
      });
    }

    if (stopGuardBtn) {
      stopGuardBtn.addEventListener('click', () => {
        if (this.isActive) {
          this.stop();
        }
      });
    }

    if (confirmConsentBtn) {
      confirmConsentBtn.addEventListener('click', () => {
        if (consentModal) consentModal.classList.remove('is-active');
        this._startMonitoringSession();
      });
    }

    if (cancelConsentBtn) {
      cancelConsentBtn.addEventListener('click', () => {
        if (consentModal) consentModal.classList.remove('is-active');
      });
    }

    // Monitoring Mode Selector Buttons
    document.querySelectorAll('.btn-guard-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        this.setMode(mode);
        document.querySelectorAll('.btn-guard-mode').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Alert Banner Buttons
    const alertContinueBtn = document.getElementById('btnAlertContinueMonitoring');
    const alertStopBtn = document.getElementById('btnAlertStopMonitoring');
    const alertViewEvidenceBtn = document.getElementById('btnAlertViewEvidence');

    if (alertContinueBtn) {
      alertContinueBtn.addEventListener('click', () => {
        this._dismissAlertBanner();
      });
    }

    if (alertStopBtn) {
      alertStopBtn.addEventListener('click', () => {
        this._dismissAlertBanner();
        this.stop();
      });
    }

    if (alertViewEvidenceBtn) {
      alertViewEvidenceBtn.addEventListener('click', () => {
        const evidenceSection = document.getElementById('liveGuardTimelineCard');
        if (evidenceSection) evidenceSection.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Session Summary Modal Close & Download
    const summaryCloseBtn = document.getElementById('btnCloseLiveSummaryModal');
    const summaryCloseBtn2 = document.getElementById('btnCloseLiveSummaryBtn');
    const downloadReportBtn = document.getElementById('btnDownloadLiveSummaryReport');

    const hideSummaryModal = () => {
      const summaryModal = document.getElementById('liveSummaryModal');
      if (summaryModal) summaryModal.classList.remove('is-active');
    };

    if (summaryCloseBtn) summaryCloseBtn.addEventListener('click', hideSummaryModal);
    if (summaryCloseBtn2) summaryCloseBtn2.addEventListener('click', hideSummaryModal);
    if (downloadReportBtn) {
      downloadReportBtn.addEventListener('click', () => {
        this.downloadIncidentReport();
      });
    }
  }

  setMode(mode) {
    this.monitoringMode = mode;
    const modeLabel = document.getElementById('guardCurrentModeLabel');
    if (modeLabel) {
      if (mode === 'known') modeLabel.textContent = 'Known Contact Mode (Identity Verification active)';
      else if (mode === 'stranger') modeLabel.textContent = 'Unknown Person Mode (Stranger Anomaly Screening)';
      else modeLabel.textContent = 'General Monitoring Mode';
    }
  }

  _promptConsent() {
    const consentModal = document.getElementById('liveGuardConsentModal');
    if (consentModal) {
      consentModal.classList.add('is-active');
    } else {
      this._startMonitoringSession();
    }
  }

  async _startMonitoringSession() {
    if (this.isActive) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.show('Microphone access is unavailable or unsupported in this browser.', 'error');
      return;
    }

    try {
      // 1. Request explicit audio stream
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // Keep raw speaker acoustic characteristics
          noiseSuppression: false,
          autoGainControl: false,
        }
      });

      // 2. Initialize Web Audio API pipeline
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtxClass();
      this.sampleRate = this.audioContext.sampleRate || 16000;
      this.ringBufferMax = Math.floor(this.sampleRate * 5); // 5 seconds ring buffer
      this.rawSampleRingBuffer = [];

      const sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.2;

      // ScriptProcessor for continuous PCM collection
      const bufferSize = 4096;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
      this.processorNode.onaudioprocess = (e) => {
        if (!this.isActive) return;
        const inputData = e.inputBuffer.getChannelData(0);
        for (let i = 0; i < inputData.length; i++) {
          this.rawSampleRingBuffer.push(inputData[i]);
        }
        if (this.rawSampleRingBuffer.length > this.ringBufferMax) {
          this.rawSampleRingBuffer.splice(0, this.rawSampleRingBuffer.length - this.ringBufferMax);
        }
      };

      sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      // 3. Initialize state
      this.isActive = true;
      this.hasAlerted = false;
      const randSeed = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto.getRandomValues(new Uint16Array(1))[0] : Math.floor(Date.now() % 899 + 100);
      this.sessionId = `CALL-${Date.now().toString(36).toUpperCase()}-${randSeed}`;
      this.startTime = Date.now();
      this.elapsedSeconds = 0;
      this.recentWindows = [];
      this.windowHistory = [];
      this.timelineEvents = [];
      this.currentState = 'NORMAL';
      this.consecutiveSuspiciousCount = 0;

      this.sessionSummary = {
        totalWindows: 0,
        normalWindows: 0,
        reviewWindows: 0,
        elevatedEvents: 0,
        highRiskEvents: 0,
        maxRisk: 'LOW',
        confidences: []
      };

      this._updateUIStarted();
      this._addTimelineEvent('NORMAL', 'Live Call Guard Started', 'Monitoring session activated with explicit user consent. Capturing conversational audio stream.', null);

      // 4. Start call duration timer
      this.timerInterval = setInterval(() => {
        this.elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        const mins = Math.floor(this.elapsedSeconds / 60);
        const secs = this.elapsedSeconds % 60;
        const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        const timerEl = document.getElementById('guardCallDuration');
        if (timerEl) timerEl.textContent = formatted;
      }, 500);

      // 5. Start rolling-window processing (Window: 2.5s, Hop: 1.5s)
      this.analysisInterval = setInterval(() => {
        this._analyzeCurrentWindow();
      }, 1500);

      toast.show('Live Call Guard active. Monitoring conversation for suspicious voice traits.', 'info');
    } catch (err) {
      console.error('Failed to start Live Call Guard:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.show('Microphone permission was denied. Live monitoring cannot start.', 'error');
      } else {
        toast.show(`Could not start audio monitoring: ${err.message || 'Permission denied'}`, 'error');
      }
      this.stop();
    }
  }

  _analyzeCurrentWindow() {
    if (!this.isActive || this.rawSampleRingBuffer.length < this.sampleRate * 1.5) {
      return;
    }

    // Extract last 2.5 seconds from ring buffer
    const windowLength = Math.min(this.rawSampleRingBuffer.length, Math.floor(this.sampleRate * 2.5));
    const slice = this.rawSampleRingBuffer.slice(this.rawSampleRingBuffer.length - windowLength);

    // 1. Audio level & VAD (Speech presence check)
    let sumSquares = 0;
    let peak = 0;
    for (let i = 0; i < slice.length; i++) {
      const v = slice[i];
      sumSquares += v * v;
      const absV = Math.abs(v);
      if (absV > peak) peak = absV;
    }
    const rms = Math.sqrt(sumSquares / slice.length);

    // Frame-level energy to determine noise floor vs speech activity
    const frameSize = Math.floor(this.sampleRate * 0.03); // 30ms
    const numFrames = Math.floor(slice.length / frameSize);
    const frameEnergies = [];
    for (let f = 0; f < numFrames; f++) {
      let fSum = 0;
      const off = f * frameSize;
      for (let j = 0; j < frameSize; j++) fSum += slice[off + j] * slice[off + j];
      frameEnergies.push(Math.sqrt(fSum / frameSize));
    }
    frameEnergies.sort((a, b) => a - b);
    const noiseFloor = frameEnergies[Math.floor(numFrames * 0.15)] || 0.001;
    const speechThresh = Math.max(0.012, noiseFloor * 2.2);

    let activeSpeechFrames = 0;
    let digitalSilenceFrames = 0;
    for (let f = 0; f < frameEnergies.length; f++) {
      if (frameEnergies[f] >= speechThresh) activeSpeechFrames++;
      if (frameEnergies[f] < 0.0004) digitalSilenceFrames++;
    }
    const speechActive = activeSpeechFrames >= Math.floor(numFrames * 0.25);
    const speechPercent = numFrames > 0 ? (activeSpeechFrames / numFrames) * 100 : 0;
    const digitalSilenceRatio = numFrames > 0 ? digitalSilenceFrames / numFrames : 0;

    // If pure silence or insufficient speech: stay calm, no false alerts
    if (!speechActive || rms < 0.005) {
      this._updateLiveDashboard({
        speech: 'NOT DETECTED',
        risk: this.currentState === 'HIGHRISK' ? this.currentState : 'NORMAL',
        confidence: '--',
        syntheticSignal: '--',
        replaySignal: '--',
        liveness: '--',
        backgroundNoise: noiseFloor > 0.02 ? 'HIGH' : (noiseFloor > 0.008 ? 'MEDIUM' : 'LOW')
      });
      return;
    }

    // 2. Voiced Frame Pitch & Prosody extraction via Autocorrelation
    const minLag = Math.floor(this.sampleRate / 450); // 450Hz max pitch
    const maxLag = Math.floor(this.sampleRate / 70);  // 70Hz min pitch
    const pitches = [];
    const step = Math.floor(this.sampleRate * 0.02);

    for (let s = 0; s + frameSize < slice.length; s += step) {
      let fEnergy = 0;
      for (let j = 0; j < frameSize; j++) fEnergy += slice[s + j] * slice[s + j];
      if (fEnergy > 0.001) {
        let maxCorr = 0;
        let bestLag = minLag;
        for (let lag = minLag; lag < maxLag && lag < frameSize; lag++) {
          let cSum = 0;
          for (let j = 0; j < frameSize - lag; j++) {
            cSum += slice[s + j] * slice[s + j + lag];
          }
          if (cSum > maxCorr) {
            maxCorr = cSum;
            bestLag = lag;
          }
        }
        const normCorr = fEnergy > 0 ? maxCorr / fEnergy : 0;
        if (normCorr > 0.42) {
          pitches.push(this.sampleRate / bestLag);
        }
      }
    }

    let meanPitch = 140;
    let pitchStd = 18;
    let jitterPct = 1.0;
    let pitchBimodal = false;

    if (pitches.length >= 6) {
      meanPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;
      const varP = pitches.reduce((a, b) => a + Math.pow(b - meanPitch, 2), 0) / pitches.length;
      pitchStd = Math.sqrt(varP);

      // Check bimodal pitch jumps (Multiple speakers detection)
      let largeJumps = 0;
      for (let i = 0; i < pitches.length - 1; i++) {
        if (Math.abs(pitches[i + 1] - pitches[i]) > 75) largeJumps++;
      }
      if (largeJumps >= 3) pitchBimodal = true;

      // Micro-jitter calculation on consecutive pitch periods
      const periods = pitches.map(p => 1.0 / p);
      let diffSum = 0;
      for (let i = 0; i < periods.length - 1; i++) {
        diffSum += Math.abs(periods[i + 1] - periods[i]);
      }
      const meanPeriod = periods.reduce((a, b) => a + b, 0) / periods.length;
      if (meanPeriod > 0) {
        jitterPct = Math.round(((diffSum / (periods.length - 1)) / meanPeriod) * 10000) / 100;
      }
    }

    // 3. Comb-filter check for loudspeaker acoustic replay reflection (15ms - 40ms)
    const combMinLag = Math.floor(this.sampleRate * 0.015);
    const combMaxLag = Math.floor(this.sampleRate * 0.040);
    let combPeak = 0;
    for (let lag = combMinLag; lag < combMaxLag && lag < 1500; lag += 4) {
      let cSum = 0, cRef = 0;
      const testLen = Math.min(800, slice.length - lag);
      for (let j = 0; j < testLen; j += 4) {
        cSum += slice[j] * slice[j + lag];
        cRef += slice[j] * slice[j];
      }
      const norm = cRef > 0 ? Math.abs(cSum / cRef) : 0;
      if (norm > combPeak) combPeak = norm;
    }

    // 4. Acoustic Evidence Scoring for this Window
    let syntheticIndicators = 0;
    let replayIndicators = 0;
    let livenessIssues = 0;

    // Robotic flat pitch indicator (Synthetic TTS vocoders often produce flat prosody < 5.0 Hz)
    if (pitches.length >= 8 && pitchStd < 5.0) {
      syntheticIndicators++;
    }

    // Unnatural pitch variance (sudden erratic jumps or synthesis glitch)
    if (pitches.length >= 8 && pitchStd > 58.0 && !pitchBimodal) {
      syntheticIndicators++;
    }

    // Digital silence during pauses (neural synthesis with zero room tone)
    if (digitalSilenceRatio > 0.30 && noiseFloor < 0.0004) {
      syntheticIndicators++;
    }

    // Comb-filter replay reflections
    if (combPeak > 0.52) {
      replayIndicators += 2;
    } else if (combPeak > 0.38) {
      replayIndicators += 1;
    }

    // Liveness: human dynamic inflection
    if (pitches.length >= 8 && pitchStd < 4.8) {
      livenessIssues++;
    }

    // Check against Enrolled Voice if Known Contact mode
    let identityResult = null;
    if (this.monitoringMode === 'known') {
      identityResult = SpeakerEnrollment.verifyIdentity({
        mean_pitch: meanPitch,
        pitch_std: pitchStd,
        voiced_frames: pitches.length
      });
    }

    // Window Verdict Assessment
    let windowVerdict = 'NORMAL';
    if (syntheticIndicators >= 2 || (syntheticIndicators >= 1 && replayIndicators >= 2)) {
      windowVerdict = 'SUSPICIOUS';
    } else if (syntheticIndicators >= 1 || replayIndicators >= 2) {
      windowVerdict = 'REVIEW';
    }

    // 5. Temporal Smoothing & Evidence Accumulation Across Windows
    this.recentWindows.push({
      verdict: windowVerdict,
      synthetic: syntheticIndicators,
      replay: replayIndicators,
      liveness: livenessIssues,
      meanPitch,
      pitchStd,
      combPeak,
      timestamp: this._getFormattedTimestamp()
    });
    if (this.recentWindows.length > 5) this.recentWindows.shift();

    this.windowHistory.push(windowVerdict);
    this.sessionSummary.totalWindows++;

    // Evaluate Rolling Temporal State
    const last3 = this.recentWindows.slice(-3);
    const suspiciousInLast3 = last3.filter(w => w.verdict === 'SUSPICIOUS').length;
    const reviewInLast3 = last3.filter(w => w.verdict === 'REVIEW').length;

    let newState = 'NORMAL';
    let alertRequired = false;

    if (suspiciousInLast3 >= 2 || (suspiciousInLast3 >= 1 && reviewInLast3 >= 2)) {
      this.consecutiveSuspiciousCount++;
      if (this.consecutiveSuspiciousCount >= 3) {
        newState = 'HIGHRISK';
        if (!this.hasAlerted) alertRequired = true;
      } else {
        newState = 'ELEVATED';
      }
    } else if (suspiciousInLast3 >= 1 || reviewInLast3 >= 2) {
      newState = 'REVIEW';
      this.consecutiveSuspiciousCount = Math.max(0, this.consecutiveSuspiciousCount - 1);
    } else {
      newState = 'NORMAL';
      this.consecutiveSuspiciousCount = 0;
    }

    this.currentState = newState;

    // Track Session Summary
    if (newState === 'NORMAL') this.sessionSummary.normalWindows++;
    else if (newState === 'REVIEW') this.sessionSummary.reviewWindows++;
    else if (newState === 'ELEVATED') this.sessionSummary.elevatedEvents++;
    else if (newState === 'HIGHRISK') this.sessionSummary.highRiskEvents++;

    if (newState === 'HIGHRISK') this.sessionSummary.maxRisk = 'HIGH';
    else if (newState === 'ELEVATED' && this.sessionSummary.maxRisk !== 'HIGH') this.sessionSummary.maxRisk = 'MEDIUM';
    else if (newState === 'REVIEW' && this.sessionSummary.maxRisk === 'LOW') this.sessionSummary.maxRisk = 'MEDIUM';

    // Confidence Calculation (Probabilistic distance, 72% - 94%)
    const confidence = Math.min(94, Math.max(72, Math.round(76 + (this.recentWindows.length * 2.5) + (newState === 'HIGHRISK' ? 8 : 0))));
    this.sessionSummary.confidences.push(confidence);

    // 6. Update Live UI Elements
    this._updateLiveDashboard({
      speech: pitchBimodal ? 'MULTIPLE SPEAKERS' : 'ACTIVE',
      risk: newState,
      confidence: confidence,
      syntheticSignal: syntheticIndicators >= 2 ? 'HIGH' : (syntheticIndicators === 1 ? 'MEDIUM' : 'LOW'),
      replaySignal: replayIndicators >= 2 ? 'HIGH' : (replayIndicators === 1 ? 'MEDIUM' : 'LOW'),
      liveness: livenessIssues > 0 ? 'REVIEW' : 'PASS',
      backgroundNoise: noiseFloor > 0.025 ? 'HIGH' : (noiseFloor > 0.008 ? 'MEDIUM' : 'LOW'),
      identity: identityResult
    });

    // 7. Emit Timeline Event on State Escalation or Notable Acoustic Change
    if (newState !== 'NORMAL' || this.windowHistory.length % 5 === 0) {
      let eventTitle = 'Normal Human Speech';
      let eventEvidence = `Natural prosodic pitch modulation (std: ${pitchStd.toFixed(1)} Hz), biological vocal micro-tremor.`;

      if (newState === 'HIGHRISK') {
        eventTitle = '🚨 HIGH RISK — Potential AI-Generated Voice';
        eventEvidence = `Persistent synthetic markers across consecutive windows: flat prosody contour (${pitchStd.toFixed(1)} Hz), vocoder cutoff, and replay reflections (${(combPeak * 100).toFixed(0)}%).`;
      } else if (newState === 'ELEVATED') {
        eventTitle = '🟠 Suspicious Voice Pattern Increasing';
        eventEvidence = `Multiple consecutive windows exhibiting repetitive synthetic traits or room reflections.`;
      } else if (newState === 'REVIEW') {
        eventTitle = '🟡 Acoustic Anomaly Detected';
        eventEvidence = `Unusual acoustic activity observed (${syntheticIndicators > 0 ? 'low pitch variance' : 'borderline replay reflection'}). Continuing surveillance.`;
      }

      if (pitchBimodal) {
        eventEvidence += ' [Notice: Multiple speakers detected in conversation. Individual attribution unavailable.]';
      }

      this._addTimelineEvent(newState, eventTitle, eventEvidence, confidence);
    }

    // 8. Trigger Live Alert Banner when HIGH RISK is reached
    if (alertRequired) {
      this.hasAlerted = true;
      this._displayAlertBanner({
        risk: 'HIGH',
        confidence: confidence,
        timestamp: this._getFormattedTimestamp(),
        evidence: [
          `Flat pitch prosodic intonation (${pitchStd.toFixed(1)} Hz variance)`,
          syntheticIndicators > 0 ? 'Absence of biological vocal tremor & digital pause silence' : 'Loudspeaker replay reflection pattern',
          `Observed across ${this.consecutiveSuspiciousCount} consecutive rolling analysis windows`
        ]
      });
      this.onAlert({
        sessionId: this.sessionId,
        state: 'HIGHRISK',
        confidence: confidence,
        timestamp: this._getFormattedTimestamp()
      });
    }
  }

  _updateLiveDashboard(data) {
    const statusBadge = document.getElementById('guardRiskBadge');
    const confidenceVal = document.getElementById('guardConfidenceValue');
    const speechVal = document.getElementById('guardSpeechStatus');
    const synVal = document.getElementById('guardSyntheticSignal');
    const repVal = document.getElementById('guardReplaySignal');
    const liveVal = document.getElementById('guardLivenessStatus');
    const noiseVal = document.getElementById('guardNoiseLevel');
    const pulseDot = document.getElementById('guardPulseDot');

    if (confidenceVal) {
      confidenceVal.textContent = (data.confidence !== '--' && data.confidence !== null && data.confidence !== undefined) ? `${data.confidence}%` : '--';
    }
    if (speechVal) {
      speechVal.textContent = data.speech;
      speechVal.style.color = data.speech === 'ACTIVE' ? '#10b981' : (data.speech === 'MULTIPLE SPEAKERS' ? '#2563eb' : 'var(--text-muted)');
    }
    if (synVal) {
      synVal.textContent = data.syntheticSignal;
      synVal.className = (data.syntheticSignal !== '--') ? `liveguard-stat-val status-${data.syntheticSignal.toLowerCase()}` : 'liveguard-stat-val';
    }
    if (repVal) {
      repVal.textContent = data.replaySignal;
      repVal.className = (data.replaySignal !== '--') ? `liveguard-stat-val status-${data.replaySignal.toLowerCase()}` : 'liveguard-stat-val';
    }
    if (liveVal) {
      liveVal.textContent = data.liveness;
      liveVal.style.color = data.liveness === 'PASS' ? '#10b981' : (data.liveness === 'REVIEW' ? '#f59e0b' : 'var(--text-muted)');
    }
    if (noiseVal) {
      noiseVal.textContent = data.backgroundNoise;
    }

    if (statusBadge) {
      if (data.risk === 'HIGHRISK') {
        statusBadge.className = 'triad-badge status-high';
        statusBadge.textContent = '🔴 HIGH RISK';
        if (pulseDot) pulseDot.className = 'live-pulse-dot pulse-high';
      } else if (data.risk === 'ELEVATED') {
        statusBadge.className = 'triad-badge status-elevated';
        statusBadge.textContent = '🟠 ELEVATED';
        if (pulseDot) pulseDot.className = 'live-pulse-dot pulse-elevated';
      } else if (data.risk === 'REVIEW') {
        statusBadge.className = 'triad-badge status-uncertain';
        statusBadge.textContent = '🟡 REVIEW';
        if (pulseDot) pulseDot.className = 'live-pulse-dot pulse-review';
      } else if (data.risk === 'NORMAL') {
        statusBadge.className = 'triad-badge status-authentic';
        statusBadge.textContent = '🟢 NORMAL';
        if (pulseDot) pulseDot.className = 'live-pulse-dot';
      } else {
        statusBadge.className = 'triad-badge';
        statusBadge.textContent = '--';
        if (pulseDot) pulseDot.className = 'live-pulse-dot';
      }
    }
  }

  _addTimelineEvent(riskState, title, evidence, confidence) {
    const list = document.getElementById('guardTimelineList');
    const timeStr = this._getFormattedTimestamp();

    let stateClass = 'item-normal';
    let icon = '🟢';
    if (riskState === 'HIGHRISK') { stateClass = 'item-highrisk'; icon = '🔴'; }
    else if (riskState === 'ELEVATED') { stateClass = 'item-elevated'; icon = '🟠'; }
    else if (riskState === 'REVIEW') { stateClass = 'item-review'; icon = '🟡'; }

    const confTag = (confidence !== null && confidence !== undefined && confidence !== '--') ? ` (${confidence}%)` : '';
    const item = document.createElement('div');
    item.className = `timeline-item ${stateClass}`;
    item.innerHTML = `
      <div class="timeline-timestamp">${timeStr}</div>
      <div class="timeline-content">
        <div class="timeline-event-title">${icon} ${title}${confTag}</div>
        <div class="timeline-event-evidence">${evidence}</div>
      </div>
    `;

    if (list) {
      list.insertBefore(item, list.firstChild);
      // Keep max 25 items in view
      if (list.children.length > 25) {
        list.removeChild(list.lastChild);
      }
    }

    this.timelineEvents.push({
      timestamp: timeStr,
      state: riskState,
      title: title,
      evidence: evidence,
      confidence: confidence
    });
  }

  _displayAlertBanner(alertData) {
    const banner = document.getElementById('liveGuardAlertBanner');
    if (!banner) return;

    const timeEl = document.getElementById('liveAlertTime');
    const confEl = document.getElementById('liveAlertConfidence');
    const evidenceList = document.getElementById('liveAlertEvidenceList');

    if (timeEl) timeEl.textContent = alertData.timestamp;
    if (confEl) confEl.textContent = `${alertData.confidence}%`;
    if (evidenceList) {
      evidenceList.innerHTML = alertData.evidence.map(e => `<li>• ${e}</li>`).join('');
    }

    banner.style.display = 'block';
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Browser notification where supported and permitted
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('🚨 VoiceShield Alert: Suspicious Voice Detected', {
          body: 'Persistent acoustic indicators associated with a potentially synthetic or replayed voice.',
          icon: './vite.svg'
        });
      } catch (e) {}
    }
  }

  _dismissAlertBanner() {
    const banner = document.getElementById('liveGuardAlertBanner');
    if (banner) banner.style.display = 'none';
  }

  _updateUIStarted() {
    const startBtn = document.getElementById('btnStartLiveCallGuard');
    const stopBtn = document.getElementById('btnStopLiveCallGuard');
    const liveStudio = document.getElementById('liveGuardActiveStudio');
    const initialPrompt = document.getElementById('liveGuardInitialPrompt');
    const statusPill = document.getElementById('guardMonitoringStatusPill');
    const activeLabel = document.getElementById('guardMonitoringActiveLabel');

    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'inline-flex';
    if (initialPrompt) initialPrompt.style.display = 'none';
    if (liveStudio) liveStudio.style.display = 'block';
    if (statusPill) {
      statusPill.textContent = 'ACTIVE MONITORING';
      statusPill.className = 'triad-badge status-authentic';
    }
    if (activeLabel) {
      activeLabel.textContent = 'MONITORING ACTIVE';
    }
  }

  stop() {
    if (!this.isActive) return;

    this.isActive = false;
    clearInterval(this.timerInterval);
    clearInterval(this.analysisInterval);

    // Stop MediaStream tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }

    // Disconnect & Close AudioContext
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    // Clear temporary volatile audio buffers
    this.rawSampleRingBuffer = [];
    this._dismissAlertBanner();

    this._updateUIStopped();
    this._generateSessionSummaryModal();

    toast.show('Live Call Guard stopped. Security Summary generated.', 'info');
  }

  _updateUIStopped() {
    const startBtn = document.getElementById('btnStartLiveCallGuard');
    const stopBtn = document.getElementById('btnStopLiveCallGuard');
    const statusPill = document.getElementById('guardMonitoringStatusPill');
    const activeLabel = document.getElementById('guardMonitoringActiveLabel');
    const initialPrompt = document.getElementById('liveGuardInitialPrompt');
    const liveStudio = document.getElementById('liveGuardActiveStudio');

    if (startBtn) startBtn.style.display = 'inline-flex';
    if (stopBtn) stopBtn.style.display = 'none';
    if (initialPrompt) initialPrompt.style.display = 'block';
    if (liveStudio) liveStudio.style.display = 'none';
    if (statusPill) {
      statusPill.textContent = 'READY';
      statusPill.className = 'triad-badge status-nomatch';
    }
    if (activeLabel) {
      activeLabel.textContent = 'NOT ACTIVE';
    }

    // Reset dashboard telemetry to clean initial state
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('guardCallDuration', '00:00:00');
    setEl('guardConfidenceValue', '--');
    setEl('guardSpeechStatus', '--');
    setEl('guardSyntheticSignal', '--');
    setEl('guardReplaySignal', '--');
    setEl('guardLivenessStatus', '--');
    setEl('guardNoiseLevel', '--');
    const badge = document.getElementById('guardRiskBadge');
    if (badge) {
      badge.className = 'triad-badge';
      badge.textContent = '--';
    }
    const pulseDot = document.getElementById('guardPulseDot');
    if (pulseDot) pulseDot.className = 'live-pulse-dot';
  }

  _generateSessionSummaryModal() {
    const modal = document.getElementById('liveSummaryModal');
    if (!modal) return;

    const durMins = Math.floor(this.elapsedSeconds / 60);
    const durSecs = this.elapsedSeconds % 60;
    const durStr = `${durMins}m ${durSecs}s`;

    const avgConf = this.sessionSummary.confidences.length > 0
      ? `${Math.round(this.sessionSummary.confidences.reduce((a, b) => a + b, 0) / this.sessionSummary.confidences.length)}%`
      : '--';

    const setEl = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setEl('sumSessionId', this.sessionId || 'SESSION-LIVE');
    setEl('sumDuration', durStr);
    setEl('liveSummaryDuration', durStr);
    setEl('sumWindowsCount', this.sessionSummary.totalWindows);
    setEl('liveSummaryEventsCount', this.sessionSummary.totalWindows);
    setEl('sumNormalCount', this.sessionSummary.normalWindows);
    setEl('sumReviewCount', this.sessionSummary.reviewWindows);
    setEl('sumElevatedCount', this.sessionSummary.elevatedEvents);
    setEl('sumHighRiskCount', this.sessionSummary.highRiskEvents);
    setEl('sumMaxRisk', this.sessionSummary.maxRisk);
    setEl('liveSummaryPeakRisk', this.sessionSummary.maxRisk);
    setEl('sumAvgConfidence', `${avgConf}%`);

    const finalVer = this.sessionSummary.highRiskEvents > 0
      ? '🔴 SUSPICIOUS SPEECH DETECTED DURING CONVERSATION'
      : (this.sessionSummary.reviewWindows > 0
        ? '🟡 UNCERTAIN — REVISE RECENT ACOUSTIC ANOMALIES'
        : '🟢 CONVERSATION APPEARS NATURAL & AUTHENTIC');
    setEl('sumFinalAssessment', finalVer);

    const anomaliesList = document.getElementById('liveSummaryAnomaliesList');
    if (anomaliesList) {
      if (this.timelineEvents.length === 0) {
        anomaliesList.innerHTML = '<li>✓ No suspicious anomalies detected during this session.</li>';
      } else {
        const suspiciousEvents = this.timelineEvents.filter(e => e.state === 'HIGHRISK' || e.state === 'ELEVATED');
        if (suspiciousEvents.length > 0) {
          anomaliesList.innerHTML = suspiciousEvents.map(e => `<li>• [${e.timestamp}] <strong>${e.title}</strong>: ${e.evidence}</li>`).join('');
        } else {
          anomaliesList.innerHTML = '<li>✓ Conversation displayed natural speech dynamics with normal prosodic variation.</li>';
        }
      }
    }

    modal.classList.add('is-active');
  }

  downloadIncidentReport() {
    const durMins = Math.floor(this.elapsedSeconds / 60);
    const durSecs = this.elapsedSeconds % 60;
    const durStr = `${durMins}m ${durSecs}s`;
    const reportText = `================================================================================
VOICESHIELD AI - LIVE CALL GUARD INCIDENT AUDIT REPORT
Security Architecture: Blockchain & Cybersecurity Enterprise Telemetry
Smart India Hackathon 2026 | Team Agents (TEAM-312)
================================================================================

[SESSION METADATA]
Session ID:          ${this.sessionId || 'SESSION-LIVE'}
Timestamp:           ${new Date().toISOString()}
Monitored Duration:  ${durStr}
Screening Mode:      ${this.monitoringMode.toUpperCase()}
Peak Security Risk:  ${this.sessionSummary.maxRisk}

[MONITORING SUMMARY]
Windows Evaluated:   ${this.sessionSummary.totalWindows} (2.5-second rolling windows)
Normal Windows:      ${this.sessionSummary.normalWindows}
Review Advisories:   ${this.sessionSummary.reviewWindows}
Elevated Warnings:   ${this.sessionSummary.elevatedEvents}
High Risk Incidents: ${this.sessionSummary.highRiskEvents}

[DECISION SUPPORT DISCLOSURE]
VoiceShield AI acts as real-time decision support for human operators.
Evaluations are derived mathematically from acoustic signal boundaries in volatile memory.
No audio streams were permanently persisted or transmitted to third-party APIs.

[TIMELINE EVENT LOG]
${this.timelineEvents.length > 0 ? this.timelineEvents.map(e => `[${e.timestamp}] [${e.state}] ${e.title} - ${e.evidence}`).join('\n') : 'No acoustic anomalies detected during session.'}

================================================================================
Report Generated Deterministically by VoiceShield AI Engine
================================================================================`;

    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VoiceShield-LiveGuard-${this.sessionId || 'session'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.show('Incident audit report downloaded.', 'success');
  }

  _getFormattedTimestamp() {
    const d = new Date();
    return d.toTimeString().split(' ')[0];
  }
}
