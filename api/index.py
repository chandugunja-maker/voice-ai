"""
VoiceShield AI - Vercel Serverless Entrypoint
Exports the FastAPI 'app' instance for Vercel Serverless Functions.
"""
import os
import sys

# Ensure repository root is on sys.path so 'backend' package is importable
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from backend.app.main import app

# Vercel entrypoint
__all__ = ["app"]
