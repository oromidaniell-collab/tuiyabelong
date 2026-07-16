from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.interaction import Feedback, Review
from app.api.endpoints.auth import get_current_user
from app.models.users import User, UserRole
from app.models.tenant import Tenant
from pydantic import BaseModel
from typing import List

router = APIRouter()

class FeedbackCreate(BaseModel):
    subject: str
    message: str
    category: str = "general"
    urgency: str = "low"

class ReviewCreate(BaseModel):
    property_id: int
    rating: float
    comment: str

class FeedbackResponse(BaseModel):
    id: int
    subject: str
    message: str
    status: str
    created_at: str

@router.post("/feedback")
async def submit_feedback(
    feedback_in: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Tenant).where(Tenant.user_id == current_user.id)
    )
    tenant = result.scalars().first()
    if not tenant:
        raise HTTPException(status_code=400, detail="Only tenants can submit feedback")

    feedback = Feedback(
        tenant_id=tenant.id,
        subject=feedback_in.subject,
        message=feedback_in.message
    )
    db.add(feedback)
    await db.commit()
    return {"message": "Feedback submitted successfully"}

@router.post("/review")
async def submit_review(
    review_in: ReviewCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Tenant).where(Tenant.user_id == current_user.id)
    )
    tenant = result.scalars().first()
    if not tenant:
        raise HTTPException(status_code=400, detail="Only tenants can submit reviews")

    review = Review(
        tenant_id=tenant.id,
        property_id=review_in.property_id,
        rating=review_in.rating,
        comment=review_in.comment
    )
    db.add(review)
    await db.commit()
    return {"message": "Review submitted successfully"}

@router.get("/feedback")
async def get_all_feedback(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in [UserRole.ADMIN, UserRole.LANDLORD, UserRole.PROPERTY_MANAGER]:
        raise HTTPException(status_code=403, detail="Not authorized to view feedback")

    result = await db.execute(
        select(Feedback, Tenant, User)
        .join(Tenant, Feedback.tenant_id == Tenant.id)
        .join(User, Tenant.user_id == User.id)
        .order_by(desc(Feedback.created_at))
    )

    feedbacks = result.all()

    return [{
        "id": f.id,
        "subject": f.subject,
        "message": f.message,
        "status": f.status,
        "created_at": str(f.created_at),
        "tenant_name": f"{u.first_name} {u.last_name}" if u else "Unknown",
        "tenant_id": t.id
    } for f, t, u in feedbacks]

@router.get("/my-feedback")
async def get_my_feedback(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Tenant).where(Tenant.user_id == current_user.id)
    )
    tenant = result.scalars().first()
    if not tenant:
        return []

    result = await db.execute(
        select(Feedback)
        .where(Feedback.tenant_id == tenant.id)
        .order_by(desc(Feedback.created_at))
    )
    feedbacks = result.scalars().all()

    return [{
        "id": f.id,
        "subject": f.subject,
        "message": f.message,
        "status": f.status,
        "created_at": str(f.created_at)
    } for f in feedbacks]
