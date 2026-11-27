import logging

from engine.llm import get_sidecar

logger = logging.getLogger("agora.engine.search")


def search_web(query: str, max_results: int = 3) -> str:
    """
    Search the web through llm-sidecar and return formatted markdown results.

    Free and keyless: DuckDuckGo by default, upgraded to a local SearXNG
    automatically when llm-sidecar has one available. Results are cached by
    the sidecar for an hour.
    """
    sc = get_sidecar()
    formatted = []

    # 1. News Search (Current Events)
    try:
        news = sc.search(query, max_results=max_results, news=True)
        if news:
            formatted.append("### NEWS RESULTS ###")
            for i, r in enumerate(news, 1):
                date = f" ({r.published})" if r.published else ""
                formatted.append(f"{i}. **[{r.title or 'Untitled'}]({r.url or '#'})**{date}\n   {r.snippet}")
            formatted.append("")  # Spacer
    except Exception as e:
        logger.warning(f"News search failed: {e}")

    # 2. Text Search (General Knowledge)
    try:
        web = sc.search(query, max_results=max_results)
        if web:
            formatted.append("### WEB RESULTS ###")
            for i, r in enumerate(web, 1):
                formatted.append(f"{i}. **[{r.title or 'Untitled'}]({r.url or '#'})**\n   {r.snippet}")
    except Exception as e:
        logger.warning(f"Text search failed: {e}")

    if not formatted:
        return "No search results found."

    return "\n\n".join(formatted)
