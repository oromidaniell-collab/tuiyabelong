from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional
from app.core.database import get_db
from app.models.users import User
from app.models.maintenance import MaintenanceRequest
from app.models.tenant import Tenant
from app.api.endpoints.auth import get_current_user
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class MaintenanceCreate(BaseModel):
    type: str
    description: str
    preferred_time: Optional[str] = "anytime"
    priority: Optional[str] = "medium"

class MaintenanceResponse(BaseModel):
    id: int
    type: str
    description: str
    status: str
    priority: str
    created_at: datetime
    tenant_name: Optional[str] = None
    unit_number: Optional[str] = None

@router.get("/my", response_model=List[MaintenanceResponse])
async def get_my_maintenance_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Tenant).where(Tenant.user_id == current_user.id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        return []

    result = await db.execute(
        select(MaintenanceRequest)
        .where(MaintenanceRequest.tenant_id == tenant.id)
        .order_by(desc(MaintenanceRequest.created_at))
    )
    requests = result.scalars().all()

    return [{
        "id": req.id,
        "type": req.title,
        "description": req.description,
        "status": req.status,
        "priority": req.priority,
        "created_at": req.created_at,
        "tenant_name": f"{current_user.first_name} {current_user.last_name}",
        "unit_number": tenant.unit_id
    } for req in requests]

@router.get("/all", response_model=List[MaintenanceResponse])
async def get_all_maintenance_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(MaintenanceRequest, Tenant, User)
        .join(Tenant, MaintenanceRequest.tenant_id == Tenant.id)
        .join(User, Tenant.user_id == User.id)
        .order_by(desc(MaintenanceRequest.created_at))
    )
    results = result.all()

    return [{
        "id": req.id,
        "type": req.title,
        "description": req.description,
        "status": req.status,
        "priority": req.priority,
        "created_at": req.created_at,
        "tenant_name": f"{user.first_name} {user.last_name}",
        "unit_number": tenant.unit_id
    } for req, tenant, user in results]

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_maintenance_request(
    request: MaintenanceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Tenant).where(Tenant.user_id == current_user.id)
    )
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant record not found"
        )

    maintenance_request = MaintenanceRequest(
        tenant_id=tenant.id,
        title=request.type,
        description=request.description,
        status="pending",
        priority=request.priority or "medium",
        created_at=datetime.utcnow()
    )

    db.add(maintenance_request)
    await db.commit()
    await db.refresh(maintenance_request)

    return {"message": "Maintenance request created", "id": maintenance_request.id}

@router.put("/{request_id}/status")
async def update_request_status(
    request_id: int,
    new_status: str = "",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(MaintenanceRequest).where(MaintenanceRequest.id == request_id)
    )
    request = result.scalar_one_or_none()

    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    request.status = new_status
    await db.commit()

    return {"message": "Status updated"}
