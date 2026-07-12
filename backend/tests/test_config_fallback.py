import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings


def test_settings_fall_back_to_local_sqlite_and_dev_secret(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("SECRET_KEY", raising=False)

    settings = Settings()

    assert settings.SECRET_KEY.startswith("dev-")
    assert settings.ASYNC_DATABASE_URL.startswith("sqlite+aiosqlite")
