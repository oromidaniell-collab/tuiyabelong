# backend/app/models/interaction.py
from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import BaseModel

class Feedback(BaseModel):
    __tablename__ = 'feedbacks'
    
    tenant_id = Column(Integer, ForeignKey('tenants.id'))
    subject = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(50), default='open') # open, in_progress, resolved
    
    tenant = relationship("Tenant")

class Review(BaseModel):
    __tablename__ = 'reviews'
    
    tenant_id = Column(Integer, ForeignKey('tenants.id'))
    property_id = Column(Integer, ForeignKey('properties.id'))
    rating = Column(Float, nullable=False)
    comment = Column(Text)
    
    tenant = relationship("Tenant")
    property = relationship("Property")
