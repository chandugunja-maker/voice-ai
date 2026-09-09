/**
 * VoiceShield AI - Single Page Application Orchestrator
 * Smart India Hackathon 2026 | Theme: Blockchain & Cybersecurity | Team: Agents (TEAM-312)
 */

import { ResultView } from './components/result-view.js';
import { VerificationWorkspace } from './components/verification.js';

class VoiceShieldApp {
  constructor() {
    this.resultView = null;
    this.verificationWorkspace = null;

    this.init();
  }

  init() {
    // 1. Result View Component
    this.resultView = new ResultView({
      onReset: () => {
        if (this.verificationWorkspace) this.verificationWorkspace.reset();
        const verifySection = document.getElementById('verify');
        if (verifySection) verifySection.scrollIntoView({ behavior: 'smooth' });
      },
      onTestMic: () => {
        if (this.verificationWorkspace) {
          const verifySection = document.getElementById('verify');
          if (verifySection) verifySection.scrollIntoView({ behavior: 'smooth' });
          this.verificationWorkspace._runMicrophoneTest();
        }
      }
    });

    // 2. Verification Workspace Component (Handles mic, recording, upload, examples)
    this.verificationWorkspace = new VerificationWorkspace({
      onAnalysisComplete: (result, filename) => {
        this.resultView.render(result, filename);
      }
    });

    // 3. Navigation & Modals
    this._bindNavigation();
    this._bindModals();

    console.log('VoiceShield AI application loaded successfully.');
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

    // Top CTA: "Start Voice Check"
    const startNavBtn = document.getElementById('btnNavStartVerify');
    if (startNavBtn) {
      startNavBtn.addEventListener('click', () => {
        const verifySection = document.getElementById('verify');
        if (verifySection) {
          verifySection.scrollIntoView({ behavior: 'smooth' });
          // Switch to live tab
          if (this.verificationWorkspace) {
            this.verificationWorkspace.switchTab('live');
          }
        }
      });
    }
  }

  _bindModals() {
    // Close modal handlers
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target === el || el.classList.contains('modal-close')) {
          document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('is-active'));
        }
      });
    });

    // Escape key closes modals
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
