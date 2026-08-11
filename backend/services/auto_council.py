"""
Auto-council architect.

Given a user's statement, the architect surveys the available councils and
either picks an existing one or designs a new bespoke council on the fly,
including per-councillor model-tier assignments. The result is shown to the
user as a proposal — Agora doesn't materialise a new council until the user
confirms.

Why a separate module: this is a one-shot reasoning utility — different in
character from the multi-turn deliberation engine. Keeping it isolated keeps
the engine focused on "many councillors, one verdict" while this handles the
"which council in the first place" question.
"""

from __future__ import annotations

import os
import re
import json
import logging
import httpx
from sqlalchemy.orm import Session

from backend.database import CouncilRow
from backend.services import settings_service, model_picker
from engine.interface import AgoraEngine

logger = logging.getLogger("agora.auto_council")

ALLOWED_ICONS = ["users", "lightbulb", "heart", "activity", "brain", "shield", "star", "target", "compass", "zap"]
ALLOWED_PERSPECTIVES = ["supportive", "neutral", "critical", "contrarian"]
ALLOWED_TIERS = ["fast", "balanced", "powerful"]


def _summarise_councils(db: Session) -> list[dict]:
    """Compact council summaries the architect can read in one look."""
    councils = (
        db.query(CouncilRow)
        .filter(CouncilRow.is_active == True)  # noqa: E712 (SQLAlchemy)
        .order_by(CouncilRow.is_default.desc(), CouncilRow.name)
        .all()
    )
    return [
        {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "councillors": [
                {"name": cr.name, "expertise": cr.expertise_area or ""}
                for cr in c.councillors
            ],
        }
        for c in councils
    ]


def _build_architect_prompt(statement: str, councils: list[dict]) -> tuple[str, str]:
    """Returns (system_prompt, user_message). Split so the architect reads
    the live data closely while the rules stay stable in the system slot."""
    system = (
        "You are the Council Architect for Agora — a multi-perspective AI "
        "deliberation system that runs panels of 4–5 specialist personas on "
        "a user's statement.\n\n"
        "Your job has two parts:\n"
        "  1) Pick or design the right council.\n"
        "  2) Decide whether the deliberation needs live web search.\n\n"
        "═══ PART 1: COUNCIL DECISION ═══\n\n"
        "DECISION RULES:\n"
        "1. If an existing council clearly maps to the domain of the "
        "statement, USE IT. Don't over-design.\n"
        "2. If the statement is in a niche the existing councils don't "
        "cover (e.g. legal, regulatory, scientific, parenting, relationships, "
        "sports analysis, niche professional domains), DESIGN A NEW council.\n"
        "3. Lean toward existing councils when the fit is reasonable — "
        "adding councils has friction.\n\n"
        "IF YOU DESIGN A NEW COUNCIL:\n"
        "- 4 to 5 councillors with distinct, complementary perspectives.\n"
        "- Each councillor needs:\n"
        "  • name — terse and evocative (e.g. 'The Sceptic', 'Market Analyst', 'Compliance Officer').\n"
        "  • role_description — one short sentence summarising the role.\n"
        "  • expertise_area — 1–3 words.\n"
        f"  • perspective — one of {ALLOWED_PERSPECTIVES}.\n"
        f"  • model_tier — one of {ALLOWED_TIERS}.\n"
        "    – 'powerful' for deep reasoning roles (security, hard tradeoffs, devil's advocate).\n"
        "    – 'balanced' for most general roles (use as the default).\n"
        "    – 'fast' for simple sanity-check or quick-perspective roles.\n"
        "  • instructions — a 100–200 word system prompt defining how that councillor thinks.\n"
        "- coordinator_instructions — 100–200 word system prompt for synthesising the panel into a verdict.\n"
        f"- icon — pick one of: {ALLOWED_ICONS}.\n\n"
        "═══ PART 2: WEB SEARCH DECISION ═══\n\n"
        "Set `needs_web_search` to true if the deliberation would benefit from\n"
        "live web information. Examples of when to enable it:\n"
        "  • Current events, news, recent developments ('latest', 'today', 'this week').\n"
        "  • Specific factual claims to verify (statistics, prices, release dates, who-said-what).\n"
        "  • Named entities the model might not know post-training (recent products, people, papers).\n"
        "  • Comparison shopping, market data, real-time conditions.\n"
        "  • Anything where the model's training data could easily be stale.\n\n"
        "Set it to false ONLY when the question is clearly timeless and self-contained:\n"
        "  • Pure reasoning / opinion questions ('should I quit my job?', parenting advice).\n"
        "  • Generic decision-making with no external facts needed.\n"
        "  • Pure code / design review where the input contains everything needed.\n\n"
        "WHEN IN DOUBT, set it to TRUE. Extra web context rarely hurts; missing\n"
        "context can produce confidently wrong answers.\n\n"
        "═══ OUTPUT FORMAT ═══\n\n"
        "RETURN ONLY VALID JSON, NO MARKDOWN FENCES, NO PROSE OUTSIDE THE JSON.\n"
        "IMPORTANT: emit `decision` and (when use_existing) `council_id` FIRST,\n"
        "before any rationale fields, so the critical decision survives if you\n"
        "run out of tokens mid-response. council_id must be the EXACT id from\n"
        "the existing councils list above (e.g. 'default-tech'), not a name.\n\n"
        "{\n"
        '  "decision": "use_existing" | "create_new",\n'
        '  "council_id": "..."           ← REQUIRED if use_existing, exact id\n'
        '  "needs_web_search": true | false,\n'
        '  "rationale": "1-2 sentences on the council decision",\n'
        '  "web_search_rationale": "one short sentence on the search decision",\n'
        '  "new_council": {              ← only if create_new\n'
        '    "name": "...",\n'
        '    "description": "...",\n'
        '    "icon": "...",\n'
        '    "coordinator_instructions": "...",\n'
        '    "councillors": [\n'
        '      {"name": "...", "role_description": "...", "expertise_area": "...", "perspective": "...", "model_tier": "...", "instructions": "..."}\n'
        '    ]\n'
        '  }\n'
        "}\n"
    )
    user = (
        f'STATEMENT:\n"{statement}"\n\n'
        "EXISTING COUNCILS (id, name, description, councillors):\n"
        f"{json.dumps(councils, indent=2)}\n\n"
        "Return your JSON decision now."
    )
    return system, user


_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def _extract_json_block(text: str) -> str:
    """Be forgiving about how models package the JSON output:
    - Strip <think>...</think> reasoning traces (DeepSeek-R1, QwQ, etc.).
    - Strip ```json fences.
    - If there's still prose around the JSON, slice from the first `{`
      to the last `}` and return that substring.
    """
    s = _THINK_BLOCK.sub("", text).strip()
    if s.startswith("```json"):
        s = s[len("```json"):].lstrip()
    elif s.startswith("```"):
        s = s[3:].lstrip()
    if s.endswith("```"):
        s = s[:-3].rstrip()
    start = s.find("{")
    end = s.rfind("}")
    if start != -1 and end != -1 and end > start:
        return s[start:end + 1]
    return s


def design_for_statement(db: Session, statement: str, budget: str = "free") -> dict:
    """Run the architect once. Returns either:
    - {"decision": "use_existing", "council_id": ..., "rationale": ..., chosen_model, ...}
    - {"decision": "create_new", "new_council": {...}, "rationale": ..., chosen_model, ...}
    - {"error": "..."} on user-facing failure.

    `budget` is one of "free" | "cheap" | "best". The picker finds a working
    model in that budget tier (pre-tested with a tiny call), then the architect
    runs on it. The same model id is returned in `chosen_model` so the caller
    can use it to drive the entire deliberation that follows."""
    # Don't gate on api_key here — the picker handles the "no key + no Ollama"
    # case with a friendly error. If we have a key, expose it for the engine
    # via env (older code paths still read it from there).
    api_key = settings_service.get_api_key(db)
    if api_key:
        os.environ["OPENROUTER_API_KEY"] = api_key
    councils = _summarise_councils(db)
    system_prompt, user_message = _build_architect_prompt(statement, councils)
    engine = AgoraEngine()

    # The picker pretest catches obviously-broken models, but rate limits
    # for big calls behave differently from tiny ones — a model can pass a
    # 10-token pretest and then 429 on the 2000-token architect call. So we
    # walk through candidates: pick → architect-call → on 429/503, exclude
    # and try the next candidate.
    excluded: set = set()
    last_attempts: list = []
    architect_model = ""
    architect_model_name = ""
    chosen_models: dict = {}
    chosen_model_names: dict = {}
    content = ""
    usage = None
    last_transient_error: str | None = None

    for retry in range(3):
        pool_result = model_picker.pick_pool(db, budget, exclude=excluded)
        if not pool_result.get("ok"):
            err = pool_result.get("error", "Could not pick a model.")
            if last_transient_error:
                err = f"{err} (Earlier model: {last_transient_error})"
            return {"error": err, "attempts": last_attempts + pool_result.get("attempts", [])}

        architect_model = pool_result["primary_model"]
        architect_model_name = pool_result["primary_model_name"]
        chosen_models = pool_result["models"]
        chosen_model_names = pool_result["model_names"]
        last_attempts = last_attempts + pool_result.get("attempts", [])
        excluded.add(architect_model)  # exclude from next retry if this one 429s

        try:
            # Architect output for a NEW council can easily exceed 2k tokens
            # (5 councillor instructions × ~150 words each + coordinator
            # instructions). Bumped to 4500 to leave a comfortable margin.
            content, usage = engine._call_llm(
                architect_model, system_prompt, user_message, max_tokens=4500
            )
            break  # success — fall through to JSON parse
        except httpx.HTTPStatusError as e:
            status = e.response.status_code if e.response is not None else 0
            if status in (429, 503):
                logger.info(
                    f"architect: {architect_model} returned {status}; trying next candidate"
                )
                excluded.add(architect_model)
                last_transient_error = f"{architect_model} → HTTP {status}"
                continue
            logger.error(f"Architect HTTP error (model={architect_model}): {status}")
            return {"error": f"Architect call failed: HTTP {status}"}
        except Exception as e:
            logger.error(
                f"Architect call crashed (model={architect_model}): "
                f"{type(e).__name__}: {e}"
            )
            return {"error": f"Architect call failed: {str(e)[:200]}"}
    else:
        return {
            "error": (
                f"All candidate models in the '{budget}' tier were rate-limited "
                "or failing. Try a different budget."
            ),
            "attempts": last_attempts,
        }

    try:
        proposal = json.loads(_extract_json_block(content))
    except json.JSONDecodeError as e:
        logger.error(f"Architect JSON parse failed: {e}; content head: {content[:300]!r}")
        return {"error": "Architect returned invalid JSON. Please try again or pick a council manually."}

    decision = proposal.get("decision")
    if decision not in ("use_existing", "create_new"):
        logger.error(
            f"Architect returned invalid decision={decision!r}; "
            f"proposal keys={list(proposal.keys())}; raw head={content[:300]!r}"
        )
        return {"error": "Architect returned an invalid decision."}

    # Web-search decision. Coerce missing / weird values to True — when in
    # doubt we'd rather have extra context than miss a time-sensitive cue.
    nws = proposal.get("needs_web_search")
    if isinstance(nws, str):
        nws = nws.strip().lower() in ("true", "yes", "1")
    elif not isinstance(nws, bool):
        nws = True
    proposal["needs_web_search"] = nws
    if not isinstance(proposal.get("web_search_rationale"), str):
        proposal["web_search_rationale"] = ""

    if decision == "use_existing":
        cid = proposal.get("council_id")
        if not cid:
            logger.error(f"Architect missing council_id; raw head={content[:300]!r}")
            return {"error": "Architect did not return a council_id."}
        match = db.query(CouncilRow).filter(
            CouncilRow.id == cid, CouncilRow.is_active == True  # noqa: E712
        ).first()
        if not match:
            # LLMs are bad at copying long UUIDs — try fuzzy matching against
            # the existing councils. Prefix match handles single-char typos;
            # name match handles "the model recalled the name not the id".
            active = db.query(CouncilRow).filter(CouncilRow.is_active == True).all()  # noqa: E712
            prefix = cid[:8] if len(cid) >= 8 else cid
            for c in active:
                if c.id.startswith(prefix) or c.id[:8] == prefix:
                    logger.info(f"Architect council_id={cid!r} fuzzy-matched → {c.id} ({c.name})")
                    match = c
                    proposal["council_id"] = c.id
                    break
            if not match:
                logger.error(f"Architect picked unknown council_id={cid!r}")
                return {"error": f"Architect picked an unknown council: {cid}"}
    else:
        nc = proposal.get("new_council") or {}
        if not nc.get("name") or not nc.get("councillors"):
            logger.error(
                f"Architect new_council missing fields; keys={list(nc.keys())}; "
                f"raw head={content[:300]!r}"
            )
            return {"error": "Architect's new_council is missing required fields."}
        # Coerce enum-like fields to safe defaults rather than fail outright.
        if nc.get("icon") not in ALLOWED_ICONS:
            nc["icon"] = "users"
        for c in (nc.get("councillors") or []):
            if c.get("perspective") not in ALLOWED_PERSPECTIVES:
                c["perspective"] = "neutral"
            if c.get("model_tier") not in ALLOWED_TIERS:
                c["model_tier"] = "balanced"
        proposal["new_council"] = nc

    proposal["chosen_model"] = {
        "id": architect_model,
        "name": architect_model_name,
        "budget": budget,
    }
    # Tier-mapped models for diversified deliberation (different models per
    # councillor tier). Frontend sends these as model_overrides so cloud
    # councillors get distinct LLMs rather than all sharing one.
    proposal["chosen_models"] = {
        tier: {"id": mid, "name": chosen_model_names.get(tier, mid)}
        for tier, mid in chosen_models.items()
    }
    proposal["model_used"] = architect_model
    proposal["cost_usd"] = round(usage.cost, 6) if usage else 0.0
    proposal["total_tokens"] = usage.total_tokens if usage else 0
    proposal["pretest_attempts"] = last_attempts
    return proposal
