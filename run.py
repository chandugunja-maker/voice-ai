"""
VoiceShield AI Launcher
Smart India Hackathon 2026 - Problem: Voice Cloning Impersonation Detection
Theme: Blockchain & Cybersecurity | Team: Agents (TEAM-312)

Run this file to start the complete application:
    python run.py
"""

import sys
import os

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from backend.app.main import run

if __name__ == "__main__":
    run()
