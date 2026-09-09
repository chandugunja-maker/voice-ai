# VoiceShield AI

> **“Verify the Voice. Stop the Impersonation.”**  
> AI-Powered Real-Time Detection and Prevention of Voice Cloning Impersonation Attacks  
> **Smart India Hackathon 2026** | **Theme**: Blockchain & Cybersecurity | **Category**: Software  
> **Team**: Agents | **Team ID**: TEAM-312  

---

## 🛡️ Project Overview

With the explosive advancement of few-shot neural text-to-speech (TTS) and voice diffusion models (e.g. ElevenLabs, VALL-E, Bark), cybercriminals can now impersonate an individual's voice using only 3 to 10 seconds of captured audio. These clones are weaponized in high-yield social engineering attacks, executive wire fraud (CEO fraud), emergency family ransom scams, and helpdesk credential harvesting.

**VoiceShield AI** provides a lightweight, real-time, non-intrusive decision-support layer that analyzes incoming voice audio, extracts biometric and acoustic features, computes a standardized risk score (0–100), presents actionable security advisories, and anchors verification events to a tamper-evident SHA-256 blockchain ledger.

---

## 🌟 Key Features

1. **🎙️ Real-Time Voice Recording**:
   - Web Audio API integration with native microphone capture (`getUserMedia`).
   - Live oscillogram & frequency spectrum canvas rendering during recording.
   - Real-time recording timer with target duration guidance (5–10s).
   - Audio playback preview with instant Play/Pause and re-record controls.

2. **📁 Flexible Audio Upload**:
   - Drag-and-drop file upload zone supporting `WAV`, `MP3`, `M4A`, `WebM`, and `OGG`.
   - Comprehensive validation (file type checking, empty file detection, duration limits, 25MB file size limit).

3. **📊 Multi-Stage Analysis Experience**:
   - Timed, authentic 6-stage verification progress checklist:
     - `✓ Audio received`
     - `✓ Audio quality checked`
     - `⏳ Extracting voice features`
     - `○ Detecting synthetic patterns`
     - `○ Comparing voice characteristics`
     - `○ Generating risk assessment`

4. **🎯 Transparent Decision-Support Results**:
   - High-contrast circular SVG risk score gauge (0–100).
   - Standardized terminology:
     - 🟢 **LIKELY GENUINE** (0–30: Low Risk)
     - 🟡 **SUSPICIOUS** (31–60: Medium Risk)
     - 🔴 **POSSIBLE AI-GENERATED VOICE** (61–100: High / Critical Risk)
   - Clear distinction: **Risk Score ≠ Detection Confidence** (with explanatory guide).
   - Never claims 100% absolute certainty; operates as a responsible decision-support tool.

5. **🔬 6 Acoustic Feature Breakdown Dimensions**:
   - **Spectral Characteristics**: High-frequency roll-off & vocoder attenuation.
   - **Prosody & Pitch Patterns**: Fundamental frequency (F0) variance (robotic flattening vs natural micro-inflections).
   - **Speech Rhythm & Pauses**: Natural respiration acoustics vs mechanical inter-word intervals.
   - **Voice Consistency**: Biometric vocal tract formant resonance across syllables.
   - **Background & Audio Artifacts**: Ambient room reverberation vs synthetic noise floor profiles.
   - **Synthetic Speech Indicators**: Neural vocoder phase dispersion & deepfake footprints.

6. **⚠️ Security Warning & Out-of-Band Verification Protocol**:
   - Instant prominent alert for suspicious/AI voices: `⚠️ Potential Voice Impersonation Detected`.
   - Actionable incident response checklist (halt financial transactions, do not disclose OTPs/PINs, call back on trusted numbers).
   - "Verify Using Another Method" interactive guide.

7. **⚡ Live 5-Second Burst Verification**:
   - High-speed demonstration mode: records a 5-second burst, streams live audio waveform, and returns immediate risk analysis.

8. **🔗 Blockchain Verification & Cryptographic Ledger**:
   - Addresses SIH 2026 **Blockchain & Cybersecurity** theme.
   - Cryptographic SHA-256 chain: `SHA256(audio_hash + classification + risk_score + timestamp + previous_hash)`.
   - **Architectural distinction**: AI analyzes the voice; Blockchain secures audit trail integrity.
   - Raw audio is **never** stored on public blockchains (guaranteeing privacy compliance & scalability).
   - Includes live chain integrity verifier.

9. **📈 Dashboard & Verification History**:
   - Telemetry cards: Total Verifications, Genuine Voices, Suspicious Voices, Potential AI Clones, Average Risk Score.
   - Verification history log with View Details, individual record deletion, and Clear History confirmation modal.

10. **⚡ SIH Quick-Test Demo Samples**:
    - Preloaded sample buttons for 1-click evaluation during presentations:
      - `Sample: Likely Genuine (Human Voice)`
      - `Sample: Suspicious (Atypical Prosody)`
      - `Sample: Possible AI-Generated (Voice Clone)`

---

## 🏗️ System Architecture

```
VoiceShield AI
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI application & static asset server
│   │   ├── config.py                   # App configuration & Demo Mode toggle
│   │   ├── api/
│   │   │   └── endpoints.py            # /api/analyze-voice, /api/stats, /api/blockchain/*
│   │   ├── services/
│   │   │   ├── voice_detection.py      # Modular VoiceDetectionService interface
│   │   │   ├── acoustic_analyzer.py    # NumPy spectral centroid, roll-off, pitch jitter (F0)
│   │   │   └── blockchain_ledger.py    # SHA-256 tamper-evident verification ledger
│   │   └── models/
│   │       └── schemas.py              # Pydantic request/response schemas
│   └── tests/
│       └── test_api.py                 # Backend unit & integration test suite
├── frontend/
│   ├── index.html                      # Single Page Application HTML5 structure
│   ├── css/
│   │   ├── main.css                    # Dark cybersecurity design system
│   │   └── components.css              # Waveforms, gauges, cards, modals, toast
│   ├── js/
│   │   ├── app.js                      # SPA router, event coordinator, and initialization
│   │   ├── api.js                      # Backend API client with graceful fallback
│   │   ├── audio-recorder.js           # Web Audio API + MediaRecorder capture
│   │   ├── waveform-visualizer.js      # Canvas live waveform and frequency visualizers
│   │   └── components/
│   │       ├── verification.js         # Record & upload tabs, timer, playback, analysis
│   │       ├── live-verification.js    # 5-second live capture mode
│   │       ├── result-view.js          # Circular risk gauge, 6 feature cards, warnings
│   │       ├── dashboard.js            # Stats cards, history table, record deletion
│   │       ├── blockchain-view.js      # Ledger records and chain verifier
│   │       └── toast.js                # Accessible toast alerts
│   └── assets/
│       └── samples/                    # Pre-calibrated demo audio samples (Genuine, Suspicious, AI)
└── run.py                              # One-click startup launcher
```

---

## 🚀 Quick Start (Single Command)

### Prerequisites
- Python 3.10+ (Tested on Python 3.13)
- Required packages: `fastapi`, `uvicorn`, `python-multipart`, `numpy` (already installed)

### Launch the Application
Run the launcher from the project root:
```bash
python run.py
```

Open your browser and navigate to:
```
http://127.0.0.1:8000
```

- **Web Application**: `http://127.0.0.1:8000`
- **Interactive API Documentation (Swagger)**: `http://127.0.0.1:8000/api/docs`
- **Alternative API Documentation (ReDoc)**: `http://127.0.0.1:8000/api/redoc`

---

## 🧪 Running Automated Tests

To execute the test suite (unit tests for acoustic analysis, blockchain ledger, and API endpoints):
```bash
python -m unittest discover -s backend/tests -p "test_*.py"
```

---

## 🔒 Security & Privacy Commitments

- **No Permanent Storage Without Consent**: Audio files uploaded or recorded are processed in ephemeral memory for feature extraction and discarded.
- **Microphone Permissions**: Browser microphone hardware is accessed only after explicit user interaction.
- **Biometric Hash Anonymization**: Only irreversible SHA-256 mathematical hashes are stored on the verification ledger. Raw voice samples are never written to the blockchain.
- **Decision-Support Principle**: VoiceShield AI does not claim 100% accuracy or act as an identity oracle. It provides probability-based guidance to help humans make safe decisions.
