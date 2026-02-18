
import os
import sys
import logging
from dotenv import load_dotenv

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine.interface import AgoraEngine

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agora.test")

def test_pre_check():
    load_dotenv()
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        print("Skipping test: No API key found.")
        return

    engine = AgoraEngine()
    
    councillors = [
        {
            "id": "test_c1",
            "name": "The Skeptic",
            "role_description": "You are a skeptic.",
            "expertise_area": "Critical Thinking",
            "perspective": "critical",
            "model_override": None
        }
    ]

    print("\n--- TEST 1: Vague Statement (Should Trigger Pre-Check) ---")
    vague_statement = "I have a business idea."
    events = engine.run_deliberation(
        statement=vague_statement,
        councillors=councillors,
        council_name="Test Council",
        bypass_pre_check=False
    )
    
    triggered = False
    for e in events:
        if e.type == "pre_check":
            print(f"✅ Pre-check triggered!")
            print(f"Questions: {e.data['questions']}")
            triggered = True
            break
    
    if not triggered:
        print("❌ Pre-check FAILED to trigger.")

    print("\n--- TEST 2: Specific Statement (Should Proceed) ---")
    specific_statement = "I want to start a dog walking business in London with a budget of £5000. Target market is busy professionals."
    events = engine.run_deliberation(
        statement=specific_statement,
        councillors=councillors,
        council_name="Test Council",
        bypass_pre_check=False
    )
    
    proceeded = False
    for e in events:
        if e.type == "councillor_start":
            print(f"✅ Deliberation started (Pre-check passed).")
            proceeded = True
            break
        if e.type == "pre_check":
            print(f"❌ Pre-check triggered unexpectedly.")
            
    if not proceeded:
         print("❌ Deliberation did not start.")

    print("\n--- TEST 3: Vague Statement + Bypass (Should Proceed) ---")
    events = engine.run_deliberation(
        statement=vague_statement,
        councillors=councillors,
        council_name="Test Council",
        bypass_pre_check=True
    )
    
    bypassed = False
    for e in events:
        if e.type == "councillor_start":
            print(f"✅ Deliberation started (Pre-check bypassed).")
            bypassed = True
            break
            
    if not bypassed:
        print("❌ Bypass FAILED.")

if __name__ == "__main__":
    test_pre_check()
