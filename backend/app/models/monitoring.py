# backend/app/models/monitoring.py
from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from datetime import datetime
from .base import BaseModel

class SystemMetric(BaseModel):
    __tablename__ = 'system_metrics'
    
    metric_name = Column(String(100), index=True)
    value = Column(Float)
    details = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)

class LogEntry(BaseModel):
    __tablename__ = 'log_entries'
    
    level = Column(String(20)) # INFO, ERROR, WARN
    module = Column(String(100))
    message = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)
