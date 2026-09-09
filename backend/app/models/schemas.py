"""
Pydantic Schemas for VoiceShield AI API
Simplified, Accessible, and Production-Grade Decision Support
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class FeatureMetric(BaseModel):
    name: str                       # e.g., "Voice Sound Pattern", "Speaking Style"
    score: int = Field(..., ge=0, le=100)
    status: str                     # "Normal", "Slight anomaly", "Unusual", "Needs Attention"
    explanation: str                # Simple, human-friendly explanation


class BlockchainProof(BaseModel):
    record_id: str
    block_index: int
    timestamp: str
    audio_sha256: str
    verification_hash: str
    previous_hash: str
    status: str = "VERIFIED_TAMPER_EVIDENT"


class VoiceAnalysisResponse(BaseModel):
    # Overall status: 'success' | 'no_voice' | 'voice_not_clear' | 'too_short'
    status: str = Field(..., description="'success', 'no_voice', 'voice_not_clear', or 'too_short'")
    
    # Non-speech / Quality Check fields (populated when status != 'success')
    title: Optional[str] = None
    message: Optional[str] = None
    instructions: Optional[str] = None
    suggestions: Optional[List[str]] = None
    
    # Speech analysis fields (populated when status == 'success')
    classification: Optional[str] = None         # 'genuine' | 'suspicious' | 'ai_generated'
    classification_label: Optional[str] = None   # 'Likely Real Voice' | 'Suspicious Voice' | 'Possible AI-Generated Voice'
    result_icon: Optional[str] = None            # '🟢' | '🟠' | '🔴' | '🔇' | '⚠️' | '⏱️'
    risk_level: Optional[str] = None             # 'Low' | 'Medium' | 'High'
    risk_score: Optional[int] = None             # 0 - 100
    confidence_percentage: Optional[int] = None  # e.g. 92%
    confidence_label: Optional[str] = None       # "How confident is the result?"
    warning: Optional[str] = None                # Safety warning message for suspicious/AI
    voice_detected: Optional[bool] = None
    speech_detected: Optional[bool] = None
    multiple_voices: Optional[bool] = None
    background_type: Optional[str] = None
    background_level: Optional[str] = None
    explanation: Optional[str] = None            # "What does this mean?"
    simple_features: Optional[Dict[str, FeatureMetric]] = None
    
    audio_duration: float = 0.0
    processing_time: float = 0.0
    blockchain_proof: Optional[BlockchainProof] = None
    demo_mode: bool = True
    notice: str = "This result is an AI-based assessment, not a guarantee."


class VerificationHistoryItem(BaseModel):
    id: str
    timestamp: str
    filename: str
    duration_str: str
    classification: str
    classification_label: str
    risk_score: int
    risk_level: str
    confidence_percentage: int
    verification_hash: str


class MicrophoneTestResponse(BaseModel):
    status: str                                  # 'detected' | 'not_detected' | 'no_voice'
    title: str
    message: str
    audio_level: float


class StatsSummary(BaseModel):
    total_verifications: int
    genuine_count: int
    suspicious_count: int
    ai_count: int
    avg_risk_score: float
    high_risk_prevented: int


class HealthResponse(BaseModel):
    status: str
    app_name: str
    version: str
    demo_mode: bool
    sih_team: str
