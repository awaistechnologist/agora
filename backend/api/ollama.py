"""
Ollama integration API — /api/ollama

Surfaces:
- Whether Ollama is reachable on localhost:11434
- Local hardware (RAM, CPU, GPU label) so the UI can score model viability
- Models the user has already pulled, with size + parameter info
- A curated catalog of models worth pulling, ranked for council workloads
- A blocking `pull` endpoint that triggers Ollama to download a model

Why integrated rather than wrapping `llm-checker`:
- We score against council-specific workloads (5-way parallel-ish, mid-context)
- We tie viability into the same Default-1/2/3 slot UX
- Zero new external CLI dependency

Stays inside the OSS-friendly box: pure stdlib + httpx + subprocess(sysctl).
"""

from __future__ import annotations

import os
import sys
import json
import subprocess
import platform
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/ollama", tags=["ollama"])
logger = logging.getLogger("agora.ollama")

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
# Headroom we leave for the OS, the user's other apps, and Agora itself.
# Apple Silicon's unified memory means model swap-in/out is cheap, but the
# system still needs working RAM for the browser, Python, etc.
RAM_HEADROOM_BYTES = 6 * 1024 ** 3


# ── Curated catalog ──────────────────────────────────────────────────────────
# Approximate on-disk sizes for the most popular Ollama tags at their default
# quantisation (typically Q4_K_M). Numbers are rounded to billions of bytes;
# the UI uses them only to compute a viability rating, not to bill.
#
# `purpose` lets us tag good fits for specific tier slots. `intelligence`
# is a coarse 1-5 score for how strong the model is at general reasoning —
# useful for ranking, not authoritative.
CATALOG: list[dict] = [
    # Small, fast — great for Default 1 (Fast slot) on most machines
    {"id": "llama3.2:1b",        "label": "Llama 3.2 1B",          "approx_size_bytes": 1_300_000_000, "purpose": ["fast"],            "intelligence": 2, "summary": "Tiny, instant responses. Good for the Fast slot."},
    {"id": "llama3.2:3b",        "label": "Llama 3.2 3B",          "approx_size_bytes": 2_000_000_000, "purpose": ["fast"],            "intelligence": 3, "summary": "Small but capable. Solid Fast-slot pick."},
    {"id": "gemma2:2b",          "label": "Gemma 2 2B",            "approx_size_bytes": 1_700_000_000, "purpose": ["fast"],            "intelligence": 2, "summary": "Google's small model. Fast and cheap."},
    {"id": "phi3:mini",          "label": "Phi-3 Mini (3.8B)",     "approx_size_bytes": 2_500_000_000, "purpose": ["fast"],            "intelligence": 3, "summary": "Microsoft's small reasoning-tuned model."},

    # Mid — Default 2 (Balanced) on most machines
    {"id": "llama3.1:8b",        "label": "Llama 3.1 8B",          "approx_size_bytes": 5_000_000_000, "purpose": ["balanced"],        "intelligence": 4, "summary": "Workhorse. Strong Balanced-slot default."},
    {"id": "qwen2.5:7b",         "label": "Qwen 2.5 7B",           "approx_size_bytes": 4_700_000_000, "purpose": ["balanced"],        "intelligence": 4, "summary": "Alibaba's well-rounded mid-size model."},
    {"id": "mistral:7b",         "label": "Mistral 7B",            "approx_size_bytes": 4_400_000_000, "purpose": ["balanced"],        "intelligence": 3, "summary": "The classic. Good general-purpose."},
    {"id": "gemma2:9b",          "label": "Gemma 2 9B",            "approx_size_bytes": 5_500_000_000, "purpose": ["balanced"],        "intelligence": 4, "summary": "Google's mid-tier. Strong reasoning."},
    {"id": "qwen2.5-coder:7b",   "label": "Qwen 2.5 Coder 7B",     "approx_size_bytes": 4_700_000_000, "purpose": ["balanced"],        "intelligence": 4, "summary": "Code-specialised. Pair with the Tech Council."},

    # Larger — Default 3 (Powerful) on capable machines
    {"id": "qwen2.5:14b",        "label": "Qwen 2.5 14B",          "approx_size_bytes": 9_000_000_000, "purpose": ["powerful"],        "intelligence": 4, "summary": "Step up from 7B. Better synthesis."},
    {"id": "gemma2:27b",         "label": "Gemma 2 27B",           "approx_size_bytes": 16_000_000_000, "purpose": ["powerful"],        "intelligence": 5, "summary": "Heavy-duty reasoning."},
    {"id": "qwen2.5:32b",        "label": "Qwen 2.5 32B",          "approx_size_bytes": 20_000_000_000, "purpose": ["powerful"],        "intelligence": 5, "summary": "Strong open-weight model. Powerful slot."},
    {"id": "qwen2.5-coder:32b",  "label": "Qwen 2.5 Coder 32B",    "approx_size_bytes": 20_000_000_000, "purpose": ["powerful"],        "intelligence": 5, "summary": "Top open-weight coding model."},
    {"id": "mixtral:8x7b",       "label": "Mixtral 8x7B (MoE)",    "approx_size_bytes": 26_000_000_000, "purpose": ["powerful"],        "intelligence": 4, "summary": "Mixture-of-experts. Big and clever."},
    {"id": "llama3.1:70b",       "label": "Llama 3.1 70B",         "approx_size_bytes": 40_000_000_000, "purpose": ["powerful"],        "intelligence": 5, "summary": "Frontier open weights. Needs ≥48GB."},
    {"id": "qwen2.5:72b",        "label": "Qwen 2.5 72B",          "approx_size_bytes": 47_000_000_000, "purpose": ["powerful"],        "intelligence": 5, "summary": "Top-tier open weights. Needs ≥56GB."},
]


# ── Hardware detection ───────────────────────────────────────────────────────

def _sysctl(key: str) -> Optional[str]:
    try:
        out = subprocess.check_output(["sysctl", "-n", key], stderr=subprocess.DEVNULL, timeout=2)
        return out.decode().strip()
    except Exception:
        return None


def _macos_gpu_label() -> Optional[str]:
    """On macOS, GPU info via system_profiler. Apple Silicon uses unified memory
    so the GPU's effective memory is the system RAM."""
    try:
        out = subprocess.check_output(
            ["system_profiler", "SPDisplaysDataType", "-json"],
            stderr=subprocess.DEVNULL, timeout=4,
        )
        data = json.loads(out.decode())
        gpus = data.get("SPDisplaysDataType") or []
        if gpus:
            first = gpus[0]
            return first.get("sppci_model") or first.get("_name")
    except Exception:
        return None
    return None


def _nvidia_gpu_label() -> Optional[str]:
    """Linux/Windows-with-WSL NVIDIA detection."""
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
            stderr=subprocess.DEVNULL, timeout=2,
        )
        line = out.decode().strip().splitlines()[0]
        return line  # e.g. "NVIDIA GeForce RTX 4090, 24576 MiB"
    except Exception:
        return None


def detect_system() -> dict:
    """Return a small system snapshot used for model viability scoring."""
    arch = platform.machine()
    system = platform.system()

    ram_bytes: Optional[int] = None
    cpu_brand: Optional[str] = None
    cpu_cores: Optional[int] = None
    gpu_label: Optional[str] = None

    if system == "Darwin":
        ram_str = _sysctl("hw.memsize")
        if ram_str:
            try: ram_bytes = int(ram_str)
            except ValueError: pass
        cpu_brand = _sysctl("machdep.cpu.brand_string")
        cores_str = _sysctl("hw.ncpu")
        if cores_str:
            try: cpu_cores = int(cores_str)
            except ValueError: pass
        gpu_label = _macos_gpu_label() or cpu_brand  # Apple Silicon: GPU == SoC
    elif system == "Linux":
        try:
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemTotal:"):
                        ram_bytes = int(line.split()[1]) * 1024
                        break
        except OSError:
            pass
        try:
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if line.startswith("model name"):
                        cpu_brand = line.split(":", 1)[1].strip()
                        break
        except OSError:
            pass
        cpu_cores = os.cpu_count()
        gpu_label = _nvidia_gpu_label()

    if cpu_cores is None:
        cpu_cores = os.cpu_count()

    available_for_models = max(0, (ram_bytes or 0) - RAM_HEADROOM_BYTES)
    is_apple_silicon = system == "Darwin" and arch == "arm64"

    return {
        "ram_bytes": ram_bytes,
        "cpu_brand": cpu_brand,
        "cpu_cores": cpu_cores,
        "arch": arch,
        "system": system,
        "gpu_label": gpu_label,
        "is_apple_silicon": is_apple_silicon,
        "available_for_models_bytes": available_for_models,
        "ram_headroom_bytes": RAM_HEADROOM_BYTES,
    }


# ── Viability scoring ────────────────────────────────────────────────────────

def _score_viability(model_size: int, available: int) -> dict:
    """Return a viability rating for a model of the given size on a system with
    `available` bytes of inference-usable memory."""
    if available <= 0 or model_size <= 0:
        return {"rating": "unknown", "label": "Unknown", "note": ""}
    ratio = model_size / available
    if ratio <= 0.4:
        return {"rating": "recommended", "label": "Recommended", "note": "Fits comfortably; should run fast."}
    if ratio <= 0.7:
        return {"rating": "workable", "label": "Workable", "note": "Fits with room. Expect normal speed."}
    if ratio <= 0.9:
        return {"rating": "tight", "label": "Tight fit", "note": "Will run but leaves little headroom for other apps."}
    if ratio <= 1.05:
        return {"rating": "marginal", "label": "Marginal", "note": "Right at your memory limit — likely to swap or stall."}
    return {"rating": "wont_fit", "label": "Won't fit", "note": "Larger than your usable memory — pulling not recommended."}


# ── Ollama HTTP helpers ──────────────────────────────────────────────────────

def _ollama_get(path: str, timeout: float = 1.0):
    # Short timeout: Ollama runs locally and answers in milliseconds when
    # it's up, and TCP connection refused on localhost is instant when it
    # isn't. Anything beyond 1s here just makes the Settings page slow.
    return httpx.get(f"{OLLAMA_HOST}{path}", timeout=timeout)


def _ollama_post(path: str, json_body: dict, timeout: float = 600.0):
    return httpx.post(f"{OLLAMA_HOST}{path}", json=json_body, timeout=timeout)


def _list_installed() -> list[dict]:
    """Return the list of models the user has already pulled."""
    try:
        r = _ollama_get("/api/tags")
        r.raise_for_status()
        return r.json().get("models", [])
    except Exception:
        return []


def _ollama_version() -> Optional[str]:
    try:
        r = _ollama_get("/api/version")
        if r.status_code == 200:
            return r.json().get("version")
    except Exception:
        pass
    return None


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/status")
def status():
    """Everything the UI needs to render the Local Models card."""
    sysinfo = detect_system()
    available = sysinfo["available_for_models_bytes"]

    installed_raw = _list_installed()
    version = _ollama_version()
    running = bool(installed_raw) or version is not None

    installed_ids = {m.get("name") for m in installed_raw}
    installed = [
        {
            "id": m.get("name"),
            "size_bytes": m.get("size", 0),
            "param_size": (m.get("details") or {}).get("parameter_size"),
            "quant": (m.get("details") or {}).get("quantization_level"),
            "family": (m.get("details") or {}).get("family"),
            "viability": _score_viability(m.get("size", 0), available),
        }
        for m in installed_raw
    ]
    # Sort installed by size, smallest first (most likely Fast picks at top)
    installed.sort(key=lambda x: x["size_bytes"])

    catalog = []
    for m in CATALOG:
        catalog.append({
            **m,
            "installed": m["id"] in installed_ids
                or any(installed_id.startswith(m["id"].split(":")[0] + ":") and installed_id.endswith(":latest") and m["id"].endswith(":latest") for installed_id in installed_ids),
            "viability": _score_viability(m["approx_size_bytes"], available),
        })

    return {
        "running": running,
        "host": OLLAMA_HOST,
        "version": version,
        "system": sysinfo,
        "installed": installed,
        "catalog": catalog,
    }


class PullBody(BaseModel):
    id: str


@router.post("/pull")
def pull(body: PullBody):
    """Block-pull a model. The endpoint returns once the pull completes (or fails).
    For now we don't stream progress — the UI shows a busy state and re-fetches
    /status when this returns. Streaming progress is a worthwhile follow-up."""
    if not body.id or "/" in body.id and not body.id.startswith("ollama/"):
        raise HTTPException(status_code=400, detail="Invalid model id.")

    model_id = body.id
    if model_id.startswith("ollama/"):
        model_id = model_id[len("ollama/"):]

    try:
        # Ollama's pull endpoint streams NDJSON; we consume it to completion.
        # `stream: false` returns once complete with a single response.
        with httpx.stream("POST", f"{OLLAMA_HOST}/api/pull",
                         json={"name": model_id, "stream": False},
                         timeout=httpx.Timeout(connect=5.0, read=None, write=30.0, pool=5.0)) as r:
            if r.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"Ollama returned {r.status_code}")
            # consume the stream so the call blocks until the pull finishes
            for _ in r.iter_lines():
                pass
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Could not reach Ollama at {OLLAMA_HOST}: {e}")

    return {"ok": True, "id": model_id}
