"""
Agora — Database setup and schema.
Uses SQLAlchemy with aiosqlite for async SQLite access.
"""

import os
from sqlalchemy import (
    Column, Integer, Text, Boolean, Float, create_engine,
    ForeignKey, event
)
from sqlalchemy.orm import sessionmaker, declarative_base, relationship
from sqlalchemy.pool import StaticPool

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.getenv("AGORA_DB_PATH", "data/agora.db")
DB_FULL_PATH = os.path.join(BASE_DIR, DB_PATH)

os.makedirs(os.path.dirname(DB_FULL_PATH), exist_ok=True)

DATABASE_URL = f"sqlite:///{DB_FULL_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    echo=False,
)


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ─── ORM Models ───────────────────────────────────────────────────────────

class SettingsRow(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, default=1)
    openrouter_key_encrypted = Column(Text, nullable=True)
    default_model = Column(Text, default="openai/gpt-4o")
    created_at = Column(Text, server_default="CURRENT_TIMESTAMP")
    updated_at = Column(Text, server_default="CURRENT_TIMESTAMP")


class CouncilRow(Base):
    __tablename__ = "councils"
    id = Column(Text, primary_key=True)
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=False)
    icon = Column(Text, default="users")
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    source_council_id = Column(Text, nullable=True)
    hocon_file_path = Column(Text, nullable=True)
    coordinator_instructions = Column(Text, nullable=True)
    web_search_enabled = Column(Boolean, default=False)
    created_at = Column(Text, default=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
    updated_at = Column(Text, server_default="CURRENT_TIMESTAMP")
    councillors = relationship("CouncillorRow", back_populates="council", cascade="all, delete-orphan")


class CouncillorRow(Base):
    __tablename__ = "councillors"
    id = Column(Text, primary_key=True)
    council_id = Column(Text, ForeignKey("councils.id"), nullable=False)
    name = Column(Text, nullable=False)
    role_description = Column(Text, nullable=False)
    expertise_area = Column(Text, nullable=True)
    perspective = Column(Text, default="neutral")
    instructions = Column(Text, nullable=True)
    model_override = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(Text, default=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
    council = relationship("CouncilRow", back_populates="councillors")


class SessionRow(Base):
    __tablename__ = "sessions"
    id = Column(Text, primary_key=True)
    council_id = Column(Text, ForeignKey("councils.id"), nullable=False)
    statement = Column(Text, nullable=False)
    verdict = Column(Text, nullable=True)
    confidence = Column(Text, nullable=True)
    status = Column(Text, default="pending")
    total_cost_usd = Column(Float, default=0.0)
    total_tokens = Column(Integer, default=0)
    duration_seconds = Column(Float, nullable=True)
    model_summary = Column(Text, nullable=True)
    created_at = Column(Text, default=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
    completed_at = Column(Text, nullable=True)
    council = relationship("CouncilRow")
    responses = relationship("ResponseRow", back_populates="session", cascade="all, delete-orphan")


class ResponseRow(Base):
    __tablename__ = "responses"
    id = Column(Text, primary_key=True)
    session_id = Column(Text, ForeignKey("sessions.id"), nullable=False)
    councillor_id = Column(Text, ForeignKey("councillors.id"), nullable=False)
    response_text = Column(Text, nullable=True)
    stance = Column(Text, nullable=True)
    model_used = Column(Text, nullable=True)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)
    sort_order = Column(Integer, default=0)
    created_at = Column(Text, default=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
    session = relationship("SessionRow", back_populates="responses")
    councillor = relationship("CouncillorRow")


class CachedModelRow(Base):
    __tablename__ = "cached_models"
    id = Column(Text, primary_key=True)
    name = Column(Text, nullable=True)
    provider = Column(Text, nullable=True)
    context_length = Column(Integer, nullable=True)
    pricing_prompt = Column(Text, nullable=True)
    pricing_completion = Column(Text, nullable=True)
    pricing_image = Column(Text, nullable=True)
    pricing_request = Column(Text, nullable=True)
    supports_tools = Column(Boolean, default=True)
    last_fetched = Column(Text, server_default="CURRENT_TIMESTAMP")


# ─── Init ──────────────────────────────────────────────────────────────────

def init_db():
    """Create all tables if they don't exist."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Dependency for FastAPI endpoints."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
