"""
VoiceShield AI - Application Configuration
Enterprise AI Voice Security & Authenticity Platform
"""

import os
from pydantic import BaseModel

class Settings(BaseModel):
    # Application Info
    APP_NAME: str = "VoiceShield AI"
    APP_VERSION: str = "2.0.0"
    APP_TAGLINE: str = "Detect AI Voices. Verify Authenticity."

    # Environment & Demo Mode
    # When DEMO_MODE is True, the application provides decision-support benchmark mode
    DEMO_MODE: bool = os.getenv("VOICESHIELD_DEMO_MODE", "false").lower() in ("true", "1", "yes")

    # Audio Ingestion Constraints
    MAX_FILE_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 MB max upload
    MIN_DURATION_SECONDS: float = 1.2             # Minimum voice duration for acoustic analysis
    MAX_DURATION_SECONDS: float = 120.0           # Maximum voice sample length
    ALLOWED_EXTENSIONS: set = {"wav", "mp3", "m4a", "webm", "ogg", "flac"}
    
    # Model configuration (supports modular ML integration: torch, onnx, or signal-biometrics)
    MODEL_PATH: str = os.getenv("VOICESHIELD_MODEL_PATH", "backend/models/voice_detection.pt")
    MODEL_FRAMEWORK: str = os.getenv("VOICESHIELD_MODEL_FRAMEWORK", "signal")  # signal, torch, onnx
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
        "audio/flac",
        "audio/x-flac",
        "application/octet-stream", # Browsers occasionally send webm blobs as octet-stream
    }

    # Host & Port
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # CORS allowed origins — comma-separated list
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "*")

    # Path to sample audio files
    SAMPLES_DIR: str = os.getenv(
        "SAMPLES_DIR",
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "frontend", "assets", "samples")
    )

settings = Settings()

