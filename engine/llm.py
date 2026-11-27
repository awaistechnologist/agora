"""
The one place Agora reaches llm-sidecar.

Agora used to carry its own OpenRouter/Ollama client, DuckDuckGo search and
claim-verification judge. llm-sidecar does all three (plus SearXNG, page
reading, caching, a usage ledger and the claude/ providers), so the engine
now routes through it as a library — in-process, no daemon required.

Agora still owns its settings: the OpenRouter key saved in Agora's Settings
page and its OLLAMA_HOST win over anything in ~/.config/llm-sidecar. When
Agora has no key of its own, a key already configured for llm-sidecar on
this machine is used instead.
"""

from __future__ import annotations

import os
import threading

from llm_sidecar import Sidecar

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_PREFIX = "ollama/"

_lock = threading.Lock()
_instances: dict[str, Sidecar] = {}


def get_sidecar(api_key: str | None = None) -> Sidecar:
    """A Sidecar configured for Agora, one per OpenRouter key.

    Cached because a Sidecar remembers which auto-picked models failed in this
    process; rebuilding it per call would forget that."""
    key = api_key or ""
    with _lock:
        sc = _instances.get(key)
        if sc is None:
            sc = Sidecar(
                openrouter_api_key=api_key or None,
                ollama_host=OLLAMA_HOST,
                referer="http://localhost:8080",
                app_title="Agora",
            )
            _instances[key] = sc
        return sc
