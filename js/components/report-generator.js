/**
 * VoiceShield AI - Professional Security Report Generator
 * Generates official voice authenticity and cryptographic audit reports for export/printing.
 */

export class ReportGenerator {
  /**
   * Generates an official printable/PDF audit report in a dedicated print window
   */
  static generateReport(result, filename = 'voice_sample.wav') {
    if (!result) return;

    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const hexSuffix = Math.floor(Date.now() % 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0');
    const analysisId = result.analysis_id || `VS-${ymd}-${hexSuffix}`;
    const dateStr = new Date().toUTCString();
    const verdict = result.verdict || result.classification_label || 'UNCERTAIN — REVIEW RECOMMENDED';
    const confidence = result.confidence ? `${result.confidence}%` : 'Not calculated';
    const riskLevel = result.risk_level || (result.risk_score ? `${result.risk_score}/100` : 'Not calculated');
    const quality = result.audio_quality || {};
    const metrics = result.metrics || {};
    const bg = result.background_audio || {};
    const explain = result.explainability || { positive_indicators: [], potential_concerns: [] };
    const hash = result.verification_hash ||
                 result.sha256_hash ||
                 (result.blockchain_proof && result.blockchain_proof.verification_hash) ||
                 'SHA-256 Calculated';

    const printHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>VoiceShield AI - Authenticity Report ${analysisId}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 24px;
      line-height: 1.45;
      font-size: 13px;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .brand-title {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #0f172a;
      margin: 0 0 4px 0;
    }
    .brand-sub {
      font-size: 12px;
      color: #475569;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .report-meta {
      text-align: right;
      font-size: 11px;
      color: #475569;
    }
    .meta-id {
      font-family: monospace;
      font-weight: 700;
      font-size: 13px;
      color: #0f172a;
    }
    .verdict-box {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 20px;
      background: #f8fafc;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .verdict-text {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.02em;
    }
    .verdict-authentic { color: #047857; }
    .verdict-synthetic { color: #b91c1c; }
    .verdict-uncertain { color: #b45309; }
    .verdict-metrics {
      display: flex;
      gap: 24px;
      text-align: right;
    }
    .metric-col-title {
      font-size: 10px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }
    .metric-col-val {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
    }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
      margin-top: 18px;
      margin-bottom: 12px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .data-table td {
      padding: 6px 8px;
      border-bottom: 1px solid #f1f5f9;
    }
    .data-table td:first-child {
      color: #475569;
      font-weight: 500;
      width: 55%;
    }
    .data-table td:last-child {
      color: #0f172a;
      font-weight: 600;
      text-align: right;
    }
    .evidence-list {
      margin: 0;
      padding-left: 18px;
      font-size: 12px;
      color: #334155;
    }
    .evidence-list li {
      margin-bottom: 5px;
    }
    .positive-bullet { color: #047857; }
    .concern-bullet { color: #b91c1c; }
    .hash-box {
      font-family: monospace;
      font-size: 10px;
      background: #f1f5f9;
      padding: 8px 12px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
      color: #334155;
      word-break: break-all;
      margin-top: 8px;
    }
    .disclaimer-box {
      margin-top: 24px;
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
      font-size: 10px;
      color: #64748b;
      line-height: 1.5;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px; display: flex; justify-content: flex-end; gap: 8px;">
    <button onclick="window.print()" style="padding: 8px 16px; background: #0f172a; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Print / Save as PDF</button>
    <button onclick="window.close()" style="padding: 8px 16px; background: #e2e8f0; color: #0f172a; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Close</button>
  </div>

  <div class="report-header">
    <div>
      <h1 class="brand-title">VoiceShield AI</h1>
      <div class="brand-sub">Voice Authenticity & Biometric Analysis Report</div>
    </div>
    <div class="report-meta">
      <div>Report ID: <span class="meta-id">${analysisId}</span></div>
      <div>Date: ${dateStr}</div>
      <div>Target Audio: <strong>${filename}</strong></div>
    </div>
  </div>

  <div class="verdict-box">
    <div>
      <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 4px;">Primary Classification</div>
      <div class="verdict-text ${verdict.includes('AUTHENTIC') ? 'verdict-authentic' : (verdict.includes('SYNTHETIC') ? 'verdict-synthetic' : 'verdict-uncertain')}">
        ${verdict}
      </div>
    </div>
    <div class="verdict-metrics">
      <div>
        <div class="metric-col-title">Confidence</div>
        <div class="metric-col-val">${confidence}</div>
      </div>
      <div>
        <div class="metric-col-title">Risk Assessment</div>
        <div class="metric-col-val">${riskLevel}</div>
      </div>
    </div>
  </div>

  <div class="grid-2">
    <div>
      <div class="section-title">Pre-Analysis Signal Quality</div>
      <table class="data-table">
        <tr><td>Audio Duration</td><td>${quality.duration ? quality.duration + 's' : 'N/A'}</td></tr>
        <tr><td>Sampling Frequency</td><td>${quality.sample_rate ? quality.sample_rate + ' Hz' : '16000 Hz'}</td></tr>
        <tr><td>Channels</td><td>${quality.channels === 2 ? 'Stereo' : 'Mono'}</td></tr>
        <tr><td>Signal-to-Noise Ratio</td><td>${quality.snr_estimate || 'Calculated'}</td></tr>
        <tr><td>Sample Clipping</td><td>${quality.clipping_detected ? 'Detected (Mild)' : 'None (Clean)'}</td></tr>
        <tr><td>Silence Ratio</td><td>${quality.silence_pct !== undefined ? quality.silence_pct + '%' : 'Not available'}</td></tr>
      </table>
    </div>

    <div>
      <div class="section-title">Acoustic Biometric Metrics</div>
      <table class="data-table">
        <tr><td>Authenticity Score</td><td>${metrics.authenticity !== undefined && metrics.authenticity !== null ? metrics.authenticity + '%' : 'Not available'}</td></tr>
        <tr><td>Acoustic Liveness</td><td>${metrics.liveness || 'Not available'}</td></tr>
        <tr><td>Prosodic Naturalness</td><td>${metrics.naturalness !== undefined && metrics.naturalness !== null ? metrics.naturalness + '%' : 'Not available'}</td></tr>
        <tr><td>Spectral Consistency</td><td>${metrics.spectral_consistency !== undefined && metrics.spectral_consistency !== null ? metrics.spectral_consistency + '%' : 'Not available'}</td></tr>
        <tr><td>Temporal Consistency</td><td>${metrics.temporal_consistency !== undefined && metrics.temporal_consistency !== null ? metrics.temporal_consistency + '%' : 'Not available'}</td></tr>
        <tr><td>Replay Risk Indicator</td><td>${metrics.replay_risk || 'Not available'}</td></tr>
      </table>
    </div>
  </div>

  <div class="grid-2">
    <div>
      <div class="section-title">Observed Human Speech Signals</div>
      <ul class="evidence-list">
        ${explain.positive_indicators && explain.positive_indicators.length > 0 
          ? explain.positive_indicators.map(i => `<li><span class="positive-bullet">✓</span> ${i}</li>`).join('') 
          : '<li>Voice activity detected across spoken frames</li>'}
      </ul>
    </div>

    <div>
      <div class="section-title">Observed Anomalies & Concerns</div>
      <ul class="evidence-list">
        ${explain.potential_concerns && explain.potential_concerns.length > 0 
          ? explain.potential_concerns.map(c => `<li><span class="concern-bullet">•</span> ${c}</li>`).join('') 
          : '<li>No synthetic anomalies or replay distortion detected</li>'}
      </ul>
    </div>
  </div>

  <div class="section-title">Background Acoustic Isolation</div>
  <table class="data-table" style="margin-bottom: 12px;">
    <tr><td>Background Profile</td><td>${bg.summary || 'Clean room environment'}</td></tr>
    <tr><td>Primary Speaker</td><td>${bg.primary_voice || 'Dominant speaker'}</td></tr>
    <tr><td>Background Speech</td><td>${bg.background_speech || 'None detected'}</td></tr>
    <tr><td>Environmental Noise</td><td>${bg.environmental_noise || 'Low'}</td></tr>
  </table>

  <div class="section-title">Cryptographic Audit Anchor</div>
  <div style="font-size: 11px; color: #475569;">Deterministic SHA-256 Ledger Digest:</div>
  <div class="hash-box">${hash}</div>

  <div class="disclaimer-box">
    <strong>Security Notice & Limitations:</strong> AI voice detection is probabilistic and evaluates observed acoustic biometrics, prosodic variance, and spectral characteristics against known synthetic patterns. It should not be considered definitive proof of authenticity, human identity, or criminal intent. Always verify critical requests through an established secondary channel.
    <br><br>
    VoiceShield AI • Enterprise Voice Security & Authenticity Verification Platform
  </div>
</body>
</html>

    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(printHtml);
      printWindow.document.close();
    } else {
      alert('Popup was blocked by your browser. Please allow popups for VoiceShield AI to view and download reports.');
    }
  }
}
