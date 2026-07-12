# backend/app/core/database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool
from app.config import settings
import logging
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

# Create async engine with optimized connection pooling for serverless
if not settings.ASYNC_DATABASE_URL:
    raise ValueError("DATABASE_URL must be set in Environment Variables")

import os
is_pooler = "pooler.supabase.com" in settings.ASYNC_DATABASE_URL
pool_class = NullPool if (os.getenv("VERCEL") or is_pooler) else None

engine_kwargs = {
    "echo": settings.DB_ECHO,
    "connect_args": {
        "command_timeout": 30,
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "server_settings": {
            "application_name": "RMS_Vercel"
        },
    }
}

if settings.ASYNC_DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
    engine_kwargs["poolclass"] = NullPool
elif pool_class:
    engine_kwargs["poolclass"] = pool_class
else:
    engine_kwargs.update({
        "pool_size": settings.DB_POOL_SIZE,
        "max_overflow": settings.DB_MAX_OVERFLOW,
        "pool_recycle": 3600,
    })

logger.info(f"Creating engine with pool_class: {pool_class.__name__ if pool_class else 'Default'}")

engine = create_async_engine(
    settings.ASYNC_DATABASE_URL,
    **engine_kwargs
)

# Create async session factory
AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Base class for models
Base = declarative_base()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for getting database session
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def init_db():
    """
    Initialize database with default data
    """
    from app.models.users import User
    from app.models.property import Property
    from app.models.tenant import Tenant
    from app.models.lease import Lease
    from app.models.payment import Payment
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    logger.info("Database initialized successfully")