"""
VoiceShield AI - SQLite Persistent Verification Store & Dashboard Analytics
Lightweight, dependency-free local and serverless-safe audit persistence.
"""

import os
import json
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Generator


class HistoryStore:
    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            data_dir = os.path.join(base_dir, "data")
            try:
                os.makedirs(data_dir, exist_ok=True)
                self.db_path = os.path.join(data_dir, "voiceshield.db")
            except Exception:
                self.db_path = "/tmp/voiceshield.db"
        else:
            self.db_path = db_path

        self._init_db()

    @contextmanager
    def _conn(self) -> Generator[sqlite3.Connection, None, None]:
        conn = None
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            yield conn
        except Exception:
            conn = sqlite3.connect(":memory:")
            conn.row_factory = sqlite3.Row
            yield conn
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    def _init_db(self):
        try:
            with self._conn() as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS verifications (
                        id TEXT PRIMARY KEY,
                        timestamp TEXT NOT NULL,
                        filename TEXT NOT NULL,
                        duration REAL NOT NULL,
                        verdict TEXT NOT NULL,
                        confidence INTEGER NOT NULL,
                        risk_level TEXT NOT NULL,
                        risk_score INTEGER NOT NULL,
                        status TEXT NOT NULL,
                        verification_hash TEXT NOT NULL,
                        audio_quality_json TEXT,
                        metrics_json TEXT,
                        background_audio_json TEXT,
                        explainability_json TEXT,
                        created_at TEXT NOT NULL
                    )
                """)
                conn.commit()

            if self._count_records() == 0:
                self._seed_baseline_records()
        except Exception as e:
            print(f"[HistoryStore] Init DB error: {e}")

    def _count_records(self) -> int:
        try:
            with self._conn() as conn:
                cursor = conn.execute("SELECT COUNT(*) FROM verifications")
                return cursor.fetchone()[0]
        except Exception:
            return 0

    def _seed_baseline_records(self):
        seed_items = [
            {
                "id": "VS-1024",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "filename": "executive_briefing_sample.wav",
                "duration": 5.4,
                "verdict": "LIKELY AUTHENTIC",
                "confidence": 94,
                "risk_level": "LOW RISK",
                "risk_score": 16,
                "status": "success",
                "verification_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                "audio_quality_json": json.dumps({
                    "duration": 5.4,
                    "sample_rate": 16000,
                    "channels": 1,
                    "rms_level": 0.048,
                    "silence_pct": 14.2,
                    "snr_estimate": "23.4 dB (Good)",
                    "clipping_detected": False,
                    "background_noise_level": "Low",
                    "voice_activity": "Speech Detected"
                }),
                "metrics_json": json.dumps({
                    "authenticity": 94,
                    "liveness": "PASS",
                    "naturalness": 96,
                    "spectral_consistency": 89,
                    "temporal_consistency": 93,
                    "audio_quality_score": 90,
                    "replay_risk": "LOW",
                    "background_noise": "Low (Clean)"
                }),
                "background_audio_json": json.dumps({
                    "summary": "Clean acoustic environment with low ambient floor",
                    "primary_voice": "Dominant",
                    "background_speech": "None detected",
                    "environmental_noise": "Low",
                    "silence": "Normal conversational pauses",
                    "noise_floor_rms": 0.0024
                }),
                "explainability_json": json.dumps({
                    "positive_indicators": [
                        "Natural vocal micro-jitter present (1.12%)",
                        "Dynamic prosodic pitch inflection (std: 18.4 Hz)",
                        "Natural room tone present in conversational pauses",
                        "Broadband spectral envelope without sharp vocoder cutoff"
                    ],
                    "potential_concerns": []
                }),
                "created_at": "Today, 10:45 AM"
            },
            {
                "id": "VS-1025",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "filename": "urgent_transfer_request.mp3",
                "duration": 6.8,
                "verdict": "LIKELY SYNTHETIC",
                "confidence": 93,
                "risk_level": "HIGH RISK",
                "risk_score": 88,
                "status": "success",
                "verification_hash": "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
                "audio_quality_json": json.dumps({
                    "duration": 6.8,
                    "sample_rate": 16000,
                    "channels": 1,
                    "rms_level": 0.062,
                    "silence_pct": 8.5,
                    "snr_estimate": "19.8 dB (Good)",
                    "clipping_detected": False,
                    "background_noise_level": "Low",
                    "voice_activity": "Speech Detected"
                }),
                "metrics_json": json.dumps({
                    "authenticity": 12,
                    "liveness": "REVIEW",
                    "naturalness": 18,
                    "spectral_consistency": 24,
                    "temporal_consistency": 32,
                    "audio_quality_score": 85,
                    "replay_risk": "MEDIUM",
                    "background_noise": "Low"
                }),
                "background_audio_json": json.dumps({
                    "summary": "Synthesized voice profile with artificial silence",
                    "primary_voice": "Dominant",
                    "background_speech": "None detected",
                    "environmental_noise": "Low",
                    "silence": "Digital zero silence detected between phrases",
                    "noise_floor_rms": 0.0002
                }),
                "explainability_json": json.dumps({
                    "positive_indicators": [
                        "Adequate signal-to-noise ratio"
                    ],
                    "potential_concerns": [
                        "Flat prosodic pitch intonation characteristic of neural TTS",
                        "Absence of physiological vocal micro-jitter (<0.38%)",
                        "Digital zero silence in pauses (lacks ambient room tone)",
                        "Steep vocoder spectral rolloff above 3.8 kHz"
                    ]
                }),
                "created_at": "Today, 09:15 AM"
            }
        ]

        for item in seed_items:
            self.save_verification(item)

    def save_verification(self, record: Dict[str, Any]) -> Dict[str, Any]:
        try:
            with self._conn() as conn:
                conn.execute("""
                    INSERT OR REPLACE INTO verifications (
                        id, timestamp, filename, duration, verdict, confidence,
                        risk_level, risk_score, status, verification_hash,
                        audio_quality_json, metrics_json, background_audio_json,
                        explainability_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    record.get("id", f"VS-{int(time.time() % 100000):05d}"),
                    record.get("timestamp", datetime.now(timezone.utc).isoformat()),
                    record.get("filename", "voice_sample.wav"),
                    float(record.get("duration", 0.0)),
                    record.get("verdict", "UNCERTAIN — REVIEW"),
                    int(record.get("confidence", 80)),
                    record.get("risk_level", "LOW RISK"),
                    int(record.get("risk_score", 20)),
                    record.get("status", "success"),
                    record.get("verification_hash", "0" * 64),
                    record.get("audio_quality_json", "{}"),
                    record.get("metrics_json", "{}"),
                    record.get("background_audio_json", "{}"),
                    record.get("explainability_json", "{}"),
                    record.get("created_at", datetime.now().strftime("%b %d, %H:%M"))
                ))
                conn.commit()
            return record
        except Exception as e:
            print(f"[HistoryStore] Save error: {e}")
            return record

    def get_history(
        self,
        limit: int = 50,
        offset: int = 0,
        search: Optional[str] = None,
        verdict_filter: Optional[str] = None,
        risk_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        try:
            query = "SELECT * FROM verifications WHERE 1=1"
            params: List[Any] = []

            if search:
                query += " AND (filename LIKE ? OR id LIKE ?)"
                params.extend([f"%{search}%", f"%{search}%"])

            if verdict_filter and verdict_filter != "ALL":
                query += " AND verdict = ?"
                params.append(verdict_filter)

            if risk_filter and risk_filter != "ALL":
                query += " AND risk_level = ?"
                params.append(risk_filter)

            query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
            params.extend([limit, offset])

            with self._conn() as conn:
                cursor = conn.execute(query, params)
                rows = cursor.fetchall()
                results = []
                for row in rows:
                    results.append({
                        "id": row["id"],
                        "timestamp": row["timestamp"],
                        "filename": row["filename"],
                        "duration": row["duration"],
                        "duration_str": f"{row['duration']:.1f}s",
                        "verdict": row["verdict"],
                        "confidence": row["confidence"],
                        "risk_level": row["risk_level"],
                        "risk_score": row["risk_score"],
                        "status": row["status"],
                        "verification_hash": row["verification_hash"],
                        "created_at": row["created_at"]
                    })
                return results
        except Exception as e:
            print(f"[HistoryStore] Query error: {e}")
            return []

    def get_record(self, record_id: str) -> Optional[Dict[str, Any]]:
        try:
            with self._conn() as conn:
                cursor = conn.execute("SELECT * FROM verifications WHERE id = ?", (record_id,))
                row = cursor.fetchone()
                if row:
                    return {
                        "id": row["id"],
                        "timestamp": row["timestamp"],
                        "filename": row["filename"],
                        "duration": row["duration"],
                        "duration_str": f"{row['duration']:.1f}s",
                        "verdict": row["verdict"],
                        "confidence": row["confidence"],
                        "risk_level": row["risk_level"],
                        "risk_score": row["risk_score"],
                        "status": row["status"],
                        "verification_hash": row["verification_hash"],
                        "audio_quality": json.loads(row["audio_quality_json"] or "{}"),
                        "metrics": json.loads(row["metrics_json"] or "{}"),
                        "background_audio": json.loads(row["background_audio_json"] or "{}"),
                        "explainability": json.loads(row["explainability_json"] or "{}"),
                        "created_at": row["created_at"]
                    }
                return None
        except Exception as e:
            print(f"[HistoryStore] Get record error: {e}")
            return None

    def delete_record(self, record_id: str) -> bool:
        try:
            with self._conn() as conn:
                cursor = conn.execute("DELETE FROM verifications WHERE id = ?", (record_id,))
                conn.commit()
                return cursor.rowcount > 0
        except Exception as e:
            print(f"[HistoryStore] Delete error: {e}")
            return False

    def clear_all(self) -> int:
        try:
            with self._conn() as conn:
                cursor = conn.execute("DELETE FROM verifications")
                conn.commit()
                return cursor.rowcount
        except Exception as e:
            print(f"[HistoryStore] Clear error: {e}")
            return 0

    def get_dashboard_stats(self) -> Dict[str, Any]:
        try:
            with self._conn() as conn:
                cursor = conn.execute("SELECT * FROM verifications ORDER BY timestamp DESC")
                rows = cursor.fetchall()

                total = len(rows)
                authentic_count = 0
                synthetic_count = 0
                uncertain_count = 0
                high_risk_count = 0
                confidence_sum = 0

                verdict_dist = {"Likely Authentic": 0, "Uncertain — Review": 0, "Likely Synthetic": 0}
                risk_dist = {"Low Risk": 0, "Medium Risk": 0, "High Risk": 0}
                confidence_dist = {"90-100%": 0, "80-89%": 0, "70-79%": 0, "<70%": 0}

                recent_activity = []

                for r in rows:
                    verdict = r["verdict"]
                    risk = r["risk_level"]
                    conf = r["confidence"]

                    confidence_sum += conf

                    if "AUTHENTIC" in verdict:
                        authentic_count += 1
                        verdict_dist["Likely Authentic"] += 1
                    elif "SYNTHETIC" in verdict:
                        synthetic_count += 1
                        verdict_dist["Likely Synthetic"] += 1
                        high_risk_count += 1
                    else:
                        uncertain_count += 1
                        verdict_dist["Uncertain — Review"] += 1

                    if "LOW" in risk:
                        risk_dist["Low Risk"] += 1
                    elif "HIGH" in risk or "CRITICAL" in risk:
                        risk_dist["High Risk"] += 1
                    else:
                        risk_dist["Medium Risk"] += 1

                    if conf >= 90:
                        confidence_dist["90-100%"] += 1
                    elif conf >= 80:
                        confidence_dist["80-89%"] += 1
                    elif conf >= 70:
                        confidence_dist["70-79%"] += 1
                    else:
                        confidence_dist["<70%"] += 1

                    if len(recent_activity) < 10:
                        recent_activity.append({
                            "id": r["id"],
                            "filename": r["filename"],
                            "duration_str": f"{r['duration']:.1f}s",
                            "verdict": verdict,
                            "confidence": conf,
                            "risk_level": risk,
                            "created_at": r["created_at"]
                        })

                avg_conf = round(confidence_sum / total, 1) if total > 0 else 0.0

                return {
                    "total_analyses": total,
                    "likely_authentic": authentic_count,
                    "likely_synthetic": synthetic_count,
                    "uncertain": uncertain_count,
                    "high_risk_prevented": high_risk_count,
                    "avg_confidence": avg_conf,
                    "charts": {
                        "verdict_distribution": verdict_dist,
                        "risk_distribution": risk_dist,
                        "confidence_distribution": confidence_dist,
                        "recent_activity": recent_activity
                    }
                }
        except Exception as e:
            print(f"[HistoryStore] Dashboard stats error: {e}")
            return {
                "total_analyses": 0,
                "likely_authentic": 0,
                "likely_synthetic": 0,
                "uncertain": 0,
                "high_risk_prevented": 0,
                "avg_confidence": 0.0,
                "charts": {
                    "verdict_distribution": {},
                    "risk_distribution": {},
                    "confidence_distribution": {},
                    "recent_activity": []
                }
            }


history_store = HistoryStore()
