import sqlite3
import os

DB_PATH = "data/agora.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}. Nothing to migrate.")
        return

    print(f"Migrating database at {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if column exists first (optional, but safer)
        cursor.execute("PRAGMA table_info(councils)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if "web_search_provider" not in columns:
            cursor.execute("ALTER TABLE councils ADD COLUMN web_search_provider TEXT DEFAULT 'openrouter'")
            print("Successfully added 'web_search_provider' column to 'councils' table.")
        else:
            print("Column 'web_search_provider' already exists. Skipping.")
            
    except sqlite3.OperationalError as e:
        print(f"Error executing migration: {e}")
            
    conn.commit()
    conn.close()

if __name__ == "__main__":
    migrate()
