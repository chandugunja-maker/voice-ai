"""
Blockchain & Cryptographic Verification Ledger Service
Smart India Hackathon 2026 - Theme: Blockchain & Cybersecurity

Provides tamper-evident verification event hashing and audit trails.
Audio recordings are NEVER stored on the blockchain; only cryptographic digests
and verification metadata are hashed into the ledger chain.
"""

import hashlib
import json
import time
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from backend.app.models.schemas import BlockchainProof


class BlockchainLedger:
    def __init__(self):
        self.chain: List[Dict[str, Any]] = []
        self._initialize_genesis_block()

    def _initialize_genesis_block(self):
        """Creates the Genesis Block for the VoiceShield AI audit chain."""
        genesis_timestamp = "2026-01-01T00:00:00Z"
        genesis_payload = {
            "index": 0,
            "record_id": "VS-GENESIS-0000",
            "timestamp": genesis_timestamp,
            "audio_sha256": "0" * 64,
            "classification": "SYSTEM_INIT",
            "risk_score": 0,
            "previous_hash": "0" * 64,
            "note": "VoiceShield AI Genesis Ledger Block - SIH 2026 TEAM-312"
        }
        genesis_hash = self._calculate_hash(genesis_payload)
        genesis_payload["verification_hash"] = genesis_hash
        self.chain.append(genesis_payload)

    def _calculate_hash(self, block_data: Dict[str, Any]) -> str:
        """Calculates a deterministic SHA-256 hash of block contents."""
        # Exclude verification_hash itself if present
        data_to_hash = {k: v for k, v in block_data.items() if k != "verification_hash"}
        encoded = json.dumps(data_to_hash, sort_keys=True).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def record_verification(
        self,
        audio_bytes: bytes,
        classification: str,
        risk_score: int,
        confidence: float
    ) -> BlockchainProof:
        """
        Creates a new tamper-evident audit record for a verified voice sample.
        Calculates SHA-256 of the raw audio bytes and anchors it to the ledger.
        """
        audio_sha256 = hashlib.sha256(audio_bytes).hexdigest()
        previous_block = self.chain[-1]
        previous_hash = previous_block["verification_hash"]
        
        block_index = len(self.chain)
        timestamp = datetime.now(timezone.utc).isoformat()
        record_id = f"VS-REC-{block_index:05d}-{int(time.time()) % 10000:04d}"

        block_payload = {
            "index": block_index,
            "record_id": record_id,
            "timestamp": timestamp,
            "audio_sha256": audio_sha256,
            "classification": classification,
            "risk_score": risk_score,
            "confidence": round(confidence, 4),
            "previous_hash": previous_hash
        }

        verification_hash = self._calculate_hash(block_payload)
        block_payload["verification_hash"] = verification_hash

        self.chain.append(block_payload)

        return BlockchainProof(
            record_id=record_id,
            block_index=block_index,
            timestamp=timestamp,
            audio_sha256=audio_sha256,
            verification_hash=verification_hash,
            previous_hash=previous_hash,
            status="VERIFIED_TAMPER_EVIDENT"
        )

    def get_recent_records(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Returns the most recent ledger blocks, excluding genesis."""
        non_genesis = self.chain[1:]
        return non_genesis[-limit:][::-1]

    def verify_integrity(self) -> Dict[str, Any]:
        """
        Verifies the cryptographic chain integrity.
        Ensures each block's previous_hash matches and verification_hash is valid.
        """
        for i in range(1, len(self.chain)):
            current = self.chain[i]
            prev = self.chain[i - 1]

            if current["previous_hash"] != prev["verification_hash"]:
                return {
                    "is_valid": False,
                    "failed_block": i,
                    "reason": f"Previous hash mismatch at block {i}"
                }

            expected_hash = self._calculate_hash(current)
            if current["verification_hash"] != expected_hash:
                return {
                    "is_valid": False,
                    "failed_block": i,
                    "reason": f"Hash corruption detected at block {i}"
                }

        return {
            "is_valid": True,
            "total_blocks": len(self.chain),
            "latest_hash": self.chain[-1]["verification_hash"]
        }


# Global ledger singleton instance
ledger = BlockchainLedger()
