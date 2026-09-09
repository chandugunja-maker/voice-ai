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


def is_benchmark_record(record: Dict[str, Any]) -> bool:
    if not record:
        return False
    if record.get("is_benchmark") is True or record.get("is_demo") is True:
        return True
    if record.get("source_type") == "benchmark":
        return True
    fn = str(record.get("filename") or "").lower()
    if any(fn.startswith(p) for p in ("test_benchmark_", "example-", "sample-")):
        return True
    if any(preset in fn for preset in ("rahul", "suspicious", "processed")):
        return True
    return False


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
                # Purge any legacy benchmark records
                conn.execute("""
                    DELETE FROM verifications 
                    WHERE filename LIKE 'test_benchmark_%'
                       OR filename LIKE 'example-%'
                       OR filename LIKE 'sample-%'
                       OR filename LIKE '%rahul%'
                       OR filename LIKE '%suspicious%'
                       OR filename LIKE '%processed%'
                """)
                conn.commit()
            # Real analyses will populate the store dynamically
        except Exception as e:
            print(f"[HistoryStore] Init DB error: {e}")

    def _count_records(self) -> int:
        try:
            with self._conn() as conn:
                cursor = conn.execute("SELECT COUNT(*) FROM verifications")
                return cursor.fetchone()[0]
        except Exception:
            return 0
    def save_verification(self, record: Dict[str, Any]) -> Dict[str, Any]:
        if is_benchmark_record(record):
            return record
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
            query = """
                SELECT * FROM verifications 
                WHERE filename NOT LIKE 'test_benchmark_%'
                  AND filename NOT LIKE 'example-%'
                  AND filename NOT LIKE 'sample-%'
                  AND filename NOT LIKE '%rahul%'
                  AND filename NOT LIKE '%suspicious%'
                  AND filename NOT LIKE '%processed%'
            """
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
                cursor = conn.execute("""
                    SELECT * FROM verifications 
                    WHERE filename NOT LIKE 'test_benchmark_%'
                      AND filename NOT LIKE 'example-%'
                      AND filename NOT LIKE 'sample-%'
                      AND filename NOT LIKE '%rahul%'
                      AND filename NOT LIKE '%suspicious%'
                      AND filename NOT LIKE '%processed%'
                    ORDER BY timestamp DESC
                """)
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
