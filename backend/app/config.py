"""
VoiceShield AI - Application Configuration
Smart India Hackathon 2026 - Project TEAM-312
"""

import os
from pydantic import BaseModel

class Settings(BaseModel):
    # Application Info
    APP_NAME: str = "VoiceShield AI"
    APP_VERSION: str = "1.0.0"
    SIH_THEME: str = "Blockchain & Cybersecurity"
    TEAM_NAME: str = "Agents"
    TEAM_ID: str = "TEAM-312"

    # Environment & Demo Mode
    # When DEMO_MODE is True, the application clearly marks that it operates in demo/decision-support mode
    DEMO_MODE: bool = os.getenv("VOICESHIELD_DEMO_MODE", "true").lower() in ("true", "1", "yes")

    # Audio Ingestion Constraints
    MAX_FILE_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB max upload
    MIN_DURATION_SECONDS: float = 1.5             # Minimum voice duration for acoustic analysis
    MAX_DURATION_SECONDS: float = 120.0           # Maximum voice sample length
    ALLOWED_EXTENSIONS: set = {"wav", "mp3", "m4a", "webm", "ogg"}
    # Model configuration (optional – placeholder for future ML integration)
    MODEL_PATH: str = os.getenv("VOICESHIELD_MODEL_PATH", "backend/models/voice_detection.pt")
    MODEL_FRAMEWORK: str = os.getenv("VOICESHIELD_MODEL_FRAMEWORK", "dummy")  # dummy, torch, tf, onnx
    USE_GPU: bool = os.getenv("VOICESHIELD_USE_GPU", "false").lower() in ("true", "1", "yes")
    ALLOWED_MIME_TYPES: set = {
        "audio/wav",
        "audio/x-wav",
        "audio/wave",
        "audio/mp3",
        "audio/mpeg",
        "audio/webm",
        "audio/ogg",
        "audio/m4a",
        "audio/x-m4a",
        "audio/mp4",
        "application/octet-stream", # Some browsers send webm blobs as octet-stream
    }

    # Host & Port (cloud platforms set PORT env var; use 0.0.0.0 to accept all interfaces)
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # CORS allowed origins — comma-separated list. Use * for dev, specific domains for prod.
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "*")

    # Path to demo sample audio files (relative to project working directory)
    SAMPLES_DIR: str = os.getenv("SAMPLES_DIR", "frontend/assets/samples")

settings = Settings()
