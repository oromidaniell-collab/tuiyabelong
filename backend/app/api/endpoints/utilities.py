# backend/app/api/endpoints/utilities.py
# API endpoints for water and wifi utility charge management.
# The landlord/admin enters charges manually: water has units + amount, wifi has amount only.
# Also provides invoice/statement generation for tenants.
from fastapi import APIRouter, Depends, status, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, desc, and_
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.models.users import User
from app.models.utility import UtilityCharge
from app.api.endpoints.dependencies import get_current_owner


router = APIRouter()

# ── Pydantic Schemas ─────────────────────────────────────────

class UtilityChargeCreate(BaseModel):
    utility_type: str  # 'water' or 'wifi'
    units_consumed: Optional[float] = None  # Only for water
    amount: float = Field(gt=0)
    billing_month: str  # e.g. '2026-05'
    notes: Optional[str] = None

class UtilityChargeUpdate(BaseModel):
    units_consumed: Optional[float] = None
    amount: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class UtilityChargeResponse(BaseModel):
    id: int
    utility_type: str
    units_consumed: Optional[float] = None
    amount: float
    billing_month: str
    status: str
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class UtilityStatementResponse(BaseModel):
    tenant_name: str
    tenant_email: Optional[str] = None
    tenant_phone: Optional[str] = None
    property_name: str
    unit_number: str
    billing_month: str
    charges: List[dict]
    total_amount: float
    generated_at: datetime

class UtilityProfitSummary(BaseModel):
    total_rent_income: float
    total_water_expense: float
    total_wifi_expense: float
    total_utility_expense: float
    net_profit: float
    total_water_units: float
    charge_count: int
    paid_count: int
    pending_count: int
    billing_month: Optional[str] = None
    currency: str = "KES"

# ── CRUD Endpoints ───────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_utility_charge(
    charge_in: UtilityChargeCreate,
    current_user: User = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    """Create a new global utility expense (water or wifi)."""
    if charge_in.utility_type not in ('water', 'wifi'):
        raise HTTPException(status_code=400, detail="utility_type must be 'water' or 'wifi'")
    
    if charge_in.utility_type == 'water' and charge_in.units_consumed is None:
        raise HTTPException(status_code=400, detail="Water charges require units_consumed")
    
    new_charge = UtilityCharge(
        utility_type=charge_in.utility_type,
        units_consumed=charge_in.units_consumed if charge_in.utility_type == 'water' else None,
        amount=charge_in.amount,
        billing_month=charge_in.billing_month,
        notes=charge_in.notes,
        created_by_user_id=current_user.id if current_user.id not in (998, 999) else None,
        status='pending'
    )
    db.add(new_charge)
    await db.commit()
    await db.refresh(new_charge)
    
    return {
        "success": True,
        "message": f"{charge_in.utility_type.capitalize()} expense of Ksh {charge_in.amount:,.2f} added successfully",
        "charge_id": new_charge.id
    }


@router.get("/", response_model=List[UtilityChargeResponse])
async def list_utility_charges(
    utility_type: Optional[str] = Query(None, description="Filter by 'water' or 'wifi'"),
    billing_month: Optional[str] = Query(None, description="Filter by billing month e.g. '2026-05'"),
    current_user: User = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    """List all global utility expenses with optional filters."""
    query = select(UtilityCharge).order_by(desc(UtilityCharge.created_at))
    
    if utility_type:
        query = query.where(UtilityCharge.utility_type == utility_type)
    if billing_month:
        query = query.where(UtilityCharge.billing_month == billing_month)
    
    result = await db.execute(query)
    charges = result.scalars().all()
    
    return charges


@router.get("/profit-summary", response_model=UtilityProfitSummary)
async def get_utility_profit_summary(
    billing_month: Optional[str] = Query(None, description="Filter by billing month"),
    current_user: User = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    """
    Get a profit/income summary showing total rent vs utility expenses.
    """
    from app.models.payment import Payment
    
    water_filter = [UtilityCharge.utility_type == 'water']
    wifi_filter = [UtilityCharge.utility_type == 'wifi']
    all_filter = []
    
    # Optional payment filter logic based on month
    payment_filter = [Payment.status == 'paid']
    
    if billing_month:
        water_filter.append(UtilityCharge.billing_month == billing_month)
        wifi_filter.append(UtilityCharge.billing_month == billing_month)
        all_filter.append(UtilityCharge.billing_month == billing_month)
        # Note: In a real system, you'd match payment_date to the billing_month more precisely.
        # Here we just use month-start and month-end filtering.
        try:
            year, month = map(int, billing_month.split('-'))
            month_start = datetime(year, month, 1)
            if month == 12:
                next_month = datetime(year + 1, 1, 1)
            else:
                next_month = datetime(year, month + 1, 1)
            payment_filter.append(Payment.payment_date >= month_start)
            payment_filter.append(Payment.payment_date < next_month)
        except Exception:
            pass
    
    # Total Rent Income
    result = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(and_(*payment_filter))
    )
    total_rent = result.scalar() or 0.0

    # Total water expense
    result = await db.execute(
        select(func.coalesce(func.sum(UtilityCharge.amount), 0)).where(and_(*water_filter))
    )
    total_water = result.scalar() or 0.0
    
    # Total water units
    result = await db.execute(
        select(func.coalesce(func.sum(UtilityCharge.units_consumed), 0)).where(and_(*water_filter))
    )
    total_water_units = result.scalar() or 0.0
    
    # Total wifi expense
    result = await db.execute(
        select(func.coalesce(func.sum(UtilityCharge.amount), 0)).where(and_(*wifi_filter))
    )
    total_wifi = result.scalar() or 0.0
    
    # Counts
    count_query = select(func.count(UtilityCharge.id))
    if all_filter:
        count_query = count_query.where(and_(*all_filter))
    result = await db.execute(count_query)
    charge_count = result.scalar() or 0
    
    # Paid count
    paid_filter = [UtilityCharge.status == 'paid']
    if all_filter:
        paid_filter.extend(all_filter)
    result = await db.execute(
        select(func.count(UtilityCharge.id)).where(and_(*paid_filter))
    )
    paid_count = result.scalar() or 0
    
    # Pending count
    pending_filter = [UtilityCharge.status == 'pending']
    if all_filter:
        pending_filter.extend(all_filter)
    result = await db.execute(
        select(func.count(UtilityCharge.id)).where(and_(*pending_filter))
    )
    pending_count = result.scalar() or 0
    
    return UtilityProfitSummary(
        total_rent_income=total_rent,
        total_water_expense=total_water,
        total_wifi_expense=total_wifi,
        total_utility_expense=total_water + total_wifi,
        net_profit=total_rent - (total_water + total_wifi),
        total_water_units=total_water_units,
        charge_count=charge_count,
        paid_count=paid_count,
        pending_count=pending_count,
        billing_month=billing_month
    )


@router.put("/{charge_id}")
async def update_utility_charge(
    charge_id: int,
    update_in: UtilityChargeUpdate,
    current_user: User = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    """Update a utility charge (amount, status, notes)."""
    result = await db.execute(select(UtilityCharge).where(UtilityCharge.id == charge_id))
    charge = result.scalars().first()
    if not charge:
        raise HTTPException(status_code=404, detail="Utility charge not found")

    
    if update_in.amount is not None:
        charge.amount = update_in.amount
    if update_in.units_consumed is not None:
        charge.units_consumed = update_in.units_consumed
    if update_in.status is not None:
        charge.status = update_in.status
    if update_in.notes is not None:
        charge.notes = update_in.notes
    
    await db.commit()
    return {"success": True, "message": "Utility charge updated"}


@router.delete("/{charge_id}")
async def delete_utility_charge(
    charge_id: int,
    current_user: User = Depends(get_current_owner),
    db: AsyncSession = Depends(get_db)
):
    """Delete a utility charge."""
    result = await db.execute(select(UtilityCharge).where(UtilityCharge.id == charge_id))
    charge = result.scalars().first()
    if not charge:
        raise HTTPException(status_code=404, detail="Utility charge not found")
    
    await db.delete(charge)
    await db.commit()
    return {"success": True, "message": "Utility charge deleted"}
