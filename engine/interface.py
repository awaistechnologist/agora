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

    def _call_llm(self, model: str, system_prompt: str, user_message: str) -> tuple[str, UsageData]:
        """Make a synchronous LLM call to OpenRouter."""
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.7,
            "max_tokens": 1000,
        }

        try:
            resp = httpx.post(
                OPENROUTER_CHAT_URL,
                json=payload,
                headers=self._get_headers(),
                timeout=60.0,
            )
            resp.raise_for_status()
            data = resp.json()

            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            usage_raw = data.get("usage", {})
            usage = UsageData(
                prompt_tokens=usage_raw.get("prompt_tokens", 0),
                completion_tokens=usage_raw.get("completion_tokens", 0),
                total_tokens=usage_raw.get("total_tokens", 0),
                cost=usage_raw.get("cost", 0.0) if usage_raw.get("cost") else 0.0,
            )
            return content, usage

        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            raise

    def _infer_stance(self, perspective: str, response_text: str) -> str:
        """Simple stance inference based on councillor perspective."""
        if perspective == "supportive":
            return "supportive"
        elif perspective in ("critical", "contrarian"):
            return "critical"
        return "mixed"

    def run_deliberation(
        self,
        statement: str,
        councillors: list[dict],
        council_name: str,
        default_model: str = "openai/gpt-4o",
        coordinator_instructions: str = "",
        web_search_enabled: bool = False,
        web_search_provider: str = "openrouter",
    ):
        """
        Run a full deliberation synchronously, yielding events.
        Returns a generator of SessionEvent objects.
        """
        events = []
        all_responses = []
        total_usage = UsageData()
        
        current_date = datetime.now().strftime("%Y-%m-%d")

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

            model = c.get("model_override") or default_model
            
            # Apply :online suffix if provider is 'openrouter'
            if web_search_enabled and use_online_model_suffix:
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
            coordinator_model = default_model
            
            # Apply :online suffix if provider is 'openrouter'
            if web_search_enabled and use_online_model_suffix:
                if not coordinator_model.endswith(":online") and not coordinator_model.endswith(":free"):
                    coordinator_model = coordinator_model + ":online"

            # Inject search context if present
            final_coordinator_instructions = coordinator_instructions
            if search_context:
                final_coordinator_instructions = coordinator_instructions + "\n\n" + search_context

            verdict_text, verdict_usage = self._call_llm(
                coordinator_model, final_coordinator_instructions, synthesis_message
            )

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
