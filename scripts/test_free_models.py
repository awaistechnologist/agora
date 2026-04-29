import asyncio
import os
import sys
import json
from pathlib import Path

# Add project root to path so we can run this script directly
sys.path.append(str(Path(__file__).parent.parent))

from dotenv import load_dotenv
import httpx

async def main():
    load_dotenv()
    
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        print("Error: OPENROUTER_API_KEY not found in environment.")
        sys.exit(1)
        
    print("Fetching available models from OpenRouter...")
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get("https://openrouter.ai/api/v1/models")
            response.raise_for_status()
            models_data = response.json().get("data", [])
        except Exception as e:
            print(f"Failed to fetch models: {e}")
            sys.exit(1)
            
    # Filter for free models
    free_models = []
    for model in models_data:
        pricing = model.get("pricing", {})
        try:
            prompt_price = float(pricing.get("prompt", -1))
            completion_price = float(pricing.get("completion", -1))
            if prompt_price == 0.0 and completion_price == 0.0:
                free_models.append(model["id"])
        except (ValueError, TypeError):
            continue
            
    print(f"Found {len(free_models)} free models.")
    print("-" * 50)
    
    # Test each free model
    working_models = []
    failed_models = []
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/awaistechnologist/agora", 
        "X-Title": "Agora Testing"
    }
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        for i, model_id in enumerate(free_models, 1):
            print(f"[{i}/{len(free_models)}] Testing {model_id}... ", end="", flush=True)
            
            payload = {
                "model": model_id,
                "messages": [{"role": "user", "content": "Reply with 'OK' and nothing else."}],
                "max_tokens": 10
            }
            
            try:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers=headers,
                    json=payload
                )
                
                if response.status_code == 200:
                    data = response.json()
                    if "choices" in data and len(data["choices"]) > 0:
                        print("✅ Success")
                        working_models.append(model_id)
                    else:
                        print("❌ Failed (Invalid response format)")
                        failed_models.append((model_id, "Invalid response format"))
                else:
                    error_msg = f"HTTP {response.status_code}"
                    try:
                        error_data = response.json()
                        if "error" in error_data and "message" in error_data["error"]:
                            error_msg += f": {error_data['error']['message']}"
                    except:
                        pass
                    print(f"❌ Failed ({error_msg})")
                    failed_models.append((model_id, error_msg))
            except httpx.TimeoutException:
                print("❌ Failed (Timeout)")
                failed_models.append((model_id, "Timeout"))
            except Exception as e:
                print(f"❌ Failed ({type(e).__name__})")
                failed_models.append((model_id, str(e)))
                
    print("\n" + "=" * 50)
    print("TESTING COMPLETE")
    print("=" * 50)
    print(f"Working models: {len(working_models)}")
    print(f"Failed models:  {len(failed_models)}")
    
    print("\n--- Working Models ---")
    for model in working_models:
        print(f"✅ {model}")
        
    print("\n--- Failed Models ---")
    for model, reason in failed_models:
        print(f"❌ {model}: {reason}")

if __name__ == "__main__":
    asyncio.run(main())
