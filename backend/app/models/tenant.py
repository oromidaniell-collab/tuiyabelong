# This file defines the Tenant model for the Rental Management System. It includes fields for tenant information, relationships to other models, and an enumeration for tenant status. The Tenant model is used to store and manage tenant data in the database.
from sqlalchemy import Column, Integer, String, Date, Boolean, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from app.models.base import BaseModel
import enum
# Tenant status enumeration
# This enum defines the possible statuses for a tenant, such as active, inactive, or evicted. It helps to standardize the status values and makes it easier to manage tenant states in the application.

class TenantStatus(str, enum.Enum):
    ACTIVE = 'active'
    INACTIVE = 'inactive'
    EVICTED = 'evicted'

# The Tenant model represents a tenant in the rental management system. It includes fields for personal information, contact details, employment information, and relationships to other models such as User, Unit, Lease, Payment, MaintenanceRequest, and Document. The model also includes a status field to track the tenant's current state in the system.
class Tenant(BaseModel):
    __tablename__ = 'tenants'
    
    user_id = Column(Integer, ForeignKey('users.id'), unique=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(20))
    date_of_birth = Column(Date)
    emergency_contact_name = Column(String(200))
    emergency_contact_phone = Column(String(20))
    employer = Column(String(200))
    annual_income = Column(Float)
    unit_id = Column(Integer, ForeignKey('units.id'), nullable=True)  # allow tenant without unit at signup
    status = Column(String(50), default='active')
    notes = Column(Text)
    
    # Relationships
    # The relationships defined here allow us to easily access related data for a tenant, such as their user account, the unit they are renting, their leases, payments, maintenance requests, and any documents associated with them. This makes it easier to manage tenant information and perform operations that involve related data.
    user = relationship("User", back_populates="tenants")
    unit = relationship("Unit", back_populates="tenants")
    leases = relationship("Lease", back_populates="tenant")
    payments = relationship("Payment", back_populates="tenant")
    maintenance_requests = relationship("MaintenanceRequest", back_populates="tenant")
    documents = relationship("Document", back_populates="tenant", cascade="all, delete-orphan")