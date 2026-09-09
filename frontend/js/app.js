/**
 * VoiceShield AI - Single Page Application Orchestrator
 * Enterprise AI Voice Security & Authenticity Verification Platform
 * Smart India Hackathon 2026 | Theme: Blockchain & Cybersecurity | Team: Agents (TEAM-312)
 */

import { ResultView } from './components/result-view.js';
import { VerificationWorkspace } from './components/verification.js';
import { DashboardManager } from './components/dashboard.js';

class VoiceShieldApp {
  constructor() {
    this.resultView = null;
    this.verificationWorkspace = null;
    this.dashboardManager = null;

    this.init();
  }

  init() {
    // 1. Dashboard & History Manager
    this.dashboardManager = new DashboardManager();

    // 2. Result View Component
    this.resultView = new ResultView({
      onReset: () => {
        if (this.verificationWorkspace) this.verificationWorkspace.reset();
        const verifySection = document.getElementById('analyze');
        if (verifySection) verifySection.scrollIntoView({ behavior: 'smooth' });
      },
      onTestMic: () => {
        if (this.verificationWorkspace) {
          const verifySection = document.getElementById('analyze');
          if (verifySection) verifySection.scrollIntoView({ behavior: 'smooth' });
          this.verificationWorkspace._runMicrophoneTest();
        }
      }
    });

    // 3. Verification Workspace Component (Mic recording, upload, pre-analysis quality, analysis)
    this.verificationWorkspace = new VerificationWorkspace({
      onAnalysisComplete: (result, filename) => {
        this.resultView.render(result, filename);
        if (this.dashboardManager && result.status === 'success') {
          this.dashboardManager.addRecord(result);
        }
      }
    });

    // 4. Navigation & Modals
    this._bindNavigation();
    this._bindModals();

    console.log('[VoiceShield AI] Enterprise security platform initialized.');
  }

  _bindNavigation() {
    // Smooth scrolling for navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('#')) {
          e.preventDefault();
          const targetId = href.substring(1);
          const targetEl = document.getElementById(targetId);

          document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
          link.classList.add('active');

          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth' });
          }

          const navMenu = document.getElementById('navMenu');
          if (navMenu) navMenu.classList.remove('is-open');
        }
      });
    });

    // Mobile menu toggle
    const toggleBtn = document.getElementById('navToggleBtn');
    const navMenu = document.getElementById('navMenu');
    if (toggleBtn && navMenu) {
      toggleBtn.addEventListener('click', () => {
        navMenu.classList.toggle('is-open');
      });
    }

    // Top CTA: "Analyze Voice"
    const startNavBtn = document.getElementById('btnNavStartVerify');
    if (startNavBtn) {
      startNavBtn.addEventListener('click', () => {
        const verifySection = document.getElementById('analyze');
        if (verifySection) {
          verifySection.scrollIntoView({ behavior: 'smooth' });
          if (this.verificationWorkspace) {
            this.verificationWorkspace.switchTab('live');
          }
        }
      });
    }

    // Hero buttons: "Start Recording" & "Upload Audio"
    const heroRecordBtn = document.getElementById('btnHeroStartRecord');
    if (heroRecordBtn) {
      heroRecordBtn.addEventListener('click', () => {
        const verifySection = document.getElementById('analyze');
        if (verifySection) {
          verifySection.scrollIntoView({ behavior: 'smooth' });
          if (this.verificationWorkspace) {
            this.verificationWorkspace.switchTab('live');
            this.verificationWorkspace._startRecordingFlow();
          }
        }
      });
    }

    const heroUploadBtn = document.getElementById('btnHeroUploadAudio');
    if (heroUploadBtn) {
      heroUploadBtn.addEventListener('click', () => {
        const verifySection = document.getElementById('analyze');
        if (verifySection) {
          verifySection.scrollIntoView({ behavior: 'smooth' });
          if (this.verificationWorkspace) {
            this.verificationWorkspace.switchTab('upload');
          }
        }
      });
    }
  }

  _bindModals() {
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target === el || el.classList.contains('modal-close')) {
          document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('is-active'));
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('is-active'));
      }
    });
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  window.app = new VoiceShieldApp();
});
