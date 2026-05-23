from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List, Optional
from app.api.endpoints.auth import get_current_user
from app.core.database import get_db
from app.models.users import User
from app.models.tenant import Tenant
from app.models.unit import Unit
from app.models.property import Property
from pydantic import BaseModel

router = APIRouter()

class TenantSchema(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    unit_id: Optional[int] = None
    status: str

    class Config:
        from_attributes = True

class RoomAssignmentRequest(BaseModel):
    unit_id: int
    move_in_date: Optional[str] = None
    notes: Optional[str] = ""

class AvailableUnitOut(BaseModel):
    id: int
    unit_number: str
    property_name: str
    monthly_rent: float

@router.get("/available-units", response_model=List[AvailableUnitOut])
async def get_available_units(db: AsyncSession = Depends(get_db)):
    """List all vacant units for self-assignment"""
    query = select(Unit, Property).join(Property).where(Unit.is_occupied == False)
    result = await db.execute(query)
    units = []
    for unit, prop in result.all():
        units.append(AvailableUnitOut(
            id=unit.id,
            unit_number=unit.unit_number,
            property_name=prop.name,
            monthly_rent=unit.monthly_rent
        ))
    return units

@router.post("/assign-room")
async def assign_room(
    req: RoomAssignmentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Associate a User to a Unit by creating or updating a Tenant record"""
    # 1. Check if unit is available
    unit_res = await db.execute(select(Unit).where(Unit.id == req.unit_id))
    unit = unit_res.scalar_one_or_none()
    if not unit or unit.is_occupied:
        raise HTTPException(status_code=400, detail="Unit is not available")

    # 2. Check if tenant record exists
    tenant_res = await db.execute(select(Tenant).where(Tenant.user_id == current_user.id))
    tenant = tenant_res.scalar_one_or_none()

    if not tenant:
        # Create new tenant record linked to user
        tenant = Tenant(
            user_id=current_user.id,
            first_name=current_user.first_name,
            last_name=current_user.last_name,
            email=current_user.email,
            phone=current_user.phone,
            unit_id=req.unit_id,
            status='active',
            notes=req.notes
        )
        db.add(tenant)
    else:
        # Update existing record
        tenant.unit_id = req.unit_id
        tenant.notes = req.notes

    # 3. Mark unit as occupied
    unit.is_occupied = True
    
    await db.commit()
    return {"message": "Room successfully assigned", "tenant_id": tenant.id}

@router.get("/my-status")
async def get_my_tenant_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Check if the current user has an assigned room"""
    result = await db.execute(select(Tenant).where(Tenant.user_id == current_user.id))
    tenant = result.scalar_one_or_none()
    
    if not tenant or not tenant.unit_id:
        return {"has_unit": False}
    
    # Get unit details
    unit_res = await db.execute(
        select(Unit, Property).join(Property).where(Unit.id == tenant.unit_id)
    )
    unit_data = unit_res.first()
    
    return {
        "has_unit": True,
        "tenant_id": tenant.id,
        "unit_number": unit_data[0].unit_number if unit_data else "N/A",
        "property_name": unit_data[1].name if unit_data else "N/A"
    }

@router.get("/", response_model=List[TenantSchema])
async def get_tenants(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tenant))
    return result.scalars().all()

@router.get("/{tenant_id}", response_model=TenantSchema)
async def get_tenant_details(
    tenant_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get details of a specific tenant"""
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    
    return tenant


