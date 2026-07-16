# backend/app/models/utility.py
# Utility charge model for tracking water and wifi billing per unit.
# Water charges have units consumed + amount. Wifi charges have amount only.
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import BaseModel

class UtilityType:
    WATER = 'water'
    WIFI = 'wifi'

class UtilityCharge(BaseModel):
    __tablename__ = 'utility_charges'
    
    # Type: 'water' or 'wifi'
    utility_type = Column(String(20), nullable=False, index=True)
    
    # For water: units consumed (e.g. cubic meters). For wifi: NULL.
    units_consumed = Column(Float, nullable=True)
    
    # The amount charged (KES)
    amount = Column(Float, nullable=False)
    
    # Billing period
    billing_month = Column(String(7), nullable=False)  # e.g. '2026-05'
    
    # Status: pending, paid
    status = Column(String(20), default='pending')
    
    notes = Column(Text, nullable=True)
    
    # Who entered this charge
    created_by_user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
