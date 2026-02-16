#!/usr/bin/env python3
"""
Agora — Run script.
Starts the FastAPI backend (which serves the frontend).
"""

import os
import sys
import subprocess
import webbrowser
import time
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

HOST = os.getenv("AGORA_HOST", "127.0.0.1")
PORT = int(os.getenv("AGORA_PORT", "8080"))


def main():
    print("""
    ╔═══════════════════════════════════════╗
    ║          🏛️  A G O R A               ║
    ║     Many voices. Better decisions.    ║
    ╚═══════════════════════════════════════╝
    """)

    # Check Python version
    if sys.version_info < (3, 12):
        print("⚠️  Agora requires Python 3.12 or later.")
        sys.exit(1)

    # Ensure data directory exists
    os.makedirs(os.path.join(BASE_DIR, "data"), exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, "logs"), exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, "registries", "user"), exist_ok=True)

    # Check if deps are installed
    try:
        import fastapi
        import uvicorn
    except ImportError:
        print("📦 Installing dependencies...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r",
                             os.path.join(BASE_DIR, "requirements.txt"), "-q"])
        import uvicorn

    print(f"🚀 Starting Agora at http://{HOST}:{PORT}")
    print(f"   Press Ctrl+C to stop.\n")

    # Open browser after a short delay
    def open_browser():
        time.sleep(2)
        webbrowser.open(f"http://{HOST}:{PORT}")

    import threading
    threading.Thread(target=open_browser, daemon=True).start()

    # Start server
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=HOST,
        port=PORT,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
