"""
Agora Backend — FastAPI application.
Serves API routes and frontend static files.
"""

import os
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

# Load .env before anything else
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

from backend.database import init_db, SessionLocal
from backend.services.council_service import seed_defaults
from backend.api import settings as settings_api
from backend.api import models as models_api
from backend.api import councils as councils_api
from backend.api import chamber as chamber_api
from backend.api import mcp as mcp_api
from backend.api import ollama as ollama_api
from backend.api import verify as verify_api

# ─── Logging ───────────────────────────────────────────────────────────────
log_level = os.getenv("AGORA_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("agora")

# Create logs dir for file handler
logs_dir = os.path.join(BASE_DIR, "logs")
os.makedirs(logs_dir, exist_ok=True)
file_handler = logging.FileHandler(os.path.join(logs_dir, "agora.log"))
file_handler.setLevel(getattr(logging, log_level, logging.INFO))
file_handler.setFormatter(logging.Formatter("%(asctime)s [%(name)s] %(levelname)s: %(message)s"))
logging.getLogger().addHandler(file_handler)


# ─── Lifespan ──────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Agora is starting up...")
    init_db()
    db = SessionLocal()
    try:
        seed_defaults(db)
    finally:
        db.close()
    logger.info("Database initialized, defaults seeded.")
    yield
    # Shutdown
    logger.info("Agora is shutting down.")


# ─── App ───────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Agora",
    description="Many voices. Better decisions.",
    version="0.3.0",
    lifespan=lifespan,
)

# CORS (for dev mode with separate frontend)
cors_origins = os.getenv("AGORA_CORS_ORIGINS", "")
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in cors_origins.split(",")],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# ─── API Routes ────────────────────────────────────────────────────────────
app.include_router(settings_api.router)
app.include_router(models_api.router)
app.include_router(councils_api.router)
app.include_router(chamber_api.router)
app.include_router(mcp_api.router)
app.include_router(ollama_api.router)
app.include_router(verify_api.router)


# ─── Health ────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    from engine.interface import AgoraEngine
    return {
        "status": "ok",
        "version": "0.3.0",
        "engine_version": AgoraEngine.get_engine_version(),
    }


# ─── Static files (frontend) ──────────────────────────────────────────────
FRONTEND_DIST = os.path.join(BASE_DIR, "frontend", "dist")
# index.html is the SPA shell; it points at a content-hashed JS bundle in
# /assets. We must NOT let the browser cache index.html, otherwise a new build
# (with a new bundle hash) won't be picked up on plain navigation — the user
# would have to hard-refresh every time. Hashed bundles in /assets are safe
# to cache long-term because their filenames change when the code changes.
#
# `no-store` is stronger than `no-cache` and is the only directive that
# reliably invalidates the browser's in-memory back/forward cache (bfcache).
# `Pragma`/`Expires` cover legacy proxies for completeness.
_INDEX_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}

if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve the React SPA — all non-API routes go to index.html."""
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.isfile(file_path):
            # If the user requests a real file at the root (e.g. favicon),
            # serve it; otherwise fall through to index.html below.
            if full_path == "index.html":
                return FileResponse(file_path, headers=_INDEX_HEADERS)
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"), headers=_INDEX_HEADERS)
