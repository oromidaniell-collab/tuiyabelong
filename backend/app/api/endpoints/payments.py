from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from typing import List, Optional
from app.core.database import get_db
from app.models.users import User
from app.models.payment import Payment
from app.models.tenant import Tenant
from app.models.unit import Unit
from app.api.endpoints.auth import get_current_user
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class PaymentResponse(BaseModel):
    id: int
    amount: float
    payment_date: datetime
    payment_method: Optional[str]
    status: str
    receipt_url: Optional[str]
    tenant_name: Optional[str] = None
    property_name: Optional[str] = None

class MpesaVerification(BaseModel):
    transaction_code: str

@router.get("/my", response_model=List[PaymentResponse])
async def get_my_payments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 50
):
    result = await db.execute(
        select(Payment)
        .where(Payment.user_id == current_user.id)
        .order_by(desc(Payment.payment_date))
        .limit(limit)
    )
    payments = result.scalars().all()

    return [{
        "id": p.id,
        "amount": p.amount,
        "payment_date": p.payment_date,
        "payment_method": p.payment_method,
        "status": p.status,
        "receipt_url": p.receipt_url
    } for p in payments]

@router.get("/all", response_model=List[PaymentResponse])
async def get_all_payments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 100
):
    result = await db.execute(
        select(Payment, User)
        .outerjoin(User, Payment.user_id == User.id)
        .order_by(desc(Payment.payment_date))
        .limit(limit)
    )
    results = result.all()

    return [{
        "id": p.id,
        "amount": p.amount,
        "payment_date": p.payment_date,
        "payment_method": p.payment_method,
        "status": p.status,
        "receipt_url": p.receipt_url,
        "tenant_name": f"{user.first_name} {user.last_name}" if user else "System/Unknown"
    } for p, user in results]

@router.get("/recent", response_model=List[PaymentResponse])
async def get_recent_payments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 10
):
    result = await db.execute(
        select(Payment)
        .outerjoin(Tenant, Payment.tenant_id == Tenant.id)
        .outerjoin(Unit, Tenant.unit_id == Unit.id)
        .order_by(desc(Payment.payment_date))
        .limit(limit)
    )
    rows = result.all()

    return [{
        "id": p.id,
        "amount": p.amount,
        "payment_date": p.payment_date,
        "payment_method": p.payment_method,
        "status": p.status,
        "receipt_url": p.receipt_url,
        "property_name": "N/A"
    } for p in rows]

@router.post("/verify-mpesa")
async def verify_mpesa_payment(
    verification: MpesaVerification,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Tenant)
        .options(selectinload(Tenant.unit))
        .where(Tenant.user_id == current_user.id)
    )
    tenant = result.scalars().first()

    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant record not found")

    result = await db.execute(
        select(Payment).where(Payment.transaction_id == verification.transaction_code)
    )
    existing = result.scalar_one_or_none()

    if existing:
        return {"message": "Payment already verified", "status": existing.status}

    monthly_rent = 0.0
    if tenant.unit:
        monthly_rent = tenant.unit.monthly_rent or 0.0

    payment = Payment(
        tenant_id=tenant.id,
        user_id=current_user.id,
        amount=monthly_rent,
        payment_date=datetime.utcnow(),
        due_date=datetime.utcnow(),
        payment_method="M-Pesa",
        transaction_id=verification.transaction_code,
        status='pending'
    )

    db.add(payment)
    await db.commit()

    return {"message": "Payment recorded, awaiting verification", "status": "pending"}
