import asyncio
import importlib
import sys
from pathlib import Path

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings


def test_settings_fall_back_to_local_sqlite_and_dev_secret(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("SECRET_KEY", raising=False)

    settings = Settings()

    assert settings.SECRET_KEY.startswith("dev-")
    assert settings.ASYNC_DATABASE_URL.startswith("sqlite+aiosqlite")


def test_settings_ignore_legacy_env_placeholders(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "your jwt secret")
    monkeypatch.setenv("JWT_EXPIRES_IN", "30minutes")
    monkeypatch.setenv("PORT", "your server port (e.g. 3000)")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("SECRET_KEY", raising=False)

    settings = Settings()

    assert settings.SECRET_KEY.startswith("dev-")
    assert settings.ASYNC_DATABASE_URL.startswith("sqlite+aiosqlite")


def test_sqlite_fallback_session_factory_and_init_db(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("SECRET_KEY", raising=False)

    sys.modules.pop("app.core.database", None)
    sys.modules.pop("app.config", None)

    import app.core.database as database_module
    database_module = importlib.reload(database_module)

    async def _run():
        async with database_module.AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        await database_module.init_db()

    asyncio.run(_run())
