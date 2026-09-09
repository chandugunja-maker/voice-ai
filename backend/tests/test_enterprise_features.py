"""
Enterprise Feature Tests for VoiceShield AI
Validates audio quality diagnostics, verdict scales, explainability,
history persistence, and dashboard analytics.
"""

import unittest
import io
import wave
import numpy as np
from fastapi.testclient import TestClient
from backend.app.main import app


class TestEnterpriseFeatures(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.sr = 16000

        # Human-like speech simulation with pitch inflection and room tone
        duration = 3.5
        t = np.linspace(0, duration, int(self.sr * duration), endpoint=False)
        f0 = 135.0 + 20.0 * np.sin(2 * np.pi * 1.2 * t)
        phase = 2 * np.pi * np.cumsum(f0) / self.sr
        speech = 0.4 * np.sin(phase) + 0.2 * np.sin(2 * phase)
        room_tone = 0.003 * np.random.randn(len(t))
        # Add a pause interval
        mask = (t < 1.4) | (t > 1.8)
        audio = np.where(mask, speech + room_tone, room_tone)
        pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16)

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(self.sr)
            wf.writeframes(pcm.tobytes())
        self.speech_wav = buf.getvalue()

        # Pure silence
        silence_pcm = np.zeros(int(self.sr * 2.0), dtype=np.int16)
        s_buf = io.BytesIO()
        with wave.open(s_buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(self.sr)
            wf.writeframes(silence_pcm.tobytes())
        self.silence_wav = s_buf.getvalue()

    def test_pre_analysis_and_authenticity_pipeline(self):
        files = {"audio": ("test_sample.wav", self.speech_wav, "audio/wav")}
        res = self.client.post("/api/analyze-voice", files=files)
        self.assertEqual(res.status_code, 200)
        data = res.json()

        # Check verdict format
        self.assertIn(data["verdict"], ["LIKELY AUTHENTIC", "UNCERTAIN — REVIEW", "LIKELY SYNTHETIC"])
        self.assertIsNotNone(data["confidence"])
        self.assertIn("RISK", data["risk_level"])

        # Check Audio Quality
        aq = data["audio_quality"]
        self.assertGreater(aq["duration"], 2.0)
        self.assertEqual(aq["sample_rate"], 16000)
        self.assertIn("voice_activity", aq)
        self.assertIn("snr_estimate", aq)

        # Check Metrics Breakdown
        metrics = data["metrics"]
        self.assertIn("authenticity", metrics)
        self.assertIn(metrics["liveness"], ["PASS", "REVIEW", "FAIL"])
        self.assertIn("naturalness", metrics)
        self.assertIn("spectral_consistency", metrics)
        self.assertIn("temporal_consistency", metrics)
        self.assertIn("replay_risk", metrics)

        # Check Explainability
        explain = data["explainability"]
        self.assertIsInstance(explain["positive_indicators"], list)
        self.assertIsInstance(explain["potential_concerns"], list)
        self.assertGreater(len(explain["positive_indicators"]), 0)

        # Check Background Audio
        bg = data["background_audio"]
        self.assertIn("summary", bg)
        self.assertIn("primary_voice", bg)

    def test_silence_handling_does_not_classify_as_ai(self):
        files = {"audio": ("silence.wav", self.silence_wav, "audio/wav")}
        res = self.client.post("/api/analyze-voice", files=files)
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertEqual(data["status"], "no_voice")
        self.assertIn("NO", data["verdict"].upper())
        self.assertIsNone(data["confidence"])
        self.assertIsNone(data["metrics"])

    def test_dashboard_stats_endpoint(self):
        res = self.client.get("/api/dashboard/stats")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertIn("total_analyses", data)
        self.assertIn("likely_authentic", data)
        self.assertIn("likely_synthetic", data)
        self.assertIn("uncertain", data)
        self.assertIn("charts", data)
        self.assertIn("verdict_distribution", data["charts"])
        self.assertIn("risk_distribution", data["charts"])
        self.assertIn("confidence_distribution", data["charts"])

    def test_history_endpoints_and_delete(self):
        # 1. Fetch History
        res = self.client.get("/api/history")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertGreater(len(data["records"]), 0)

        first_id = data["records"][0]["id"]

        # 2. Get Detail
        detail_res = self.client.get(f"/api/history/{first_id}")
        self.assertEqual(detail_res.status_code, 200)
        detail_data = detail_res.json()
        self.assertEqual(detail_data["record"]["id"], first_id)

        # 3. Delete Record
        del_res = self.client.delete(f"/api/history/{first_id}")
        self.assertEqual(del_res.status_code, 200)

    def test_audio_quality_diagnostic_endpoint(self):
        files = {"audio": ("test_sample.wav", self.speech_wav, "audio/wav")}
        res = self.client.post("/api/audio-quality", files=files)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["passed"])
        self.assertEqual(data["status"], "success")
        self.assertIn("quality", data)
        self.assertGreater(data["quality"]["duration"], 2.0)
        self.assertEqual(data["quality"]["sample_rate"], 16000)

    def test_health_endpoint(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["app_name"], "VoiceShield AI")
        self.assertIn("tagline", data)


if __name__ == "__main__":
    unittest.main()

