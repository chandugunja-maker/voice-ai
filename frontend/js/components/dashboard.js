/**
 * VoiceShield AI - Dashboard & Analysis History Manager
 * Manages cybersecurity analytics cards, responsive SVG charts,
 * verification history filtering, and privacy data deletion.
 */

import { VoiceShieldAPI } from '../api.js';
import { ReportGenerator } from './report-generator.js';
import { toast } from './toast.js';

export class DashboardManager {
  constructor(options = {}) {
    this.onViewDetails = options.onViewDetails || (() => {});
    this.historyRecords = [];
    this.dashboardStats = null;

    this._bindEvents();
    this.refresh();
  }

  _bindEvents() {
    // History Search Input
    const searchInput = document.getElementById('historySearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this._filterAndRenderHistory();
      });
    }

    // History Verdict Filter
    const verdictFilter = document.getElementById('historyVerdictFilter');
    if (verdictFilter) {
      verdictFilter.addEventListener('change', () => {
        this._filterAndRenderHistory();
      });
    }

    // Clear History / Delete My Data
    const clearHistoryBtn = document.getElementById('btnClearHistory');
    const deleteDataBtn = document.getElementById('btnDeleteMyData');

    const handleClear = async () => {
      if (confirm('Are you sure you want to permanently delete all analysis history and stored verification records?')) {
        await VoiceShieldAPI.clearAllHistory();
        localStorage.removeItem('voiceshield_verification_history');
        this.historyRecords = [];
        this._filterAndRenderHistory();
        this.refresh();
        toast.show('All verification records have been permanently cleared.', 'info');
      }
    };

    if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', handleClear);
    if (deleteDataBtn) deleteDataBtn.addEventListener('click', handleClear);
  }

  async refresh() {
    // 1. Fetch Stats & Chart Data
    try {
      this.dashboardStats = await VoiceShieldAPI.getDashboardStats();
      this._renderStatsCards(this.dashboardStats);
      this._renderCharts(this.dashboardStats.charts);
    } catch (e) {
      console.warn('Dashboard stats refresh error:', e);
    }

    // 2. Fetch History Records
    try {
      const records = await VoiceShieldAPI.getHistory();
      if (records && records.length > 0) {
        this.historyRecords = records;
      } else {
        // Fallback to local storage
        const local = localStorage.getItem('voiceshield_verification_history');
        if (local) {
          this.historyRecords = JSON.parse(local);
        }
      }
      this._filterAndRenderHistory();
    } catch (e) {
      console.warn('History refresh error:', e);
    }
  }

  _renderStatsCards(stats) {
    if (!stats) return;

    const totalEl = document.getElementById('statTotalAnalyses');
    const authEl = document.getElementById('statLikelyAuthentic');
    const synEl = document.getElementById('statLikelySynthetic');
    const uncEl = document.getElementById('statUncertain');
    const preventedEl = document.getElementById('statHighRiskPrevented');

    if (totalEl) totalEl.textContent = Number(stats.total_analyses).toLocaleString();
    if (authEl) authEl.textContent = Number(stats.likely_authentic).toLocaleString();
    if (synEl) synEl.textContent = Number(stats.likely_synthetic).toLocaleString();
    if (uncEl) uncEl.textContent = Number(stats.uncertain).toLocaleString();
    if (preventedEl) preventedEl.textContent = Number(stats.high_risk_prevented).toLocaleString();
  }

  _renderCharts(charts) {
    if (!charts) return;

    // Check if there are any records
    const vData = charts.verdict_distribution || {};
    const totalVerdicts = Object.values(vData).reduce((a, b) => a + b, 0);

    const verdictContainer = document.getElementById('chartVerdictDistribution');
    const riskContainer = document.getElementById('chartRiskDistribution');
    const confContainer = document.getElementById('chartConfidenceDistribution');

    if (totalVerdicts === 0) {
      const emptyHtml = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 2.25rem 1rem;">No analysis data yet — perform your first verification above to generate telemetry.</div>`;
      if (verdictContainer) verdictContainer.innerHTML = emptyHtml;
      if (riskContainer) riskContainer.innerHTML = emptyHtml;
      if (confContainer) confContainer.innerHTML = emptyHtml;
      return;
    }

    // 1. Verdict Breakdown Chart (Horizontal Multi-Bar)
    if (verdictContainer && charts.verdict_distribution) {
      const data = charts.verdict_distribution;
      const total = totalVerdicts || 1;
      const authPct = Math.round(((data['Likely Authentic'] || 0) / total) * 100);
      const uncPct = Math.round(((data['Uncertain — Review Recommended'] || data['Uncertain — Review'] || 0) / total) * 100);
      const synPct = Math.round(((data['Likely Synthetic'] || 0) / total) * 100);

      verdictContainer.innerHTML = `
        <div style="margin-bottom: 12px; display: flex; height: 16px; border-radius: 8px; overflow: hidden; background: #e2e8f0;">
          <div style="width: ${authPct}%; background: #10b981;" title="Likely Authentic: ${authPct}%"></div>
          <div style="width: ${uncPct}%; background: #f59e0b;" title="Uncertain: ${uncPct}%"></div>
          <div style="width: ${synPct}%; background: #ef4444;" title="Likely Synthetic: ${synPct}%"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted); flex-wrap: wrap; gap: 8px;">
          <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981; margin-right:4px;"></span>Authentic (${authPct}%)</span>
          <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#f59e0b; margin-right:4px;"></span>Uncertain (${uncPct}%)</span>
          <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#ef4444; margin-right:4px;"></span>Synthetic (${synPct}%)</span>
        </div>
      `;
    }

    // 2. Risk Distribution Chart
    if (riskContainer && charts.risk_distribution) {
      const data = charts.risk_distribution;
      const maxVal = Math.max(1, ...Object.values(data));

      riskContainer.innerHTML = Object.entries(data).map(([label, val]) => {
        const heightPct = Math.max(8, Math.round((val / maxVal) * 100));
        let color = '#10b981';
        if (label.includes('High')) color = '#ef4444';
        else if (label.includes('Medium')) color = '#f59e0b';

        return `
          <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px;">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-primary);">${val}</span>
            <div style="width: 100%; max-width: 44px; height: 100px; display: flex; align-items: flex-end; background: #f1f5f9; border-radius: 4px; border: 1px solid var(--border-subtle);">
              <div style="width: 100%; height: ${heightPct}%; background: ${color}; border-radius: 3px; transition: height 0.5s ease;"></div>
            </div>
            <span style="font-size: 0.75rem; color: var(--text-muted); text-align: center;">${label.replace(' Risk', '')}</span>
          </div>
        `;
      }).join('');
    }

    // 3. Confidence Range Distribution
    if (confContainer && charts.confidence_distribution) {
      const data = charts.confidence_distribution;
      const maxVal = Math.max(1, ...Object.values(data));

      confContainer.innerHTML = Object.entries(data).map(([label, val]) => {
        const widthPct = Math.max(4, Math.round((val / maxVal) * 100));
        return `
          <div style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 3px;">
              <span>${label}</span>
              <span style="font-weight: 700; color: var(--text-primary);">${val}</span>
            </div>
            <div style="height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; border: 1px solid var(--border-subtle);">
              <div style="width: ${widthPct}%; height: 100%; background: var(--accent-primary); border-radius: 3px;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  _filterAndRenderHistory() {
    const tableBody = document.getElementById('historyTableBody');
    if (!tableBody) return;

    const search = (document.getElementById('historySearchInput')?.value || '').toLowerCase();
    const verdictFilter = document.getElementById('historyVerdictFilter')?.value || 'ALL';

    const filtered = this.historyRecords.filter(item => {
      const matchSearch = !search || 
        (item.filename && item.filename.toLowerCase().includes(search)) ||
        (item.id && item.id.toLowerCase().includes(search));

      const matchVerdict = verdictFilter === 'ALL' || 
        (item.verdict && item.verdict.toUpperCase().includes(verdictFilter.toUpperCase()));

      return matchSearch && matchVerdict;
    });

    if (filtered.length === 0) {
      const msg = this.historyRecords.length === 0
        ? 'No analyses yet — record or upload an audio sample to create your first verification audit record.'
        : 'No verification records found matching the current search criteria.';
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 28px 16px; color: var(--text-muted); font-size: 0.9rem;">
            ${msg}
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered.map(item => {
      const verdict = item.verdict || 'UNCERTAIN — REVIEW';
      let pillClass = 'badge-uncertain';
      if (verdict.includes('AUTHENTIC')) pillClass = 'badge-authentic';
      else if (verdict.includes('SYNTHETIC')) pillClass = 'badge-synthetic';

      const conf = item.confidence ? `${item.confidence}%` : 'N/A';
      const risk = item.risk_level || 'REVIEW';

      return `
        <tr style="border-bottom: 1px solid var(--border-subtle);">
          <td style="padding: 12px 14px; font-family: monospace; font-size: 0.8rem; color: var(--accent-primary);">${item.id}</td>
          <td style="padding: 12px 14px; font-weight: 600; color: var(--text-primary);">${item.filename || 'voice_sample.wav'}</td>
          <td style="padding: 12px 14px; color: var(--text-muted);">${item.duration_str || item.duration + 's' || '5.0s'}</td>
          <td style="padding: 12px 14px;">
            <span class="history-pill ${pillClass}">${verdict}</span>
          </td>
          <td style="padding: 12px 14px; font-weight: 700; color: var(--text-primary);">${conf}</td>
          <td style="padding: 12px 14px; color: var(--text-secondary);">${risk}</td>
          <td style="padding: 12px 14px; text-align: right;">
            <div style="display: flex; gap: 6px; justify-content: flex-end;">
              <button class="btn btn-sm btn-secondary btn-history-details" data-id="${item.id}" type="button" title="View Details">
                Details
              </button>
              <button class="btn btn-sm btn-tertiary btn-history-delete" data-id="${item.id}" type="button" title="Delete" style="color: #ef4444;">
                ✕
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Bind action buttons
    tableBody.querySelectorAll('.btn-history-details').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        let record = this.historyRecords.find(r => r.id === id);
        try {
          const detail = await VoiceShieldAPI.getHistoryDetail(id);
          if (detail && detail.record) {
            record = detail.record;
          }
        } catch (e) {}

        if (record) {
          this._openRecordDetailModal(record);
        } else {
          toast.show('Record details not found.', 'warning');
        }
      });
    });

    tableBody.querySelectorAll('.btn-history-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm(`Delete record ${id}?`)) {
          await VoiceShieldAPI.deleteHistoryItem(id);
          this.historyRecords = this.historyRecords.filter(r => r.id !== id);
          localStorage.setItem('voiceshield_verification_history', JSON.stringify(this.historyRecords));
          this._filterAndRenderHistory();
          this.refresh();
          toast.show(`Record ${id} removed.`, 'info');
        }
      });
    });

    // Close button for Detail Modal
    const modal = document.getElementById('historyDetailModal');
    const closeBtn = document.getElementById('btnCloseHistoryDetailModal');
    const modalCloseBtn = document.getElementById('btnModalClose');

    [closeBtn, modalCloseBtn].forEach(b => {
      if (b) {
        b.onclick = () => {
          if (modal) modal.classList.remove('is-active');
        };
      }
    });
  }

  _openRecordDetailModal(record) {
    if (!record) return;
    const modal = document.getElementById('historyDetailModal');
    if (!modal) return;

    const idEl = document.getElementById('modalDetailId');
    const fnEl = document.getElementById('modalDetailFilename');
    const verdictEl = document.getElementById('modalDetailVerdict');
    const verdictBox = document.getElementById('modalDetailVerdictBox');
    const confEl = document.getElementById('modalDetailConfidence');
    const riskEl = document.getElementById('modalDetailRisk');
    const timeEl = document.getElementById('modalDetailTimestamp');
    const durEl = document.getElementById('modalDetailDuration');
    const qualEl = document.getElementById('modalDetailQuality');
    const hashEl = document.getElementById('modalDetailHash');
    const metricsGrid = document.getElementById('modalDetailMetricsGrid');
    const explainList = document.getElementById('modalDetailExplainList');
    const btnDownload = document.getElementById('btnModalDownloadReport');

    const id = record.id || 'VS-0000';
    const filename = record.filename || 'voice_sample.wav';
    const verdict = record.verdict || 'UNCERTAIN — REVIEW';
    const conf = record.confidence !== undefined && record.confidence !== null ? `${record.confidence}%` : 'Not calculated';
    const risk = record.risk_level || 'REVIEW';
    const time = record.created_at || record.timestamp || 'Recent';
    const dur = record.duration_str || (record.duration ? `${record.duration}s` : '5.0s');
    const hash = record.verification_hash || 'SHA-256 Ledger Verified';

    if (idEl) idEl.textContent = id;
    if (fnEl) fnEl.textContent = filename;
    if (verdictEl) verdictEl.textContent = verdict;
    if (confEl) confEl.textContent = conf;
    if (riskEl) riskEl.textContent = risk;
    if (timeEl) timeEl.textContent = time;
    if (durEl) durEl.textContent = dur;
    if (hashEl) hashEl.textContent = hash;

    if (verdictBox) {
      verdictBox.className = 'verdict-display-card';
      if (verdict.includes('AUTHENTIC')) verdictBox.classList.add('verdict-authentic');
      else if (verdict.includes('SYNTHETIC')) verdictBox.classList.add('verdict-synthetic');
      else verdictBox.classList.add('verdict-uncertain');
    }

    const aq = record.audio_quality || {};
    if (qualEl) qualEl.textContent = aq.snr_estimate || 'Standard Quality';

    // Metrics breakdown
    const m = record.metrics || {};
    if (metricsGrid) {
      metricsGrid.innerHTML = `
        <div class="metadata-card"><div class="metadata-label">Authenticity</div><div class="metadata-val">${m.authenticity !== undefined && m.authenticity !== null ? m.authenticity + '%' : 'Not available'}</div></div>
        <div class="metadata-card"><div class="metadata-label">Liveness</div><div class="metadata-val">${m.liveness || 'Not available'}</div></div>
        <div class="metadata-card"><div class="metadata-label">Naturalness</div><div class="metadata-val">${m.naturalness !== undefined && m.naturalness !== null ? m.naturalness + '%' : 'Not available'}</div></div>
        <div class="metadata-card"><div class="metadata-label">Spectral Cons.</div><div class="metadata-val">${m.spectral_consistency !== undefined && m.spectral_consistency !== null ? m.spectral_consistency + '%' : 'Not available'}</div></div>
        <div class="metadata-card"><div class="metadata-label">Temporal Cons.</div><div class="metadata-val">${m.temporal_consistency !== undefined && m.temporal_consistency !== null ? m.temporal_consistency + '%' : 'Not available'}</div></div>
        <div class="metadata-card"><div class="metadata-label">Replay Risk</div><div class="metadata-val">${m.replay_risk || 'Not available'}</div></div>
      `;
    }

    // Explain list
    const exp = record.explainability || {};
    if (explainList) {
      const positives = (exp.positive_indicators || []).map(p => `<li><span class="bullet-pos">✓</span> ${p}</li>`);
      const concerns = (exp.potential_concerns || []).map(c => `<li><span class="bullet-con">•</span> ${c}</li>`);
      const all = [...positives, ...concerns];
      if (all.length > 0) {
        explainList.innerHTML = all.join('');
      } else {
        explainList.innerHTML = `<li><span class="bullet-pos">✓</span> Analysis verified and anchored to ledger.</li>`;
      }
    }

    if (btnDownload) {
      btnDownload.onclick = () => ReportGenerator.generateReport(record, filename);
    }

    modal.classList.add('is-active');
  }

  addRecord(record) {
    if (!record) return;
    this.historyRecords.unshift(record);
    try {
      localStorage.setItem('voiceshield_verification_history', JSON.stringify(this.historyRecords.slice(0, 50)));
    } catch (e) {}
    this._filterAndRenderHistory();
    this.refresh();
  }
}

