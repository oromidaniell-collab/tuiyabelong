# backend/app/models/cache.py
from sqlalchemy import Column, String, Text, DateTime
from datetime import datetime, timedelta
from .base import BaseModel

class CacheItem(BaseModel):
    __tablename__ = 'cache_items'
    
    key = Column(String(255), primary_key=True, index=True)
    value = Column(Text)
    expires_at = Column(DateTime)

    def is_expired(self):
        return datetime.utcnow() > self.expires_at
