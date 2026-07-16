# backend/app/models/payment.py
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import BaseModel

# enums for payment status and methods could be added here for better data integrity and easier querying in the future. For now, we will use string fields for simplicity.
class PaymentStatus(str):
    PENDING = 'pending'
    PAID = 'paid'
    OVERDUE = 'overdue'
    FAILED = 'failed'

class PaymentMethod(str):
    BANK_TRANSFER = 'bank_transfer'
    CASH = 'cash'
    CHECK = 'check'
    CARD = 'card'
    MPESA = 'mpesa'
    QR_CODE_SCAN = 'qrcode_scan'# since  my till does not support daraja api integration, we will use mpesa code for payment verification instead of transaction id from daraja. This allows us to verify payments using the unique mpesa code generated for each transaction, ensuring accurate tracking and reconciliation of payments in our system.


class Payment(BaseModel):
    __tablename__ = 'payments'
    
    tenant_id = Column(Integer, ForeignKey('tenants.id'))
    lease_id = Column(Integer, ForeignKey('leases.id'))
    amount = Column(Float, nullable=False)
    payment_date = Column(DateTime, default=datetime.utcnow)
    due_date = Column(DateTime, nullable=False)
    payment_method = Column(String(50))  # bank_transfer, cash, check, card, mpesa, qrcode scan.
    status = Column(String(20), default='pending')  # pending, paid, overdue, failed
    transaction_id = Column(String(100), unique=True)
    mpesa_code = Column(String(20), unique=True, index=True)
    receipt_url = Column(String(500))
    notes = Column(String(500))
    user_id = Column(Integer, ForeignKey('users.id'))
    
    # Relationships
    tenant = relationship("Tenant", back_populates="payments")
    lease = relationship("Lease", back_populates="payments")
    user = relationship("User", back_populates="payments")