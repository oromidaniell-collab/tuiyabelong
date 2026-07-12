# backend/app/config.py
import os
from pathlib import Path

from pydantic_settings import BaseSettings
from pydantic import ValidationError, Field
from typing import Optional, List
import logging
import sys


def _env_or_default(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    PROJECT_NAME: str = "Rental Management System"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # Server configuration with port-based separation
    TENANT_PORT: int = int(os.getenv("TENANT_PORT", "8000"))
    LANDLORD_PORT: int = int(os.getenv("LANDLORD_PORT", "8001"))
    ADMIN_PORT: int = int(os.getenv("ADMIN_PORT", "8002"))
    DEPLOYMENT_ENV: str = os.getenv("DEPLOYMENT_ENV", "development")

    BACKEND_CORS_ORIGINS: List[str] = [
        "https://tuiyabelong.vercel.app",
        "https://tuiyabelong.com",
        "https://www.tuiyabelong.com",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://localhost:8001",
        "http://localhost:8002",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:8001",
        "http://127.0.0.1:8002"
    ]

    # Database
    DATABASE_URL: Optional[str] = Field(default_factory=lambda: _env_or_default("DATABASE_URL"))

    @property
    def ASYNC_DATABASE_URL(self) -> Optional[str]:
        if not self.DATABASE_URL:
            project_root = Path(__file__).resolve().parents[2]
            db_path = project_root / "rms_dev.sqlite3"
            return f"sqlite+aiosqlite:///{db_path.as_posix()}"

        url = self.DATABASE_URL.strip()
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("sqlite://"):
            return url.replace("sqlite://", "sqlite+aiosqlite://", 1)

        params = [
            "prepared_statement_cache_size=0",
            "statement_cache_size=0"
        ]

        for param in params:
            if param.split('=')[0] not in url:
                separator = "&" if "?" in url else "?"
                url = f"{url}{separator}{param}"

        return url

    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 40

    # JWT (REQUIRED)
    SECRET_KEY: str = Field(default_factory=lambda: _env_or_default("SECRET_KEY", "dev-secret-key-change-me"))
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Portal Login Credentials (Admin & Landlord portals)
    ADMIN_PORTAL_ACCESS_KEY: str = os.getenv("ADMIN_PORTAL_ACCESS_KEY", "2026")
    ADMIN_PORTAL_PASSWORD: str = os.getenv("ADMIN_PORTAL_PASSWORD", "admin@2026")
    LANDLORD_PORTAL_ACCESS_KEY: str = os.getenv("LANDLORD_PORTAL_ACCESS_KEY", "2026")
    LANDLORD_PORTAL_PASSWORD: str = os.getenv("LANDLORD_PORTAL_PASSWORD", "landlord@2026")

    # Email (Mapped to .env)
    SMTP_PORT: Optional[int] = os.getenv("SMTP_PORT")
    SMTP_SERVER: Optional[str] = os.getenv("SMTP_SERVER")
    SMTP_USER: Optional[str] = os.getenv("SMTP_USER")
    SMTP_PASSWORD: Optional[str] = os.getenv("SMTP_PASSWORD")
    MAIL_FROM: Optional[str] = os.getenv("MAIL_FROM")
    MAIL_FROM_NAME: Optional[str] = os.getenv("MAIL_FROM_NAME")

    # MPESA
    MPESA_SHORTCODE: Optional[str] = os.getenv("MPESA_SHORTCODE")
    MPESA_PASSKEY: Optional[str] = os.getenv("MPESA_PASSKEY")
    MPESA_CONSUMER_KEY: Optional[str] = os.getenv("MPESA_CONSUMER_KEY")
    MPESA_CONSUMER_SECRET: Optional[str] = os.getenv("MPESA_CONSUMER_SECRET")
    MPESA_CALLBACK_URL: Optional[str] = os.getenv("MPESA_CALLBACK_URL")
    MPESA_ENVIRONMENT: str = os.getenv("MPESA_ENVIRONMENT", "sandbox")

    # DeepSeek AI
    DEEPSEEK_API_KEY: Optional[str] = os.getenv("DEEPSEEK_API_KEY")

    class Config:
        env_file = None
        extra = "ignore"
        case_sensitive = False

    def __init__(self, **data):
        super().__init__(**data)
        self._validate_required_settings()

    def _validate_required_settings(self):
        """Log configuration issues without blocking local development startup."""
        warnings = []

        if not self.SECRET_KEY or self.SECRET_KEY in ("your secret key for encryption", ""):
            warnings.append("SECRET_KEY not configured; using development fallback")

        if not self.DATABASE_URL:
            warnings.append("DATABASE_URL not configured; using local SQLite fallback")

        if warnings:
            logger.warning("Configuration warnings:")
            for warning in warnings:
                logger.warning(f"  - {warning}")


try:
    settings = Settings()
except ValidationError as e:
    logger.error("Failed to load settings:", exc_info=True)
    sys.exit(1)
