"""
Settings service — API key management, encryption, and configuration.
"""

import os
import logging
from cryptography.fernet import Fernet
from sqlalchemy.orm import Session

from backend.database import SettingsRow

logger = logging.getLogger("agora.settings")

# Derive a machine-stable encryption key from a fixed seed file
_KEY_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", ".agora_key")


def _get_fernet() -> Fernet:
    """Get or create a Fernet key for encrypting the API key at rest."""
    os.makedirs(os.path.dirname(_KEY_FILE), exist_ok=True)
    if os.path.exists(_KEY_FILE):
        with open(_KEY_FILE, "rb") as f:
            key = f.read()
    else:
        key = Fernet.generate_key()
        with open(_KEY_FILE, "wb") as f:
            f.write(key)
    return Fernet(key)


def _ensure_settings(db: Session) -> SettingsRow:
    """Ensure a settings row exists."""
    row = db.query(SettingsRow).filter(SettingsRow.id == 1).first()
    if not row:
        row = SettingsRow(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def get_settings(db: Session) -> dict:
    """Return settings with masked key."""
    row = _ensure_settings(db)
    key_set = bool(row.openrouter_key_encrypted)
    key_preview = ""
    if key_set:
        try:
            decrypted = _get_fernet().decrypt(row.openrouter_key_encrypted.encode()).decode()
            key_preview = f"...{decrypted[-4:]}"
        except Exception:
            key_preview = "...????"
    # Also check env var as fallback (matches get_api_key logic)
    if not key_set:
        env_key = os.getenv("OPENROUTER_API_KEY")
        if env_key:
            key_set = True
            key_preview = f"...{env_key[-4:]}"
    return {
        "openrouter_key_set": key_set,
        "openrouter_key_preview": key_preview,
        "default_model": row.default_model or "openai/gpt-4o",
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def update_settings(db: Session, openrouter_key: str | None = None, default_model: str | None = None) -> dict:
    """Update settings. Encrypts the API key if provided."""
    row = _ensure_settings(db)
    if openrouter_key is not None:
        encrypted = _get_fernet().encrypt(openrouter_key.encode()).decode()
        row.openrouter_key_encrypted = encrypted
        # Also write to .env for the engine module
        _update_env_key(openrouter_key)
    if default_model is not None:
        row.default_model = default_model
    db.commit()
    db.refresh(row)
    return get_settings(db)


def get_api_key(db: Session) -> str | None:
    """Decrypt and return the raw API key, or None."""
    row = _ensure_settings(db)
    if not row.openrouter_key_encrypted:
        # Fall back to .env
        return os.getenv("OPENROUTER_API_KEY") or None
    try:
        return _get_fernet().decrypt(row.openrouter_key_encrypted.encode()).decode()
    except Exception:
        return os.getenv("OPENROUTER_API_KEY") or None


def _update_env_key(key: str):
    """Update the .env file with the new key (for engine module)."""
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
    lines = []
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            lines = f.readlines()

    found = False
    for i, line in enumerate(lines):
        if line.startswith("OPENROUTER_API_KEY="):
            lines[i] = f"OPENROUTER_API_KEY={key}\n"
            found = True
            break
    if not found:
        lines.append(f"OPENROUTER_API_KEY={key}\n")

    with open(env_path, "w") as f:
        f.writelines(lines)
