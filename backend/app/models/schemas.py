"""
VoiceShield AI - Pydantic Schemas & Data Contracts
Enterprise AI Voice Security & Authenticity Platform
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class FeatureMetric(BaseModel):
    name: str
    score: int = Field(..., ge=0, le=100)
    status: str
    explanation: str


class BlockchainProof(BaseModel):
    record_id: str
    block_index: int
    timestamp: str
    audio_sha256: str
    verification_hash: str
    previous_hash: str
    status: str = "VERIFIED_TAMPER_EVIDENT"


class AudioQualityMetrics(BaseModel):
    duration: float = Field(..., description="Duration in seconds")
    sample_rate: int = Field(16000, description="Sampling rate in Hz")
    channels: int = Field(1, description="Audio channels (mono/stereo)")
    rms_level: float = Field(..., description="RMS energy amplitude")
    silence_pct: float = Field(..., description="Estimated silence percentage")
    snr_estimate: str = Field("Unknown", description="Estimated Signal-to-Noise Ratio")
    clipping_detected: bool = Field(False, description="Whether audio samples clipped")
    background_noise_level: str = Field("Low", description="'Low', 'Medium', or 'High'")
    voice_activity: str = Field("Speech Detected", description="Status of voice activity")


class AuthenticityScoreBreakdown(BaseModel):
    authenticity: Optional[int] = Field(None, description="Authenticity probability 0-100%")
    liveness: Optional[str] = Field("Not available", description="'PASS', 'REVIEW', 'FAIL', or 'Not available'")
    naturalness: Optional[int] = Field(None, description="Prosodic naturalness score 0-100%")
    spectral_consistency: Optional[int] = Field(None, description="Spectral envelope consistency 0-100%")
    temporal_consistency: Optional[int] = Field(None, description="Temporal rhythm and pause consistency 0-100%")
    audio_quality_score: Optional[int] = Field(None, description="Overall audio quality 0-100%")
    replay_risk: Optional[str] = Field("Not available", description="'LOW', 'MEDIUM', 'HIGH', or 'Not available'")
    background_noise: Optional[str] = Field("Low", description="Qualitative background noise level")


class BackgroundAudioAnalysis(BaseModel):
    summary: str = Field("Clean acoustic background", description="Summary of background audio")
    primary_voice: str = Field("Dominant", description="Primary voice presence")
    background_speech: str = Field("None detected", description="Background speech status")
    environmental_noise: str = Field("Low", description="Environmental noise level")
    silence: str = Field("Normal conversational pauses", description="Silence characteristic")
    noise_floor_rms: float = Field(0.002, description="Calculated noise floor RMS")


class ExplainabilityReport(BaseModel):
    positive_indicators: List[str] = Field(default_factory=list, description="Observed human/authentic signals")
    potential_concerns: List[str] = Field(default_factory=list, description="Observed anomalies or synthetic markers")


class VoiceAnalysisResponse(BaseModel):
    # Core Identification
    analysis_id: str = Field("VS-0000", description="Unique analysis record identifier")
    status: str = Field(..., description="'success', 'insufficient_speech', 'poor_quality', 'too_short', or 'no_voice'")
    
    # Primary Verdict & Metrics
    verdict: Optional[str] = Field(None, description="'LIKELY AUTHENTIC', 'UNCERTAIN — REVIEW', or 'LIKELY SYNTHETIC'")
    confidence: Optional[int] = Field(None, description="Overall confidence percentage (only if calculated)")
    risk_level: Optional[str] = Field(None, description="'LOW RISK', 'MEDIUM RISK', or 'HIGH RISK'")
    verification_hash: Optional[str] = Field(None, description="Cryptographic SHA-256 ledger digest")
    sha256_hash: Optional[str] = Field(None, description="Cryptographic SHA-256 hash of audio stream")
    
    # Structured Analysis Sections
    audio_quality: Optional[AudioQualityMetrics] = None
    metrics: Optional[AuthenticityScoreBreakdown] = None
    background_audio: Optional[BackgroundAudioAnalysis] = None
    explainability: Optional[ExplainabilityReport] = None
    
    # Safety Warnings & Notices
    warnings: List[str] = Field(default_factory=list)
    warning: Optional[str] = None
    disclaimer: str = Field(
        "AI voice detection is probabilistic and should not be considered definitive proof of authenticity or identity."
    )
    
    # Non-speech / Quality Check fields (when status != 'success')
    title: Optional[str] = None
    message: Optional[str] = None
    instructions: Optional[str] = None
    suggestions: Optional[List[str]] = None
    
    # Backward-Compatible Fields for existing frontend components
    classification: Optional[str] = None
    classification_label: Optional[str] = None
    result_icon: Optional[str] = None
    risk_score: Optional[int] = None
    confidence_percentage: Optional[int] = None
    confidence_label: Optional[str] = "How confident is the result?"
    explanation: Optional[str] = None
    simple_features: Optional[Dict[str, FeatureMetric]] = None
    voice_detected: Optional[bool] = None
    speech_detected: Optional[bool] = None
    multiple_voices: Optional[bool] = None
    background_type: Optional[str] = None
    background_level: Optional[str] = None
    
    # Metadata
    audio_duration: float = 0.0
    processing_time: float = 0.0
    blockchain_proof: Optional[BlockchainProof] = None
    demo_mode: bool = False
    notice: str = "VoiceShield AI Decision Support"
    created_at: Optional[str] = None


class VerificationHistoryItem(BaseModel):
    id: str
    timestamp: str
    filename: str
    duration_str: str
    verdict: str
    confidence: int
    risk_level: str
    status: str
    verification_hash: str
    classification: Optional[str] = None
    classification_label: Optional[str] = None
    risk_score: Optional[int] = None
    confidence_percentage: Optional[int] = None


class MicrophoneTestResponse(BaseModel):
    status: str
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


class DashboardChartData(BaseModel):
    verdict_distribution: Dict[str, int]
    risk_distribution: Dict[str, int]
    confidence_distribution: Dict[str, int]
    recent_activity: List[Dict[str, Any]]


class DashboardStatsResponse(BaseModel):
    total_analyses: int
    likely_authentic: int
    likely_synthetic: int
    uncertain: int
    high_risk_prevented: int
    avg_confidence: float
    charts: DashboardChartData


class HealthResponse(BaseModel):
    status: str
    app_name: str
    version: str
    demo_mode: bool
    tagline: Optional[str] = "Detect AI Voices. Verify Authenticity."
    sih_team: Optional[str] = None

