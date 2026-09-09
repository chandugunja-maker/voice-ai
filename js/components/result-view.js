/**
 * VoiceShield AI - Simplified Result View Component
 * Clear, accessible, non-technical presentation of voice verification results
 * Handles: No Voice, Noise, Short Recordings, and the 3 Core Result States.
 */

import { toast } from './toast.js';

export class ResultView {
  constructor(options = {}) {
    this.container = document.getElementById('resultContainer');
    this.onReset = options.onReset || (() => {});
    this.onTestMic = options.onTestMic || (() => {});
    this.currentResult = null;
    this.history = [];

    this._bindEvents();
    this._loadHistory();
  }

  _bindEvents() {
    // Reset / Check Another Voice
    const resetBtns = document.querySelectorAll('.btn-action-reset');
    resetBtns.forEach(b => {
      b.addEventListener('click', () => {
        this.hide();
        this.onReset();
      });
    });

    // Test Microphone from No Voice card
    const testMicBtn = document.getElementById('btnResultTestMic');
    if (testMicBtn) {
      testMicBtn.addEventListener('click', () => {
        this.hide();
        this.onTestMic();
      });
    }

    // Safety Tips modal trigger
    const safetyBtn = document.getElementById('btnResultSafetyTips');
    if (safetyBtn) {
      safetyBtn.addEventListener('click', () => {
        const modal = document.getElementById('altMethodModal');
        if (modal) modal.classList.add('is-active');
      });
    }

    // Toggle Technical Characteristics
    const toggleDetailsBtn = document.getElementById('btnToggleDetails');
    const detailsWrap = document.getElementById('technicalDetailsWrapper');
    const arrow = document.getElementById('toggleDetailsArrow');
    const text = document.getElementById('toggleDetailsText');
    if (toggleDetailsBtn && detailsWrap) {
      toggleDetailsBtn.addEventListener('click', () => {
        const isHidden = detailsWrap.style.display === 'none' || !detailsWrap.style.display;
        detailsWrap.style.display = isHidden ? 'block' : 'none';
        if (arrow) arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        if (text) text.textContent = isHidden ? 'Hide Voice Characteristics' : 'Show Voice Characteristics';
      });
    }

    // Clear History Button
    const clearHistoryBtn = document.getElementById('btnClearHistoryBtn');
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', () => {
        this.history = [];
        this._renderHistory();
        toast.show('Verification history cleared.', 'info');
      });
    }
  }

  render(result, filename = 'voice_sample.wav') {
    this.currentResult = result;
    if (!this.container) return;

    const noVoicePanel = document.getElementById('resultNoVoicePanel');
    const validVoicePanel = document.getElementById('resultValidVoicePanel');

    // =========================================================================
    // CASE A: NO CLEAR VOICE DETECTED (Silence, Heavy Noise, or Too Short)
    // =========================================================================
    if (result.status !== 'success') {
      if (validVoicePanel) validVoicePanel.style.display = 'none';
      if (noVoicePanel) {
        noVoicePanel.style.display = 'block';

        const iconEl = document.getElementById('noVoiceIcon');
        const titleEl = document.getElementById('noVoiceTitle');
        const msgEl = document.getElementById('noVoiceMessage');
        const hintsBox = document.getElementById('noVoiceHints');
        const hintsList = document.getElementById('noVoiceHintsList');
        const testMicBtn = document.getElementById('btnResultTestMic');

        if (result.status === 'no_voice') {
          if (iconEl) iconEl.textContent = '🔇';
          if (titleEl) titleEl.textContent = result.title || 'No Voice Detected';
          if (msgEl) msgEl.textContent = result.message || "We couldn't detect speech in this recording. Please speak clearly and try again.";
          if (hintsBox) hintsBox.style.display = 'block';
          if (hintsList) {
            hintsList.innerHTML = `
              <li>• Please speak into the microphone and ensure your volume is turned up.</li>
              <li>• Speak clearly for at least 5–10 seconds.</li>
              <li>• Check that your microphone is not muted.</li>
            `;
          }
          if (testMicBtn) testMicBtn.style.display = 'inline-flex';
        } else if (result.status === 'too_short') {
          if (iconEl) iconEl.textContent = '⏱️';
          if (titleEl) titleEl.textContent = result.title || 'Recording Too Short';
          if (msgEl) msgEl.textContent = result.message || 'Please speak for a few more seconds so we can check the voice.';
          if (hintsBox) hintsBox.style.display = 'none';
          if (testMicBtn) testMicBtn.style.display = 'none';
        }
      }

      this._addToHistory(filename, result);
      this.container.classList.add('is-visible');
      this.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // =========================================================================
    // CASE B: VALID SPEECH ANALYZED
    // =========================================================================
    if (noVoicePanel) noVoicePanel.style.display = 'none';
    if (validVoicePanel) validVoicePanel.style.display = 'block';

    // 0. Live Model / Demo Mode Banner
    const modelBanner = document.getElementById('modelStatusBanner');
    const modelText = document.getElementById('modelStatusText');
    if (modelBanner && modelText) {
      if (result.demo_mode) {
        modelText.textContent = result.notice || "AI Detection Unavailable — Demo Mode";
        modelBanner.style.borderColor = 'rgba(217, 119, 6, 0.3)';
        modelBanner.style.color = '#d97706';
      } else {
        modelText.textContent = "AI Acoustic Biometric Detection Model Active";
        modelBanner.style.borderColor = 'rgba(5, 150, 105, 0.3)';
        modelBanner.style.color = '#059669';
      }
    }

    // 1. Verdict Badge
    const verdictBadge = document.getElementById('resultVerdictBadge');
    let verdictClass = 'genuine';
    let iconSymbol = '✓';

    if (result.classification === 'suspicious') {
      verdictClass = 'suspicious';
      iconSymbol = '⚠️';
    } else if (result.classification === 'ai_generated') {
      verdictClass = 'ai-generated';
      iconSymbol = '🤖';
    }

    if (verdictBadge) {
      verdictBadge.className = `verdict-badge ${verdictClass}`;
      verdictBadge.innerHTML = `<span>${iconSymbol}</span> <span>${result.classification_label || 'Likely Real Voice'}</span>`;
    }

    // 2. Summary & Sub-Explanation
    const summaryTextEl = document.getElementById('resultSummaryText');
    const subExplanationEl = document.getElementById('resultSubExplanation');
    if (summaryTextEl) {
      summaryTextEl.textContent = result.message || 'Speech was detected. The main voice was analyzed separately from the background noise.';
    }
    if (subExplanationEl) {
      subExplanationEl.textContent = result.explanation || 'Speech was detected. The main voice was analyzed separately from the background sound.';
    }

    // 3. Structured Breakdown Cards
    const cardSpeech = document.getElementById('cardSpeechDetected');
    const cardAiProb = document.getElementById('cardAiProbability');
    const cardConf = document.getElementById('cardConfidence');
    const cardBgType = document.getElementById('cardBackgroundType');
    const cardBgLevel = document.getElementById('cardBackgroundLevel');
    const cardVoices = document.getElementById('cardVoicesDetected');

    if (cardSpeech) cardSpeech.textContent = result.speech_detected ? 'Yes' : 'No';
    if (cardAiProb) cardAiProb.textContent = `${result.risk_score || 16}%`;
    if (cardConf) cardConf.textContent = `${result.confidence_percentage || 92}%`;
    if (cardBgType) cardBgType.textContent = result.background_type || 'Clean / No Significant Background';
    if (cardBgLevel) cardBgLevel.textContent = result.background_level || 'Low';
    if (cardVoices) cardVoices.textContent = result.multiple_voices ? 'Multiple Voices (2)' : '1 Voice Detected';

    // 4. Circular Risk Gauge & AI Confidence
    const scoreVal = result.risk_score !== undefined ? result.risk_score : 18;
    const scoreNumEl = document.getElementById('gaugeScoreNum');
    const labelEl = document.getElementById('gaugeRiskLabel');
    const arcEl = document.getElementById('gaugeArc');

    if (scoreNumEl) scoreNumEl.textContent = scoreVal;
    if (labelEl) labelEl.textContent = `Overall Risk: ${result.risk_level || 'Low'}`;

    if (arcEl) {
      const circumference = 440;
      arcEl.style.strokeDasharray = circumference;
      let strokeColor = '#059669';
      if (result.classification === 'suspicious') strokeColor = '#d97706';
      else if (result.classification === 'ai_generated') strokeColor = '#dc2626';
      arcEl.style.stroke = strokeColor;
      const offset = circumference - (circumference * scoreVal) / 100;
      setTimeout(() => {
        arcEl.style.strokeDashoffset = offset;
      }, 50);
    }

    const confValEl = document.getElementById('confidenceValue');
    const confBarEl = document.getElementById('confidenceBarFill');
    const conf = result.confidence_percentage || 92;
    if (confValEl) confValEl.textContent = `${conf}%`;
    if (confBarEl) {
      confBarEl.style.width = '0%';
      setTimeout(() => {
        confBarEl.style.width = `${conf}%`;
      }, 50);
    }

    // 5. Warning Callout (Suspicious / AI-Generated)
    const warningBox = document.getElementById('resultWarningCallout');
    const warningTextEl = document.getElementById('resultWarningText');
    const safetyBtn = document.getElementById('btnResultSafetyTips');
    if (warningBox) {
      if (result.warning) {
        warningBox.style.display = 'block';
        if (warningTextEl) warningTextEl.textContent = result.warning;
        if (safetyBtn) safetyBtn.style.display = 'inline-flex';
      } else {
        warningBox.style.display = 'none';
        if (safetyBtn) safetyBtn.style.display = 'none';
      }
    }

    // 6. Technical Characteristics Breakdown
    const featuresGrid = document.getElementById('simpleFeaturesGrid');
    if (featuresGrid && result.simple_features) {
      const keys = Object.keys(result.simple_features);
      featuresGrid.innerHTML = keys.map(k => {
        const feat = result.simple_features[k];
        let statusBadgeClass = 'status-normal';
        if (feat.status.toLowerCase().includes('unusual') || feat.status.toLowerCase().includes('high') || feat.status.toLowerCase().includes('robotic')) {
          statusBadgeClass = 'status-anomaly';
        } else if (feat.status.toLowerCase().includes('altered') || feat.status.toLowerCase().includes('medium') || feat.status.toLowerCase().includes('moderate')) {
          statusBadgeClass = 'status-variance';
        }

        return `
          <div class="feature-card">
            <div class="feature-header">
              <span class="feature-title">${feat.name}</span>
              <span class="feature-status-badge ${statusBadgeClass}">
                ${feat.status}
              </span>
            </div>
            <div class="feature-bar-bg">
              <div class="feature-bar-fill" style="width: ${feat.score}%; background: var(--accent-primary);"></div>
            </div>
            <p class="feature-desc">${feat.explanation}</p>
          </div>
        `;
      }).join('');
    }

    // 7. Save and update Verification History (Preserve each recording's result)
    this._addToHistory(filename, result);

    this.container.classList.add('is-visible');
    this.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  _addToHistory(filename, result) {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isNoVoice = result.status !== 'success';

    const item = {
      id: Date.now(),
      voiceName: filename || `Recording #${this.history.length + 1}`,
      status: isNoVoice ? 'No Voice Detected' : (result.classification_label || 'Likely Real Voice'),
      statusClass: isNoVoice ? 'no-voice' : result.classification,
      aiProb: isNoVoice ? 'N/A' : `${result.risk_score || 0}%`,
      confidence: isNoVoice ? 'N/A' : `${result.confidence_percentage || 0}%`,
      background: result.background_type || (isNoVoice ? 'None' : 'Clean / No Background'),
      bgLevel: result.background_level || 'Low',
      voices: result.multiple_voices ? 'Multiple Voices' : (isNoVoice ? '0' : '1 Voice'),
      time: timeStr
    };

    this.history.unshift(item); // prepend newest
    this._renderHistory();
  }

  _renderHistory() {
    const historySection = document.getElementById('historySection');
    const tableBody = document.getElementById('historyTableBody');
    if (!historySection || !tableBody) return;

    if (this.history.length === 0) {
      historySection.style.display = 'none';
      tableBody.innerHTML = '';
      return;
    }

    historySection.style.display = 'block';
    tableBody.innerHTML = this.history.map((item, idx) => {
      let badgeStyle = 'background: rgba(5, 150, 105, 0.12); color: #059669; border: 1px solid rgba(5, 150, 105, 0.3);';
      if (item.statusClass === 'suspicious') {
        badgeStyle = 'background: rgba(217, 119, 6, 0.12); color: #d97706; border: 1px solid rgba(217, 119, 6, 0.3);';
      } else if (item.statusClass === 'ai_generated') {
        badgeStyle = 'background: rgba(220, 38, 38, 0.12); color: #dc2626; border: 1px solid rgba(220, 38, 38, 0.3);';
      } else if (item.statusClass === 'no-voice') {
        badgeStyle = 'background: rgba(100, 116, 139, 0.12); color: #64748b; border: 1px solid rgba(100, 116, 139, 0.3);';
      }

      return `
        <tr style="border-bottom: 1px solid var(--border-subtle);">
          <td style="padding: 0.75rem; font-weight: 600; color: var(--text-primary);">
            Voice #${this.history.length - idx} <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 400;">(${item.voiceName})</span>
          </td>
          <td style="padding: 0.75rem;">
            <span style="display: inline-block; padding: 0.25rem 0.65rem; border-radius: var(--radius-full); font-size: 0.8rem; font-weight: 600; ${badgeStyle}">
              ${item.status}
            </span>
          </td>
          <td style="padding: 0.75rem; font-weight: 600; color: var(--text-primary);">${item.aiProb}</td>
          <td style="padding: 0.75rem; font-weight: 600; color: var(--accent-primary);">${item.confidence}</td>
          <td style="padding: 0.75rem; color: var(--text-secondary);">${item.background} <span style="font-size: 0.75rem; color: var(--text-muted);">(${item.bgLevel})</span></td>
          <td style="padding: 0.75rem; color: var(--text-secondary);">${item.voices}</td>
          <td style="padding: 0.75rem; color: var(--text-muted); font-size: 0.8rem;">${item.time}</td>
        </tr>
      `;
    }).join('');
  }

  _loadHistory() {
    this._renderHistory();
  }

  hide() {
    if (this.container) {
      this.container.classList.remove('is-visible');
    }
  }
}

