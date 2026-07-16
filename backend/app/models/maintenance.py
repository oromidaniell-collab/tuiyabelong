# backend/app/models/maintenance.py
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.models.base import BaseModel

class MaintenanceRequest(BaseModel):
    __tablename__ = 'maintenance_requests'
    
    tenant_id = Column(Integer, ForeignKey('tenants.id'))
    property_id = Column(Integer, ForeignKey('properties.id'))
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(50), default='pending')  # pending, in_progress, completed, cancelled
    priority = Column(String(50), default='medium')  # low, medium, high, emergency
    
    # Relationships
    tenant = relationship("Tenant", back_populates="maintenance_requests")
    property = relationship("Property", back_populates="maintenance_requests")
