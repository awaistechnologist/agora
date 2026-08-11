"""
Model picker — given a budget preference, finds a working OpenRouter model
without requiring the user to pre-configure anything.

Strategy:
1. From the cached OpenRouter model list, filter candidates by budget tier
   (free / cheap / best price tier).
2. Walk a curated priority list first (well-known capable picks per tier),
   then fall back to remaining candidates ranked by price within the tier.
3. Pre-test each candidate with a tiny "Reply OK" call. Return the first
   that responds with HTTP 200 and non-empty content — so we hand back a
   model that's verified working right now (not stale or rate-limited).

Used by /api/chamber/auto-design when the user picks Auto + a budget knob.
The chosen model is then used for the architect call AND every councillor
+ coordinator in the resulting deliberation, so the user gets a fully
automatic flow with no upfront model setup.
"""

from __future__ import annotations

import os
import logging
import httpx
from sqlalchemy.orm import Session

from backend.services import model_service, settings_service

logger = logging.getLogger("agora.model_picker")

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_PREFIX = "ollama/"

# Curated priority lists per budget tier. Order = preference. We try these
# first because they're known to be capable enough for council-style
# reasoning. Anything not in cache is silently skipped — the catalogue
# changes over time so this list doesn't have to be perfectly current.
PREFERRED = {
    "free": [
        "z-ai/glm-4.5-air:free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "nousresearch/hermes-3-llama-3.1-405b:free",
        "qwen/qwen3-next-80b-a3b-instruct:free",
        "google/gemma-4-31b-it:free",
        "google/gemma-3-27b-it:free",
        "deepseek/deepseek-chat-v3:free",
        "deepseek/deepseek-r1:free",
        "meta-llama/llama-3.1-70b-instruct:free",
    ],
    "cheap": [
        "anthropic/claude-haiku-4-5",
        "google/gemini-2.5-flash",
        "openai/gpt-5-nano",
        "openai/gpt-5-mini",
        "anthropic/claude-3-5-haiku",
        "google/gemini-flash-1.5",
        "mistralai/mistral-small-3.2",
    ],
    "best": [
        "anthropic/claude-opus-4-7",
        "anthropic/claude-sonnet-4-6",
        "openai/gpt-5",
        "openai/gpt-5.2",
        "google/gemini-3-pro",
        "anthropic/claude-3-5-sonnet",
        "openai/gpt-4o",
    ],
}

# Substrings that mark a model as specialised (OCR, vision-only, embeddings,
# audio, image-gen, etc.) — exclude these from the fallback pool because
# they're rarely good council reasoners.
SPECIALISED_KEYWORDS = (
    "ocr", "vision", "embed", "embedding", "image-gen", "imagegen",
    "audio", "tts", "stt", "whisper", "moderation", "rerank",
    # Multimodal / non-text-reasoning extras:
    "lyria", "clip", "music", "video", "imagen", "dall-e", "midjourney",
    "stable-diffusion", "sora", "veo",
)


def _is_specialised(model_id: str) -> bool:
    lower = model_id.lower()
    return any(k in lower for k in SPECIALISED_KEYWORDS)


def _matches_budget(m, budget: str) -> bool:
    """Does this model fall in the given budget bucket?"""
    p = m.prompt_price_per_million
    if budget == "free":
        return m.is_free
    if budget == "cheap":
        return (not m.is_free) and 0 < p <= 1.0
    if budget == "best":
        return p >= 5.0
    return False


def _ollama_candidates() -> list[str]:
    """Installed Ollama models, prefixed with `ollama/` so the engine routes
    them locally. Ordered by size descending — bigger local models tend to
    reason better, and we already know they fit in RAM (since they're
    installed). Returns [] if Ollama isn't reachable."""
    try:
        r = httpx.get(f"{OLLAMA_HOST}/api/tags", timeout=1.0)
        if r.status_code != 200:
            return []
        models = r.json().get("models") or []
    except Exception:
        return []
    # Skip unsupported families (vision-only, embed-only) — same idea as the
    # specialised-keyword filter for OpenRouter.
    keep = [m for m in models if not _is_specialised(m.get("name", ""))]
    # Largest first — generally more capable.
    keep.sort(key=lambda m: m.get("size", 0), reverse=True)
    return [f"{OLLAMA_PREFIX}{m['name']}" for m in keep if m.get("name")]


def _candidates(db: Session, budget: str) -> list[str]:
    """Ordered list of candidate model ids — curated preferred picks first,
    then remaining in-tier general-purpose models sorted by price + context.
    Specialised models (OCR, vision-only, embedding, etc.) are excluded
    from the fallback pool to avoid picking a bad architect/councillor model.

    For budget=free, we ALSO consider locally-installed Ollama models. Local
    models are placed at the front of the queue because they're truly free
    (no rate limits, no quota), unlike OpenRouter free tiers which throttle
    aggressively."""
    models = model_service.get_cached_models(db)
    by_id = {m.id: m for m in models}
    in_budget = [m for m in models if _matches_budget(m, budget) and not _is_specialised(m.id)]

    preferred_ids = [pid for pid in PREFERRED.get(budget, []) if pid in by_id]
    fallback_ids = [m.id for m in in_budget if m.id not in preferred_ids]

    if budget == "free":
        fallback_ids.sort(key=lambda i: -by_id[i].context_length)
    elif budget == "cheap":
        fallback_ids.sort(key=lambda i: by_id[i].prompt_price_per_million)
    elif budget == "best":
        fallback_ids.sort(key=lambda i: by_id[i].prompt_price_per_million, reverse=True)

    cloud_candidates = preferred_ids + fallback_ids
    if budget == "free":
        api_key = settings_service.get_api_key(db)
        if api_key:
            # API key present → try OpenRouter free models first, Ollama as fallback.
            return cloud_candidates + _ollama_candidates()
        else:
            # No API key → Ollama is the only real option.
            return _ollama_candidates() + cloud_candidates
    return cloud_candidates


def _pretest(model_id: str, api_key: str | None, timeout: float = 15.0) -> tuple[bool, str | None]:
    """Send a tiny call to the model. Return (ok, error_reason_or_None).

    Routes ollama/* to localhost:11434, everything else to OpenRouter. The
    OpenAI-compatible wire format is identical."""
    is_ollama = model_id.startswith(OLLAMA_PREFIX)
    if is_ollama:
        url = f"{OLLAMA_HOST}/v1/chat/completions"
        wire_model = model_id[len(OLLAMA_PREFIX):]
        headers = {"Content-Type": "application/json"}
        local_timeout = 30.0  # local model first-load can take a moment
    else:
        if not api_key:
            return False, "no api key"
        url = OPENROUTER_CHAT_URL
        wire_model = model_id
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:8080",
            "X-Title": "Agora",
        }
        local_timeout = timeout

    payload = {
        "model": wire_model,
        "messages": [{"role": "user", "content": "Reply with 'OK' and nothing else."}],
        "max_tokens": 10,
        "temperature": 0.0,
    }
    try:
        r = httpx.post(url, headers=headers, json=payload, timeout=local_timeout)
        if r.status_code != 200:
            return False, f"HTTP {r.status_code}"
        data = r.json()
        choices = data.get("choices") or []
        if not choices:
            return False, "no choices"
        content = (choices[0].get("message") or {}).get("content") or ""
        if len(content.strip()) == 0:
            return False, "empty content"
        return True, None
    except Exception as e:
        return False, f"{type(e).__name__}: {str(e)[:80]}"


def pick(db: Session, budget: str, max_attempts: int = 6, exclude: set | None = None) -> dict:
    """Return {ok: True, model_id, model_name, attempts: [...]}
    or       {ok: False, error, attempts: [...]} on failure.

    `exclude` skips model ids that previously failed (used when a model
    passed pretest but then 429'd on the real call)."""
    if budget not in ("free", "cheap", "best"):
        return {"ok": False, "error": f"Unknown budget: {budget}", "attempts": []}

    cand = [c for c in _candidates(db, budget) if not exclude or c not in exclude]
    if not cand:
        return {
            "ok": False,
            "error": (
                f"No models match the '{budget}' budget (after excluding previously-failed). "
                "Refresh the model list in Settings → Default Models or pick a different budget."
            ),
            "attempts": [],
        }

    # Only require an OpenRouter key if we have to fall through to cloud
    # models. For budget=free with Ollama running, we can succeed without one.
    api_key = settings_service.get_api_key(db)
    has_cloud_cand = any(not c.startswith(OLLAMA_PREFIX) for c in cand)
    if has_cloud_cand and not api_key:
        # Drop cloud candidates from the list rather than fail outright.
        cand = [c for c in cand if c.startswith(OLLAMA_PREFIX)]
        if not cand:
            return {
                "ok": False,
                "error": "Add an OpenRouter API key in Settings, or install Ollama locally, to use Auto-pick.",
                "attempts": [],
            }

    cand = cand[:max_attempts]
    models = {m.id: m for m in model_service.get_cached_models(db)}
    attempts: list[dict] = []
    for model_id in cand:
        ok, reason = _pretest(model_id, api_key)
        attempts.append({"id": model_id, "ok": ok, "reason": reason})
        if ok:
            if model_id.startswith(OLLAMA_PREFIX):
                short = model_id[len(OLLAMA_PREFIX):]
                friendly = f"{short} (local)"
            else:
                picked = models.get(model_id)
                friendly = picked.name if picked else model_id
            return {
                "ok": True,
                "model_id": model_id,
                "model_name": friendly,
                "attempts": attempts,
            }
    return {
        "ok": False,
        "error": (
            f"Tried {len(attempts)} candidate model(s); none responded. "
            "Try a different budget, refresh models, or check your "
            "OpenRouter key has credit."
        ),
        "attempts": attempts,
    }


def pick_pool(db: Session, budget: str, max_attempts: int = 8, exclude: set | None = None) -> dict:
    """Like pick(), but returns up to 3 distinct working models mapped to tiers.

    For Ollama or no-key runs, all tiers get the same model (local inference
    is already diversified by the model itself). For OpenRouter, we try to
    pick a separate verified model for each tier so different councillors use
    different LLMs — that's the whole point of the cloud free tier.

    Returns:
      {ok: True, models: {fast, balanced, powerful}, model_names: {...},
       primary_model: str, primary_model_name: str, attempts: [...]}
    or the standard {ok: False, error, attempts} on failure."""
    first = pick(db, budget, max_attempts=max_attempts, exclude=exclude)
    if not first.get("ok"):
        return first

    first_id = first["model_id"]
    all_attempts = list(first["attempts"])
    api_key = settings_service.get_api_key(db)

    # No diversification for local-only runs — every tier gets the same model.
    if first_id.startswith(OLLAMA_PREFIX) or not api_key:
        name = first["model_name"]
        return {
            "ok": True,
            "models": {"fast": first_id, "balanced": first_id, "powerful": first_id},
            "model_names": {"fast": name, "balanced": name, "powerful": name},
            "primary_model": first_id,
            "primary_model_name": name,
            "attempts": all_attempts,
        }

    # OpenRouter: pick up to 2 more distinct working models for tier variety.
    excluded = (exclude or set()) | {first_id}
    extras: list[dict] = []
    for _ in range(2):
        nxt = pick(db, budget, max_attempts=max_attempts, exclude=excluded)
        all_attempts += nxt.get("attempts", [])
        if nxt.get("ok"):
            extras.append(nxt)
            excluded.add(nxt["model_id"])

    # Assign tiers: balanced gets the first pick (most councillors default to
    # it), fast and powerful get extras when available.
    tier_order = ["balanced", "fast", "powerful"]
    tier_picks = [first] + extras
    models: dict[str, str] = {}
    model_names: dict[str, str] = {}
    for i, tier in enumerate(tier_order):
        p = tier_picks[min(i, len(tier_picks) - 1)]
        models[tier] = p["model_id"]
        model_names[tier] = p["model_name"]

    return {
        "ok": True,
        "models": models,
        "model_names": model_names,
        "primary_model": first_id,
        "primary_model_name": first["model_name"],
        "attempts": all_attempts,
    }
