/**
 * VoiceShield AI - Blockchain Audit Trail Component
 * Visualizes cryptographic ledger blocks and chain integrity.
 */

import { VoiceShieldAPI } from '../api.js';
import { toast } from './toast.js';

export class BlockchainView {
  constructor() {
    this.tableBody = document.getElementById('blockchainTableBody');
    this.integrityBadge = document.getElementById('ledgerIntegrityBadge');

    this._bindEvents();
  }

  _bindEvents() {
    const verifyBtn = document.getElementById('btnVerifyChainIntegrity');
    if (verifyBtn) {
      verifyBtn.addEventListener('click', () => this.verifyChain());
    }
  }

  async loadRecords() {
    const data = await VoiceShieldAPI.getBlockchainRecords();
    if (!this.tableBody) return;

    const records = data.records || [];
    if (records.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            No blocks anchored to the ledger yet.
          </td>
        </tr>
      `;
      return;
    }

    this.tableBody.innerHTML = records.map(b => {
      const shortAudio = b.audio_sha256 ? `${b.audio_sha256.slice(0, 10)}...${b.audio_sha256.slice(-6)}` : 'N/A';
      const shortHash = b.verification_hash ? `${b.verification_hash.slice(0, 12)}...${b.verification_hash.slice(-6)}` : 'N/A';

      let statusColor = 'var(--color-genuine)';
      if (b.classification === 'suspicious') statusColor = 'var(--color-suspicious)';
      else if (b.classification === 'ai_generated') statusColor = 'var(--color-ai)';

      return `
        <tr>
          <td style="font-family: monospace; font-weight: 700; color: var(--accent-primary);">#${b.index}</td>
          <td>${new Date(b.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
          <td><span style="font-family: monospace; font-size: 0.8rem;" title="${b.audio_sha256}">${shortAudio}</span></td>
          <td style="color: ${statusColor}; font-weight: 600; text-transform: uppercase;">${b.classification}</td>
          <td style="font-family: monospace;">${b.risk_score}/100</td>
          <td>
            <span style="font-family: monospace; font-size: 0.8rem; color: #cbd5e1;" title="${b.verification_hash}">${shortHash}</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  async verifyChain() {
    const res = await VoiceShieldAPI.verifyBlockchainChain();
    if (res && res.is_valid) {
      toast.show('Chain integrity verified! All SHA-256 blocks mathematically intact.', 'success');
      if (this.integrityBadge) {
        this.integrityBadge.innerHTML = '✓ Ledger Integrity: Cryptographically Intact';
        this.integrityBadge.style.color = 'var(--color-genuine)';
      }
    } else {
      toast.show('Warning: Hash mismatch detected on ledger.', 'error');
    }
  }
}
