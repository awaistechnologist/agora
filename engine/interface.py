"""
Agora Engine — Core Interface

The engine calls OpenRouter directly for each councillor and then for the coordinator synthesis,
without requiring external agent servers.
This produces real, high-quality AI deliberations with accurate cost tracking.
"""

import os
import json
import logging
import time
from datetime import datetime
import httpx
from dataclasses import dataclass, field
from typing import AsyncGenerator, Optional

logger = logging.getLogger("agora.engine")

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_PREFIX = "ollama/"


@dataclass
class UsageData:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost: float = 0.0


@dataclass
class CouncillorResult:
    councillor_id: str
    councillor_name: str
    councillor_role: str
    response_text: str
    stance: str = "neutral"
    model_used: str = ""
    usage: UsageData = field(default_factory=UsageData)


@dataclass
class VerdictResult:
    text: str
    confidence: str = "medium"
    usage: UsageData = field(default_factory=UsageData)


@dataclass
class SessionEvent:
    type: str  # councillor_start, councillor_response, verdict, error, complete
    data: dict = field(default_factory=dict)


class AgoraEngine:
    """
    Simulation-mode engine that calls OpenRouter directly for each councillor.
    """

    def __init__(self):
        self.api_key = os.getenv("OPENROUTER_API_KEY", "")

    def _get_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:8080",
            "X-Title": "Agora",
        }

    def _call_llm(self, model: str, system_prompt: str, user_message: str, max_tokens: int = 1000) -> tuple[str, UsageData]:
        """Make a synchronous LLM call. Routes to Ollama for `ollama/*` model ids
        and to OpenRouter for everything else. The wire format is identical
        (OpenAI-compatible chat completions); only the base URL + auth differ."""
        is_ollama = model.startswith(OLLAMA_PREFIX)
        if is_ollama:
            url = f"{OLLAMA_HOST}/v1/chat/completions"
            wire_model = model[len(OLLAMA_PREFIX):]
            headers = {"Content-Type": "application/json"}
        else:
            url = OPENROUTER_CHAT_URL
            wire_model = model
            headers = self._get_headers()

        payload = {
            "model": wire_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.7,
            "max_tokens": max_tokens,
        }

        try:
            resp = httpx.post(url, json=payload, headers=headers, timeout=300.0)
            resp.raise_for_status()
            data = resp.json()

            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            usage_raw = data.get("usage", {})
            # Ollama doesn't bill, so cost is always 0 for local calls.
            cost = 0.0 if is_ollama else (usage_raw.get("cost") or 0.0)
            usage = UsageData(
                prompt_tokens=usage_raw.get("prompt_tokens", 0),
                completion_tokens=usage_raw.get("completion_tokens", 0),
                total_tokens=usage_raw.get("total_tokens", 0),
                cost=cost,
            )
            return content, usage

        except Exception as e:
            logger.error(f"LLM call failed ({'ollama' if is_ollama else 'openrouter'}, model={wire_model}): {e}")
            raise

    def _infer_stance(self, perspective: str, response_text: str) -> str:
        """Simple stance inference based on councillor perspective."""
        if perspective == "supportive":
            return "supportive"
        elif perspective in ("critical", "contrarian"):
            return "critical"
        return "mixed"


    def _run_pre_check(self, statement: str, council_name: str, model: str) -> dict:
        """
        Evaluate statement completeness.
        Returns dict with status="proceed" or status="needs_clarification" (with questions).
        """
        system_prompt = (
            f"You are the coordinator of the {council_name}.\n"
            "Your task is to evaluate whether the user's statement contains enough context for a meaningful council deliberation.\n\n"
            "Check for:\n"
            "- Specificity: Is the statement concrete?\n"
            "- Context: Is there enough background?\n"
            "- Scope: Is it clear what feedback is needed?\n\n"
            "IF SUFFICIENT:\n"
            "Respond with JSON: {\"status\": \"proceed\"}\n\n"
            "IF INSUFFICIENT:\n"
            "Respond with JSON: {\"status\": \"needs_clarification\", \"questions\": [\"Q1\", \"Q2\"], \"understood\": \"Brief summary of what you understood\"}\n\n"
            "Do not call any tools. Just respond with JSON."
        )

        try:
            content, usage = self._call_llm(model, system_prompt, statement)
            # Try to parse JSON
            cleaned_content = content.strip()
            if cleaned_content.startswith("```json"):
                cleaned_content = cleaned_content[7:]
            if cleaned_content.endswith("```"):
                cleaned_content = cleaned_content[:-3]
            
            data = json.loads(cleaned_content)
            return {"result": data, "usage": usage}
        except Exception as e:
            logger.error(f"Pre-check failed: {e}")
            # detailed error logging would be good here
            # Fallback to proceed if JSON parsing fails
            return {"result": {"status": "proceed"}, "usage": UsageData()}


    def run_deliberation(
        self,
        statement: str,
        councillors: list[dict],
        council_name: str,
        default_models: dict | str = "openai/gpt-4o",
        coordinator_instructions: str = "",
        web_search_enabled: bool = False,
        web_search_provider: str = "openrouter",
        bypass_pre_check: bool = False,
        pre_check_enabled: bool = True,
        coordinator_model_tier: str | None = None,
    ):
        """
        Run a full deliberation synchronously, yielding events.

        `default_models` is a dict {"fast": str, "balanced": str, "powerful": str}.
        A bare string is also accepted for backward compatibility — it becomes
        the value for all three tiers.
        Returns a list of SessionEvent objects.
        """
        # Normalise default_models into a tier dict
        if isinstance(default_models, str):
            tier_models = {"fast": default_models, "balanced": default_models, "powerful": default_models}
        else:
            balanced = default_models.get("balanced") or "openai/gpt-4o"
            tier_models = {
                "fast": default_models.get("fast") or balanced,
                "balanced": balanced,
                "powerful": default_models.get("powerful") or balanced,
            }

        def resolve_tier(tier: str | None) -> str:
            return tier_models.get(tier or "balanced", tier_models["balanced"])

        # Legacy alias for any code below that still references default_model
        default_model = tier_models["balanced"]

        events = []
        all_responses = []
        total_usage = UsageData()

        current_date = datetime.now().strftime("%Y-%m-%d")

        # ─── Pre-Check (Phase 2) ───
        if pre_check_enabled and not bypass_pre_check:
            # Pre-check is a cheap clarity scan — run it on the Fast tier.
            pre_check_model = tier_models["fast"]
            
            pre_check_data = self._run_pre_check(statement, council_name, pre_check_model)
            result = pre_check_data["result"]
            usage = pre_check_data["usage"]
            
            total_usage.prompt_tokens += usage.prompt_tokens
            total_usage.completion_tokens += usage.completion_tokens
            total_usage.total_tokens += usage.total_tokens
            total_usage.cost += usage.cost
            
            if result.get("status") == "needs_clarification":
                events.append(SessionEvent(
                    type="pre_check",
                    data={
                        "questions": result.get("questions", []),
                        "understood": result.get("understood", ""),
                        "cost": usage.cost
                    }
                ))
                # End session here
                events.append(SessionEvent(
                    type="complete",
                    data={
                        "total_cost_usd": round(total_usage.cost, 6),
                        "total_tokens": total_usage.total_tokens,
                    },
                ))
                return events

        # ─── Search Context Injection (Local Provider) ───
        search_context = ""
        use_online_model_suffix = False

        if web_search_enabled:
            # Check provider
            if web_search_provider == "local":
                # Perform local search
                try:
                    from engine.search import search_web
                    logger.info(f"Performing local web search for: {statement[:50]}...")
                    results = search_web(statement)
                    search_context = f"\n\n### WEB SEARCH DEBUG CONTEXT ###\n{results}\n\n(This information was retrieved from a live web search. Use it if relevant to the user's request.)\n"
                except Exception as e:
                    logger.error(f"Local search failed: {e}")
                    events.append(SessionEvent(type="error", data={"message": f"Local search failed: {e}"}))
            else:
                # Default to native (OpenRouter)
                use_online_model_suffix = True

        # Phase 1: Call each councillor
        for c in councillors:
            events.append(SessionEvent(
                type="councillor_start",
                data={"councillor_id": c["id"], "councillor_name": c["name"]}
            ))

            # Precedence: explicit model_override > tier-resolved model > balanced default
            model = c.get("model_override") or resolve_tier(c.get("model_tier"))

            # Apply :online suffix only for OpenRouter models — Ollama has no online routing.
            if web_search_enabled and use_online_model_suffix and not model.startswith(OLLAMA_PREFIX):
                if not model.endswith(":online") and not model.endswith(":free"):
                    model = model + ":online"

            # Prefer rich instructions from HOCON; fall back to generic prompt
            if c.get("instructions"):
                system_prompt = c["instructions"]
            else:
                system_prompt = (
                    f"You are {c['name']}.\n\n"
                    f"{c['role_description']}\n\n"
                    f"Your expertise area is: {c.get('expertise_area', 'General')}\n"
                    f"Your perspective bias is: {c.get('perspective', 'neutral')}\n\n"
                    f"Keep your response concise (150-250 words). Use plain language."
                )
            
            # Prepend date context
            system_prompt = f"Current Date: {current_date}\n\n" + system_prompt
            
            # Inject search context if present
            # Inject search context if present
            if search_context:
                system_prompt = system_prompt + "\n\n" + search_context

            try:
                response_text, usage = self._call_llm(model, system_prompt, statement)
                stance = self._infer_stance(c.get("perspective", "neutral"), response_text)

                result = CouncillorResult(
                    councillor_id=c["id"],
                    councillor_name=c["name"],
                    councillor_role=c.get("expertise_area", ""),
                    response_text=response_text,
                    stance=stance,
                    model_used=model,
                    usage=usage,
                )
                all_responses.append(result)

                total_usage.prompt_tokens += usage.prompt_tokens
                total_usage.completion_tokens += usage.completion_tokens
                total_usage.total_tokens += usage.total_tokens
                total_usage.cost += usage.cost

                events.append(SessionEvent(
                    type="councillor_response",
                    data={
                        "councillor_id": c["id"],
                        "councillor_name": c["name"],
                        "councillor_role": c.get("expertise_area", ""),
                        "response_text": response_text,
                        "stance": stance,
                        "model_used": model,
                        "prompt_tokens": usage.prompt_tokens,
                        "completion_tokens": usage.completion_tokens,
                        "total_tokens": usage.total_tokens,
                        "cost_usd": usage.cost,
                    },
                ))
            except Exception as e:
                events.append(SessionEvent(
                    type="councillor_response",
                    data={
                        "councillor_id": c["id"],
                        "councillor_name": c["name"],
                        "councillor_role": c.get("expertise_area", ""),
                        "response_text": f"Unable to respond: {str(e)[:100]}",
                        "stance": "mixed",
                        "model_used": model,
                        "cost_usd": 0,
                        "error": True,
                    },
                ))

        # Phase 2: Coordinator synthesis
        if not coordinator_instructions:
            coordinator_instructions = (
                f"You are the coordinator of the {council_name}. "
                "Synthesise the councillors' perspectives into a clear verdict.\n\n"
                "Your verdict MUST include:\n"
                "- A brief summary of what the user asked or stated.\n"
                "- Where the councillors AGREE (common ground).\n"
                "- Where the councillors DISAGREE (tensions or trade-offs).\n"
                "- A balanced final recommendation.\n"
                "- Suggested next steps.\n\n"
                "At the end of your response, include a confidence assessment on a separate line:\n"
                "CONFIDENCE: [Low/Medium/High]\n\n"
                "Keep your language clear and accessible."
            )
        
        # Prepend date context
        coordinator_instructions = f"Current Date: {current_date}\n\n" + coordinator_instructions

        # Build the user message with all councillor responses
        synthesis_message = f"ORIGINAL STATEMENT:\n\"{statement}\"\n\nCOUNCILLOR RESPONSES:\n\n"
        for r in all_responses:
            synthesis_message += f"--- {r.councillor_name} ({r.councillor_role}) ---\n"
            synthesis_message += f"{r.response_text}\n\n"
        synthesis_message += "Please synthesise these perspectives into a clear, balanced verdict."

        try:
            coordinator_model = resolve_tier(coordinator_model_tier)

            # Apply :online suffix only for OpenRouter models — Ollama has no online routing.
            if web_search_enabled and use_online_model_suffix and not coordinator_model.startswith(OLLAMA_PREFIX):
                if not coordinator_model.endswith(":online") and not coordinator_model.endswith(":free"):
                    coordinator_model = coordinator_model + ":online"

            # Inject search context if present
            final_coordinator_instructions = coordinator_instructions
            if search_context:
                final_coordinator_instructions = coordinator_instructions + "\n\n" + search_context

            # Coordinator needs more tokens than councillors — it synthesises all responses
            verdict_text, verdict_usage = self._call_llm(
                coordinator_model, final_coordinator_instructions, synthesis_message,
                max_tokens=2500
            )

            if not verdict_text or not verdict_text.strip():
                raise ValueError("Coordinator returned an empty response. The model may have hit a context or content limit.")

            # Extract confidence from verdict text
            confidence = "medium"
            for line in verdict_text.split("\n"):
                if "CONFIDENCE:" in line.upper():
                    if "HIGH" in line.upper():
                        confidence = "high"
                    elif "LOW" in line.upper():
                        confidence = "low"
                    else:
                        confidence = "medium"
                    break

            total_usage.prompt_tokens += verdict_usage.prompt_tokens
            total_usage.completion_tokens += verdict_usage.completion_tokens
            total_usage.total_tokens += verdict_usage.total_tokens
            total_usage.cost += verdict_usage.cost

            # Build model summary
            model_counts = {}
            for r in all_responses:
                model_name = r.model_used.split("/")[-1] if "/" in r.model_used else r.model_used
                model_counts[model_name] = model_counts.get(model_name, 0) + 1
            model_summary = ", ".join(f"{name} ({count})" for name, count in model_counts.items())

            events.append(SessionEvent(
                type="verdict",
                data={
                    "verdict_text": verdict_text,
                    "confidence": confidence,
                    "total_cost_usd": round(total_usage.cost, 6),
                    "total_tokens": total_usage.total_tokens,
                    "model_summary": model_summary,
                    "councillor_count": len(all_responses),
                    "verdict_cost_usd": round(verdict_usage.cost, 6),
                    "verdict_tokens": verdict_usage.total_tokens,
                },
            ))
        except Exception as e:
            events.append(SessionEvent(
                type="error",
                data={"message": f"Verdict generation failed: {str(e)[:200]}"},
            ))

        events.append(SessionEvent(
            type="complete",
            data={
                "total_cost_usd": round(total_usage.cost, 6),
                "total_tokens": total_usage.total_tokens,
            },
        ))

        return events

    @staticmethod
    def get_engine_version() -> str:
        version_file = os.path.join(os.path.dirname(__file__), "VERSION")
        try:
            with open(version_file) as f:
                return f.read().strip()
        except Exception:
            return "unknown"
