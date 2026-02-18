
import sqlite3
import os

DB_PATH = "data/agora.db"

def check_schema():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print("\n--- COUNCILS Table Schema ---")
    cursor.execute("PRAGMA table_info(councils)")
    columns = cursor.fetchall()
    for col in columns:
        print(col)

    print("\n--- Rows ---")
    cursor.execute("SELECT * FROM councils")
    rows = cursor.fetchall()
    for row in rows:
        print(row)
        print(f"Row length: {len(row)}")

    conn.close()

if __name__ == "__main__":
    check_schema()
