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
from fastapi.responses import FileResponse
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
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))

if os.path.exists(frontend_dir):
    # Mount assets and static files
    assets_dir = os.path.join(frontend_dir, "assets")
    css_dir = os.path.join(frontend_dir, "css")
    js_dir = os.path.join(frontend_dir, "js")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
    if os.path.exists(css_dir):
        app.mount("/css", StaticFiles(directory=css_dir), name="css")
    if os.path.exists(js_dir):
        app.mount("/js", StaticFiles(directory=js_dir), name="js")
    # Keep /static as a legacy mount pointing to the full frontend dir
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    # Serve vite.svg
    @app.get("/vite.svg", include_in_schema=False)
    async def serve_vite_svg():
        svg_file = os.path.join(frontend_dir, "vite.svg")
        if os.path.exists(svg_file):
            return FileResponse(svg_file, media_type="image/svg+xml")
        return FileResponse(os.path.join(frontend_dir, "assets", "vite.svg"), media_type="image/svg+xml")

    # Serve favicon.ico
    @app.get("/favicon.ico", include_in_schema=False)
    async def serve_favicon():
        fav_file = os.path.join(frontend_dir, "favicon.ico")
        if os.path.exists(fav_file):
            return FileResponse(fav_file, media_type="image/x-icon")
        return FileResponse(os.path.join(frontend_dir, "assets", "vite.svg"), media_type="image/svg+xml")

    # Serve index.html at root
    @app.get("/", include_in_schema=False)
    async def serve_index():
        index_file = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "Frontend index.html not found"}

    @app.get("/index.html", include_in_schema=False)
    async def serve_index_html():
        index_file = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "Frontend index.html not found"}

    @app.get("/index_custom.html", include_in_schema=False)
    async def serve_index_custom():
        custom_file = os.path.join(frontend_dir, "index_custom.html")
        if os.path.exists(custom_file):
            return FileResponse(custom_file)
        return {"message": "Frontend index_custom.html not found"}
else:
    @app.get("/")
    async def root():
        return {
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "status": "online",
            "docs": "/api/docs"
        }


def run():
    print("=" * 60)
    print(f"  {settings.APP_NAME} v{settings.APP_VERSION}")
    print(f"  Smart India Hackathon 2026 | {settings.SIH_THEME}")
    print(f"  Team: {settings.TEAM_NAME} ({settings.TEAM_ID})")
    print(f"  Demo Mode: {'ENABLED' if settings.DEMO_MODE else 'DISABLED'}")
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
