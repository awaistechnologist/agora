"""
Claim verification — a lightweight Agora capability, separate from council
deliberations.

Delegates to llm-sidecar's verifier: a targeted web search per claim, a judge
model grading claims in batches against that evidence, and a second pass that
reads the full source pages for anything still unverified.

Used by the MCP tools `verify_claims` / `search_web` and the REST endpoint
POST /api/verify/claims. Does not touch the deliberation flow.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("agora.engine.verify")

VERDICTS = ("supported", "contradicted", "unverified", "not_a_claim")


def verify_claims(claims: list[str], model: str, sidecar) -> list[dict]:
    """Verify claims against fresh web evidence.

    Args:
        claims:  plain-language factual statements to check.
        model:   judge model id (`ollama/<name>` for local, else OpenRouter id).
        sidecar: an llm_sidecar.Sidecar — see engine.llm.get_sidecar.

    Returns one dict per claim, in order:
        {claim, verdict: supported|contradicted|unverified|not_a_claim, note, sources: [urls]}
    """
    claims = [c.strip() for c in claims if c and c.strip()]
    if not claims:
        return []

    results = [
        {"claim": v.claim, "verdict": v.verdict, "note": v.note, "sources": list(v.sources)}
        for v in sidecar.verify(claims, model=model)
    ]
    logger.info(
        "verified %d claims: %s", len(results),
        {v: sum(1 for r in results if r["verdict"] == v) for v in VERDICTS},
    )
    return results
