
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal, CouncilRow

def debug_query():
    db = SessionLocal()
    try:
        from backend.database import SessionRow
        
        print("Querying sessions...")
        sessions = db.query(SessionRow).all()
        for s in sessions:
            print(f"Session {s.id}: Council ID {s.council_id}")
            council = db.query(CouncilRow).filter(CouncilRow.id == s.council_id).first()
            print(f"  -> Council: {council.name if council else 'None'}")
            
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    debug_query()
