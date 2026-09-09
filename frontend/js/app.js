/**
 * VoiceShield AI - Single Page Application Orchestrator
 * Enterprise AI Voice Security & Authenticity Verification Platform
 * Smart India Hackathon 2026 | Theme: Blockchain & Cybersecurity | Team: Agents (TEAM-312)
 */

import { VoiceShieldAPI, isBenchmarkRecord } from './api.js';
import { ResultView } from './components/result-view.js';
import { VerificationWorkspace } from './components/verification.js';
import { DashboardManager } from './components/dashboard.js';
import { SpeakerEnrollment } from './components/speaker-enrollment.js';
import { LiveCallGuard } from './components/live-call-guard.js';

if (typeof window !== 'undefined') {
  window.VoiceShieldAPI = VoiceShieldAPI;
}

class VoiceShieldApp {
  constructor() {
    this.resultView = null;
    this.verificationWorkspace = null;
    this.dashboardManager = null;
    this.speakerEnrollment = null;
    this.liveCallGuard = null;

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
      onAnalysisComplete: (result, filename, isBenchmark = false) => {
        this.resultView.render(result, filename);
        // Do NOT contaminate dashboard statistics or user audit history with test benchmark controls
        const isBench = isBenchmark === true || 
          result.is_benchmark === true || 
          result.source_type === 'benchmark' || 
          isBenchmarkRecord(result);
        if (this.dashboardManager && result.status === 'success' && !isBench) {
          result.filename = result.filename || filename;
          result.id = result.id || result.analysis_id;
          result.analysis_id = result.analysis_id || result.id;
          this.dashboardManager.addRecord(result);
        }
      }
    });

    // 4. Speaker Enrollment & Live Call Guard
    this.speakerEnrollment = new SpeakerEnrollment();
    this.liveCallGuard = new LiveCallGuard();

    // 5. Navigation, Quick Samples & Modals
    this._bindNavigation();
    this._bindModals();

    console.log('[VoiceShield AI] Enterprise security platform initialized with Live Call Guard & Triad Architecture.');
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

    // Nav Link: "Live Call Guard"
    const navLiveGuard = document.getElementById('navLinkLiveGuard');
    if (navLiveGuard) {
      navLiveGuard.addEventListener('click', (e) => {
        e.preventDefault();
        const verifySection = document.getElementById('analyze');
        if (verifySection) {
          verifySection.scrollIntoView({ behavior: 'smooth' });
          if (this.verificationWorkspace) {
            this.verificationWorkspace.switchTab('liveguard');
          }
        }
      });
    }

    // Hero buttons: "Start Recording", "Upload Audio" & "Live Call Guard"
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

    const heroLiveGuardBtn = document.getElementById('heroBtnLiveGuard');
    if (heroLiveGuardBtn) {
      heroLiveGuardBtn.addEventListener('click', () => {
        const verifySection = document.getElementById('analyze');
        if (verifySection) {
          verifySection.scrollIntoView({ behavior: 'smooth' });
          if (this.verificationWorkspace) {
            this.verificationWorkspace.switchTab('liveguard');
          }
        }
      });
    }

    // Benchmark Demo Samples Quick Buttons
    document.querySelectorAll('.btn-analyze-example').forEach(btn => {
      btn.addEventListener('click', () => {
        const sample = btn.getAttribute('data-sample');
        if (this.verificationWorkspace && sample) {
          this.verificationWorkspace._analyzeExample(sample);
        }
      });
    });
  }

  _bindModals() {
    // History Detail Modal Close Buttons
    const btnCloseHist = document.getElementById('btnCloseHistoryDetailModal');
    const btnCloseHist2 = document.getElementById('btnModalClose');
    const hideHistModal = () => {
      const m = document.getElementById('historyDetailModal');
      if (m) m.classList.remove('is-active');
    };
    if (btnCloseHist) btnCloseHist.addEventListener('click', hideHistModal);
    if (btnCloseHist2) btnCloseHist2.addEventListener('click', hideHistModal);

    // Live Guard Consent Modal Close
    const btnCloseConsent = document.getElementById('btnCloseLiveConsentModal');
    if (btnCloseConsent) {
      btnCloseConsent.addEventListener('click', () => {
        const m = document.getElementById('liveGuardConsentModal');
        if (m) m.classList.remove('is-active');
      });
    }

    document.querySelectorAll('.modal-close, .modal-close-btn, .modal-overlay').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target === el || el.classList.contains('modal-close') || el.classList.contains('modal-close-btn')) {
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

// Initialize on DOM load or immediately if already loaded
function startApp() {
  if (!window.app) {
    window.app = new VoiceShieldApp();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
