"""
Migration v4: model tiers (Fast / Balanced / Powerful).

Adds:
- settings.default_model_fast
- settings.default_model_powerful
  (existing settings.default_model becomes the "Balanced" tier — no rename)
- councils.coordinator_model_tier
- councillors.model_tier

Per-row populates the new settings columns from the existing default_model
so behaviour is preserved on first run.
"""

import sqlite3
import os

DB_PATH = "data/agora.db"


def _columns(cursor, table: str) -> set[str]:
    cursor.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cursor.fetchall()}


def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}. Nothing to migrate.")
        return

    print(f"Migrating database at {DB_PATH} to v4 (model tiers)...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # ── settings ──────────────────────────────────────────────────────
        settings_cols = _columns(cursor, "settings")

        if "default_model_fast" not in settings_cols:
            cursor.execute("ALTER TABLE settings ADD COLUMN default_model_fast TEXT")
            print("Added settings.default_model_fast")
        else:
            print("settings.default_model_fast already exists. Skipping.")

        if "default_model_powerful" not in settings_cols:
            cursor.execute("ALTER TABLE settings ADD COLUMN default_model_powerful TEXT")
            print("Added settings.default_model_powerful")
        else:
            print("settings.default_model_powerful already exists. Skipping.")

        # Backfill: copy existing default_model into the two new tier columns
        # so the user keeps working immediately. They can change Fast/Powerful
        # later in Settings.
        cursor.execute(
            "UPDATE settings SET default_model_fast = COALESCE(default_model_fast, default_model) "
            "WHERE default_model IS NOT NULL"
        )
        cursor.execute(
            "UPDATE settings SET default_model_powerful = COALESCE(default_model_powerful, default_model) "
            "WHERE default_model IS NOT NULL"
        )

        # ── councils ──────────────────────────────────────────────────────
        council_cols = _columns(cursor, "councils")
        if "coordinator_model_tier" not in council_cols:
            cursor.execute("ALTER TABLE councils ADD COLUMN coordinator_model_tier TEXT")
            print("Added councils.coordinator_model_tier")
        else:
            print("councils.coordinator_model_tier already exists. Skipping.")

        # ── councillors ───────────────────────────────────────────────────
        councillor_cols = _columns(cursor, "councillors")
        if "model_tier" not in councillor_cols:
            cursor.execute("ALTER TABLE councillors ADD COLUMN model_tier TEXT")
            print("Added councillors.model_tier")
        else:
            print("councillors.model_tier already exists. Skipping.")

        conn.commit()
        print("Migration v4 successful.")
    except sqlite3.OperationalError as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
