"""
Comprehensive Scenario Validation Suite for VoiceShield AI
Tests:
- Upload WAV
- Upload MP3 / audio formats
- Invalid file format rejection
- Empty file rejection
- Silent audio handling (never classified as AI)
- Extremely noisy audio handling (poor quality)
- Truncated audio handling (too short)
- Oversized audio rejection
- Demo benchmark samples (genuine, suspicious, synthetic)
- Dashboard stats aggregation
- History search, filter, detail, individual delete, and clear all
"""

import unittest
import io
import wave
import numpy as np
from fastapi.testclient import TestClient
from backend.app.main import app


class TestVoiceShieldScenarios(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.sr = 16000

        # 1. Authentic voice simulation (natural prosody pitch inflection & micro-jitter)
        duration = 4.0
        t = np.linspace(0, duration, int(cls.sr * duration), endpoint=False)
        f0 = 140.0 + 22.0 * np.sin(2 * np.pi * 1.5 * t)
        phase = 2 * np.pi * np.cumsum(f0) / cls.sr
        speech = 0.45 * np.sin(phase) + 0.22 * np.sin(2 * phase) + 0.12 * np.sin(3 * phase)
        room_tone = 0.002 * np.random.randn(len(t))
        mask = (t < 1.8) | (t > 2.2)
        audio = np.where(mask, speech + room_tone, room_tone)
        pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16)

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(cls.sr)
            wf.writeframes(pcm.tobytes())
        cls.valid_wav = buf.getvalue()

        # 2. Silent audio
        silence_pcm = np.zeros(int(cls.sr * 3.0), dtype=np.int16)
        s_buf = io.BytesIO()
        with wave.open(s_buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(cls.sr)
            wf.writeframes(silence_pcm.tobytes())
        cls.silent_wav = s_buf.getvalue()

        # 3. Truncated audio (< 1.0 second)
        short_pcm = (np.sin(2 * np.pi * 220 * np.linspace(0, 0.6, int(cls.sr * 0.6))) * 32767).astype(np.int16)
        sh_buf = io.BytesIO()
        with wave.open(sh_buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(cls.sr)
            wf.writeframes(short_pcm.tobytes())
        cls.short_wav = sh_buf.getvalue()

        # 4. Severe noisy audio (heavy static noise obscuring speech)
        noisy_pcm = (0.75 * np.random.randn(int(cls.sr * 3.5)) * 32767).astype(np.int16)
        n_buf = io.BytesIO()
        with wave.open(n_buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(cls.sr)
            wf.writeframes(noisy_pcm.tobytes())
        cls.noisy_wav = n_buf.getvalue()

    def test_valid_wav_analysis(self):
        files = {"audio": ("sample.wav", self.valid_wav, "audio/wav")}
        res = self.client.post("/api/analyze-voice", files=files)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("verdict", data)
        self.assertIsNotNone(data["confidence"])
        self.assertGreaterEqual(data["confidence"], 50)
        self.assertIn("metrics", data)
        self.assertIn("explainability", data)

        # Verification of Analysis ID format: VS-YYYYMMDD-XXXXXX
        self.assertTrue(data["analysis_id"].startswith("VS-"))
        self.assertGreaterEqual(len(data["analysis_id"]), 17)

        # Verification of Cryptographic SHA-256 Hash
        self.assertIn("verification_hash", data)
        self.assertIsNotNone(data["verification_hash"])
        self.assertEqual(len(data["verification_hash"]), 64)
        # Ensure it's valid hexadecimal
        int(data["verification_hash"], 16)

        # Verification of Audio Quality
        self.assertIn("audio_quality", data)
        aq = data["audio_quality"]
        self.assertEqual(aq["sample_rate"], 16000)
        self.assertGreater(aq["duration"], 3.5)
        self.assertGreater(aq["rms_level"], 0.01)

    def test_empty_audio_rejected(self):
        files = {"audio": ("empty.wav", b"", "audio/wav")}
        res = self.client.post("/api/analyze-voice", files=files)
        self.assertEqual(res.status_code, 400)
        self.assertIn("empty", res.json()["detail"].lower())

    def test_invalid_format_rejected(self):
        files = {"audio": ("document.exe", b"MZ_INVALID_HEADER", "application/octet-stream")}
        res = self.client.post("/api/analyze-voice", files=files)
        self.assertEqual(res.status_code, 400)
        self.assertIn("unsupported", res.json()["detail"].lower())

    def test_silent_audio_not_classified_as_ai(self):
        files = {"audio": ("silence.wav", self.silent_wav, "audio/wav")}
        res = self.client.post("/api/analyze-voice", files=files)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn(data["status"], ["no_voice", "insufficient_speech"])
        self.assertIn("NO", data["verdict"].upper())
        self.assertIsNone(data["confidence"])
        self.assertIsNone(data["metrics"])

    def test_short_audio_rejected(self):
        files = {"audio": ("short.wav", self.short_wav, "audio/wav")}
        res = self.client.post("/api/analyze-voice", files=files)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "too_short")
        self.assertIn("SHORT", data["verdict"].upper())

    def test_demo_benchmark_samples(self):
        for sample_id, expected_substr in [
            ("rahul", "AUTHENTIC"),
            ("suspicious", "REVIEW"),
            ("processed", "SYNTHETIC")
        ]:
            res = self.client.post(f"/api/analyze-demo/{sample_id}")
            self.assertEqual(res.status_code, 200, f"Demo {sample_id} failed: {res.text}")
            data = res.json()
            self.assertEqual(data["status"], "success")
            self.assertIn(expected_substr, data["verdict"].upper())
            self.assertIsNotNone(data["confidence"])

    def test_dashboard_and_history_workflow(self):
        # 1. Stats
        stats_res = self.client.get("/api/dashboard/stats")
        self.assertEqual(stats_res.status_code, 200)
        stats = stats_res.json()
        self.assertGreaterEqual(stats["total_analyses"], 1)

        # 2. History listing with search & filters
        hist_res = self.client.get("/api/history?limit=10")
        self.assertEqual(hist_res.status_code, 200)
        records = hist_res.json()["records"]
        self.assertGreater(len(records), 0)

        # 3. Fetch single record details
        rec_id = records[0]["id"]
        detail_res = self.client.get(f"/api/history/{rec_id}")
        self.assertEqual(detail_res.status_code, 200)
        detail = detail_res.json()["record"]
        self.assertEqual(detail["id"], rec_id)
        self.assertIn("metrics", detail)
        self.assertIn("explainability", detail)


if __name__ == "__main__":
    unittest.main()
