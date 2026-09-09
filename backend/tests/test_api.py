"""
Unit & Integration Tests for VoiceShield AI Backend
"""

import unittest
import io
import wave
import numpy as np
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.acoustic_analyzer import AcousticAnalyzer
from backend.app.services.blockchain_ledger import BlockchainLedger
from backend.app.services.voice_detection import VoiceDetectionService


class TestVoiceShieldBackend(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.sr = 16000
        self.duration = 4.0
        t = np.linspace(0, self.duration, int(self.sr * self.duration), endpoint=False)
        # Speech-like audio with 130Hz harmonic structure
        sig = 0.5 * np.sin(2 * np.pi * 130.0 * t) + 0.3 * np.sin(2 * np.pi * 260.0 * t)
        pcm = (sig * 32767).astype(np.int16)

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(self.sr)
            wf.writeframes(pcm.tobytes())
        self.dummy_wav_bytes = buf.getvalue()

        # Pure silence WAV
        silence_pcm = np.zeros(int(self.sr * self.duration), dtype=np.int16)
        s_buf = io.BytesIO()
        with wave.open(s_buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(self.sr)
            wf.writeframes(silence_pcm.tobytes())
        self.silence_wav_bytes = s_buf.getvalue()

    def test_health_endpoint(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["app_name"], "VoiceShield AI")

    def test_stats_endpoint(self):
        res = self.client.get("/api/stats")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("total_verifications", data)
        self.assertIn("avg_risk_score", data)

    def test_acoustic_analyzer_features(self):
        features = AcousticAnalyzer.extract_features(self.dummy_wav_bytes)
        self.assertIn("spectral_centroid", features)
        self.assertIn("pitch_variance", features)
        self.assertGreater(features["duration"], 2.0)

    def test_vad_silence_detection(self):
        vad = AcousticAnalyzer.check_voice_activity(self.silence_wav_bytes)
        self.assertFalse(vad["passed"])
        self.assertEqual(vad["status"], "no_voice")
        self.assertIn("No Voice Detected", vad["title"])

    def test_blockchain_ledger(self):
        ledger = BlockchainLedger()
        proof = ledger.record_verification(
            audio_bytes=self.dummy_wav_bytes,
            classification="genuine",
            risk_score=18,
            confidence=0.92
        )
        self.assertEqual(proof.status, "VERIFIED_TAMPER_EVIDENT")
        self.assertEqual(len(proof.audio_sha256), 64)
        self.assertEqual(len(proof.verification_hash), 64)
        integrity = ledger.verify_integrity()
        self.assertTrue(integrity["is_valid"])

    def test_voice_detection_service(self):
        service = VoiceDetectionService(demo_mode=True)
        res = service.analyze_audio(self.dummy_wav_bytes, "test.wav")
        self.assertEqual(res.status, "success")
        self.assertIn(res.classification, ["genuine", "suspicious", "ai_generated"])
        self.assertIn("main_voice", res.simple_features)
        self.assertIn("background_sound", res.simple_features)
        self.assertTrue(res.speech_detected)
        self.assertTrue(res.voice_detected)
        self.assertIsNotNone(res.background_type)
        self.assertIsNotNone(res.blockchain_proof)

    def test_analyze_demo_endpoint(self):
        res = self.client.post("/api/analyze-demo/rahul")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["classification"], "genuine")
        self.assertEqual(data["classification_label"], "Likely Real Voice")
        self.assertIn("LOW", data["risk_level"].upper())

        res_ai = self.client.post("/api/analyze-demo/processed")
        self.assertEqual(res_ai.status_code, 200)
        data_ai = res_ai.json()
        self.assertEqual(data_ai["classification"], "ai_generated")
        self.assertEqual(data_ai["classification_label"], "Possible AI-Generated Voice")
        self.assertIn("HIGH", data_ai["risk_level"].upper())

    def test_microphone_test_endpoint(self):
        files = {"audio": ("mic_test.wav", self.dummy_wav_bytes, "audio/wav")}
        res = self.client.post("/api/test-microphone", files=files)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("status", data)
        self.assertIn("Microphone", data["title"])

    def test_webm_and_ai_voice_discrimination(self):
        """Verify that PyAV decodes WebM and that AI voice is accurately distinguished from human voice."""
        import av

        # Helper to encode continuous float samples into WebM
        def encode_webm(samples, sample_rate=48000):
            pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
            buf = io.BytesIO()
            oc = av.open(buf, mode='w', format='webm')
            s = oc.add_stream('opus', rate=sample_rate)
            s.layout = 'mono'
            chunk = 960
            for i in range(0, len(pcm) - chunk, chunk):
                frame = av.AudioFrame.from_ndarray(pcm[i:i+chunk].reshape(1, -1), format='s16', layout='mono')
                frame.rate = sample_rate
                frame.pts = i
                for pkt in s.encode(frame):
                    oc.mux(pkt)
            for pkt in s.encode(None):
                oc.mux(pkt)
            oc.close()
            return buf.getvalue()

        # 1. Continuous Human WebM (prosody, micro-jitter, room tone)
        sr = 48000
        t_h = np.linspace(0, 2.5, int(sr * 2.5), endpoint=False)
        mask_h = ((t_h >= 0.2) & (t_h < 1.0)) | ((t_h >= 1.4) & (t_h < 2.3))
        f0_h = 135.0 + 24.0 * np.sin(2 * np.pi * 0.8 * t_h)
        j_h = 1.0 + 0.012 * np.random.randn(len(t_h))
        p_h = 2 * np.pi * np.cumsum(f0_h * j_h) / sr
        sig_h = 0.35 * np.sin(p_h) + 0.18 * np.sin(2 * p_h) + 0.08 * np.sin(3 * p_h)
        room_h = 0.003 * np.random.randn(len(t_h))
        h_audio = np.where(mask_h, sig_h + room_h, room_h).astype(np.float32)
        h_webm = encode_webm(h_audio, sr)

        # 2. Continuous AI WebM (flat pitch 165Hz, low jitter, digital silence in pauses)
        t_ai = np.linspace(0, 2.5, int(sr * 2.5), endpoint=False)
        mask_ai = ((t_ai >= 0.2) & (t_ai < 1.0)) | ((t_ai >= 1.4) & (t_ai < 2.3))
        f0_ai = 165.0 + 0.5 * np.sin(2 * np.pi * 0.3 * t_ai)
        j_ai = 1.0 + 0.0004 * np.random.randn(len(t_ai))
        p_ai = 2 * np.pi * np.cumsum(f0_ai * j_ai) / sr
        sig_ai = 0.38 * np.sin(p_ai) + 0.22 * np.sin(2 * p_ai)
        ai_audio = np.where(mask_ai, sig_ai, 0.0).astype(np.float32)
        ai_webm = encode_webm(ai_audio, sr)

        # Test Human WebM
        res_h = self.client.post("/api/analyze-voice", files={"audio": ("human.webm", h_webm, "audio/webm")})
        self.assertEqual(res_h.status_code, 200)
        dh = res_h.json()
        self.assertEqual(dh["classification"], "genuine")
        self.assertEqual(dh["classification_label"], "Likely Real Voice")
        self.assertLessEqual(dh["risk_score"], 34)

        # Test AI WebM
        res_ai = self.client.post("/api/analyze-voice", files={"audio": ("ai.webm", ai_webm, "audio/webm")})
        self.assertEqual(res_ai.status_code, 200)
        dai = res_ai.json()
        self.assertEqual(dai["classification"], "ai_generated")
        self.assertEqual(dai["classification_label"], "Possible AI-Generated Voice")
        self.assertGreaterEqual(dai["risk_score"], 65)

        # Verify values are dynamic and distinct
        self.assertNotEqual(dh["risk_score"], dai["risk_score"])
        self.assertNotEqual(dh["confidence_percentage"], 0)


if __name__ == "__main__":
    unittest.main()
