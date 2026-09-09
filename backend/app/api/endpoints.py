"""
API Endpoints for VoiceShield AI
Enterprise AI Voice Security & Authenticity Platform
Smart India Hackathon 2026 - Theme: Blockchain & Cybersecurity | Team: Agents (TEAM-312)
"""

import os
import numpy as np
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Query
from backend.app.config import settings
from backend.app.models.schemas import (
    VoiceAnalysisResponse,
    MicrophoneTestResponse,
    StatsSummary,
    DashboardStatsResponse,
    HealthResponse
)
from backend.app.services.acoustic_analyzer import AcousticAnalyzer
from backend.app.services.voice_detection import voice_service
from backend.app.services.blockchain_ledger import ledger
from backend.app.services.history_store import history_store

router = APIRouter(prefix="/api", tags=["VoiceShield Security Engine"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health status and system configuration."""
    return HealthResponse(
        status="healthy",
        app_name=settings.APP_NAME,
        version=settings.APP_VERSION,
        demo_mode=settings.DEMO_MODE,
        tagline=settings.APP_TAGLINE
    )



@router.post("/test-microphone", response_model=MicrophoneTestResponse)
async def test_microphone(
    audio: UploadFile = File(..., description="Short audio sample for microphone diagnostic testing")
):
    """
    Microphone Diagnostic Test:
    Returns status: 'detected', 'not_detected', or 'no_voice'.
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

        samples, sr, duration, channels = AcousticAnalyzer.parse_audio_samples(contents)
        if len(samples) == 0:
            return MicrophoneTestResponse(
                status="not_detected",
                title="⚠️ Microphone not detected",
                message="Could not decode audio from the browser microphone.",
                audio_level=0.0
            )

        rms = float(np.sqrt(np.mean(samples ** 2)))
        peak = float(np.max(np.abs(samples)))

        if rms < 0.003 and peak < 0.009:
            return MicrophoneTestResponse(
                status="no_voice",
                title="🔇 No voice detected",
                message="Microphone is active but no speech was heard. Please verify input volume.",
                audio_level=round(rms * 100, 1)
            )

        return MicrophoneTestResponse(
            status="detected",
            title="🎙️ Microphone detected",
            message="Microphone is active and working clearly! Ready for voice analysis.",
            audio_level=round(rms * 100, 1)
        )
    except Exception as e:
        return MicrophoneTestResponse(
            status="not_detected",
            title="⚠️ Microphone not detected",
            message=f"Could not read microphone input: {str(e)}",
            audio_level=0.0
        )

@router.post("/audio-quality")
async def check_audio_quality(
    audio: UploadFile = File(..., description="Audio file to perform pre-analysis signal quality check")
):
    """
    Pre-Analysis Audio Quality Diagnostic:
    Calculates duration, sample rate, channels, RMS/volume, silence %, SNR,
    clipping detection, background noise level, and voice activity.
    """
    if not audio.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No audio file was received."
        )

    contents = await audio.read()
    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded audio is empty."
        )

    try:
        samples, sr, duration, channels = AcousticAnalyzer.parse_audio_samples(contents)
        vad_check = AcousticAnalyzer.check_voice_activity(contents, parsed_cache=(samples, sr, duration, channels))
        return {
            "status": vad_check["status"],
            "passed": vad_check["passed"],
            "title": vad_check.get("title", "Audio Quality Diagnostic"),
            "message": vad_check.get("message", "Pre-analysis quality assessment complete."),
            "quality": vad_check["quality"]
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Audio quality analysis failed: {str(exc)}"
        )


@router.post("/analyze-voice", response_model=VoiceAnalysisResponse)
async def analyze_voice(
    audio: UploadFile = File(..., description="Audio file in WAV, MP3, M4A, WebM, FLAC, or OGG format"),
    sample_hint: Optional[str] = Form(None, description="Optional classification hint for benchmark evaluation"),
    fast_mode: bool = Form(False, description="Fast mode execution")
):
    """
    Main Voice Verification Endpoint:
    Checks for speech presence (VAD), pre-analysis quality, acoustic biometrics,
    liveness/replay indicators, and generates probabilistic authenticity verdict.
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
            detail=f"Unsupported file format (.{ext}). Accepted formats: {', '.join(settings.ALLOWED_EXTENSIONS).upper()}."
        )

    contents = await audio.read()
    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded audio is empty. Please check your recording or file."
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
        return result

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {str(exc)}"
        )


@router.post("/analyze-demo/{sample_id}", response_model=VoiceAnalysisResponse)
async def analyze_demo_sample(sample_id: str):
    """
    Instant test analysis for the 3 demo benchmark samples:
    - 'rahul' / 'genuine' -> Rahul Natural Human Voice
    - 'suspicious' -> Urgent Verification Suspicious Voice
    - 'processed' / 'ai_generated' -> Processed AI Voice Clone
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
            detail=f"Sample '{sample_id}' not found. Available: rahul, suspicious, processed."
        )

    filename, hint = sample_mapping[sample_id]
    sample_path = os.path.join(settings.SAMPLES_DIR, filename)

    if not os.path.exists(sample_path):
        fallback_name = "sample-genuine.wav" if hint == "genuine" else ("sample-suspicious.wav" if hint == "suspicious" else "sample-ai-clone.wav")
        sample_path = os.path.join(settings.SAMPLES_DIR, fallback_name)

    if not os.path.exists(sample_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Demo sample file '{filename}' was not found on the server."
        )

    with open(sample_path, "rb") as f:
        audio_bytes = f.read()

    result = voice_service.analyze_audio(
        audio_bytes=audio_bytes,
        filename=filename,
        sample_hint=hint
    )
    return result


@router.get("/dashboard/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats():
    """
    Returns real aggregate metrics and responsive chart data:
    Total Analyses, Authentic, Synthetic, Uncertain, Risk/Confidence distribution.
    """
    stats = history_store.get_dashboard_stats()
    return stats


@router.get("/stats", response_model=StatsSummary)
async def get_legacy_stats():
    """Returns basic verification counts for backward compatibility."""
    stats = history_store.get_dashboard_stats()
    return StatsSummary(
        total_verifications=stats["total_analyses"],
        genuine_count=stats["likely_authentic"],
        suspicious_count=stats["uncertain"],
        ai_count=stats["likely_synthetic"],
        avg_risk_score=round(100.0 - stats["avg_confidence"], 1),
        high_risk_prevented=stats["high_risk_prevented"]
    )


@router.get("/history")
async def get_history(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: Optional[str] = Query(None),
    verdict: Optional[str] = Query(None),
    risk: Optional[str] = Query(None)
):
    """
    Returns paginated verification history records with search and filtering.
    """
    records = history_store.get_history(
        limit=limit,
        offset=offset,
        search=search,
        verdict_filter=verdict,
        risk_filter=risk
    )
    return {
        "status": "success",
        "count": len(records),
        "records": records
    }


@router.get("/history/{record_id}")
async def get_history_detail(record_id: str):
    """
    Retrieves full details of a specific past analysis.
    """
    record = history_store.get_record(record_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Analysis record '{record_id}' not found."
        )
    return {
        "status": "success",
        "record": record
    }


@router.delete("/history/{record_id}")
async def delete_history_item(record_id: str):
    """
    Deletes a specific analysis record from persistent storage.
    """
    deleted = history_store.delete_record(record_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Analysis record '{record_id}' not found or already deleted."
        )
    return {
        "status": "success",
        "message": f"Record '{record_id}' deleted successfully."
    }


@router.delete("/history")
async def clear_all_history():
    """
    Privacy control: Deletes all stored analysis records.
    """
    count = history_store.clear_all()
    return {
        "status": "success",
        "message": f"All {count} analysis records have been permanently cleared."
    }


@router.get("/blockchain/records")
async def get_blockchain_records(limit: int = Query(10, ge=1, le=50)):
    """Returns recent tamper-evident ledger records."""
    return {
        "status": "success",
        "records": ledger.get_recent_records(limit=limit),
        "total_blocks": len(ledger.chain),
        "integrity": ledger.verify_integrity()
    }


@router.get("/blockchain/verify-chain")
async def verify_blockchain_chain():
    """Verifies cryptographic chain integrity."""
    return ledger.verify_integrity()
