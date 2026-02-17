
import logging
from ddgs import DDGS

logger = logging.getLogger("agora.engine.search")

def search_web(query: str, max_results: int = 3) -> str:
    """
    Search the web using DuckDuckGo (Free) and return formatted markdown results.
    """
    formatted = []
    
    # 1. News Search (Current Events)
    try:
        news_results = list(DDGS().news(query, max_results=3))
        if news_results:
            formatted.append("### NEWS RESULTS ###")
            for i, r in enumerate(news_results, 1):
                title = r.get("title", "Untitled")
                href = r.get("href", "#")
                body = r.get("body", "")
                date = r.get("date", "")
                formatted.append(f"{i}. **[{title}]({href})** ({date})\n   {body}")
            formatted.append("") # Spacer
    except Exception as e:
        logger.warning(f"News search failed: {e}")

    # 2. Text Search (General Knowledge)
    try:
        text_results = list(DDGS().text(query, max_results=3))
        if text_results:
            formatted.append("### WEB RESULTS ###")
            for i, r in enumerate(text_results, 1):
                title = r.get("title", "Untitled")
                href = r.get("href", "#")
                body = r.get("body", "")
                formatted.append(f"{i}. **[{title}]({href})**\n   {body}")
    except Exception as e:
        logger.warning(f"Text search failed: {e}")
        
    if not formatted:
        return "No search results found."

    return "\n\n".join(formatted)


