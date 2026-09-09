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

    // 1. Verdict Breakdown Chart (Horizontal Multi-Bar)
    const verdictContainer = document.getElementById('chartVerdictDistribution');
    if (verdictContainer && charts.verdict_distribution) {
      const data = charts.verdict_distribution;
      const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
      const authPct = Math.round(((data['Likely Authentic'] || 0) / total) * 100);
      const uncPct = Math.round(((data['Uncertain — Review'] || 0) / total) * 100);
      const synPct = Math.round(((data['Likely Synthetic'] || 0) / total) * 100);

      verdictContainer.innerHTML = `
        <div style="margin-bottom: 12px; display: flex; height: 16px; border-radius: 8px; overflow: hidden; background: #1f2937;">
          <div style="width: ${authPct}%; background: #10b981;" title="Likely Authentic: ${authPct}%"></div>
          <div style="width: ${uncPct}%; background: #f59e0b;" title="Uncertain: ${uncPct}%"></div>
          <div style="width: ${synPct}%; background: #ef4444;" title="Likely Synthetic: ${synPct}%"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #94a3b8; flex-wrap: wrap; gap: 8px;">
          <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981; margin-right:4px;"></span>Authentic (${authPct}%)</span>
          <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#f59e0b; margin-right:4px;"></span>Uncertain (${uncPct}%)</span>
          <span><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#ef4444; margin-right:4px;"></span>Synthetic (${synPct}%)</span>
        </div>
      `;
    }

    // 2. Risk Distribution Chart
    const riskContainer = document.getElementById('chartRiskDistribution');
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
            <span style="font-size: 0.75rem; font-weight: 700; color: #cbd5e1;">${val}</span>
            <div style="width: 100%; max-width: 44px; height: 100px; display: flex; align-items: flex-end; background: #1e293b; border-radius: 4px;">
              <div style="width: 100%; height: ${heightPct}%; background: ${color}; border-radius: 4px; transition: height 0.5s ease;"></div>
            </div>
            <span style="font-size: 0.75rem; color: #94a3b8; text-align: center;">${label.replace(' Risk', '')}</span>
          </div>
        `;
      }).join('');
    }

    // 3. Confidence Range Distribution
    const confContainer = document.getElementById('chartConfidenceDistribution');
    if (confContainer && charts.confidence_distribution) {
      const data = charts.confidence_distribution;
      const maxVal = Math.max(1, ...Object.values(data));

      confContainer.innerHTML = Object.entries(data).map(([label, val]) => {
        const widthPct = Math.max(4, Math.round((val / maxVal) * 100));
        return `
          <div style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #94a3b8; margin-bottom: 3px;">
              <span>${label}</span>
              <span style="font-weight: 700; color: #f8fafc;">${val}</span>
            </div>
            <div style="height: 8px; background: #1e293b; border-radius: 4px; overflow: hidden;">
              <div style="width: ${widthPct}%; height: 100%; background: #38bdf8; border-radius: 4px;"></div>
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
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 24px; color: #94a3b8;">
            No verification records found matching the current criteria.
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
        <tr style="border-bottom: 1px solid #1e293b;">
          <td style="padding: 12px 14px; font-family: monospace; font-size: 0.8rem; color: #38bdf8;">${item.id}</td>
          <td style="padding: 12px 14px; font-weight: 600; color: #f8fafc;">${item.filename || 'voice_sample.wav'}</td>
          <td style="padding: 12px 14px; color: #94a3b8;">${item.duration_str || item.duration + 's' || '5.0s'}</td>
          <td style="padding: 12px 14px;">
            <span class="history-pill ${pillClass}">${verdict}</span>
          </td>
          <td style="padding: 12px 14px; font-weight: 700; color: #f8fafc;">${conf}</td>
          <td style="padding: 12px 14px; color: #cbd5e1;">${risk}</td>
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
        const detail = await VoiceShieldAPI.getHistory(id);
        const record = (detail && detail.length) ? detail.find(r => r.id === id) : this.historyRecords.find(r => r.id === id);
        if (record) {
          ReportGenerator.generateReport(record, record.filename);
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
