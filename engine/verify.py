"""
Claim verification — a lightweight Agora capability, separate from council
deliberations.

For each claim: a targeted DuckDuckGo search (free, keyless) gathers evidence,
then a single cheap LLM judge call per batch grades every claim against its
own evidence. Returns structured verdicts with source URLs.

Used by the MCP tools `verify_claims` / `search_web` and the REST endpoint
POST /api/verify/claims. Does not touch the deliberation flow.
"""

from __future__ import annotations

import json
import logging
import re

logger = logging.getLogger("agora.engine.verify")

VERDICTS = ("supported", "contradicted", "unverified")
BATCH_SIZE = 5  # claims per judge call
MAX_EVIDENCE_PER_CLAIM = 4

JUDGE_SYSTEM = """You are a careful fact-checking judge. For each numbered claim you are
given web search evidence. Grade each claim STRICTLY on the evidence provided:
- "supported": the evidence clearly backs the claim.
- "contradicted": the evidence clearly conflicts with the claim.
- "unverified": the evidence is insufficient, off-topic, or mixed. When in doubt, use this.
Never use outside knowledge to mark a claim "supported" — evidence only. You may use
well-established knowledge to mark an obviously false claim "contradicted".
Respond ONLY with valid JSON, no markdown fences, no commentary."""

JUDGE_TEMPLATE = """Grade these claims against their evidence:

{blocks}

Respond with EXACTLY this JSON shape, one entry per claim, in order:
{{"results": [{{"claim": 1, "verdict": "supported|contradicted|unverified",
"note": "one short sentence explaining the verdict"}}]}}"""


def gather_evidence(claim: str, max_results: int = MAX_EVIDENCE_PER_CLAIM) -> list[dict]:
    """Targeted web search for one claim. Returns [{title, url, snippet}]."""
    from ddgs import DDGS

    out: list[dict] = []
    try:
        for r in DDGS().text(claim, max_results=max_results):
            out.append({
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": r.get("body", "")[:400],
            })
    except Exception as e:
        logger.warning("evidence search failed for %r: %s", claim[:60], e)
    return out


def _extract_json(text: str) -> dict:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
    if fence:
        text = fence.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in judge response")
    return json.loads(text[start : end + 1])


def _judge_batch(call_llm, model: str, claims: list[str], evidence: list[list[dict]]) -> list[dict]:
    blocks = []
    for i, (claim, ev) in enumerate(zip(claims, evidence), 1):
        ev_text = "\n".join(
            f"  - {e['title']}: {e['snippet']}" for e in ev
        ) or "  (no search results found)"
        blocks.append(f"CLAIM {i}: {claim}\nEVIDENCE:\n{ev_text}")
    user = JUDGE_TEMPLATE.format(blocks="\n\n".join(blocks))

    last_error = ""
    for attempt in range(2):
        prompt = user if not last_error else (
            user + f"\n\nYour previous response was invalid ({last_error}). "
            "Respond again with ONLY the JSON object."
        )
        raw, _usage = call_llm(model, JUDGE_SYSTEM, prompt, max_tokens=1500)
        try:
            data = _extract_json(raw)
            by_idx = {}
            for r in data.get("results", []):
                idx = int(r.get("claim", 0)) - 1
                verdict = str(r.get("verdict", "unverified")).lower()
                if verdict not in VERDICTS:
                    verdict = "unverified"
                if 0 <= idx < len(claims):
                    by_idx[idx] = {"verdict": verdict, "note": str(r.get("note", "")).strip()[:300]}
            return [
                by_idx.get(i, {"verdict": "unverified", "note": "judge gave no verdict"})
                for i in range(len(claims))
            ]
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as e:
            last_error = str(e)[:200]
    raise RuntimeError(f"judge response unparseable after 2 attempts ({last_error})")


def verify_claims(claims: list[str], model: str, call_llm) -> list[dict]:
    """Verify claims against fresh web evidence.

    Args:
        claims:   plain-language factual statements to check.
        model:    judge model id (`ollama/<name>` for local, else OpenRouter id).
        call_llm: callable(model, system, user, max_tokens) -> (text, usage) —
                  pass CouncilEngine()._call_llm to reuse Agora's routing/retries.

    Returns one dict per claim, in order:
        {claim, verdict: supported|contradicted|unverified, note, sources: [urls]}
    """
    claims = [c.strip() for c in claims if c and c.strip()]
    if not claims:
        return []

    evidence = [gather_evidence(c) for c in claims]
    results: list[dict] = []
    for i in range(0, len(claims), BATCH_SIZE):
        batch_claims = claims[i : i + BATCH_SIZE]
        batch_ev = evidence[i : i + BATCH_SIZE]
        graded = _judge_batch(call_llm, model, batch_claims, batch_ev)
        for claim, ev, g in zip(batch_claims, batch_ev, graded):
            results.append({
                "claim": claim,
                "verdict": g["verdict"],
                "note": g["note"],
                "sources": [e["url"] for e in ev if e.get("url")][:MAX_EVIDENCE_PER_CLAIM],
            })
    logger.info(
        "verified %d claims: %s", len(results),
        {v: sum(1 for r in results if r["verdict"] == v) for v in VERDICTS},
    )
    return results
