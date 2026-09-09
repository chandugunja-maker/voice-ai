"""
VoiceShield AI - Main FastAPI Application
Smart India Hackathon 2026 - Problem: Voice Cloning Impersonation Detection
Theme: Blockchain & Cybersecurity | Team: Agents (TEAM-312)
"""

import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from backend.app.config import settings
from backend.app.api.endpoints import router as api_router

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-Powered Real-Time Detection and Prevention of Voice Cloning Impersonation Attacks",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# Enable CORS for cross-origin integration
_cors_origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Router
app.include_router(api_router)

# Resolve frontend directory path
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
frontend_dir = os.path.join(repo_root, "frontend")

# Safely mount static directories if available
if os.path.exists(frontend_dir):
    try:
        assets_dir = os.path.join(frontend_dir, "assets")
        if os.path.exists(assets_dir):
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
    except Exception:
        pass

    try:
        css_dir = os.path.join(frontend_dir, "css")
        if os.path.exists(css_dir):
            app.mount("/css", StaticFiles(directory=css_dir), name="css")
    except Exception:
        pass

    try:
        js_dir = os.path.join(frontend_dir, "js")
        if os.path.exists(js_dir):
            app.mount("/js", StaticFiles(directory=js_dir), name="js")
    except Exception:
        pass

    try:
        app.mount("/static", StaticFiles(directory=frontend_dir), name="static")
    except Exception:
        pass


def _read_html_file(filename: str) -> str:
    candidates = [
        os.path.join(frontend_dir, filename),
        os.path.join(repo_root, filename),
        filename,
        os.path.join("frontend", filename)
    ]
    for c in candidates:
        if os.path.exists(c):
            try:
                with open(c, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception:
                pass
    return ""


# Serve index.html at root
@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def serve_index():
    content = _read_html_file("index.html")
    if content:
        return HTMLResponse(content=content)
    return HTMLResponse(content="<h1>VoiceShield AI is Online</h1><p><a href='/api/docs'>API Documentation</a></p>")


@app.get("/index.html", response_class=HTMLResponse, include_in_schema=False)
async def serve_index_html():
    content = _read_html_file("index.html")
    if content:
        return HTMLResponse(content=content)
    return HTMLResponse(content="<h1>VoiceShield AI is Online</h1><p><a href='/api/docs'>API Documentation</a></p>")


@app.get("/index_custom.html", response_class=HTMLResponse, include_in_schema=False)
async def serve_index_custom():
    content = _read_html_file("index_custom.html")
    if content:
        return HTMLResponse(content=content)
    return HTMLResponse(content="<h1>VoiceShield AI Custom View</h1><p><a href='/api/docs'>API Documentation</a></p>")


@app.get("/vite.svg", include_in_schema=False)
async def serve_vite_svg():
    for p in [os.path.join(frontend_dir, "vite.svg"), os.path.join(repo_root, "vite.svg"), "vite.svg"]:
        if os.path.exists(p):
            return FileResponse(p, media_type="image/svg+xml")
    return {"message": "vite.svg not found"}


@app.get("/favicon.ico", include_in_schema=False)
async def serve_favicon():
    for p in [os.path.join(frontend_dir, "favicon.ico"), os.path.join(repo_root, "favicon.ico"), "favicon.ico"]:
        if os.path.exists(p):
            return FileResponse(p, media_type="image/x-icon")
    return {"message": "favicon.ico not found"}


def run():
    print("=" * 60)
    print(f"  {settings.APP_NAME} v{settings.APP_VERSION}")
    print(f"  {settings.APP_TAGLINE}")
    print(f"  Web Interface: http://{settings.HOST}:{settings.PORT}")
    print(f"  API Docs:      http://{settings.HOST}:{settings.PORT}/api/docs")
    print("=" * 60)
    uvicorn.run(
        "backend.app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
        log_level="info"
    )



if __name__ == "__main__":
    run()
