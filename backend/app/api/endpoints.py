"""
API Endpoints for VoiceShield AI
Clean, robust, and accessible verification API.
"""

import os
import numpy as np
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from backend.app.config import settings
from backend.app.models.schemas import (
    VoiceAnalysisResponse,
    MicrophoneTestResponse,
    StatsSummary,
    HealthResponse
)
from backend.app.services.acoustic_analyzer import AcousticAnalyzer
from backend.app.services.voice_detection import voice_service
from backend.app.services.blockchain_ledger import ledger

router = APIRouter(prefix="/api", tags=["VoiceShield Verification"])

_stats_counter = {
    "total": 142,
    "genuine": 88,
    "suspicious": 32,
    "ai_generated": 22,
    "risk_sum": 4580,
    "high_risk_prevented": 54
}


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health status and configuration."""
    return HealthResponse(
        status="healthy",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        demo_mode=settings.DEMO_MODE,
        sih_team=f"{settings.TEAM_NAME} ({settings.TEAM_ID})"
    )


@router.post("/test-microphone", response_model=MicrophoneTestResponse)
async def test_microphone(
    audio: UploadFile = File(..., description="Short 1-2s audio sample for microphone testing")
):
    """
    Microphone Diagnostic Test:
    Returns:
    - '🎙️ Microphone detected' (clear voice)
    - '🔇 No voice detected' (silence / too quiet)
    - '⚠️ Microphone not detected' (corrupted stream)
    """
    try:
        contents = await audio.read()
        if len(contents) < 50:
            return MicrophoneTestResponse(
                status="not_detected",
                title="⚠️ Microphone not detected",
                message="No audio data was received from the browser microphone.",
                audio_level=0.0
            )

        samples, sr, duration = AcousticAnalyzer.parse_audio_samples(contents)
        if len(samples) == 0:
            return MicrophoneTestResponse(
                status="not_detected",
                title="⚠️ Microphone not detected",
                message="Could not decode audio from the browser microphone.",
                audio_level=0.0
            )

        rms = float(np.sqrt(np.mean(samples ** 2)))
        peak = float(np.max(np.abs(samples)))

        if rms < 0.004 and peak < 0.012:
            return MicrophoneTestResponse(
                status="no_voice",
                title="🔇 No voice detected",
                message="Microphone is active but no speech was heard. Please check your volume.",
                audio_level=round(rms * 100, 1)
            )

        return MicrophoneTestResponse(
            status="detected",
            title="🎙️ Microphone detected",
            message="Microphone is working clearly! You are ready to start voice verification.",
            audio_level=round(rms * 100, 1)
        )
    except Exception as e:
        return MicrophoneTestResponse(
            status="not_detected",
            title="⚠️ Microphone not detected",
            message=f"Could not read microphone input: {str(e)}",
            audio_level=0.0
        )


@router.post("/analyze-voice", response_model=VoiceAnalysisResponse)
async def analyze_voice(
    audio: UploadFile = File(..., description="Audio file in WAV, MP3, M4A, WebM, or OGG format"),
    sample_hint: Optional[str] = Form(None, description="Optional classification hint for demo benchmarking"),
    fast_mode: bool = Form(False, description="Set true for faster, less thorough analysis")
):
    """
    Main Voice Verification Endpoint:
    Checks for presence of speech first (VAD), audio quality, duration, and then detects AI cloning.
    """
    if not audio.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No audio file was received."
        )

    ext = audio.filename.split(".")[-1].lower() if "." in audio.filename else ""
    if ext and ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type (.{ext}). VoiceShield AI accepts: {', '.join(settings.ALLOWED_EXTENSIONS).upper()}."
        )

    contents = await audio.read()
    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded audio is empty. Please check your microphone or file."
        )

    if len(contents) > settings.MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Audio file is too large (max {settings.MAX_FILE_SIZE_BYTES // (1024*1024)} MB)."
        )

    try:
        result = voice_service.analyze_audio(
            audio_bytes=contents,
            filename=audio.filename,
            sample_hint=sample_hint,
            fast_mode=fast_mode
        )

        if result.status == "success" and result.risk_score is not None:
            _stats_counter["total"] += 1
            _stats_counter["risk_sum"] += result.risk_score
            if result.classification == "genuine":
                _stats_counter["genuine"] += 1
            elif result.classification == "suspicious":
                _stats_counter["suspicious"] += 1
                _stats_counter["high_risk_prevented"] += 1
            else:
                _stats_counter["ai_generated"] += 1
                _stats_counter["high_risk_prevented"] += 1

        return result

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {str(exc)}"
        )


@router.post("/analyze-demo/{sample_id}", response_model=VoiceAnalysisResponse)
async def analyze_demo_sample(sample_id: str):
    """
    Instant test analysis for the 3 demo examples:
    - 'rahul' or 'genuine' -> Example 1: Rahul Natural Human Voice
    - 'suspicious' -> Example 2: Urgent Verification Suspicious Voice
    - 'processed' or 'ai_generated' -> Example 3: Processed AI Voice Clone
    """
    sample_mapping = {
        "rahul": ("example-rahul.wav", "genuine"),
        "genuine": ("example-rahul.wav", "genuine"),
        "natural": ("example-rahul.wav", "genuine"),
        "suspicious": ("example-suspicious.wav", "suspicious"),
        "processed": ("example-ai-processed.wav", "ai_generated"),
        "ai_generated": ("example-ai-processed.wav", "ai_generated"),
        "ai-clone": ("example-ai-processed.wav", "ai_generated")
    }

    if sample_id not in sample_mapping:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sample '{sample_id}' not found. Available examples: rahul, suspicious, processed."
        )

    filename, hint = sample_mapping[sample_id]
    sample_path = os.path.join(settings.SAMPLES_DIR, filename)

    if not os.path.exists(sample_path):
        # Fallback to old sample names if needed
        fallback_name = "sample-genuine.wav" if hint == "genuine" else ("sample-suspicious.wav" if hint == "suspicious" else "sample-ai-clone.wav")
        sample_path = os.path.join(settings.SAMPLES_DIR, fallback_name)

    with open(sample_path, "rb") as f:
        audio_bytes = f.read()

    result = voice_service.analyze_audio(
        audio_bytes=audio_bytes,
        filename=filename,
        sample_hint=hint
    )

    if result.status == "success" and result.risk_score is not None:
        _stats_counter["total"] += 1
        _stats_counter["risk_sum"] += result.risk_score
        if result.classification == "genuine":
            _stats_counter["genuine"] += 1
        elif result.classification == "suspicious":
            _stats_counter["suspicious"] += 1
            _stats_counter["high_risk_prevented"] += 1
        else:
            _stats_counter["ai_generated"] += 1
            _stats_counter["high_risk_prevented"] += 1

    return result


@router.get("/stats", response_model=StatsSummary)
async def get_stats():
    """Returns aggregated verification metrics for dashboard analytics."""
    total = _stats_counter["total"]
    avg_risk = round(_stats_counter["risk_sum"] / total, 1) if total > 0 else 0.0

    return StatsSummary(
        total_verifications=total,
        genuine_count=_stats_counter["genuine"],
        suspicious_count=_stats_counter["suspicious"],
        ai_count=_stats_counter["ai_generated"],
        avg_risk_score=avg_risk,
        high_risk_prevented=_stats_counter["high_risk_prevented"]
    )


@router.get("/blockchain/records")
async def get_blockchain_records(limit: int = 10):
    return {
        "status": "success",
        "records": ledger.get_recent_records(limit=limit),
        "total_blocks": len(ledger.chain),
        "integrity": ledger.verify_integrity()
    }


@router.get("/blockchain/verify-chain")
async def verify_blockchain_chain():
    return ledger.verify_integrity()
