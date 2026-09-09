"""
Acoustic and Voice Activity Detection (VAD) Pipeline
VoiceShield AI - Real-time Signal Processing Engine
Smart India Hackathon 2026 - Voice Cloning Impersonation Detection

Includes:
1. Universal Audio Ingestion & Decoding (WebM, Opus, MP3, WAV, AAC, M4A, OGG, FLAC)
2. Pre-Analysis Signal Quality Diagnostics (SNR, clipping, silence %, RMS, sample rate, channels)
3. Voice Activity Detection (VAD) & Silence Segmentation
4. Full-Utterance Acoustic Biometric Feature Extraction:
   - Fundamental frequency (f0) contour & intonation prosody variance
   - Physiological vocal micro-jitter (period-to-period perturbation)
   - Pause acoustics (digital zero silence ratio vs room tone)
   - Spectral envelope, rolloff, centroid, and high-frequency band ratio
   - Acoustic liveness & replay anomaly detection (comb filtering & speakerphone cutoff)
   - Background noise floor isolation & classification
   - Multi-speaker overlap detection
"""

import io
import wave
import math
import numpy as np
from typing import Dict, Any, Tuple, Optional


class AcousticAnalyzer:
    @staticmethod
    def parse_audio_samples(audio_bytes: bytes) -> Tuple[np.ndarray, int, float, int]:
        """
        Extracts mono PCM float samples [-1.0, 1.0], sample rate (standardized to 16000Hz),
        exact duration in seconds, and original channel count.
        Uses PyAV (FFmpeg engine) if available, with resilient standard library fallbacks.
        """
        if not audio_bytes or len(audio_bytes) < 16:
            return np.zeros(0, dtype=np.float32), 16000, 0.0, 1

        # 1. Primary: PyAV (FFmpeg engine) - decodes any container/codec directly to 16kHz mono float32
        try:
            import av
            container = av.open(io.BytesIO(audio_bytes))
            if container.streams.audio:
                stream = container.streams.audio[0]
                channels = stream.channels or 1
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
                    return samples, 16000, duration, channels
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

                # Resample to 16000 if different using linear interpolation (dependency-free)
                if sample_rate != 16000 and sample_rate > 0 and len(data) > 0:
                    target_len = int(len(data) * 16000.0 / float(sample_rate))
                    indices = np.linspace(0, len(data) - 1, target_len)
                    data = np.interp(indices, np.arange(len(data)), data).astype(np.float32)
                    sample_rate = 16000

                return data, sample_rate, duration, num_channels
        except Exception:
            pass

        # 3. Tertiary fallback: soundfile if installed
        try:
            import soundfile as sf
            data, sample_rate = sf.read(io.BytesIO(audio_bytes), dtype='float32')
            channels = data.shape[1] if data.ndim > 1 else 1
            if data.ndim > 1:
                data = data.mean(axis=1)
            duration = float(len(data)) / float(sample_rate) if sample_rate > 0 else 0.0
            if sample_rate != 16000 and sample_rate > 0 and len(data) > 0:
                target_len = int(len(data) * 16000.0 / float(sample_rate))
                indices = np.linspace(0, len(data) - 1, target_len)
                data = np.interp(indices, np.arange(len(data)), data).astype(np.float32)
                sample_rate = 16000
            if len(data) > 0:
                return data, sample_rate, duration, channels
        except Exception:
            pass

        # 4. Raw PCM / Byte estimation fallback
        if len(audio_bytes) > 200:
            try:
                # Try raw 16-bit PCM interpretation
                raw_data = np.frombuffer(audio_bytes[:len(audio_bytes) - (len(audio_bytes) % 2)], dtype=np.int16)
                data = raw_data.astype(np.float32) / 32768.0
                duration = len(data) / 16000.0
                return data, 16000, duration, 1
            except Exception:
                pass

        return np.zeros(0, dtype=np.float32), 16000, 0.0, 1

    @classmethod
    def get_pre_analysis_quality(
        cls,
        samples: np.ndarray,
        sr: int,
        duration: float,
        channels: int = 1
    ) -> Dict[str, Any]:
        """
        Calculates pre-analysis audio quality diagnostics:
        - duration, sample_rate, channels
        - RMS energy level, peak amplitude
        - true clipping detection (samples >= 0.985)
        - silence percentage
        - SNR (Signal-to-Noise Ratio) estimate in dB
        - background noise level
        - voice activity status
        """
        if len(samples) == 0:
            return {
                "duration": 0.0,
                "sample_rate": sr,
                "channels": channels,
                "rms_level": 0.0,
                "silence_pct": 100.0,
                "snr_estimate": "N/A (No Audio)",
                "snr_db": 0.0,
                "clipping_detected": False,
                "background_noise_level": "Unknown",
                "voice_activity": "No Audio Detected"
            }

        rms = float(np.sqrt(np.mean(samples ** 2)))
        peak = float(np.max(np.abs(samples)))
        clipped_samples = int(np.sum(np.abs(samples) >= 0.985))
        clipping_detected = clipped_samples > max(5, int(len(samples) * 0.0005))

        # Frame-based energy analysis (30ms frame, 15ms hop)
        frame_len = int(sr * 0.03)
        hop_len = int(sr * 0.015)
        num_frames = max(1, (len(samples) - frame_len) // hop_len)

        frame_energies = [
            float(np.sqrt(np.mean(samples[i * hop_len : i * hop_len + frame_len] ** 2)))
            for i in range(num_frames)
        ]

        if not frame_energies:
            frame_energies = [rms]

        p15 = float(np.percentile(frame_energies, 15))
        p90 = float(np.percentile(frame_energies, 90))
        
        # Ambient noise floor estimation (ambient room noise is typically < 0.03 RMS)
        if p15 < 0.04:
            noise_floor = max(1e-5, p15)
        else:
            noise_floor = 0.003

        voice_level = max(noise_floor, p90)

        # Active speech frames vs silence
        speech_thresh = max(0.010, noise_floor * 1.8)
        active_speech_frames = [e for e in frame_energies if e >= speech_thresh]

        if rms < 0.004 and peak < 0.01:
            silence_pct = 100.0
        elif len(active_speech_frames) >= int(len(frame_energies) * 0.95):
            silence_pct = 0.0
        elif len(active_speech_frames) == 0:
            silence_pct = 100.0
        else:
            silent_frames = [e for e in frame_energies if e < speech_thresh]
            silence_pct = round((len(silent_frames) / float(len(frame_energies))) * 100.0, 1)

        # SNR Estimation in dB: 20 * log10(voice_level / noise_floor)
        if noise_floor > 0 and voice_level > noise_floor:
            snr_db = round(20.0 * math.log10(voice_level / noise_floor), 1)
        elif rms > 0.02:
            snr_db = 28.0
        else:
            snr_db = 0.0

        if snr_db >= 20.0:
            snr_desc = f"{snr_db} dB (Excellent)"
        elif snr_db >= 12.0:
            snr_desc = f"{snr_db} dB (Good)"
        elif snr_db >= 6.0:
            snr_desc = f"{snr_db} dB (Fair)"
        else:
            snr_desc = f"{snr_db} dB (Poor/Noisy)"

        # Background noise level
        if noise_floor < 0.008:
            noise_level = "Low"
        elif noise_floor < 0.035:
            noise_level = "Medium"
        else:
            noise_level = "High"

        # Voice activity designation
        if peak < 0.007 and rms < 0.003:
            voice_activity = "No Speech Detected (Silence)"
        elif silence_pct > 88.0:
            voice_activity = "Insufficient Speech Detected"
        elif snr_db < 4.0 and noise_level == "High":
            voice_activity = "Heavy Noise (Speech Obscured)"
        else:
            voice_activity = "Speech Detected"

        return {
            "duration": round(duration, 2),
            "sample_rate": sr,
            "channels": channels,
            "rms_level": round(rms, 4),
            "peak_level": round(peak, 4),
            "silence_pct": silence_pct,
            "snr_estimate": snr_desc,
            "snr_db": snr_db,
            "clipping_detected": clipping_detected,
            "background_noise_level": noise_level,
            "voice_activity": voice_activity,
            "noise_floor_rms": round(noise_floor, 5)
        }

    @classmethod
    def check_voice_activity(
        cls,
        audio_bytes: bytes,
        parsed_cache: Optional[Tuple[np.ndarray, int, float, int]] = None
    ) -> Dict[str, Any]:
        """
        Voice Activity & Signal Validation.
        Prevents silence, severe noise, or truncated audio from producing false classifications.
        """
        if parsed_cache is not None:
            samples, sr, duration, channels = parsed_cache
        else:
            samples, sr, duration, channels = cls.parse_audio_samples(audio_bytes)

        quality = cls.get_pre_analysis_quality(samples, sr, duration, channels)

        # 1. Truncated Audio (< 1.2s is too short for acoustic biometric evaluation)
        if duration < 1.2 or len(samples) < 16000 * 1.2:
            return {
                "passed": False,
                "status": "too_short",
                "duration": round(duration, 1),
                "title": "⏱️ Recording Too Short",
                "message": "Audio sample is too short for reliable biometric analysis (minimum 2 seconds required).",
                "instructions": "Please record or upload a sample of at least 3 to 10 seconds of clear speech.",
                "quality": quality,
                "speech_detected": True if quality["rms_level"] > 0.01 else False,
                "voice_detected": True if quality["rms_level"] > 0.01 else False
            }

        # 2. Silence / No Speech Check
        if quality["peak_level"] < 0.007 and quality["rms_level"] < 0.003:
            return {
                "passed": False,
                "status": "no_voice",
                "duration": round(duration, 1),
                "title": "🔇 No Voice Detected",
                "message": "We couldn't detect speech in this recording. Please speak clearly and try again.",
                "instructions": "Please speak into the microphone and ensure your volume is turned up.",
                "quality": quality,
                "speech_detected": False,
                "voice_detected": False
            }

        if quality["silence_pct"] > 88.0:
            return {
                "passed": False,
                "status": "insufficient_speech",
                "duration": round(duration, 1),
                "title": "🔇 No Sufficient Speech Detected",
                "message": "The recording does not contain enough usable speech for reliable voice-authenticity analysis.",
                "instructions": "Please speak clearly into the microphone or verify that the audio file contains audible spoken dialogue.",
                "quality": quality,
                "speech_detected": False,
                "voice_detected": False
            }

        # 3. Severe Noise / Unusable Audio Check
        # If noise floor completely drowns signal (SNR < 3dB and high background)
        if quality["snr_db"] < 3.0 and quality["background_noise_level"] == "High":
            return {
                "passed": False,
                "status": "poor_quality",
                "duration": round(duration, 1),
                "title": "⚠️ Insufficient Audio Quality",
                "message": "Audio quality is insufficient for reliable authenticity analysis due to heavy background noise or distortion.",
                "instructions": "Please re-record in a quieter environment or use an audio sample with less acoustic interference.",
                "quality": quality,
                "speech_detected": True,
                "voice_detected": True
            }

        return {
            "passed": True,
            "status": "success",
            "duration": round(duration, 1),
            "quality": quality,
            "speech_detected": True,
            "voice_detected": True
        }

    @classmethod
    def extract_features(
        cls,
        audio_bytes: bytes,
        parsed_cache: Optional[Tuple[np.ndarray, int, float, int]] = None
    ) -> Dict[str, Any]:
        """
        Extracts acoustic biometric, liveness, and background audio properties.
        Analyzes actual audio signal properties across the full recording:
        - Pitch contour & Prosodic variance
        - Vocal micro-jitter (period perturbation)
        - Digital silence ratio vs room tone
        - Spectral rolloff, centroid, and high-frequency band ratio
        - Acoustic liveness & replay anomaly heuristics
        - Background noise floor isolation
        """
        if parsed_cache is not None:
            samples, sr, duration, channels = parsed_cache
        else:
            samples, sr, duration, channels = cls.parse_audio_samples(audio_bytes)

        if len(samples) == 0:
            samples = np.zeros(16000, dtype=np.float32)
            sr = 16000
            duration = 1.0

        quality = cls.get_pre_analysis_quality(samples, sr, duration, channels)
        rms = quality["rms_level"]
        peak = quality["peak_level"]

        # 1. Frame-by-frame analysis (30ms frame, 15ms hop)
        frame_len = int(sr * 0.03)  # 480 samples at 16kHz
        hop_len = int(sr * 0.015)   # 240 samples at 16kHz
        num_frames = max(1, (len(samples) - frame_len) // hop_len)

        frame_energies = [
            float(np.sqrt(np.mean(samples[i * hop_len : i * hop_len + frame_len] ** 2)))
            for i in range(num_frames)
        ]

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

        # 5. Acoustic Liveness & Replay Analysis (Speaker-through-mic acoustic transfer)
        # Replay characteristics:
        # - Attenuation of extreme high frequencies (< 3000 Hz) + comb filtering (periodic notches)
        # - High digital silence or double room reverberation
        comb_filtering_score = 0
        if len(fft_mag) > 100:
            diffs = np.abs(np.diff(fft_mag[:100]))
            comb_filtering_score = float(np.std(diffs) / (np.mean(diffs) + 1e-6))

        is_replayed = False
        if spectral_rolloff < 2600.0 and comb_filtering_score > 3.8 and quality["snr_db"] < 12.0:
            replay_risk = "HIGH"
            liveness_status = "FAIL"
            is_replayed = True
        elif spectral_rolloff < 3200.0 or comb_filtering_score > 2.8:
            replay_risk = "MEDIUM"
            liveness_status = "REVIEW"
        else:
            replay_risk = "LOW"
            liveness_status = "PASS"

        # 6. Background Sound Analysis
        if noise_floor_rms < 0.009:
            background_level = "Low"
            background_type = "Clean / Quiet Room"
        elif noise_floor_rms < 0.038:
            background_level = "Medium"
            background_type = "Ambient / Indoor Noise"
        else:
            background_level = "High"
            background_type = "Noisy Environment"

        # Multi-speaker check
        multiple_voices = False
        num_voices = 1
        if len(pitches) >= 8:
            p_sorted = sorted(pitches)
            p10 = p_sorted[int(len(p_sorted) * 0.10)]
            p90 = p_sorted[int(len(p_sorted) * 0.90)]
            if (p90 - p10) > 80.0 and pitch_std > 28.0 and jitter_pct < 2.5:
                multiple_voices = True
                num_voices = 2
                background_type = "Multiple Overlapping Voices"

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
            "num_voices": num_voices,
            "liveness_status": liveness_status,
            "replay_risk": replay_risk,
            "is_replayed": is_replayed,
            "quality": quality
        }
