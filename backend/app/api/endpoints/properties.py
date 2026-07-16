from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from app.core.database import get_db
from app.models.property import Property
from app.models.tenant import Tenant
from app.models.unit import Unit
from app.models.users import User
from app.api.endpoints.auth import get_current_user
from pydantic import BaseModel

router = APIRouter()

class PropertySchema(BaseModel):
    id: int
    name: str
    address_line1: str
    city: str
    status: str
    monthly_rent: float = 0.0

    class Config:
        from_attributes = True

@router.get("/", response_model=List[PropertySchema])
async def get_properties(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Property))
    return result.scalars().all()

@router.get("/my", response_model=List[PropertySchema])
async def get_my_properties(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Tenant)
        .options(selectinload(Tenant.unit))
        .where(Tenant.user_id == current_user.id)
    )
    tenant = result.scalars().first()
    if not tenant or not tenant.unit:
        return []

    result = await db.execute(
        select(Property)
        .where(Property.id == tenant.unit.property_id)
    )
    prop = result.scalars().first()
    if not prop:
        return []

    return [PropertySchema(
        id=prop.id,
        name=prop.name,
        address_line1=prop.address_line1,
        city=prop.city,
        status=prop.status,
        monthly_rent=tenant.unit.monthly_rent or 0.0
    )]
