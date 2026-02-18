
import sqlite3
import os

DB_PATH = "data/agora.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        print("Migrating database to v3 (Configurable Pre-Check)...")
        # Add pre_check_enabled column to councils table
        # Default is 1 (True) to maintain existing behavior for current councils
        cursor.execute("ALTER TABLE councils ADD COLUMN pre_check_enabled BOOLEAN DEFAULT 1")
        print("Added 'pre_check_enabled' column to 'councils' table.")
        conn.commit()
        print("Migration successful.")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            print("Migration already applied (column exists).")
        else:
            print(f"Migration failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
