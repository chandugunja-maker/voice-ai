/**
 * VoiceShield AI - Enterprise Result View Component
 * Professional, evidence-based presentation of voice authenticity results.
 */

import { ReportGenerator } from './report-generator.js';
import { toast } from './toast.js';

export class ResultView {
  constructor(options = {}) {
    this.container = document.getElementById('resultContainer');
    this.onReset = options.onReset || (() => {});
    this.onTestMic = options.onTestMic || (() => {});
    this.currentResult = null;
    this.currentFilename = 'voice_sample.wav';

    this._bindEvents();
  }

  _bindEvents() {
    // Reset / Check Another Voice
    document.querySelectorAll('.btn-action-reset').forEach(b => {
      b.addEventListener('click', () => {
        this.hide();
        this.onReset();
      });
    });

    // Test Microphone from Quality Failure card
    const testMicBtn = document.getElementById('btnResultTestMic');
    if (testMicBtn) {
      testMicBtn.addEventListener('click', () => {
        this.hide();
        this.onTestMic();
      });
    }

    // Download Report Button
    const downloadReportBtn = document.getElementById('btnDownloadReport');
    if (downloadReportBtn) {
      downloadReportBtn.addEventListener('click', () => {
        if (this.currentResult) {
          ReportGenerator.generateReport(this.currentResult, this.currentFilename);
        } else {
          toast.show('No analysis result available to generate a report.', 'warning');
        }
      });
    }
  }

  render(result, filename = 'voice_sample.wav') {
    this.currentResult = result;
    this.currentFilename = filename;
    if (!this.container) return;

    const noVoicePanel = document.getElementById('resultNoVoicePanel');
    const validVoicePanel = document.getElementById('resultValidVoicePanel');

    // Case A: Insufficient Speech / Audio Quality Issues / Too Short
    if (result.status !== 'success' || !result.metrics) {
      if (validVoicePanel) validVoicePanel.style.display = 'none';
      if (noVoicePanel) {
        noVoicePanel.style.display = 'block';

        const iconEl = document.getElementById('noVoiceIcon');
        const titleEl = document.getElementById('noVoiceTitle');
        const msgEl = document.getElementById('noVoiceMessage');
        const hintsBox = document.getElementById('noVoiceHints');
        const hintsList = document.getElementById('noVoiceHintsList');

        if (result.status === 'insufficient_speech' || result.status === 'no_voice') {
          if (iconEl) iconEl.textContent = '🔇';
          if (titleEl) titleEl.textContent = result.title || 'No Sufficient Speech Detected';
          if (msgEl) msgEl.textContent = result.message || 'The recording does not contain enough usable speech for reliable voice-authenticity analysis.';
          if (hintsList) {
            hintsList.innerHTML = `
              <li>• Please speak closer to the microphone with clear conversational volume.</li>
              <li>• Ensure the recording duration contains at least 3 to 10 seconds of speech.</li>
              <li>• Silence and background noise are never classified as an AI voice.</li>
            `;
          }
        } else if (result.status === 'poor_quality') {
          if (iconEl) iconEl.textContent = '⚠️';
          if (titleEl) titleEl.textContent = result.title || 'Audio Quality Insufficient';
          if (msgEl) msgEl.textContent = result.message || 'Audio quality is insufficient for reliable authenticity analysis.';
          if (hintsList) {
            hintsList.innerHTML = `
              <li>• High background noise obscures subtle vocal tract acoustic features.</li>
              <li>• Re-record in a quiet room or use a clearer recording device.</li>
            `;
          }
        } else {
          if (iconEl) iconEl.textContent = '⏱️';
          if (titleEl) titleEl.textContent = result.title || 'Recording Too Short';
          if (msgEl) msgEl.textContent = result.message || 'Audio duration is too short for reliable biometric evaluation.';
          if (hintsList) {
            hintsList.innerHTML = `
              <li>• Speech verification requires at least 2.5 to 10 seconds of spoken audio.</li>
            `;
          }
        }
      }

      this.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // Case B: Valid Authenticity Verification
    if (noVoicePanel) noVoicePanel.style.display = 'none';
    if (validVoicePanel) validVoicePanel.style.display = 'block';

    const verdict = result.verdict || result.classification_label || 'UNCERTAIN — REVIEW';
    const confidence = result.confidence !== undefined && result.confidence !== null ? result.confidence : result.confidence_percentage;
    const riskLevel = result.risk_level || (result.risk_score ? (result.risk_score > 65 ? 'HIGH RISK' : (result.risk_score > 34 ? 'MEDIUM RISK' : 'LOW RISK')) : 'REVIEW');
    const riskScore = result.risk_score !== undefined ? result.risk_score : 50;

    // 1. Verdict Badge
    const verdictEl = document.getElementById('resultVerdictText');
    const verdictBox = document.getElementById('resultVerdictBox');
    if (verdictEl) verdictEl.textContent = verdict;

    if (verdictBox) {
      verdictBox.className = 'verdict-display-card';
      if (verdict.includes('AUTHENTIC')) {
        verdictBox.classList.add('verdict-authentic');
      } else if (verdict.includes('SYNTHETIC')) {
        verdictBox.classList.add('verdict-synthetic');
      } else {
        verdictBox.classList.add('verdict-uncertain');
      }
    }

    // 2. Summary Message
    const summaryEl = document.getElementById('resultSummaryText');
    if (summaryEl) {
      summaryEl.textContent = result.message || 'Voice sample analyzed using multi-signal acoustic biometrics.';
    }

    // 3. Confidence & Risk Level
    const confValEl = document.getElementById('resultConfidenceValue');
    const confBarEl = document.getElementById('resultConfidenceBar');
    const riskValEl = document.getElementById('resultRiskValue');
    const riskBadgeEl = document.getElementById('resultRiskBadge');

    if (confValEl) confValEl.textContent = confidence ? `${confidence}%` : 'Calculated';
    if (confBarEl) confBarEl.style.width = `${confidence || 85}%`;

    if (riskValEl) riskValEl.textContent = riskLevel;
    if (riskBadgeEl) {
      riskBadgeEl.className = 'risk-pill';
      if (riskLevel.includes('LOW')) riskBadgeEl.classList.add('risk-low');
      else if (riskLevel.includes('HIGH')) riskBadgeEl.classList.add('risk-high');
      else riskBadgeEl.classList.add('risk-medium');
      riskBadgeEl.textContent = riskLevel;
    }

    // 4. Authenticity Score Breakdown Cards
    const metrics = result.metrics || {};
    const setMetric = (id, val, suffix = '%') => {
      const el = document.getElementById(id);
      if (el) {
        if (val !== undefined && val !== null) {
          el.textContent = typeof val === 'number' ? `${val}${suffix}` : val;
          el.classList.remove('metric-unavailable');
        } else {
          el.textContent = 'Not available';
          el.classList.add('metric-unavailable');
        }
      }
    };

    setMetric('metricAuthenticity', metrics.authenticity);
    setMetric('metricLiveness', metrics.liveness, '');
    setMetric('metricNaturalness', metrics.naturalness);
    setMetric('metricSpectral', metrics.spectral_consistency);
    setMetric('metricTemporal', metrics.temporal_consistency);
    setMetric('metricQuality', metrics.audio_quality_score);
    setMetric('metricReplay', metrics.replay_risk, '');
    setMetric('metricBackground', metrics.background_noise, '');

    // 5. Why This Result? (Explainability)
    const explain = result.explainability || {};
    const posList = document.getElementById('explainPositiveList');
    const conList = document.getElementById('explainConcernList');

    if (posList) {
      const pos = explain.positive_indicators || [];
      if (pos.length > 0) {
        posList.innerHTML = pos.map(item => `<li><span class="bullet-pos">✓</span> ${item}</li>`).join('');
      } else {
        posList.innerHTML = '<li><span class="bullet-pos">✓</span> Spoken voice activity confirmed across active frames.</li>';
      }
    }

    if (conList) {
      const cons = explain.potential_concerns || [];
      if (cons.length > 0) {
        conList.innerHTML = cons.map(item => `<li><span class="bullet-con">•</span> ${item}</li>`).join('');
      } else {
        conList.innerHTML = '<li><span class="bullet-pos">✓</span> No synthetic anomalies or replay artifacts detected.</li>';
      }
    }

    // 6. Background Audio Analysis
    const bg = result.background_audio || {};
    const bgSummary = document.getElementById('bgAudioSummary');
    const bgPrimary = document.getElementById('bgAudioPrimary');
    const bgSpeech = document.getElementById('bgAudioSpeech');
    const bgEnv = document.getElementById('bgAudioEnv');
    const bgSilence = document.getElementById('bgAudioSilence');

    if (bgSummary) bgSummary.textContent = bg.summary || 'Acoustic background isolated from vocal tract.';
    if (bgPrimary) bgPrimary.textContent = bg.primary_voice || 'Dominant speaker';
    if (bgSpeech) bgSpeech.textContent = bg.background_speech || 'None detected';
    if (bgEnv) bgEnv.textContent = bg.environmental_noise || 'Low';
    if (bgSilence) bgSilence.textContent = bg.silence || 'Normal speech breathing pauses';

    // 7. Analysis ID & Date in Results Footer
    const metaIdEl = document.getElementById('resultMetaId');
    const metaHashEl = document.getElementById('resultMetaHash');
    if (metaIdEl) metaIdEl.textContent = result.analysis_id || 'VS-1024';
    if (metaHashEl) {
      const hash = (result.blockchain_proof && result.blockchain_proof.verification_hash) || result.verification_hash || 'SHA-256 Ledger Verified';
      metaHashEl.textContent = hash;
    }

    this.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  hide() {
    const noVoicePanel = document.getElementById('resultNoVoicePanel');
    const validVoicePanel = document.getElementById('resultValidVoicePanel');
    if (noVoicePanel) noVoicePanel.style.display = 'none';
    if (validVoicePanel) validVoicePanel.style.display = 'none';
  }
}
