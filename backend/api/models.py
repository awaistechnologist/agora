"""
Models API — /api/models (OpenRouter proxy)
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.openrouter import ModelListResponse
from backend.services import settings_service, model_service

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("", response_model=ModelListResponse)
def list_models(db: Session = Depends(get_db)):
    """List tool-capable models with pricing (cached)."""
    api_key = settings_service.get_api_key(db)
    if not api_key:
        return ModelListResponse(models=[], total=0)
    return model_service.get_models(db, api_key)


@router.get("/refresh", response_model=ModelListResponse)
def refresh_models(db: Session = Depends(get_db)):
    """Force-refresh model list from OpenRouter."""
    api_key = settings_service.get_api_key(db)
    if not api_key:
        return ModelListResponse(models=[], total=0)
    return model_service.get_models(db, api_key, force_refresh=True)

@router.get("/test-free")
async def test_free_models(db: Session = Depends(get_db)):
    """Test all free models on OpenRouter to see which ones work."""
    from fastapi.responses import StreamingResponse
    import httpx
    import json
    
    api_key = settings_service.get_api_key(db)
    
    async def event_stream():
        if not api_key:
            yield f"data: {json.dumps({'error': 'No API key set'})}\n\n"
            return
            
        yield f"data: {json.dumps({'status': 'fetching'})}\n\n"
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get("https://openrouter.ai/api/v1/models")
                models_data = resp.json().get("data", [])
        except Exception as e:
            yield f"data: {json.dumps({'error': f'Failed to fetch models: {str(e)}'})}\n\n"
            return
            
        free_models = []
        for m in models_data:
            pricing = m.get("pricing", {})
            try:
                if float(pricing.get("prompt", -1)) == 0.0 and float(pricing.get("completion", -1)) == 0.0:
                    free_models.append(m["id"])
            except:
                pass
                
        yield f"data: {json.dumps({'status': 'testing', 'total': len(free_models)})}\n\n"
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/awaistechnologist/agora",
            "X-Title": "Agora Testing"
        }
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            for m in free_models:
                payload = {
                    "model": m,
                    "messages": [{"role": "user", "content": "Reply with 'OK' and nothing else."}],
                    "max_tokens": 10
                }
                try:
                    res = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload)
                    if res.status_code == 200 and "choices" in res.json():
                        yield f"data: {json.dumps({'model': m, 'result': 'success'})}\n\n"
                    else:
                        yield f"data: {json.dumps({'model': m, 'result': 'failed'})}\n\n"
                except Exception:
                    yield f"data: {json.dumps({'model': m, 'result': 'failed'})}\n\n"
                    
        yield f"data: {json.dumps({'status': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
