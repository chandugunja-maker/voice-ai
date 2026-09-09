"""
Acoustic and Voice Activity Detection (VAD) Pipeline
VoiceShield AI - Real-time Signal Processing Engine

Includes:
1. Universal Audio Ingestion & PyAV Decoding (WebM, Opus, MP3, WAV, AAC, M4A, OGG, FLAC)
2. Whole-Audio Voice Activity Detection (VAD)
3. Full-Utterance Acoustic Biometric Feature Extraction:
   - Fundamental frequency (F0) tracking across all voiced frames
   - Physiological micro-jitter (period-to-period perturbation)
   - Intonation prosody (pitch standard deviation)
   - Pause acoustics (digital zero silence ratio vs room tone)
   - Spectral envelope, rolloff, centroid, and high-frequency band ratio
   - Isolated background noise floor & classification (clean, indoor, traffic, music)
   - Multiple speaker detection
"""

import io
import wave
import math
import numpy as np
from typing import Dict, Any, Tuple, Optional


class AcousticAnalyzer:
    @staticmethod
    def parse_audio_samples(audio_bytes: bytes) -> Tuple[np.ndarray, int, float]:
        """
        Extracts mono PCM float samples [-1.0, 1.0], sample rate (standardized to 16000Hz),
        and exact duration in seconds.
        Uses PyAV (FFmpeg) first to natively decode WebM/Opus, MP3, WAV, AAC, M4A, OGG, FLAC,
        with seamless resampling to 16kHz mono.
        Falls back to standard wave and soundfile modules if needed.
        """
        if not audio_bytes or len(audio_bytes) < 16:
            return np.zeros(0, dtype=np.float32), 16000, 0.0

        # 1. Primary: PyAV (FFmpeg engine) - decodes any container/codec directly to 16kHz mono float32
        try:
            import av
            container = av.open(io.BytesIO(audio_bytes))
            if container.streams.audio:
                stream = container.streams.audio[0]
                resampler = av.AudioResampler(format='fltp', layout='mono', rate=16000)
                audio_chunks = []
                for frame in container.decode(stream):
                    frame.pts = None
                    for rf in resampler.resample(frame):
                        audio_chunks.append(rf.to_ndarray())
                for rf in resampler.resample(None):
                    audio_chunks.append(rf.to_ndarray())
                container.close()

                if audio_chunks:
                    samples = np.concatenate(audio_chunks, axis=-1).flatten().astype(np.float32)
                    samples = np.clip(samples, -1.0, 1.0)
                    duration = float(len(samples)) / 16000.0
                    return samples, 16000, duration
        except Exception:
            pass

        # 2. Secondary fallback: standard wave module for uncompressed WAV
        try:
            with wave.open(io.BytesIO(audio_bytes), "rb") as wf:
                sample_rate = wf.getframerate()
                num_channels = wf.getnchannels()
                sample_width = wf.getsampwidth()
                num_frames = wf.getnframes()
                raw_frames = wf.readframes(num_frames)

                if sample_width == 2:
                    data = np.frombuffer(raw_frames, dtype=np.int16).astype(np.float32) / 32768.0
                elif sample_width == 1:
                    data = (np.frombuffer(raw_frames, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
                elif sample_width == 4:
                    data = np.frombuffer(raw_frames, dtype=np.int32).astype(np.float32) / 2147483648.0
                else:
                    data = np.frombuffer(raw_frames, dtype=np.int16).astype(np.float32) / 32768.0

                if num_channels > 1:
                    data = data.reshape(-1, num_channels).mean(axis=1)

                duration = float(len(data)) / float(sample_rate) if sample_rate > 0 else 0.0
                return data, sample_rate, duration
        except Exception:
            pass

        # 3. Tertiary fallback: soundfile if installed
        try:
            import soundfile as sf
            data, sample_rate = sf.read(io.BytesIO(audio_bytes), dtype='float32')
            if data.ndim > 1:
                data = data.mean(axis=1)
            duration = float(len(data)) / float(sample_rate) if sample_rate > 0 else 0.0
            if len(data) > 0:
                return data, sample_rate, duration
        except Exception:
            pass

        return np.zeros(0, dtype=np.float32), 16000, 0.0

    @classmethod
    def check_voice_activity(
        cls,
        audio_bytes: bytes,
        parsed_cache: Optional[Tuple[np.ndarray, int, float]] = None,
        fast_mode: bool = False
    ) -> Dict[str, Any]:
        """
        Step 1 & 2: Voice Activity Detection (VAD) & Human Speech Check.
        Only reports 'no_voice' if there is genuinely no audio or no speech.
        Does NOT show 'no_voice' for quiet, noisy, or unclear voice.
        """
        if parsed_cache is not None:
            samples, sr, duration = parsed_cache
        else:
            samples, sr, duration = cls.parse_audio_samples(audio_bytes)

        if len(samples) == 0 or duration < 0.4:
            return {
                "passed": False,
                "status": "no_voice",
                "duration": round(duration, 1),
                "title": "🔇 No Audio Detected",
                "message": "We couldn't receive any audio. Please check your microphone and try again.",
                "instructions": "Make sure your microphone is connected and not muted.",
                "speech_detected": False,
                "voice_detected": False
            }

        # Step 1 Check Duration (< 1.2s is too short for acoustic biometric evaluation)
        if duration < 1.2:
            return {
                "passed": False,
                "status": "too_short",
                "duration": round(duration, 1),
                "title": "⏱️ Recording Too Short",
                "message": "Please speak for a few more seconds so we can check the voice.",
                "speech_detected": True,
                "voice_detected": True
            }

        rms = float(np.sqrt(np.mean(samples ** 2))) if len(samples) > 0 else 0.0
        peak = float(np.max(np.abs(samples))) if len(samples) > 0 else 0.0

        # Frame-by-frame energy to detect speech bursts (30ms frame, 15ms hop)
        frame_len = int(sr * 0.03)
        hop_len = int(sr * 0.015)
        num_frames = max(1, (len(samples) - frame_len) // hop_len)

        frame_energies = [
            float(np.sqrt(np.mean(samples[i * hop_len : i * hop_len + frame_len] ** 2)))
            for i in range(num_frames)
        ]

        # Adaptive background threshold
        p15_energy = float(np.percentile(frame_energies, 15)) if frame_energies else 0.0
        speech_threshold = max(0.005, p15_energy * 1.8)
        active_speech_frames = [e for e in frame_energies if e > speech_threshold]
        speech_ratio = len(active_speech_frames) / float(num_frames) if num_frames > 0 else 0.0

        # Step 2: Genuine silence or complete absence of speech check
        # Only triggers if signal is near dead silence (<0.007 peak and virtually 0 speech frames)
        if peak < 0.007 and rms < 0.0025 and len(active_speech_frames) < 3:
            return {
                "passed": False,
                "status": "no_voice",
                "duration": round(duration, 1),
                "title": "🔇 No Voice Detected",
                "message": "We couldn't detect speech in this recording. Please speak clearly and try again.",
                "instructions": "Please speak into the microphone and ensure your volume is turned up.",
                "speech_detected": False,
                "voice_detected": False
            }

        return {
            "passed": True,
            "status": "success",
            "duration": round(duration, 1),
            "rms": rms,
            "speech_ratio": speech_ratio,
            "speech_detected": True,
            "voice_detected": True
        }

    @classmethod
    def extract_features(
        cls,
        audio_bytes: bytes,
        parsed_cache: Optional[Tuple[np.ndarray, int, float]] = None,
        fast_mode: bool = False
    ) -> Dict[str, Any]:
        """
        Extracts acoustic biometric, main speaker, background noise, and multi-voice indicators.
        Analyzes actual audio signal properties across the full recording:
        - Pitch contour & Prosody intonation variance
        - Vocal micro-jitter (neuromuscular tremor)
        - Digital pause silence ratio vs room tone
        - Spectral Rolloff, Centroid, and High-Frequency Band Energy Ratio
        - Background energy isolated from active speech
        - Second speaker overlap detection
        """
        if parsed_cache is not None:
            samples, sr, duration = parsed_cache
        else:
            samples, sr, duration = cls.parse_audio_samples(audio_bytes)

        if len(samples) == 0:
            samples = np.zeros(16000, dtype=np.float32)
            sr = 16000
            duration = 1.0

        rms = float(np.sqrt(np.mean(samples ** 2)))
        peak = float(np.max(np.abs(samples)))

        # 1. Frame-by-frame analysis (30ms frame, 15ms hop)
        frame_len = int(sr * 0.03)  # 480 samples at 16kHz
        hop_len = int(sr * 0.015)   # 240 samples at 16kHz
        num_frames = max(1, (len(samples) - frame_len) // hop_len)

        frame_energies = [
            float(np.sqrt(np.mean(samples[i * hop_len : i * hop_len + frame_len] ** 2)))
            for i in range(num_frames)
        ]

        # Background floor estimated from 20th percentile
        p20_energy = float(np.percentile(frame_energies, 20)) if frame_energies else 0.001
        voice_thresh = max(0.008, p20_energy * 1.8)

        min_lag = int(sr / 450)  # 450 Hz max f0 (~35 samples)
        max_lag = int(sr / 75)   # 75 Hz min f0 (~213 samples)

        pitches = []
        harmonics = []
        voiced_segments = []

        for i in range(num_frames):
            frame = samples[i * hop_len : i * hop_len + frame_len]
            energy = frame_energies[i]

            if energy >= voice_thresh:
                corr = np.correlate(frame, frame, mode='full')[frame_len - 1:]
                if max_lag < len(corr) and corr[0] > 1e-7:
                    search_slice = corr[min_lag:max_lag]
                    peak_idx = int(np.argmax(search_slice))
                    peak_val = float(search_slice[peak_idx])
                    r_norm = peak_val / corr[0]

                    if r_norm >= 0.32:  # Valid voiced frame
                        lag = min_lag + peak_idx
                        f0 = float(sr) / float(lag)
                        pitches.append(f0)
                        harmonics.append(r_norm)
                        voiced_segments.append(frame)

        # 2. Main Voice Pitch & Biometrics
        mean_pitch = float(np.mean(pitches)) if pitches else 142.0
        pitch_std = float(np.std(pitches)) if len(pitches) >= 2 else 4.5
        avg_harmonicity = float(np.mean(harmonics)) if harmonics else 0.45

        # Micro-jitter calculation (relative period perturbation in %)
        if len(pitches) >= 3:
            periods = 1.0 / np.array(pitches)
            period_diffs = np.abs(np.diff(periods))
            mean_period = float(np.mean(periods))
            jitter_pct = float(np.mean(period_diffs) / mean_period * 100.0) if mean_period > 0 else 0.0
        else:
            jitter_pct = 0.85

        # 3. Digital Pause Silence vs Ambient Mic Floor
        energies_arr = np.array(frame_energies) if frame_energies else np.zeros(1)
        p25 = float(np.percentile(energies_arr, 25))
        pause_frames = energies_arr[energies_arr <= p25]
        if len(pause_frames) > 0:
            dig_silence_count = int(np.sum(pause_frames < 0.0004))
            dig_silence_ratio = float(dig_silence_count) / float(len(pause_frames))
            noise_floor_rms = float(np.median(pause_frames))
        else:
            dig_silence_ratio = 0.0
            noise_floor_rms = 0.002

        # 4. Spectral Features across Voiced Speech
        if voiced_segments:
            voiced_samples = np.concatenate(voiced_segments)
            fft_size = min(4096, len(voiced_samples))
            fft_mag = np.abs(np.fft.rfft(voiced_samples[:fft_size]))
            freqs = np.fft.rfftfreq(fft_size, d=1.0 / sr)
        else:
            fft_size = min(2048, len(samples))
            fft_mag = np.abs(np.fft.rfft(samples[:fft_size]))
            freqs = np.fft.rfftfreq(fft_size, d=1.0 / sr)

        sum_mag = float(np.sum(fft_mag))
        if sum_mag > 1e-6:
            spectral_centroid = float(np.sum(freqs * fft_mag) / sum_mag)
            cum_mag = np.cumsum(fft_mag)
            roll_idx = np.where(cum_mag >= 0.85 * sum_mag)[0]
            spectral_rolloff = float(freqs[roll_idx[0]]) if len(roll_idx) > 0 else float(sr / 2)
            geo_mean = float(np.exp(np.mean(np.log(fft_mag + 1e-9))))
            arith_mean = float(np.mean(fft_mag) + 1e-9)
            spectral_flatness = float(geo_mean / arith_mean)

            # High-frequency band energy ratio (> 3800 Hz vs 500-3800 Hz)
            hf_mask = (freqs >= 3800)
            mf_mask = (freqs >= 500) & (freqs < 3800)
            hf_energy = float(np.sum(fft_mag[hf_mask] ** 2))
            mf_energy = float(np.sum(fft_mag[mf_mask] ** 2)) + 1e-9
            hf_ratio = float(hf_energy / mf_energy)
        else:
            spectral_centroid = 1500.0
            spectral_rolloff = 3500.0
            spectral_flatness = 0.15
            hf_ratio = 0.10

        # 5. Background Sound Analysis (Separated from Voice Clarity)
        if noise_floor_rms < 0.009:
            background_level = "Low"
        elif noise_floor_rms < 0.038:
            background_level = "Medium"
        else:
            background_level = "High"

        if noise_floor_rms < 0.006 and spectral_flatness < 0.18:
            background_type = "Clean / Quiet Room"
        elif spectral_flatness > 0.30 and spectral_rolloff > 4500:
            background_type = "Strong Noise / Static"
        elif spectral_rolloff > 3800 or (noise_floor_rms >= 0.02 and spectral_centroid > 2200):
            background_type = "Outdoor / Ambient Noise"
        elif spectral_centroid < 1800 and noise_floor_rms >= 0.008:
            background_type = "Indoor Room Noise"
        elif spectral_flatness < 0.12 and spectral_rolloff > 4200 and len(pitches) > 10:
            background_type = "Background Music"
        else:
            background_type = "Clean / Quiet Room"

        # 6. Multi-speaker check
        multiple_voices = False
        num_voices = 1
        if len(pitches) >= 8:
            p_sorted = sorted(pitches)
            p10 = p_sorted[int(len(p_sorted) * 0.10)]
            p90 = p_sorted[int(len(p_sorted) * 0.90)]
            if (p90 - p10) > 80.0 and pitch_std > 28.0 and jitter_pct < 2.5:
                multiple_voices = True
                num_voices = 2
                background_type = "Multiple Voices"

        return {
            "duration": round(duration, 2),
            "rms_energy": round(rms, 4),
            "peak_amplitude": round(peak, 4),
            "noise_floor_rms": round(noise_floor_rms, 5),
            "spectral_centroid": round(spectral_centroid, 1),
            "spectral_rolloff": round(spectral_rolloff, 1),
            "spectral_flatness": round(spectral_flatness, 3),
            "hf_ratio": round(hf_ratio, 4),
            "mean_pitch": round(mean_pitch, 1),
            "pitch_variance": round(pitch_std, 2),
            "jitter_pct": round(jitter_pct, 3),
            "harmonicity": round(avg_harmonicity, 3),
            "dig_silence_ratio": round(dig_silence_ratio, 3),
            "voiced_frames": len(pitches),
            "background_level": background_level,
            "background_type": background_type,
            "multiple_voices": multiple_voices,
            "num_voices": num_voices
        }
