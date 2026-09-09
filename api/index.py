"""
VoiceShield AI - Vercel Serverless Entrypoint
Exports the FastAPI 'app' instance for Vercel Serverless Functions.
"""
import os
import sys
import traceback

# Ensure repository root is on sys.path so 'backend' package is importable
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

try:
    from backend.app.main import app
except Exception as exc:
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse

    app = FastAPI(title="VoiceShield AI - Diagnostic Mode")
    tb = traceback.format_exc()
    print(f"CRITICAL: Failed to load backend.app.main: {exc}\n{tb}", file=sys.stderr)

    @app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
    async def diagnostic_handler(path: str):
        return JSONResponse(
            status_code=500,
            content={
                "error": "FastAPI Serverless Initialization Error",
                "message": str(exc),
                "traceback": tb.splitlines()
            }
        )

__all__ = ["app"]
